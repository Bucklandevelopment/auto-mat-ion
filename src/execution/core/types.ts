/**
 * auto-mat-ion Execution Layer - Core Types
 *
 * Extracted and generalized from solar-lab/automation
 * Defines all TypeScript interfaces for E2E testing with real devices.
 *
 * Changes from solar-lab:
 * - Removed SolarFlare-specific types (ISolarFlareConfig, ISolarFlareResult)
 * - Generalized test configuration for any type of test
 * - Added hooks for custom test execution
 */

// ============================================================================
// Platform & Device Types
// ============================================================================

/**
 * Supported operating systems for automation
 */
export type Platform = 'macos' | 'windows' | 'linux' | 'android' | 'ios';

/**
 * Supported browsers for testing
 */
export type Browser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'chromium';

/**
 * Device form factors
 */
export type DeviceFormFactor = 'desktop' | 'tablet' | 'mobile';

/**
 * Screen orientation for mobile devices
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * Camera type classification
 */
export type CameraType = 'real' | 'virtual' | 'unknown';

/**
 * Connection type for devices
 */
export type ConnectionType = 'usb' | 'wifi' | 'local' | 'remote';

// ============================================================================
// Device & Camera Information
// ============================================================================

/**
 * Camera device information
 */
export interface ICameraInfo {
  /** Device ID from enumerateDevices */
  deviceId: string;
  /** Human-readable label */
  label: string;
  /** Camera type classification */
  type: CameraType;
  /** Whether camera is front-facing (for mobile) */
  isFrontFacing?: boolean;
  /** Supported resolutions (if known) */
  supportedResolutions?: IResolutionInfo[];
  /** Index in the system's camera list */
  index?: number;
}

/**
 * Resolution with metadata
 */
export interface IResolutionInfo {
  width: number;
  height: number;
  /** Max framerate at this resolution */
  maxFps?: number;
  /** Aspect ratio string (e.g., "16:9") */
  aspectRatio?: string;
}

/**
 * Device information for test context
 */
export interface IDeviceInfo {
  /** Unique device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Platform type */
  platform: Platform;
  /** Device form factor */
  deviceType: DeviceFormFactor;
  /** Operating system version */
  osVersion: string;
  /** Available browsers */
  browsers: Browser[];
  /** Available cameras */
  cameras: ICameraInfo[];
  /** Screen resolution */
  screenResolution: IResolutionInfo;
  /** Whether device supports orientation changes */
  supportsOrientation?: boolean;
  /** Connection type */
  connectionType: ConnectionType;
  /** ADB serial (for Android) */
  adbSerial?: string;
  /** UDID (for iOS) */
  udid?: string;
  /** WiFi IP if connected via WiFi */
  wifiIp?: string;
  /** WiFi port if connected via WiFi */
  wifiPort?: number;
}

// ============================================================================
// Test Configuration (Generalized - No SolarFlare dependency)
// ============================================================================

/**
 * Generic test script configuration
 */
export interface ITestScript {
  /** Setup script to run before test */
  setup?: string;
  /** Main test script */
  execute: string;
  /** Teardown script to run after test */
  teardown?: string;
  /** Timeout for script execution (ms) */
  timeout?: number;
}

/**
 * Complete test matrix configuration
 */
export interface ITestMatrix {
  /** Custom parameters to sweep (key-value pairs) */
  parameters: Array<{
    name: string;
    values: unknown[];
  }>;
  /** Devices to test on */
  devices: string[];
  /** Browsers to test (per device capabilities) */
  browsers: Browser[];
  /** Cameras to test */
  cameras?: string[];
  /** Orientations to test (for mobile) */
  orientations?: Orientation[];
  /** Number of repetitions per configuration */
  repetitions: number;
  /** Delay between tests (ms) */
  delayBetweenTests: number;
  /** Maximum parallel tests */
  maxParallel: number;
}

/**
 * Single test configuration instance (generalized)
 */
export interface ITestConfig {
  /** Unique test run ID */
  id: string;
  /** Device to run on */
  device: IDeviceInfo;
  /** Browser to use */
  browser: Browser;
  /** Camera to use (optional) */
  camera?: ICameraInfo;
  /** Test parameters (custom key-value pairs) */
  parameters: Record<string, unknown>;
  /** Test scripts (optional for programmatic tests) */
  scripts?: ITestScript;
  /** Screen orientation (for mobile) */
  orientation?: Orientation;
  /** Repetition number */
  repetition: number;
  /** Test URL */
  testUrl: string;
  /** Project ID (for auto-mat-ion integration) */
  projectId?: string;
}

// ============================================================================
// Test Execution & Results
// ============================================================================

/**
 * Test execution status
 */
