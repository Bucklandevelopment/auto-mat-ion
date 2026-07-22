/**
 * auto-mat-ion - Windows Platform Controller
 *
 * Uses PowerShell for system-level control and Puppeteer
 * for browser automation with real camera access.
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
// Windows Controller
// ============================================================================

export class WindowsController extends BaseBrowserController {
  readonly platform: Platform = 'windows';
  readonly supportedBrowsers: Browser[] = ['chrome', 'firefox', 'edge', 'chromium'];

  private browserProcess: ChildProcess | null = null;
  private puppeteerBrowser: PuppeteerBrowser | null = null;
  private page: Page | null = null;
  private cdpPort: number = CDP_PORTS.default;
  private userDataDir: string | null = null;

  /**
   * Initialize the Windows controller
   */
  async initialize(): Promise<void> {
    // Check PowerShell availability
    try {
      await execAsync('powershell -Command "echo test"');
    } catch {
      throw new Error('PowerShell not found. This controller requires Windows.');
    }

    // Create temporary user data directory
    const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Temp';
    this.userDataDir = path.join(tempDir, `automation_chrome_${Date.now()}`);

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
    const browserPath = getBrowserPath('windows', browser);

    if (!browserPath || !fs.existsSync(browserPath)) {
      const altPath = await this.findBrowserPath(browser);
      if (!altPath) {
        throw new Error(`Browser executable not found: ${browser}`);
      }
    }

    const finalPath = browserPath && fs.existsSync(browserPath)
      ? browserPath
      : await this.findBrowserPath(browser);

    if (!finalPath) {
      throw new Error(`Cannot find ${browser} executable`);
    }

    console.log(`[Windows] Found browser at: ${finalPath}`);

    this.cdpPort = CDP_PORTS[browser] || CDP_PORTS.default;

    await this.killExistingChrome();

    const userDataPath = options.userDataDir || this.userDataDir;
    const args = [
      ...getChromeArgsForCamera(options),
      `--remote-debugging-port=${this.cdpPort}`,
      `--user-data-dir="${userDataPath}"`,
    ];

    await this.setupChromeCameraPermission(userDataPath!);

    console.log(`[Windows] Launching Chrome with args: ${args.slice(0, 5).join(' ')}...`);

    const quotedPath = finalPath.includes(' ') ? `"${finalPath}"` : finalPath;

    this.browserProcess = spawn(quotedPath, args, {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: false,
    });

    if (this.browserProcess.stderr) {
      this.browserProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('DevTools listening')) {
          console.log(`[Windows Chrome stderr] ${msg}`);
        }
      });
    }

    console.log(`[Windows] Waiting for Chrome to initialize (port ${this.cdpPort})...`);
    await this.delay(4000);

    const wsEndpoint = await this.getWebSocketEndpoint();
    console.log(`[Windows] Got WebSocket endpoint: ${wsEndpoint.substring(0, 50)}...`);

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

    console.log(`[Windows] Chrome launched and connected successfully`);
  }

  /**
   * Kill any existing Chrome processes using our debug port
   */
  private async killExistingChrome(): Promise<void> {
    try {
      await execAsync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${this.cdpPort} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`
      );
      await this.delay(500);
    } catch {
      // Ignore errors
    }
  }

  /**
   * Find browser path using PowerShell
   */
  private async findBrowserPath(browser: Browser): Promise<string | null> {
    const searchPaths: Record<Browser, string[]> = {
      chrome: [
        '${env:ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe',
        '${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe',
        '${env:LocalAppData}\\Google\\Chrome\\Application\\chrome.exe',
      ],
      edge: [
        '${env:ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe',
        '${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
      chromium: [
        '${env:ProgramFiles}\\Chromium\\Application\\chrome.exe',
        '${env:LocalAppData}\\Chromium\\Application\\chrome.exe',
      ],
      firefox: [
        '${env:ProgramFiles}\\Mozilla Firefox\\firefox.exe',
        '${env:ProgramFiles(x86)}\\Mozilla Firefox\\firefox.exe',
      ],
      safari: [],
    };

    const paths = searchPaths[browser] || [];

    for (const searchPath of paths) {
      try {
        const { stdout } = await execAsync(
          `powershell -Command "if (Test-Path '${searchPath}') { Write-Output '${searchPath}' }"`
        );
        const resolved = stdout.trim();
        if (resolved) {
          const { stdout: resolvedPath } = await execAsync(
            `powershell -Command "Write-Output ${searchPath}"`
          );
          return resolvedPath.trim();
        }
      } catch {
        continue;
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
        console.log(`[Windows] Waiting for Chrome debug port (attempt ${attempt}/${maxAttempts})... Last error: ${lastError}`);
      }

      await this.delay(500);
    }

    const processAlive = this.browserProcess && !this.browserProcess.killed;
    const diagnosticInfo = `
      Process alive: ${processAlive}
      CDP Port: ${this.cdpPort}
      Last error: ${lastError}
      User data dir: ${this.userDataDir}
    `;

    throw new Error(`Failed to get WebSocket endpoint after ${maxAttempts} attempts. Diagnostics: ${diagnosticInfo}`);
  }

  /**
   * Launch Firefox
   */
  private async launchFirefox(options: IBrowserLaunchOptions): Promise<void> {
    const browserPath = await this.findBrowserPath('firefox');
    if (!browserPath) {
      throw new Error('Firefox not found');
    }

    const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Temp';
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
      shell: true,
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
      const pid = this.browserProcess.pid;
      if (pid) {
        await execAsync(`taskkill /PID ${pid} /F /T`).catch(() => {});
      }
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
   * Run PowerShell command
   */
  async runPowerShell(command: string): Promise<string> {
    const { stdout } = await execAsync(`powershell -Command "${command.replace(/"/g, '\\"')}"`);
    return stdout.trim();
  }

  /**
   * Get video devices using PowerShell
   */
  async getVideoDevices(): Promise<Array<{ id: string; name: string }>> {
    try {
      const command = `
        Get-PnpDevice -Class Camera -Status OK |
        Select-Object InstanceId, FriendlyName |
        ConvertTo-Json
      `;
      const result = await this.runPowerShell(command);
      const devices = JSON.parse(result || '[]');

      if (Array.isArray(devices)) {
        return devices.map((d: { InstanceId: string; FriendlyName: string }) => ({
          id: d.InstanceId,
          name: d.FriendlyName,
        }));
      } else if (devices.InstanceId) {
        return [{ id: devices.InstanceId, name: devices.FriendlyName }];
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Check camera permission status
   */
  async checkCameraPermission(): Promise<boolean> {
    try {
      const command = `
        $key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam'
        if (Test-Path $key) {
          $value = Get-ItemProperty -Path $key -Name 'Value' -ErrorAction SilentlyContinue
          Write-Output $value.Value
        } else {
          Write-Output 'Allow'
        }
      `;
      const result = await this.runPowerShell(command);
      return result === 'Allow';
    } catch {
      return true;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWindowsController(): WindowsController {
  return new WindowsController();
}
