/**
 * auto-mat-ion Execution Layer - Base Browser Controller
 *
 * Extracted from solar-lab/automation/controllers/base-controller.ts
 * Abstract base class for all browser controllers.
 */

import type {
  IBrowserController,
  IBrowserLaunchOptions,
  Platform,
  Browser,
  IDeviceInfo,
  ICameraInfo,
  CameraType,
} from '../core/types.js';

// ============================================================================
// Abstract Base Controller
// ============================================================================

export abstract class BaseBrowserController implements IBrowserController {
  abstract readonly platform: Platform;
  abstract readonly supportedBrowsers: Browser[];

  protected _isInitialized: boolean = false;
  protected _isReady: boolean = false;
  protected _currentBrowser: Browser | null = null;
  protected _consoleLogs: string[] = [];

  abstract initialize(): Promise<void>;

  async isReady(): Promise<boolean> {
    return this._isReady;
  }

  abstract launchBrowser(browser: Browser, options?: IBrowserLaunchOptions): Promise<void>;
  abstract navigateTo(url: string): Promise<void>;
  abstract executeScript<T>(script: string, timeout?: number): Promise<T>;
  abstract waitForElement(selector: string, timeout?: number): Promise<boolean>;
  abstract clickElement(selector: string): Promise<void>;

  async getConsoleLogs(): Promise<string[]> {
    return [...this._consoleLogs];
  }

  abstract takeScreenshot(path: string): Promise<void>;
  abstract closeBrowser(): Promise<void>;
  abstract cleanup(): Promise<void>;

  protected addConsoleLog(message: string): void {
    this._consoleLogs.push(`[${new Date().toISOString()}] ${message}`);
  }

  protected clearConsoleLogs(): void {
    this._consoleLogs = [];
  }

  protected validateBrowser(browser: Browser): void {
    if (!this.supportedBrowsers.includes(browser)) {
      throw new Error(
        `Browser "${browser}" is not supported on ${this.platform}. ` +
          `Supported browsers: ${this.supportedBrowsers.join(', ')}`
      );
    }
  }