export type TestStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'timeout';

/**
 * Test execution progress
 */
export interface ITestProgress {
  /** Current test index */
  current: number;
  /** Total tests in queue */
  total: number;
  /** Percentage complete */
  percentage: number;
  /** Current test ID */
  currentTestId?: string;
  /** Estimated time remaining (ms) */
  estimatedRemaining?: number;
  /** Tests completed successfully */
  successCount: number;
  /** Tests failed */
  failureCount: number;
  /** Tests skipped */
  skippedCount: number;
}

/**
 * Environment metadata captured during test
 */
export interface IEnvironmentMetadata {
  /** Timestamp of test */
  timestamp: string;
  /** Platform */
  platform: Platform;
  /** OS version */
  osVersion: string;
  /** Browser name and version */
  browserVersion: string;
  /** User agent string */
  userAgent: string;
  /** Screen resolution during test */
  screenResolution: string;
  /** Device pixel ratio */
  devicePixelRatio: number;
  /** Camera label used */
  cameraLabel?: string;
  /** Camera device ID */
  cameraDeviceId?: string;
  /** Camera type classification */
  cameraType?: CameraType;
  /** Orientation (for mobile) */
  orientation?: Orientation;
  /** Network type (if detectable) */
  networkType?: string;
  /** CPU cores */
  cpuCores?: number;
  /** Available memory (MB) */
  availableMemory?: number;
}

/**
 * Generic test output (replaces ISolarFlareResult)
 */
export interface ITestOutput {
  /** Test passed or failed */
  success: boolean;
  /** Custom result data from test script */
  data: unknown;
  /** Optional verdict string */
  verdict?: string;
  /** Confidence score (0-1) */
  confidence?: number;
  /** Any additional metrics */
  metrics?: Record<string, number>;
}

/**
 * Complete test result with metadata
 */
export interface IExecutionTestResult {
  /** Test configuration used */
  config: ITestConfig;
  /** Test status */
  status: TestStatus;
  /** Test output (if completed) */
  output?: ITestOutput;
  /** Environment metadata */
  environment: IEnvironmentMetadata;
  /** Test duration (ms) */
  duration: number;
  /** Error message (if failed) */
  error?: string;
  /** Error stack trace */
  errorStack?: string;
  /** Screenshot path (if captured) */
  screenshotPath?: string;
  /** Video recording path (if enabled) */
  videoPath?: string;
  /** Console logs captured */
  consoleLogs?: string[];
  /** Network requests captured */
  networkLogs?: INetworkLog[];
}

/**
 * Network request log entry
 */
export interface INetworkLog {
  /** Request URL */
  url: string;
  /** HTTP method */
  method: string;
  /** Response status */
  status: number;
  /** Request timestamp */
  timestamp: number;
  /** Response time (ms) */
  responseTime: number;
}

// ============================================================================
// Log Collection & Storage
// ============================================================================

/**
 * Log collection configuration
 */
export interface ILogConfig {
  /** Base output directory */
  outputDir: string;
  /** Enable JSON logs */
  jsonLogs: boolean;
  /** Enable CSV summary */
  csvSummary: boolean;
  /** Enable screenshots on failure */
  screenshotsOnFailure: boolean;
  /** Enable video recording */
  videoRecording: boolean;
  /** Enable console log capture */
  captureLogs: boolean;
  /** Enable network log capture */
  captureNetwork: boolean;
  /** Organize logs by device */
  organizeByDevice: boolean;
  /** Compress logs after completion */
  compressLogs: boolean;
}

/**
 * Log session summary
 */
export interface ILogSessionSummary {
  /** Session ID */
  sessionId: string;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;
  /** Total duration (ms) */
  totalDuration: number;
  /** Test matrix used */
  testMatrix: ITestMatrix;
  /** Total tests executed */
  totalTests: number;
  /** Results by status */
  resultsByStatus: Record<TestStatus, number>;
  /** Results by device */
  resultsByDevice: Record<string, { total: number; passed: number; failed: number }>;
  /** Results by browser */
  resultsByBrowser: Record<Browser, { total: number; passed: number; failed: number }>;
  /** Log files generated */
  logFiles: string[];
}

// ============================================================================
// Controller Interfaces
// ============================================================================

/**
 * Browser controller interface - platform-agnostic
 */
export interface IBrowserController {
  /** Platform this controller supports */
  readonly platform: Platform;
  /** Supported browsers */
  readonly supportedBrowsers: Browser[];

  /** Initialize the controller */
  initialize(): Promise<void>;

  /** Check if ready */
  isReady(): Promise<boolean>;

  /** Launch browser with camera permissions */
  launchBrowser(browser: Browser, options?: IBrowserLaunchOptions): Promise<void>;

