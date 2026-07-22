/**
 * auto-mat-ion - iOS Platform Controller
 *
 * Uses Appium with XCUITest driver for device automation.
 * Supports both Safari and custom WKWebView wrapper app.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

import { BaseBrowserController } from '../controllers/base-controller.js';
import type {
  Platform,
  Browser,
  IBrowserLaunchOptions,
  IMobileController,
  Orientation,
  IDeviceInfo,
  ICameraInfo,
} from '../core/types.js';

const execAsync = promisify(exec);

// ============================================================================
// Appium Types (simplified)
// ============================================================================

interface AppiumCapabilities {
  platformName: string;
  'appium:platformVersion'?: string;
  'appium:deviceName': string;
  'appium:udid'?: string;
  'appium:automationName': string;
  'appium:browserName'?: string;
  'appium:bundleId'?: string;
  'appium:app'?: string;
  'appium:autoAcceptAlerts'?: boolean;
  'appium:webviewConnectTimeout'?: number;
  'appium:safariAllowPopups'?: boolean;
  'appium:safariIgnoreFraudWarning'?: boolean;
  'appium:safariOpenLinksInBackground'?: boolean;
  'appium:permissions'?: Record<string, Record<string, string>>;
  'appium:xcodeOrgId'?: string;
  'appium:xcodeSigningId'?: string;
}

interface AppiumClient {
  createSession(caps: { capabilities: { alwaysMatch: AppiumCapabilities } }): Promise<void>;
  deleteSession(): Promise<void>;
  navigateTo(url: string): Promise<void>;
  executeScript(script: string, args: unknown[]): Promise<unknown>;
  findElement(strategy: string, selector: string): Promise<{ click(): Promise<void> }>;
  takeScreenshot(): Promise<string>;
  getOrientation(): Promise<string>;
  setOrientation(orientation: string): Promise<void>;
  getContexts(): Promise<string[]>;
  setContext(context: string): Promise<void>;
  setTimeouts(timeouts: { script?: number }): Promise<void>;
}

// ============================================================================
// iOS Controller
// ============================================================================

export class IOSController extends BaseBrowserController implements IMobileController {
  readonly platform: Platform = 'ios';
  readonly supportedBrowsers: Browser[] = ['safari'];

  private _deviceId: string;
  private appiumClient: AppiumClient | null = null;
  private appiumServerUrl: string = 'http://127.0.0.1:4723';
  private isDeviceConnected: boolean = false;
  private useWrapperApp: boolean = false;
  private wrapperAppBundleId: string = 'com.automation.webview';

  private wrapperAppPath: string = '';

  constructor(
    deviceId?: string,
    options?: {
      appiumUrl?: string;
      useWrapperApp?: boolean;
      wrapperAppBundleId?: string;
      wrapperAppPath?: string;
    }
  ) {
    super();
    this._deviceId = deviceId || '';
    if (options?.appiumUrl) {
      this.appiumServerUrl = options.appiumUrl;
    }
    if (options?.useWrapperApp) {
      this.useWrapperApp = true;
    }
    if (options?.wrapperAppBundleId) {
      this.wrapperAppBundleId = options.wrapperAppBundleId;
    }
    if (options?.wrapperAppPath) {
      this.wrapperAppPath = options.wrapperAppPath;
    }
  }

  get deviceId(): string {
    return this._deviceId;
  }

  /**
   * Initialize the iOS controller
   */
  async initialize(): Promise<void> {
    // Check if Appium is available
    try {
      await execAsync('appium --version');
    } catch {
      throw new Error(
        'Appium not found. Install with: npm install -g appium && appium driver install xcuitest'
      );
    }

    // Check Xcode command line tools
    try {
      await execAsync('xcode-select -p');
    } catch {
      throw new Error('Xcode command line tools not found.');
    }

    // If no device specified, try to detect one
    if (!this._deviceId) {
      const devices = await this.listDevices();
      if (devices.length === 0) {
        throw new Error('No iOS devices/simulators found.');
      }
      this._deviceId = devices[0].udid;
    }

    this._isInitialized = true;
    this._isReady = true;
  }

  /**
   * Connect to device via Appium
   */
  async connect(): Promise<void> {
    // Auto-install wrapper app if path provided
    if (this.useWrapperApp && this.wrapperAppPath) {
      await this.installApp(this.wrapperAppPath);
    }

    // Dynamic import of webdriver
    const { remote } = await import('webdriverio');

    const deviceInfo = await this.getDeviceBasicInfo();
    const isSimulator = deviceInfo.isSimulator;

    const capabilities: AppiumCapabilities = {
      platformName: 'iOS',
      'appium:platformVersion': deviceInfo.osVersion,
      'appium:deviceName': deviceInfo.name,
      'appium:udid': this._deviceId,
      'appium:automationName': 'XCUITest',
      'appium:autoAcceptAlerts': true,
      'appium:safariAllowPopups': true,
      'appium:safariIgnoreFraudWarning': true,
      'appium:safariOpenLinksInBackground': false,
      'appium:webviewConnectTimeout': 30000,
    };

    if (this.useWrapperApp) {
      capabilities['appium:bundleId'] = this.wrapperAppBundleId;
    } else {
      capabilities['appium:browserName'] = 'Safari';
    }

    if (isSimulator) {
      const permTarget = this.useWrapperApp
        ? this.wrapperAppBundleId
        : 'com.apple.mobilesafari';
      capabilities['appium:permissions'] = {
        [permTarget]: {
          camera: 'YES',
          microphone: 'YES',
        },
      };
    }

    if (!isSimulator && process.env.XCODE_ORG_ID) {
      capabilities['appium:xcodeOrgId'] = process.env.XCODE_ORG_ID;
      capabilities['appium:xcodeSigningId'] = process.env.XCODE_SIGNING_ID || 'iPhone Developer';
    }

    try {
      const client = await remote({
        hostname: new URL(this.appiumServerUrl).hostname,
        port: parseInt(new URL(this.appiumServerUrl).port) || 4723,
        path: '/',
        capabilities: {
          alwaysMatch: capabilities as unknown as Record<string, unknown>,
        },
      } as any);
      this.appiumClient = client as unknown as AppiumClient;

      this.isDeviceConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to iOS device: ${error}`);
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    if (this.appiumClient) {
      try {
        await this.appiumClient.deleteSession();
      } catch {
        // Session might already be closed
      }
      this.appiumClient = null;
    }
    this.isDeviceConnected = false;
  }

  /**
   * Check if connected
   */
  async isConnected(): Promise<boolean> {
    return this.isDeviceConnected && this.appiumClient !== null;
  }

  /**
   * Launch browser
   */
  async launchBrowser(browser: Browser, _options: IBrowserLaunchOptions = {}): Promise<void> {
    this.validateBrowser(browser);

    if (!this.appiumClient) {
      await this.connect();
    }

    this._currentBrowser = browser;
    this.clearConsoleLogs();
  }

  /**
   * Navigate to URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }

    if (this.useWrapperApp) {
      await this.switchToWebViewContext();
      await this.appiumClient.executeScript(`window.location.href = '${url}'`, []);
    } else {
      await this.appiumClient.navigateTo(url);
    }

    await this.delay(3000);
  }

  /**
   * Switch to WebView context
   */
  private async switchToWebViewContext(): Promise<void> {
    if (!this.appiumClient) return;

    const contexts = await this.appiumClient.getContexts();
    const webviewContext = contexts.find((c) => c.includes('WEBVIEW'));

    if (webviewContext) {
      await this.appiumClient.setContext(webviewContext);
    }
  }

  /**
   * Execute JavaScript
   */
  async executeScript<T>(script: string, timeout: number = 60000): Promise<T> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }

    await this.switchToWebViewContext();

    await this.appiumClient.setTimeouts({
      script: Math.ceil(timeout / 1000)
    });

    return this.appiumClient.executeScript(`return ${script}`, []) as Promise<T>;
  }

  /**
   * Wait for element
   */
  async waitForElement(selector: string, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const exists = await this.executeScript<boolean>(
          `document.querySelector('${selector}') !== null`
        );
        if (exists) return true;
      } catch {
        // Element not found yet
      }
      await this.delay(500);
    }

    return false;
  }

  /**
   * Click element
   */
  async clickElement(selector: string): Promise<void> {
    await this.executeScript(`document.querySelector('${selector}').click()`);
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(filePath: string): Promise<void> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }

    const base64 = await this.appiumClient.takeScreenshot();
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    await this.disconnect();
    this._currentBrowser = null;
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    await this.closeBrowser();
    this._isReady = false;
  }

  /**
   * Set orientation
   */
  async setOrientation(orientation: Orientation): Promise<void> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }

    await this.appiumClient.setOrientation(orientation.toUpperCase());
    await this.delay(500);
  }

  /**
   * Get orientation
   */
  async getOrientation(): Promise<Orientation> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }

    const orientation = await this.appiumClient.getOrientation();
    return orientation.toLowerCase() as Orientation;
  }

  /**
   * List iOS devices and simulators
   */
  async listDevices(): Promise<Array<{ udid: string; name: string; isSimulator: boolean }>> {
    const devices: Array<{ udid: string; name: string; isSimulator: boolean }> = [];

    // List real devices
    try {
      const { stdout } = await execAsync('idevice_id -l 2>/dev/null || echo ""');
      const realDevices = stdout.trim().split('\n').filter(Boolean);

      for (const udid of realDevices) {
        try {
          const { stdout: nameOut } = await execAsync(`ideviceinfo -u ${udid} -k DeviceName`);
          devices.push({
            udid,
            name: nameOut.trim(),
            isSimulator: false,
          });
        } catch {
          devices.push({
            udid,
            name: `iOS Device (${udid.substring(0, 8)}...)`,
            isSimulator: false,
          });
        }
      }
    } catch {
      // libimobiledevice not installed
    }

    // List simulators
    try {
      const { stdout } = await execAsync('xcrun simctl list devices booted --json');
      const data = JSON.parse(stdout);

      for (const [runtime, deviceList] of Object.entries(data.devices)) {
        if (runtime.includes('iOS')) {
          for (const device of deviceList as Array<{ udid: string; name: string; state: string }>) {
            if (device.state === 'Booted') {
              devices.push({
                udid: device.udid,
                name: `${device.name} (Simulator)`,
                isSimulator: true,
              });
            }
          }
        }
      }
    } catch {
      // Simulators not available
    }

    return devices;
  }

  /**
   * Get basic device info
   */
  private async getDeviceBasicInfo(): Promise<{
    name: string;
    osVersion: string;
    isSimulator: boolean;
  }> {
    // Check if it's a simulator
    try {
      const { stdout } = await execAsync(`xcrun simctl list devices --json`);
      const data = JSON.parse(stdout);

      for (const [runtime, deviceList] of Object.entries(data.devices)) {
        for (const device of deviceList as Array<{ udid: string; name: string }>) {
          if (device.udid === this._deviceId) {
            const versionMatch = runtime.match(/iOS-(\d+)-(\d+)/);
            return {
              name: device.name,
              osVersion: versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : '16.0',
              isSimulator: true,
            };
          }
        }
      }
    } catch {
      // Not a simulator
    }

    // Real device
    try {
      const { stdout: nameOut } = await execAsync(`ideviceinfo -u ${this._deviceId} -k DeviceName`);
      const { stdout: versionOut } = await execAsync(
        `ideviceinfo -u ${this._deviceId} -k ProductVersion`
      );

      return {
        name: nameOut.trim(),
        osVersion: versionOut.trim(),
        isSimulator: false,
      };
    } catch {
      return {
        name: 'iOS Device',
        osVersion: '16.0',
        isSimulator: false,
      };
    }
  }

  /**
   * Get full device info
   */
  async getDeviceInfo(): Promise<IDeviceInfo> {
    const basicInfo = await this.getDeviceBasicInfo();
    const cameras = await this.getCameras();

    return {
      id: this._deviceId,
      name: basicInfo.name,
      platform: 'ios',
      deviceType: 'mobile',
      osVersion: `iOS ${basicInfo.osVersion}`,
      browsers: ['safari'],
      cameras,
      screenResolution: { width: 1170, height: 2532 },
      supportsOrientation: true,
      connectionType: basicInfo.isSimulator ? 'local' : 'usb',
      udid: this._deviceId,
    };
  }

  /**
   * Get cameras (iOS always has front and back)
   */
  async getCameras(): Promise<ICameraInfo[]> {
    return [
      { deviceId: 'back', label: 'Back Camera', type: 'real', isFrontFacing: false },
      { deviceId: 'front', label: 'Front Camera', type: 'real', isFrontFacing: true },
    ];
  }

  /**
   * Install app on device
   */
  async installApp(appPath: string): Promise<void> {
    const basicInfo = await this.getDeviceBasicInfo();

    if (basicInfo.isSimulator) {
      await execAsync(`xcrun simctl install ${this._deviceId} "${appPath}"`);
    } else {
      await execAsync(`ios-deploy --id ${this._deviceId} --bundle "${appPath}"`);
    }
  }

  /**
   * Launch app by bundle ID
   */
  async launchApp(bundleId: string): Promise<void> {
    const basicInfo = await this.getDeviceBasicInfo();

    if (basicInfo.isSimulator) {
      await execAsync(`xcrun simctl launch ${this._deviceId} ${bundleId}`);
    } else {
      if (this.appiumClient) {
        await this.appiumClient.executeScript('mobile: launchApp', [{ bundleId }]);
      }
    }
  }

  /**
   * Grant permissions (simulator only)
   */
  async grantPermissions(permissions: string[]): Promise<void> {
    const basicInfo = await this.getDeviceBasicInfo();

    if (basicInfo.isSimulator) {
      for (const permission of permissions) {
        const permMap: Record<string, string> = {
          camera: 'camera',
          microphone: 'microphone',
          photos: 'photos',
        };

        const simctlPermission = permMap[permission];
        if (simctlPermission) {
          const target = this.useWrapperApp
            ? this.wrapperAppBundleId
            : 'com.apple.mobilesafari';
          await execAsync(
            `xcrun simctl privacy ${this._deviceId} grant ${simctlPermission} ${target}`
          ).catch(() => {});
        }
      }
    }
  }

  /**
   * Send a command to the wrapper app's JS bridge
   */
  async sendBridgeCommand(command: Record<string, unknown>): Promise<unknown> {
    if (!this.appiumClient) {
      throw new Error('Not connected to device');
    }
    await this.switchToWebViewContext();
    return this.appiumClient.executeScript(
      `return window.__automation.postMessage(${JSON.stringify(command)})`,
      []
    );
  }

  /**
   * Check if the wrapper app's JS bridge is ready
   */
  async isWrapperAppReady(): Promise<boolean> {
    try {
      return await this.executeScript<boolean>(
        'window.__automation && window.__automation.ready === true'
      );
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createIOSController(
  deviceId?: string,
  options?: {
    appiumUrl?: string;
    useWrapperApp?: boolean;
    wrapperAppBundleId?: string;
    wrapperAppPath?: string;
  }
): IOSController {
  return new IOSController(deviceId, options);
}

/**
 * List all iOS devices
 */
export async function listIOSDevices(): Promise<
  Array<{ udid: string; name: string; isSimulator: boolean }>
> {
  const controller = new IOSController();
  return controller.listDevices();
}

/**
 * Start Appium server
 */
export async function startAppiumServer(port: number = 4723): Promise<void> {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const appium = spawn('appium', ['--port', String(port), '--log-level', 'warn'], {
      detached: true,
      stdio: 'ignore',
    });

    appium.unref();

    setTimeout(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/status`);
        if (response.ok) {
          resolve();
        } else {
          reject(new Error('Appium server failed to start'));
        }
      } catch {
        reject(new Error('Appium server not responding'));
      }
    }, 5000);
  });
}
