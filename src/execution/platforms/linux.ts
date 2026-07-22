/**
 * auto-mat-ion - Linux Platform Controller
 *
 * Uses xdotool and standard Linux tools for system-level control,
 * with Puppeteer for browser automation.
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer-core';
import type { Browser as PuppeteerBrowser, Page } from 'puppeteer-core';

import {
  BaseBrowserController,
  getChromeArgsForCamera,
  CDP_PORTS,
} from '../controllers/base-controller.js';
import type { Platform, Browser, IBrowserLaunchOptions } from '../core/types.js';

const execAsync = promisify(exec);

// ============================================================================
// Linux Controller
// ============================================================================

export class LinuxController extends BaseBrowserController {
  readonly platform: Platform = 'linux';
  readonly supportedBrowsers: Browser[] = ['chrome', 'firefox', 'chromium', 'edge'];

  private browserProcess: ChildProcess | null = null;
  private puppeteerBrowser: PuppeteerBrowser | null = null;
  private page: Page | null = null;
  private cdpPort: number = CDP_PORTS.default;
  private userDataDir: string | null = null;
  private hasXdotool: boolean = false;

  /**
   * Initialize the Linux controller
   */
  async initialize(): Promise<void> {
    // Check for xdotool (optional but useful)
    try {
      await execAsync('which xdotool');
      this.hasXdotool = true;
    } catch {
      this.hasXdotool = false;
      console.warn('xdotool not found. Some features may be limited.');
    }

    // Create temporary user data directory
    const tempDir = process.env.TMPDIR || '/tmp';
    this.userDataDir = path.join(tempDir, `automation_chrome_${Date.now()}`);

    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    this._isInitialized = true;
    this._isReady = true;
  }

  /**
   * Launch browser
   */
  async launchBrowser(browser: Browser, options: IBrowserLaunchOptions = {}): Promise<void> {
    this.validateBrowser(browser);

    if (browser === 'firefox') {
      await this.launchFirefox(options);
    } else {
      await this.launchChromium(browser, options);
    }

    this._currentBrowser = browser;
    this.clearConsoleLogs();
  }

  /**
   * Launch Chromium-based browser
   */
  private async launchChromium(browser: Browser, options: IBrowserLaunchOptions): Promise<void> {
    const browserPath = await this.findBrowserPath(browser);

    if (!browserPath) {
      throw new Error(`Browser executable not found: ${browser}`);
    }

    console.log(`[Linux] Found browser at: ${browserPath}`);

    this.cdpPort = CDP_PORTS[browser] || CDP_PORTS.default;

    await this.killExistingChrome();

    const args = [
      ...getChromeArgsForCamera(options),
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir=${options.userDataDir || this.userDataDir}`,
      '--disable-gpu',
      '--no-sandbox',
    ];

    await this.setupChromeCameraPermission(options.userDataDir || this.userDataDir!);

    console.log(`[Linux] Launching Chrome with debug port ${this.cdpPort}...`);

    this.browserProcess = spawn(browserPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':0',
      },
    });

    if (this.browserProcess.stderr) {
      this.browserProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('DevTools listening')) {
          console.log(`[Linux Chrome stderr] ${msg}`);
        }
      });
    }

    await this.delay(4000);

    const wsEndpoint = await this.getWebSocketEndpoint();
    console.log(`[Linux] Got WebSocket endpoint`);

    this.puppeteerBrowser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
    });

    const pages = await this.puppeteerBrowser.pages();
    this.page = pages[0] || (await this.puppeteerBrowser.newPage());

    await this.page.setViewport({
      width: options.width || 1920,
      height: options.height || 1080,
    });

    this.page.on('console', (msg) => {
      this.addConsoleLog(`[${msg.type()}] ${msg.text()}`);
    });

    console.log(`[Linux] Chrome launched and connected successfully`);
  }

  /**
   * Kill any existing Chrome processes using our debug port
   */
  private async killExistingChrome(): Promise<void> {
    try {
      await execAsync(`fuser -k ${this.cdpPort}/tcp 2>/dev/null || true`);
      await this.delay(500);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Find browser path on Linux
   */
  private async findBrowserPath(browser: Browser): Promise<string | null> {
    const searchCommands: Record<Browser, string[]> = {
      chrome: [
        'which google-chrome',
        'which google-chrome-stable',
        'which chrome',
      ],
      chromium: [
        'which chromium-browser',
        'which chromium',
      ],
      firefox: [
        'which firefox',
        'which firefox-esr',
      ],
      edge: [
        'which microsoft-edge',
        'which microsoft-edge-stable',
      ],
      safari: [],
    };

    const commands = searchCommands[browser] || [];

    for (const cmd of commands) {
      try {
        const { stdout } = await execAsync(cmd);
        const browserPath = stdout.trim();
        if (browserPath && fs.existsSync(browserPath)) {
          return browserPath;
        }
      } catch {
        continue;
      }
    }

    // Check common paths
    const commonPaths: Record<Browser, string[]> = {
      chrome: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/opt/google/chrome/chrome',
      ],
      chromium: [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
      ],
      firefox: [
        '/usr/bin/firefox',
        '/usr/bin/firefox-esr',
        '/snap/bin/firefox',
      ],
      edge: [
        '/usr/bin/microsoft-edge',
        '/opt/microsoft/msedge/msedge',
      ],
      safari: [],
    };

    const paths = commonPaths[browser] || [];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return null;
  }

  /**
   * Setup Chrome camera permission
   */
  private async setupChromeCameraPermission(userDataDir: string): Promise<void> {
    const prefsDir = path.join(userDataDir, 'Default');
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true });
    }

    const prefsPath = path.join(prefsDir, 'Preferences');
    const prefs = {
      profile: {
        content_settings: {
          exceptions: {
            media_stream_camera: { '*,*': { setting: 1 } },
            media_stream_mic: { '*,*': { setting: 1 } },
          },
        },
        default_content_setting_values: {
          media_stream_camera: 1,
          media_stream_mic: 1,
        },
      },
    };

    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  }

  /**
   * Get WebSocket endpoint
   */
  private async getWebSocketEndpoint(): Promise<string> {
    const maxAttempts = 60;
    let attempt = 0;
    let lastError = '';

    while (attempt < maxAttempts) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`);
        if (response.ok) {
          const data = (await response.json()) as { webSocketDebuggerUrl: string };
          if (data.webSocketDebuggerUrl) {
            return data.webSocketDebuggerUrl;
          }
          lastError = 'Response missing webSocketDebuggerUrl';
        } else {
          lastError = `HTTP ${response.status}`;
        }
      } catch (e) {
        lastError = (e as Error).message || 'Connection failed';
      }

      attempt++;

      if (attempt % 10 === 0) {
        console.log(`[Linux] Waiting for Chrome debug port (attempt ${attempt}/${maxAttempts})... Last error: ${lastError}`);
      }

      await this.delay(500);
    }

    const processAlive = this.browserProcess && !this.browserProcess.killed;
    throw new Error(`Failed to get WebSocket endpoint after ${maxAttempts} attempts. Process alive: ${processAlive}, Port: ${this.cdpPort}, Last error: ${lastError}`);
  }

  /**
   * Launch Firefox
   */
  private async launchFirefox(_options: IBrowserLaunchOptions): Promise<void> {
    const browserPath = await this.findBrowserPath('firefox');
    if (!browserPath) {
      throw new Error('Firefox not found');
    }

    const tempDir = process.env.TMPDIR || '/tmp';
    const profileDir = path.join(tempDir, `automation_firefox_${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });

    const prefs = `
user_pref("media.navigator.permission.disabled", true);
user_pref("media.navigator.streams.fake", false);
user_pref("media.autoplay.default", 0);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.prompt-connection", false);
    `.trim();

    fs.writeFileSync(path.join(profileDir, 'prefs.js'), prefs);

    const args = ['-profile', profileDir, '-no-remote'];

    this.browserProcess = spawn(browserPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':0',
      },
    });

    await this.delay(3000);
  }

  /**
   * Navigate to URL
   */
  async navigateTo(url: string): Promise<void> {
    if (this.page) {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      throw new Error('No browser page available');
    }
  }

  /**
   * Execute JavaScript
   */
  async executeScript<T>(script: string, timeout: number = 60000): Promise<T> {
    if (this.page) {
      this.page.setDefaultTimeout(timeout);
      return this.page.evaluate(script) as Promise<T>;
    }
    throw new Error('No browser page available');
  }

  /**
   * Wait for element
   */
  async waitForElement(selector: string, timeout: number = 30000): Promise<boolean> {
    if (this.page) {
      try {
        await this.page.waitForSelector(selector, { timeout });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Click element
   */
  async clickElement(selector: string): Promise<void> {
    if (this.page) {
      await this.page.click(selector);
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filePath: string): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ path: filePath, fullPage: false });
    }
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }

    if (this.puppeteerBrowser) {
      await this.puppeteerBrowser.disconnect().catch(() => {});
      this.puppeteerBrowser = null;
    }

    if (this.browserProcess) {
      this.browserProcess.kill('SIGTERM');
      this.browserProcess = null;
    }

    this._currentBrowser = null;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();

    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try {
        fs.rmSync(this.userDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    this._isReady = false;
  }

  /**
   * Get video devices using v4l2
   */
  async getVideoDevices(): Promise<Array<{ id: string; name: string }>> {
    try {
      const { stdout } = await execAsync('ls -1 /dev/video* 2>/dev/null || echo ""');
      const devices = stdout.trim().split('\n').filter(Boolean);

      const result: Array<{ id: string; name: string }> = [];

      for (const device of devices) {
        try {
          const { stdout: nameOut } = await execAsync(
            `v4l2-ctl -d ${device} --info 2>/dev/null | grep "Card type" | cut -d: -f2`
          );
          const name = nameOut.trim() || device;
          result.push({ id: device, name });
        } catch {
          result.push({ id: device, name: device });
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  /**
   * Use xdotool to interact with windows
   */
  async xdotool(command: string): Promise<string> {
    if (!this.hasXdotool) {
      throw new Error('xdotool is not available');
    }
    const { stdout } = await execAsync(`xdotool ${command}`);
    return stdout.trim();
  }

  /**
   * Focus browser window using xdotool
   */
  async focusBrowserWindow(): Promise<void> {
    if (!this.hasXdotool) return;

    const windowName = this._currentBrowser === 'firefox' ? 'Firefox' : 'Chrome';
    try {
      await this.xdotool(`search --name "${windowName}" windowactivate`);
    } catch {
      // Window might not be found
    }
  }

  /**
   * Check if running in a display environment
   */
  async hasDisplay(): Promise<boolean> {
    return !!process.env.DISPLAY;
  }

  /**
   * Get display information
   */
  async getDisplayInfo(): Promise<{ width: number; height: number } | null> {
    try {
      const { stdout } = await execAsync('xdpyinfo | grep dimensions');
      const match = stdout.match(/(\d+)x(\d+)/);
      if (match) {
        return {
          width: parseInt(match[1], 10),
          height: parseInt(match[2], 10),
        };
      }
    } catch {
      // No display
    }
    return null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLinuxController(): LinuxController {
  return new LinuxController();
}