  /** Navigate to URL */
  navigateTo(url: string): Promise<void>;

  /** Execute JavaScript in browser context */
  executeScript<T>(script: string, timeout?: number): Promise<T>;

  /** Wait for element */
  waitForElement(selector: string, timeout?: number): Promise<boolean>;

  /** Click element */
  clickElement(selector: string): Promise<void>;

  /** Get browser console logs */
  getConsoleLogs(): Promise<string[]>;

  /** Take screenshot */
  takeScreenshot(path: string): Promise<void>;

  /** Close browser */
  closeBrowser(): Promise<void>;

  /** Cleanup resources */
  cleanup(): Promise<void>;

  /** Get device info (optional - implemented by platform controllers) */
  getDeviceInfo?(): Promise<IDeviceInfo>;
}

/**
 * Browser launch options
 */
export interface IBrowserLaunchOptions {
  /** Start in headless mode (where supported) */
  headless?: boolean;
  /** Window width */
  width?: number;
  /** Window height */
  height?: number;
  /** Additional browser arguments */
  args?: string[];
  /** Camera device ID to use */
  cameraDeviceId?: string;
  /** Grant camera permission automatically */
  grantCameraPermission?: boolean;
  /** User data directory */
  userDataDir?: string;
  /** Enable DevTools */
  devtools?: boolean;
}

/**
 * Mobile device controller interface
 */
export interface IMobileController extends IBrowserController {
  /** Device UDID or serial */
  readonly deviceId: string;

  /** Connect to device */
  connect(): Promise<void>;

  /** Disconnect from device */
  disconnect(): Promise<void>;

  /** Check if device is connected */
  isConnected(): Promise<boolean>;

  /** Set screen orientation */
  setOrientation(orientation: Orientation): Promise<void>;

  /** Get current orientation */
  getOrientation(): Promise<Orientation>;

  /** Install app (for native wrapper) */
  installApp?(appPath: string): Promise<void>;

  /** Launch app */
  launchApp?(bundleId: string): Promise<void>;

  /** Grant permissions */
  grantPermissions?(permissions: string[]): Promise<void>;

  /** Get device info */
  getDeviceInfo(): Promise<IDeviceInfo>;
}

// ============================================================================
// Orchestrator Types
// ============================================================================

/**
 * Orchestrator configuration (generalized)
 */
export interface IOrchestratorConfig {
  /** Test matrix to execute */
  testMatrix: ITestMatrix;
  /** Log configuration */
  logConfig: ILogConfig;
  /** Test URL */
  testUrl: string;
  /** Timeout per test (ms) */
  testTimeout: number;
  /** Stop on first failure */
  stopOnFailure: boolean;
  /** Retry failed tests */
  retryFailedTests: number;
  /** Callback for progress updates */
  onProgress?: (progress: ITestProgress) => void;
  /** Callback for test completion */
  onTestComplete?: (result: IExecutionTestResult) => void;
  /** Callback for errors */
  onError?: (error: Error, testId?: string) => void;
}

/**
 * Orchestrator state
 */
export interface IOrchestratorState {
  /** Current status */
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  /** Current progress */
  progress: ITestProgress;
  /** All results collected */
  results: IExecutionTestResult[];
  /** Active controllers */
  activeControllers: Map<string, IBrowserController>;
  /** Error if any */
  lastError?: Error;
}

// ============================================================================
// Hooks for Custom Test Execution
// ============================================================================

/**
 * Test executor hook - allows custom test logic
 */
export interface ITestExecutor {
  /** Name of the executor */
  name: string;

  /** Setup before test (optional) */
  setup?(controller: IBrowserController, config: ITestConfig): Promise<void>;

  /** Execute the test */
  execute(controller: IBrowserController, config: ITestConfig): Promise<ITestOutput>;

  /** Teardown after test (optional) */
  teardown?(controller: IBrowserController, config: ITestConfig): Promise<void>;
}

/**
 * Default test executor that runs scripts from config
 */
export const defaultTestExecutor: ITestExecutor = {
  name: 'default',

  async setup(controller, config) {
    if (config.scripts?.setup) {
      await controller.executeScript(config.scripts.setup, config.scripts.timeout);
    }
  },

  async execute(controller, config) {
    if (!config.scripts?.execute) {
      return { success: true, data: null };
    }
    const result = await controller.executeScript<unknown>(
      config.scripts.execute,
      config.scripts.timeout || 60000
    );

    return {
      success: true,
      data: result,
    };
  },

  async teardown(controller, config) {
    if (config.scripts?.teardown) {
      await controller.executeScript(config.scripts.teardown, config.scripts.timeout);
    }
  },
};
