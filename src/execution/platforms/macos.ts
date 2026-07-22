/**
 * auto-mat-ion - macOS Platform Controller
 *
 * Uses AppleScript/JXA (osascript) for system-level control
 * and Puppeteer for browser automation with real camera access.
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer-core';
import type { Browser as PuppeteerBrowser, Page } from 'puppeteer-core';

import {
  BaseBrowserController,
  getBrowserPath,
  getChromeArgsForCamera,
  CDP_PORTS,
} from '../controllers/base-controller.js';
import type { Platform, Browser, IBrowserLaunchOptions } from '../core/types.js';

const execAsync = promisify(exec);

// ============================================================================
// macOS Controller
// ============================================================================

export class MacOSController extends BaseBrowserController {
  readonly platform: Platform = 'macos';
  readonly supportedBrowsers: Browser[] = ['chrome', 'safari', 'firefox', 'edge', 'chromium'];

  private browserProcess: ChildProcess | null = null;
  private puppeteerBrowser: PuppeteerBrowser | null = null;
  private page: Page | null = null;
  private cdpPort: number = CDP_PORTS.default;
  private userDataDir: string | null = null;

  /**
   * Initialize the macOS controller
   */
  async initialize(): Promise<void> {
    // Check osascript availability
    try {
      await execAsync('which osascript');
    } catch {
      throw new Error('osascript not found. This controller requires macOS.');
    }

    // Create temporary user data directory for Chrome
    this.userDataDir = path.join(process.cwd(), '.automation-temp', `chrome_profile_${Date.now()}`);
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    this._isInitialized = true;
    this._isReady = true;
  }

  /**
   * Launch browser with camera permissions
   */
  async launchBrowser(browser: Browser, options: IBrowserLaunchOptions = {}): Promise<void> {
    this.validateBrowser(browser);

    if (browser === 'safari') {
      await this.launchSafari(options);
    } else if (browser === 'firefox') {
      await this.launchFirefox(options);
    } else {
      // Chromium-based browsers (Chrome, Edge, Chromium)
      await this.launchChromium(browser, options);
    }

    this._currentBrowser = browser;
    this.clearConsoleLogs();
  }

  /**
   * Launch Chromium-based browser with Puppeteer connection
   */
  private async launchChromium(browser: Browser, options: IBrowserLaunchOptions): Promise<void> {
    const browserPath = options.args?.find((a) => a.startsWith('--browser-path='))?.split('=')[1] ||
      getBrowserPath('macos', browser);

    if (!browserPath || !fs.existsSync(browserPath)) {
      throw new Error(`Browser executable not found: ${browserPath}`);
    }

    // Determine CDP port
    this.cdpPort = CDP_PORTS[browser] || CDP_PORTS.default;

    // Build launch arguments
    const args = [
      ...getChromeArgsForCamera(options),
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir=${options.userDataDir || this.userDataDir}`,
    ];

    // Grant camera permission in Chrome preferences
    await this.setupChromeCameraPermission(options.userDataDir || this.userDataDir!);

    // Launch browser process
    this.browserProcess = spawn(browserPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for browser to start
    await this.delay(2000);

    // Connect Puppeteer to the running browser
    const wsEndpoint = await this.getWebSocketEndpoint();
    this.puppeteerBrowser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
    });

    // Get or create a page
    const pages = await this.puppeteerBrowser.pages();
    this.page = pages[0] || (await this.puppeteerBrowser.newPage());

    // Set viewport
    await this.page.setViewport({
      width: options.width || 1920,
      height: options.height || 1080,
    });

    // Setup console log capture
    this.page.on('console', (msg) => {
      this.addConsoleLog(`[${msg.type()}] ${msg.text()}`);
    });
  }

  /**
   * Setup Chrome camera permission via preferences
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
            media_stream_camera: {
              '*,*': {
                setting: 1, // 1 = Allow
              },
            },
            media_stream_mic: {
              '*,*': {
                setting: 1,
              },
            },
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
   * Get WebSocket endpoint for CDP connection
   */
  private async getWebSocketEndpoint(): Promise<string> {
    const maxAttempts = 30;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`);
        const data = (await response.json()) as { webSocketDebuggerUrl: string };
        return data.webSocketDebuggerUrl;
      } catch {
        attempt++;
        await this.delay(500);
      }
    }

    throw new Error(`Failed to get WebSocket endpoint after ${maxAttempts} attempts`);
  }

  /**
   * Launch Safari using AppleScript
   */
  private async launchSafari(_options: IBrowserLaunchOptions): Promise<void> {
    const script = `
      tell application "Safari"
        activate
        make new document
      end tell
    `;

    await this.runAppleScript(script);
    await this.delay(2000);
  }

  /**
   * Launch Firefox
   */
  private async launchFirefox(options: IBrowserLaunchOptions): Promise<void> {
    const browserPath = getBrowserPath('macos', 'firefox');
    if (!browserPath || !fs.existsSync(browserPath)) {
      throw new Error('Firefox not found');
    }

    // Create profile with camera permissions
    const profileDir = path.join(process.cwd(), '.automation-temp', `firefox_profile_${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });

    // Write prefs.js for Firefox
    const prefs = `
user_pref("media.navigator.permission.disabled", true);
user_pref("media.navigator.streams.fake", false);
user_pref("media.autoplay.default", 0);
user_pref("dom.disable_open_during_load", false);
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.prompt-connection", false);
    `.trim();

    fs.writeFileSync(path.join(profileDir, 'prefs.js'), prefs);

    // Launch Firefox with profile
    const args = ['-profile', profileDir, '-no-remote'];

    if (options.width && options.height) {
      args.push('-width', String(options.width), '-height', String(options.height));
    }

    this.browserProcess = spawn(browserPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await this.delay(3000);
  }

  /**
   * Navigate to URL
   */
  async navigateTo(url: string): Promise<void> {
    if (this._currentBrowser === 'safari') {
      await this.safariNavigate(url);
    } else if (this.page) {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      throw new Error('No browser page available');
    }
  }

  /**
   * Safari navigation via AppleScript
   */
  private async safariNavigate(url: string): Promise<void> {
    const script = `
      tell application "Safari"
        set URL of current tab of front window to "${url}"
      end tell
    `;
    await this.runAppleScript(script);
    await this.delay(3000);
  }

  /**
   * Execute JavaScript in browser context
   */
  async executeScript<T>(script: string, timeout: number = 60000): Promise<T> {
    if (this._currentBrowser === 'safari') {
      return this.safariExecuteScript<T>(script);
    } else if (this.page) {
      this.page.setDefaultTimeout(timeout);
      this.page.setDefaultNavigationTimeout(timeout);

      const evaluatePromise = this.page.evaluate(script) as Promise<T>;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Script execution timed out after ${timeout}ms`)), timeout);
      });

      return Promise.race([evaluatePromise, timeoutPromise]);
    } else {
      throw new Error('No browser page available');
    }
  }

  /**
   * Safari JavaScript execution via AppleScript
   */
  private async safariExecuteScript<T>(script: string): Promise<T> {
    const escapedScript = script.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const appleScript = `
      tell application "Safari"
        set jsResult to do JavaScript "${escapedScript}" in current tab of front window
        return jsResult
      end tell
    `;

    const result = await this.runAppleScript(appleScript);
    try {
      return JSON.parse(result) as T;
    } catch {
      return result as unknown as T;
    }
  }

  /**
   * Wait for element
   */
  async waitForElement(selector: string, timeout: number = 30000): Promise<boolean> {
    if (this._currentBrowser === 'safari') {
      return this.safariWaitForElement(selector, timeout);
    } else if (this.page) {
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
   * Safari wait for element
   */
  private async safariWaitForElement(selector: string, timeout: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const exists = await this.safariExecuteScript<boolean>(
        `document.querySelector('${selector}') !== null`
      );
      if (exists) return true;
      await this.delay(100);
    }
    return false;
  }

  /**
   * Click element
   */
  async clickElement(selector: string): Promise<void> {
    if (this._currentBrowser === 'safari') {
      await this.safariExecuteScript(`document.querySelector('${selector}').click()`);
    } else if (this.page) {
      await this.page.click(selector);
    }
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filePath: string): Promise<void> {
    if (this._currentBrowser === 'safari') {
      await this.safariScreenshot(filePath);
    } else if (this.page) {
      await this.page.screenshot({ path: filePath, fullPage: false });
    }
  }

  /**
   * Safari screenshot via screencapture
   */
  private async safariScreenshot(filePath: string): Promise<void> {
    await execAsync(`screencapture -x -o -w ${filePath}`);
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
      this.browserProcess.kill();
      this.browserProcess = null;
    }

    if (this._currentBrowser === 'safari') {
      await this.runAppleScript('tell application "Safari" to quit').catch(() => {});
    }

    this._currentBrowser = null;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();

    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      fs.rmSync(this.userDataDir, { recursive: true, force: true });
    }

    this._isReady = false;
  }

  /**
   * Run AppleScript command
   */
  private async runAppleScript(script: string): Promise<string> {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    return stdout.trim();
  }

  /**
   * Run JXA (JavaScript for Automation) script
   */
  async runJXA(script: string): Promise<string> {
    const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "'\\''")}'`);
    return stdout.trim();
  }

  /**
   * Grant camera permission at system level
   */
  async grantCameraPermission(appName: string = 'Google Chrome'): Promise<void> {
    const script = `
      tell application "System Preferences"
        activate
        set current pane to pane "com.apple.preference.security"
        reveal anchor "Privacy_Camera" of current pane
      end tell
    `;

    try {
      await this.runAppleScript(script);
      this.addConsoleLog(`Opened camera permissions for ${appName}`);
    } catch (error) {
      this.addConsoleLog(`Failed to open camera permissions: ${error}`);
    }
  }

  /**
   * Get list of available video devices
   */
  async getVideoDevices(): Promise<Array<{ id: string; name: string }>> {
    try {
      const { stdout } = await execAsync(
        'system_profiler SPCameraDataType -json 2>/dev/null || echo "{}"'
      );
      const data = JSON.parse(stdout);
      const cameras = data.SPCameraDataType || [];

      return cameras.map((cam: { _name: string; spcamera_unique_id?: string }, idx: number) => ({
        id: cam.spcamera_unique_id || `camera_${idx}`,
        name: cam._name,
      }));
    } catch {
      return [];
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createMacOSController(): MacOSController {
  return new MacOSController();
}
