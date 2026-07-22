/**
 * auto-mat-ion Execution Layer - Android Platform Controller
 *
 * Extracted from solar-lab/automation/platforms/android.ts
 * Uses ADB (Android Debug Bridge) for device control and
 * Chrome DevTools Protocol for browser automation.
 * Supports real camera access on physical Android devices.
 */

import { exec, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as puppeteer from 'puppeteer-core';
import type { Browser as PuppeteerBrowser, Page } from 'puppeteer-core';

import { BaseBrowserController, getChromeArgsForCamera } from '../controllers/base-controller.js';
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
// WiFi Connection Types
// ============================================================================

export interface IWifiConnectionOptions {
  /** Device IP address */
  ip: string;
  /** ADB port (default: 5555 for classic, varies for Android 11+) */
  port?: number;
  /** Pairing code for Android 11+ wireless debugging */
  pairingCode?: string;
  /** Pairing port for Android 11+ (different from connection port) */
  pairingPort?: number;
}

export interface IWifiDeviceInfo {
  ip: string;
  port: number;
  connectionType: 'wifi' | 'usb';
  isAndroid11Plus: boolean;
}

// ============================================================================
// Android Controller
// ============================================================================

export class AndroidController extends BaseBrowserController implements IMobileController {
  readonly platform: Platform = 'android';
  readonly supportedBrowsers: Browser[] = ['chrome', 'chromium', 'edge'];

  private _deviceId: string;
  private adbProcess: ChildProcess | null = null;
  private puppeteerBrowser: PuppeteerBrowser | null = null;
  private page: Page | null = null;
  private localCdpPort: number = 9222;
  private remoteCdpPort: number = 9222;
  private isDeviceConnected: boolean = false;
  /**
   * Set to true after a relaunch attempt fails, signalling that the device
   * is unrecoverable (Chrome cannot be restarted, the phone disconnected,
   * etc). All subsequent navigateTo() calls throw fast instead of burning
   * 5–10 s on waitForMainFrame timeouts that will never succeed.
   */
  private _isDead: boolean = false;

  // WiFi connection properties
  private _connectionType: 'wifi' | 'usb' = 'usb';
  private _wifiIp: string | null = null;
  private _wifiPort: number = 5555;
  private _reconnectAttempts: number = 3;
  private _reconnectInterval: number = 2000;

  constructor(deviceId?: string) {
    super();
    this._deviceId = deviceId || '';
    if (deviceId && deviceId.includes(':')) {
      const [ip, port] = deviceId.split(':');
      this._wifiIp = ip;
      this._wifiPort = parseInt(port) || 5555;
      this._connectionType = 'wifi';
    }
  }

  get connectionType(): 'wifi' | 'usb' {
    return this._connectionType;
  }

  get wifiIp(): string | null {
    return this._wifiIp;
  }

  get deviceId(): string {
    return this._deviceId;
  }

  /**
   * Initialize the Android controller
   */
  async initialize(): Promise<void> {
    try {
      await execAsync('adb version');
    } catch {
      throw new Error('ADB not found. Please install Android SDK Platform Tools.');
    }

    if (!this._deviceId) {
      const devices = await this.listDevices();
      if (devices.length === 0) {
        throw new Error('No Android devices found. Connect a device and enable USB debugging.');
      }
      this._deviceId = devices[0].serial;
    }

    await this.connect();
    this._isInitialized = true;
    this._isReady = true;
  }

  /**
   * Connect to device
   */
  async connect(): Promise<void> {
    try {
      await this.adb('get-state');
      this.isDeviceConnected = true;
    } catch {
      throw new Error(`Device ${this._deviceId} is not connected or not authorized.`);
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    await this.closeBrowser();
    if (this._connectionType === 'wifi' && this._deviceId) {
      await execAsync(`adb disconnect ${this._deviceId}`).catch(() => {});
    }
    this.isDeviceConnected = false;
  }

  // ============================================================================
  // WiFi Connection Methods
  // ============================================================================

  /**
   * Connect to device via WiFi (Android 11+ Wireless Debugging)
   */
  async connectWifiAndroid11(options: IWifiConnectionOptions): Promise<void> {
    if (!options.pairingCode || !options.pairingPort) {
      throw new Error('Android 11+ requires pairingCode and pairingPort');
    }

    const { ip, port = 5555, pairingCode, pairingPort } = options;

    console.log(`Pairing with ${ip}:${pairingPort}...`);
    try {
      const pairResult = await execAsync(`adb pair ${ip}:${pairingPort} ${pairingCode}`);
      if (!pairResult.stdout.includes('Successfully paired')) {
        throw new Error(`Pairing failed: ${pairResult.stderr || pairResult.stdout}`);
      }
      console.log('Pairing successful');
    } catch (error) {
      throw new Error(`Failed to pair with device: ${error}`);
    }

    await this.connectWifi({ ip, port });
  }

  /**
   * Connect to device via WiFi (Classic method)
   */
  async connectWifi(options: IWifiConnectionOptions): Promise<void> {
    const { ip, port = 5555 } = options;
    const deviceId = `${ip}:${port}`;

    console.log(`Connecting to ${deviceId}...`);

    try {
      const { stdout, stderr } = await execAsync(`adb connect ${deviceId}`);
      if (stdout.includes('connected') || stdout.includes('already connected')) {
        this._deviceId = deviceId;
        this._wifiIp = ip;
        this._wifiPort = port;
        this._connectionType = 'wifi';
        this.isDeviceConnected = true;
        console.log(`Connected to ${deviceId}`);
      } else {
        throw new Error(`Connection failed: ${stderr || stdout}`);
      }
    } catch (error) {
      throw new Error(`Failed to connect to ${deviceId}: ${error}`);
    }
  }

  /**
   * Enable TCP/IP mode on a USB-connected device
   */
  async enableWifiMode(port: number = 5555): Promise<string> {
    if (this._connectionType === 'wifi') {
      throw new Error('Device is already connected via WiFi');
    }

    const { stdout: ipOutput } = await this.adb('shell ip addr show wlan0');
    const ipMatch = ipOutput.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);

    if (!ipMatch) {
      throw new Error('Could not determine device WiFi IP. Is WiFi connected?');
    }

    const deviceIp = ipMatch[1];

    console.log(`Enabling TCP/IP mode on port ${port}...`);
    await this.adb(`tcpip ${port}`);
    await this.delay(2000);

    console.log(`Device ready for WiFi connection at ${deviceIp}:${port}`);
    return deviceIp;
  }

  /**
   * Attempt to reconnect to a WiFi device
   */
  async reconnectWifi(): Promise<boolean> {
    if (this._connectionType !== 'wifi' || !this._wifiIp) {
      return false;
    }

    for (let attempt = 1; attempt <= this._reconnectAttempts; attempt++) {
      console.log(`Reconnection attempt ${attempt}/${this._reconnectAttempts}...`);

      try {
        await execAsync(`adb disconnect ${this._deviceId}`).catch(() => {});
        await this.delay(500);

        const { stdout } = await execAsync(`adb connect ${this._deviceId}`);
        if (stdout.includes('connected')) {
          const { stdout: state } = await execAsync(`adb -s ${this._deviceId} get-state`);
          if (state.trim() === 'device') {
            console.log('Reconnection successful');
            this.isDeviceConnected = true;
            return true;
          }
        }
      } catch (error) {
        console.log(`Attempt ${attempt} failed: ${error}`);
      }

      if (attempt < this._reconnectAttempts) {
        await this.delay(this._reconnectInterval);
      }
    }

    this.isDeviceConnected = false;
    return false;
  }

  /**
   * Check WiFi connection health
   */
  async checkWifiHealth(): Promise<{ connected: boolean; latencyMs: number; signalStrength?: number }> {
    if (this._connectionType !== 'wifi') {
      return { connected: this.isDeviceConnected, latencyMs: 0 };
    }

    const startTime = Date.now();

    try {
      await this.adb('shell echo "ping"');
      const latencyMs = Date.now() - startTime;

      let signalStrength: number | undefined;
      try {
        const { stdout } = await this.adb('shell dumpsys wifi | grep "RSSI"');
        const rssiMatch = stdout.match(/RSSI:\s*(-?\d+)/);
        if (rssiMatch) {
          signalStrength = parseInt(rssiMatch[1]);
        }
      } catch {
        // Signal strength is optional
      }

      return { connected: true, latencyMs, signalStrength };
    } catch {
      return { connected: false, latencyMs: -1 };
    }
  }

  /**
   * Check if device is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.adb('get-state');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Launch browser with camera permissions
   */
  async launchBrowser(browser: Browser, options: IBrowserLaunchOptions = {}): Promise<void> {
    this.validateBrowser(browser);

    await this.grantPermissions(['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']);

    const packageName = this.getBrowserPackage(browser);

    // Force-stop is sometimes lenient with apps holding camera/MediaRecorder
    // services (a hung Sauron test leaves both attached). Issue it twice with
    // a longer settle so the OS has time to actually tear down the process.
    await this.adb(`shell am force-stop ${packageName}`);
    await this.delay(1500);
    await this.adb(`shell am force-stop ${packageName}`).catch(() => {});
    await this.delay(500);

    const chromeFlags = [
      'chrome',
      '--remote-debugging-port=9222',
      '--no-first-run',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--use-fake-ui-for-media-stream',
    ].join(' ');

    await this.adb(`shell "echo '${chromeFlags}' > /data/local/tmp/chrome-command-line"`);
    await this.adb(`shell "chmod 644 /data/local/tmp/chrome-command-line"`);
    await this.adb(`shell "echo '${chromeFlags}' > /data/local/tmp/com.android.chrome-command-line"`);
    await this.adb(`shell "chmod 644 /data/local/tmp/com.android.chrome-command-line"`);

    await this.adb('reverse tcp:8443 tcp:8443');
    await this.adb('reverse tcp:8080 tcp:8080');

    await this.adb(`shell am start -n ${packageName}/com.google.android.apps.chrome.Main -d "about:blank"`);
    // Bumped 3000 → 5000: a Chrome cold-start after a hung previous session
    // (camera service, MediaRecorder still detaching) needs more headroom
    // before its CDP socket is ready to accept connections.
    await this.delay(5000);

    this.localCdpPort = 9222 + Math.floor(Math.random() * 1000);
    await this.adb(`forward tcp:${this.localCdpPort} localabstract:chrome_devtools_remote`);

    await this.connectPuppeteer();

    this._currentBrowser = browser;
    this._isDead = false; // any successful relaunch revives the controller
    this.clearConsoleLogs();
  }

  private getBrowserPackage(browser: Browser): string {
    const packages: Record<Browser, string> = {
      chrome: 'com.android.chrome',
      chromium: 'org.chromium.chrome',
      edge: 'com.microsoft.emmx',
      firefox: 'org.mozilla.firefox',
      safari: '',
    };
    return packages[browser] || 'com.android.chrome';
  }

  private async connectPuppeteer(): Promise<void> {
    // 60 × 1000 ms = 60 s budget. Healthy device connects on attempt 1
    // (~50 ms total). Bumped from the original 30 × 500 ms = 15 s because a
    // post-hang Chrome cold-start on Android can take 25–40 s before its
    // remote-debug socket is reachable; failing in 15 s was abandoning
    // recoverable phones.
    const maxAttempts = 60;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.localCdpPort}/json/version`);
        const data = (await response.json()) as { webSocketDebuggerUrl: string };

        const wsUrl = data.webSocketDebuggerUrl.replace(
          /ws:\/\/[^/]+/,
          `ws://127.0.0.1:${this.localCdpPort}`
        );

        this.puppeteerBrowser = await puppeteer.connect({
          browserWSEndpoint: wsUrl,
        });

        const pages = await this.puppeteerBrowser.pages();
        this.page = pages[0] || (await this.puppeteerBrowser.newPage());

        this.page.on('console', (msg) => {
          this.addConsoleLog(`[${msg.type()}] ${msg.text()}`);
        });

        // puppeteer.connect() returns BEFORE the CDP `Page.frameTree`
        // message has been processed, so an immediate page.goto() can
        // throw "Requesting main frame too early!". The race is hard to
        // see on a single device (logging + Chrome startup soak up the
        // gap) but reliably trips when a second AndroidController attaches
        // right after — the second attach steals event-loop ticks the
        // first connection needed to finish syncing. Block here until
        // mainFrame() is available so all callers downstream can rely on
        // a fully-initialised Page.
        await this.waitForMainFrame(this.page);

        return;
      } catch {
        attempt++;
        await this.delay(1000);
      }
    }

    throw new Error(
      `Failed to connect to Chrome on Android device ${this._deviceId} ` +
        `after ${maxAttempts} attempts (~60s). Chrome may have failed to ` +
        `restart cleanly after a hung session — try unplugging and replugging the phone.`,
    );
  }

  /** Poll the Page until its FrameManager has registered the main frame. */
  private async waitForMainFrame(
    page: NonNullable<typeof this.page>,
    timeoutMs = 10_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        page.mainFrame();
        return;
      } catch (err) {
        lastErr = err;
        await this.delay(100);
      }
    }
    throw new Error(
      `Chrome page main frame did not initialise within ${timeoutMs}ms after ` +
        `CDP attach (device ${this._deviceId}): ${String(lastErr)}`,
    );
  }

  async navigateTo(url: string): Promise<void> {
    if (this._isDead) {
      throw new Error(
        `Android device ${this._deviceId} is unrecoverable; previous relaunch ` +
          `attempt failed. Reconnect the phone and start a new run.`,
      );
    }

    if (!this.page) {
      await this.adb(`shell am start -a android.intent.action.VIEW -d "${url}"`);
      await this.delay(3000);
      return;
    }

    // Recovery ladder for the page object:
    //   (a) page.mainFrame() works synchronously → fastest path, normal case.
    //   (b) FrameManager hasn't synced yet → poll up to 2s (CDP race).
    //   (c) Page is genuinely dead (Chrome killed, tab closed by the user
    //       to unblock a hang, OS-OOM) → full Chrome relaunch on the device.
    //   (d) Relaunch fails → mark _isDead so the remaining reps in the
    //       outer loop fail fast instead of burning 5s timeouts each.
    let alive = false;
    try {
      this.page.mainFrame();
      alive = true;
    } catch {
      try {
        await this.waitForMainFrame(this.page, 2_000);
        alive = true;
      } catch {
        alive = false;
      }
    }

    if (!alive) {
      console.log(
        `[Android ${this._deviceId}] page is dead — relaunching Chrome and reconnecting puppeteer...`,
      );
      // Best-effort cleanup of the stale puppeteer connection so the
      // subsequent connect() doesn't trip over a half-open WS, and remove
      // the old adb forward mapping so we don't leak host ports across
      // multiple relaunches.
      try {
        await this.puppeteerBrowser?.disconnect();
      } catch {
        /* old WS already closed */
      }
      await this.adb(`forward --remove tcp:${this.localCdpPort}`).catch(() => {});
      this.puppeteerBrowser = null;
      this.page = null;

      try {
        await this.launchBrowser(this._currentBrowser ?? 'chrome');
      } catch (err) {
        this._isDead = true;
        throw new Error(
          `Android device ${this._deviceId} could not be recovered: ` +
            `Chrome relaunch failed (${(err as Error).message}). Marking device dead.`,
        );
      }
      // launchBrowser → connectPuppeteer → waitForMainFrame, so this.page
      // is fresh and ready by here.
    }

    await this.page!.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  }

  async executeScript<T>(script: string, timeout: number = 60000): Promise<T> {
    if (this.page) {
      this.page.setDefaultTimeout(timeout);
      return this.page.evaluate(script) as Promise<T>;
    }
    throw new Error('No browser page available');
  }

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

  async clickElement(selector: string): Promise<void> {
    if (this.page) {
      await this.page.click(selector);
    }
  }

  async takeScreenshot(filePath: string): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ path: filePath, fullPage: false });
    } else {
      const tempPath = '/sdcard/screenshot.png';
      await this.adb(`shell screencap -p ${tempPath}`);
      await this.adb(`pull ${tempPath} ${filePath}`);
      await this.adb(`shell rm ${tempPath}`);
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }

    if (this.puppeteerBrowser) {
      await this.puppeteerBrowser.disconnect().catch(() => {});
      this.puppeteerBrowser = null;
    }

    await this.adb(`forward --remove tcp:${this.localCdpPort}`).catch(() => {});
    await this.adb('reverse --remove-all').catch(() => {});

    if (this._currentBrowser) {
      const pkg = this.getBrowserPackage(this._currentBrowser);
      await this.adb(`shell am force-stop ${pkg}`).catch(() => {});
    }

    this._currentBrowser = null;
  }

  async cleanup(): Promise<void> {
    await this.closeBrowser();
    await this.disconnect();
    this._isReady = false;
  }

  async setOrientation(orientation: Orientation): Promise<void> {
    await this.adb('shell settings put system accelerometer_rotation 0');
    const value = orientation === 'landscape' ? 1 : 0;
    await this.adb(`shell settings put system user_rotation ${value}`);
    await this.delay(500);
  }

  async getOrientation(): Promise<Orientation> {
    const { stdout } = await execAsync(
      `adb -s ${this._deviceId} shell settings get system user_rotation`
    );
    return stdout.trim() === '1' ? 'landscape' : 'portrait';
  }

  async grantPermissions(permissions: string[]): Promise<void> {
    const pkg = this._currentBrowser
      ? this.getBrowserPackage(this._currentBrowser)
      : 'com.android.chrome';

    for (const permission of permissions) {
      await this.adb(`shell pm grant ${pkg} ${permission}`).catch(() => {});
    }
  }

  private async adb(command: string): Promise<{ stdout: string; stderr: string }> {
    return execAsync(`adb -s ${this._deviceId} ${command}`);
  }

  async listDevices(): Promise<Array<{ serial: string; status: string }>> {
    const { stdout } = await execAsync('adb devices');
    const lines = stdout.trim().split('\n').slice(1);

    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const [serial, status] = line.split('\t');
        return { serial: serial.trim(), status: status.trim() };
      })
      .filter((d) => d.status === 'device');
  }

  async getDeviceInfo(): Promise<IDeviceInfo> {
    const [model, manufacturer, version, resolution] = await Promise.all([
      this.adb('shell getprop ro.product.model').then((r) => r.stdout.trim()),
      this.adb('shell getprop ro.product.manufacturer').then((r) => r.stdout.trim()),
      this.adb('shell getprop ro.build.version.release').then((r) => r.stdout.trim()),
      this.adb('shell wm size').then((r) => {
        const match = r.stdout.match(/(\d+)x(\d+)/);
        return match
          ? { width: parseInt(match[1]), height: parseInt(match[2]) }
          : { width: 1080, height: 1920 };
      }),
    ]);

    const cameras = await this.getCameras();

    return {
      id: this._deviceId,
      name: `${manufacturer} ${model}`,
      platform: 'android',
      deviceType: 'mobile',
      osVersion: `Android ${version}`,
      browsers: ['chrome'],
      cameras,
      screenResolution: resolution,
      supportsOrientation: true,
      connectionType: this._connectionType,
      adbSerial: this._deviceId,
      ...(this._connectionType === 'wifi' && {
        wifiIp: this._wifiIp || undefined,
        wifiPort: this._wifiPort,
      }),
    };
  }

  async getCameras(): Promise<ICameraInfo[]> {
    try {
      const { stdout } = await this.adb('shell dumpsys media.camera | grep "Camera ID"');
      const cameras: ICameraInfo[] = [];

      const lines = stdout.split('\n').filter((l) => l.includes('Camera ID'));
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/Camera ID:\s*(\d+)/);
        if (match) {
          cameras.push({
            deviceId: match[1],
            label: i === 0 ? 'Back Camera' : i === 1 ? 'Front Camera' : `Camera ${match[1]}`,
            type: 'real',
            isFrontFacing: i === 1,
          });
        }
      }

      return cameras.length > 0
        ? cameras
        : [
            { deviceId: '0', label: 'Back Camera', type: 'real', isFrontFacing: false },
            { deviceId: '1', label: 'Front Camera', type: 'real', isFrontFacing: true },
          ];
    } catch {
      return [
        { deviceId: '0', label: 'Back Camera', type: 'real', isFrontFacing: false },
        { deviceId: '1', label: 'Front Camera', type: 'real', isFrontFacing: true },
      ];
    }
  }

  async getBatteryLevel(): Promise<number> {
    const { stdout } = await this.adb('shell dumpsys battery | grep level');
    const match = stdout.match(/level:\s*(\d+)/);
    return match ? parseInt(match[1]) : -1;
  }

  async isScreenOn(): Promise<boolean> {
    const { stdout } = await this.adb('shell dumpsys power | grep "Display Power"');
    return stdout.includes('state=ON');
  }

  async wakeUp(): Promise<void> {
    await this.adb('shell input keyevent KEYCODE_WAKEUP');
    await this.delay(500);
    await this.adb('shell input swipe 500 1500 500 500');
  }

  async installApp(apkPath: string): Promise<void> {
    await this.adb(`install -r ${apkPath}`);
  }

  async launchApp(packageName: string): Promise<void> {
    await this.adb(`shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
  }

  async getChromeVersion(): Promise<string> {
    try {
      const { stdout } = await this.adb(
        'shell dumpsys package com.android.chrome | grep versionName'
      );
      const match = stdout.match(/versionName=([^\s]+)/);
      return match ? match[1] : 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createAndroidController(deviceId?: string): AndroidController {
  return new AndroidController(deviceId);
}

export async function listAndroidDevices(): Promise<Array<{ serial: string; status: string }>> {
  const controller = new AndroidController();
  return controller.listDevices();
}

export async function listAndroidDevicesDetailed(): Promise<
  Array<{
    serial: string;
    status: string;
    connectionType: 'wifi' | 'usb';
    ip?: string;
    port?: number;
  }>
> {
  const { stdout } = await execAsync('adb devices -l');
  const lines = stdout.trim().split('\n').slice(1);

  return lines
    .filter((line) => line.includes('device'))
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts[0];
      const status = parts[1];
      const isWifi = serial.includes(':');

      if (isWifi) {
        const [ip, portStr] = serial.split(':');
        return {
          serial,
          status,
          connectionType: 'wifi' as const,
          ip,
          port: parseInt(portStr),
        };
      }

      return { serial, status, connectionType: 'usb' as const };
    });
}

export async function connectAndroidWifi(ip: string, port: number = 5555): Promise<AndroidController> {
  const controller = new AndroidController();
  await controller.connectWifi({ ip, port });
  await controller.initialize();
  return controller;
}

export async function pairAndConnectAndroid11(
  ip: string,
  pairingPort: number,
  pairingCode: string,
  connectionPort: number
): Promise<AndroidController> {
  const controller = new AndroidController();
  await controller.connectWifiAndroid11({
    ip,
    port: connectionPort,
    pairingCode,
    pairingPort,
  });
  await controller.initialize();
  return controller;
}

export async function enableAndroidWifiMode(
  deviceId: string,
  port: number = 5555
): Promise<{ ip: string; port: number; command: string }> {
  const controller = new AndroidController(deviceId);
  await controller.initialize();
  const ip = await controller.enableWifiMode(port);

  return { ip, port, command: `adb connect ${ip}:${port}` };
}