  protected async waitFor(
    condition: () => Promise<boolean>,
    timeout: number = 30000,
    interval: number = 100
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await this.delay(interval);
    }
    return false;
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Browser Paths & Configuration
// ============================================================================

export const BROWSER_PATHS: Record<Platform, Partial<Record<Browser, string>>> = {
  macos: {
    chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    firefox: '/Applications/Firefox.app/Contents/MacOS/firefox',
    safari: '/Applications/Safari.app/Contents/MacOS/Safari',
    edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium',
  },
  windows: {
    chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    firefox: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    chromium: 'C:\\Program Files\\Chromium\\Application\\chrome.exe',
  },
  linux: {
    chrome: '/usr/bin/google-chrome',
    firefox: '/usr/bin/firefox',
    chromium: '/usr/bin/chromium-browser',
    edge: '/usr/bin/microsoft-edge',
  },
  android: {},
  ios: {},
};

export const CDP_PORTS: Record<string, number> = {
  default: 9222,
  chrome: 9222,
  chromium: 9223,
  edge: 9224,
  firefox: 9225, // Firefox uses different protocol but we reserve a port
  safari: 9226,  // Safari uses different protocol but we reserve a port
};

export function getBrowserPath(platform: Platform, browser: Browser): string | undefined {
  return BROWSER_PATHS[platform]?.[browser];
}

export function getChromeArgsForCamera(options: IBrowserLaunchOptions = {}): string[] {
  const args: string[] = [
    '--use-fake-ui-for-media-stream',
    '--no-first-run',
    '--no-default-browser-check',
    '--ignore-certificate-errors',
    '--allow-insecure-localhost',
    '--disable-blink-features=AutomationControlled',
    '--hide-crash-restore-bubble',
  ];

  if (options.grantCameraPermission === false) {
    const idx = args.indexOf('--use-fake-ui-for-media-stream');
    if (idx !== -1) args.splice(idx, 1);
  }

  if (options.headless) {
    args.push('--headless=new');
  }

  if (options.width && options.height) {
    args.push(`--window-size=${options.width},${options.height}`);
  }

  if (options.userDataDir) {
    args.push(`--user-data-dir=${options.userDataDir}`);
  }

  if (options.devtools) {
    args.push('--auto-open-devtools-for-tabs');
  }

  if (options.args) {
    args.push(...options.args);
  }

  return args;
}

export function getFirefoxPrefsForCamera(): Record<string, string | number | boolean> {
  return {
    'media.navigator.permission.disabled': true,
    'media.navigator.streams.fake': false,
    'media.autoplay.default': 0,
    'dom.disable_open_during_load': false,
    'privacy.trackingprotection.enabled': false,
  };
}

export function isChromiumBased(browser: Browser): boolean {
  return ['chrome', 'chromium', 'edge'].includes(browser);
}

export function detectPlatform(): Platform {
  const platform = process.platform;
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// ============================================================================
// Camera Detection
// ============================================================================

const VIRTUAL_CAMERA_PATTERNS = [
  /obs/i, /vcam/i, /virtual/i, /fake/i, /snap\s*camera/i, /manycam/i,
  /xsplit/i, /streamlabs/i, /webcamoid/i, /droidcam/i, /iriun/i, /epoccam/i,
  /camo/i, /ndi/i, /blackmagic/i, /decklink/i, /elgato/i, /camtwist/i,
  /mmhmm/i, /prism/i, /loom/i, /around/i, /krisp/i, /nvidia\s*broadcast/i,
  /screen\s*capture/i, /window\s*capture/i, /display\s*capture/i,
];

const REAL_CAMERA_PATTERNS = [
  /facetime/i, /isight/i, /integrated/i, /built-in/i, /webcam/i,
  /logitech/i, /razer/i, /microsoft\s*(lifecam|modern)/i, /hd\s*pro/i,
  /brio/i, /c920/i, /c922/i, /c930/i, /c270/i, /c310/i, /c505/i, /c615/i, /c925/i,
  /streamcam/i, /^camera\s+\d+,?\s*facing\s+(front|back)$/i,
  /front\s*camera/i, /back\s*camera/i, /rear\s*camera/i, /facing\s+(front|back)/i,
  /\([0-9a-f]{4}:[0-9a-f]{4}\)/i,
  // iPhone/iPad cameras
  /iphone/i, /ipad/i,
  // USB cameras
  /usb\s*(camera|video)/i,
];

export function classifyCameraType(label: string): CameraType {
  const normalizedLabel = label.toLowerCase();

  for (const pattern of VIRTUAL_CAMERA_PATTERNS) {
    if (pattern.test(normalizedLabel)) {
      return 'virtual';
    }
  }

  for (const pattern of REAL_CAMERA_PATTERNS) {
    if (pattern.test(normalizedLabel)) {
      return 'real';
    }
  }

  return 'unknown';
}

async function detectMacOSCameras(): Promise<ICameraInfo[]> {
  const { execSync } = await import('child_process');
  const cameras: ICameraInfo[] = [];

  try {
    const output = execSync('system_profiler SPCameraDataType -json 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const data = JSON.parse(output);
    const cameraData = data.SPCameraDataType || [];

    for (const camera of cameraData) {
      const name = camera._name || camera.name || 'Unknown Camera';
      const uniqueId = camera.unique_id || camera.spcamera_unique_id || `camera_${cameras.length}`;
      cameras.push({
        deviceId: uniqueId,
        label: name,
        type: classifyCameraType(name),
        index: cameras.length,
      });
    }
  } catch (error) {
    console.warn('Failed to detect macOS cameras:', error);
  }

  return cameras;
}

async function detectWindowsCameras(): Promise<ICameraInfo[]> {
  const { execSync } = await import('child_process');
  const cameras: ICameraInfo[] = [];

  try {
    const output = execSync(
      'powershell -Command "Get-PnpDevice -Class Camera -Status OK | Select-Object FriendlyName,InstanceId | ConvertTo-Json"',
      { encoding: 'utf-8', timeout: 5000 }
    );
    const devices = JSON.parse(output);
    const deviceList = Array.isArray(devices) ? devices : [devices];

    for (const device of deviceList) {
      if (device?.FriendlyName) {
        cameras.push({
          deviceId: device.InstanceId || `camera_${cameras.length}`,
          label: device.FriendlyName,
          type: classifyCameraType(device.FriendlyName),
          index: cameras.length,
        });
      }
    }
  } catch (error) {
    console.warn('Failed to detect Windows cameras:', error);
  }

  return cameras;
}

async function detectLinuxCameras(): Promise<ICameraInfo[]> {
  const { execSync } = await import('child_process');
  const cameras: ICameraInfo[] = [];

  try {
    const output = execSync('v4l2-ctl --list-devices 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const lines = output.split('\n');
    let currentName = '';

    for (const line of lines) {
      if (!line.startsWith('\t') && line.trim()) {
        currentName = line.replace(/\s*\(.*\)\s*:?\s*$/, '').trim();
      } else if (line.includes('/dev/video') && currentName) {
        cameras.push({
          deviceId: line.trim(),
          label: currentName,
          type: classifyCameraType(currentName),
          index: cameras.length,
        });
        currentName = '';
      }
    }
  } catch (error) {
    console.warn('Failed to detect Linux cameras:', error);
  }

  return cameras;
}

export async function detectSystemCameras(platform: Platform): Promise<ICameraInfo[]> {
  switch (platform) {
    case 'macos':
      return detectMacOSCameras();
    case 'windows':
      return detectWindowsCameras();
    case 'linux':
      return detectLinuxCameras();
    default:
      return [];
  }
}

export async function detectAvailableBrowsers(platform: Platform): Promise<Browser[]> {
  const fs = await import('fs');
  const browsers: Browser[] = [];
  const paths = BROWSER_PATHS[platform];

  for (const [browser, browserPath] of Object.entries(paths)) {
    if (browserPath) {
      try {
        if (fs.existsSync(browserPath)) {
          browsers.push(browser as Browser);
        }
      } catch {
        // Browser not found
      }
    }
  }

  if (browsers.length === 0) {
    browsers.push('chrome');
  }

  return browsers;
}

export async function createLocalDeviceInfo(): Promise<IDeviceInfo> {
  const os = await import('os');
  const platform = detectPlatform();
  const browsers = await detectAvailableBrowsers(platform);
  const cameras = await detectSystemCameras(platform);

  console.log(`Detected ${cameras.length} camera(s):`, cameras.map((c) => `${c.label} (${c.type})`).join(', '));

  return {
    id: `local_${os.hostname()}`,
    name: os.hostname(),
    platform,
    deviceType: 'desktop',
    osVersion: os.release(),
    browsers,
    cameras,
    screenResolution: { width: 1920, height: 1080 },
    connectionType: 'local',
  };
}
