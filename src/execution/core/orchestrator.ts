/**
 * auto-mat-ion - Generic Test Orchestrator
 *
 * Decoupled from SolarFlare - coordinates test execution across multiple
 * devices and browsers using pluggable test executors.
 *
 * DESIGN PRINCIPLE: This orchestrator knows HOW to manage devices and run tests,
 * but doesn't know WHAT tests to run. Test logic is injected via ITestExecutor.
 */

import type {
  IDeviceInfo,
  ITestConfig,
  IExecutionTestResult,
  IBrowserController,
  ITestExecutor,
  Platform,
  Browser,
} from './types.js';

import { classifyCameraType } from '../controllers/base-controller.js';

// ============================================================================
// Orchestrator Types
// ============================================================================

export interface ILogConfig {
  outputDir: string;
  jsonLogs: boolean;
  csvSummary: boolean;
  screenshotsOnFailure: boolean;
  videoRecording: boolean;
  captureLogs: boolean;
  captureNetwork: boolean;
  organizeByDevice: boolean;
  compressLogs: boolean;
}

export interface ITestMatrix {
  /** Parameter sets for test generation */
  parameters: Array<Record<string, unknown>>;
  /** Devices to test on: 'all' or specific device IDs */
  devices: string[];
  /** Browsers to test with */
  browsers: Browser[];
  /** Orientations for mobile */
  orientations?: Array<'portrait' | 'landscape'>;
  /** Number of repetitions per config */
  repetitions: number;
  /** Delay between tests in ms */
  delayBetweenTests: number;
  /** Max parallel tests */
  maxParallel: number;
}

export interface ITestProgress {
  current: number;
  total: number;
  percentage: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  currentTestId?: string;
  estimatedRemaining?: number;
}

export interface IOrchestratorConfig {
  /** Test matrix definition */
  testMatrix: ITestMatrix;
  /** Logging configuration */
  logConfig: ILogConfig;
  /** Base test URL */
  testUrl: string;
  /** Timeout per test in ms */
  testTimeout: number;
  /** Stop on first failure */
  stopOnFailure: boolean;
  /** Number of retries for failed tests */
  retryFailedTests: number;
  /** Progress callback */
  onProgress?: (progress: ITestProgress) => void;
  /** Test completion callback */
  onTestComplete?: (result: IExecutionTestResult) => void;
  /** Error callback */
  onError?: (error: Error, testId?: string) => void;
}

export interface IOrchestratorState {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  progress: ITestProgress;
  results: IExecutionTestResult[];
  activeControllers: Map<string, IBrowserController>;
}

// ============================================================================
// Logger Interface (for dependency injection)
// ============================================================================

export interface IExecutionLogger {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;
  logTestStart(config: ITestConfig): void;
  logTestResult(result: IExecutionTestResult): Promise<void>;
  saveScreenshot(testId: string, data: string, suffix?: string): Promise<string>;
  setTestMatrix(matrix: ITestMatrix): void;
  finalize(): Promise<{ sessionId: string }>;
  getSessionDir(): string;
}

// ============================================================================
// Controller Factory Interface
// ============================================================================

export interface IControllerFactory {
  /** Create controller for a given platform */
  createController(platform: Platform, options?: Record<string, unknown>): Promise<IBrowserController>;
  /** Detect current platform */
  detectPlatform(): Platform;
  /** Create local device info */
  createLocalDeviceInfo(): Promise<IDeviceInfo>;
  /** List Android devices */
  listAndroidDevices?(): Promise<Array<{ serial: string }>>;
  /** List iOS devices */
  listIOSDevices?(): Promise<Array<{ udid: string }>>;
}

// ============================================================================
// Generic Test Orchestrator
// ============================================================================

export class TestOrchestrator {
  protected config: IOrchestratorConfig;
  protected state: IOrchestratorState;
  protected logger: IExecutionLogger;
  protected controllerFactory: IControllerFactory;
  protected testExecutor: ITestExecutor;

  protected testQueue: ITestConfig[] = [];
  protected devices: Map<string, IDeviceInfo> = new Map();
  protected controllers: Map<string, IBrowserController> = new Map();
  protected isRunning: boolean = false;
  protected shouldStop: boolean = false;

  constructor(
    config: IOrchestratorConfig,
    logger: IExecutionLogger,
    controllerFactory: IControllerFactory,
    testExecutor: ITestExecutor
  ) {
    this.config = config;
    this.logger = logger;
    this.controllerFactory = controllerFactory;
    this.testExecutor = testExecutor;

    this.state = {
      status: 'idle',
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      },
      results: [],
      activeControllers: new Map(),
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the orchestrator and detect available devices
   */
  async initialize(): Promise<void> {
    this.state.status = 'initializing';
    this.logger.log('info', 'Initializing Test Orchestrator...');

    // Detect local device
    const localDevice = await this.controllerFactory.createLocalDeviceInfo();
    this.devices.set(localDevice.id, localDevice);
    this.logger.log('info', `Detected local device: ${localDevice.name} (${localDevice.platform})`);

    // Initialize platform controller for local device
    await this.initializeController(localDevice);

    // Detect connected mobile devices
    const currentPlatform = this.controllerFactory.detectPlatform();
    await this.detectMobileDevices(currentPlatform);

    // Discover real camera labels from browsers
    await this.discoverBrowserCameras();

    // Generate test configurations
    const allDevices = Array.from(this.devices.values());
    let generatedConfigs = this.generateTestConfigs(allDevices);

    // Filter incompatible configs
    const originalCount = generatedConfigs.length;
    generatedConfigs = this.filterIncompatibleConfigs(generatedConfigs);

    if (generatedConfigs.length < originalCount) {
      this.logger.log('info', `Filtered ${originalCount - generatedConfigs.length} incompatible test configurations`);
    }

    this.testQueue = generatedConfigs;
    this.state.progress.total = this.testQueue.length;
    this.logger.log('info', `Generated ${this.testQueue.length} test configurations`);

    this.logger.setTestMatrix(this.config.testMatrix);
    this.state.status = 'idle';
  }

  /**
   * Initialize controller for a device
   */
  private async initializeController(device: IDeviceInfo): Promise<void> {
    const options: Record<string, unknown> = {};

    if (device.platform === 'android' && device.adbSerial) {
      options.adbSerial = device.adbSerial;
    }
    if (device.platform === 'ios' && device.udid) {
      options.udid = device.udid;
    }

    const controller = await this.controllerFactory.createController(device.platform, options);
    await controller.initialize();

    this.controllers.set(device.id, controller);
    this.state.activeControllers.set(device.id, controller);

    this.logger.log('info', `Initialized controller for ${device.name}`);
  }

  /**
   * Detect connected mobile devices
   */
  private async detectMobileDevices(currentPlatform: Platform): Promise<void> {
    // Android detection
    if (
      this.config.testMatrix.devices.includes('all') ||
      this.config.testMatrix.devices.some((d) => d.includes('android'))
    ) {
      await this.detectAndroidDevices();
    }

    // iOS detection (only on macOS)
    if (currentPlatform === 'macos') {
      if (
        this.config.testMatrix.devices.includes('all') ||
        this.config.testMatrix.devices.some((d) => d.includes('ios'))
      ) {
        await this.detectIOSDevices();
      }
    } else if (this.config.testMatrix.devices.some((d) => d.includes('ios'))) {
      this.logger.log('warn', `iOS device testing not available on ${currentPlatform} - requires macOS`);
    }
  }

  private async detectAndroidDevices(): Promise<void> {
    if (!this.controllerFactory.listAndroidDevices) return;

    try {
      const devices = await this.controllerFactory.listAndroidDevices();

      for (const device of devices) {
        const controller = await this.controllerFactory.createController('android', {
          adbSerial: device.serial,
        });
        await controller.initialize();
        const deviceInfo = controller.getDeviceInfo
          ? await controller.getDeviceInfo()
          : { id: device.serial, name: device.serial, platform: 'android' as const, deviceType: 'mobile' as const, osVersion: 'unknown', browsers: ['chrome' as const], cameras: [], screenResolution: { width: 1080, height: 1920 }, connectionType: 'usb' as const };

        this.devices.set(deviceInfo.id, deviceInfo);
        this.controllers.set(deviceInfo.id, controller);

        this.logger.log('info', `Detected Android device: ${deviceInfo.name}`);
      }
    } catch (error) {
      this.logger.log('warn', `Failed to detect Android devices: ${error}`);
    }
  }

  private async detectIOSDevices(): Promise<void> {
    if (!this.controllerFactory.listIOSDevices) return;

    try {
      const devices = await this.controllerFactory.listIOSDevices();

      for (const device of devices) {
        const controller = await this.controllerFactory.createController('ios', {
          udid: device.udid,
        });
        const deviceInfo = controller.getDeviceInfo
          ? await controller.getDeviceInfo()
          : { id: device.udid, name: (device as any).name || device.udid, platform: 'ios' as const, deviceType: 'mobile' as const, osVersion: 'unknown', browsers: ['safari' as const], cameras: [], screenResolution: { width: 1170, height: 2532 }, connectionType: 'usb' as const };

        this.devices.set(deviceInfo.id, deviceInfo);
        this.controllers.set(deviceInfo.id, controller);

        this.logger.log('info', `Detected iOS device: ${deviceInfo.name}`);
      }
    } catch (error) {
      this.logger.log('warn', `Failed to detect iOS devices: ${error}`);
    }
  }

  /**
   * Discover real camera labels from browsers for each device
   */
  private async discoverBrowserCameras(): Promise<void> {
    this.logger.log('info', 'Discovering real camera labels from browsers...');

    for (const [deviceId, device] of this.devices) {
      const controller = this.controllers.get(deviceId);
      if (!controller) continue;

      // Pick first Chromium browser for discovery
      const browser = controller.supportedBrowsers.find((b) =>
        ['chrome', 'chromium', 'edge'].includes(b)
      );
      if (!browser) {
        this.logger.log('debug', `Skipping camera discovery for ${device.name}: no Chromium browser`);
        continue;
      }

      try {
        this.logger.log('debug', `Discovering cameras on ${device.name} via ${browser}...`);

        await controller.launchBrowser(browser, {
          grantCameraPermission: true,
          width: device.screenResolution.width,
          height: device.screenResolution.height,
        });

        await controller.navigateTo(this.config.testUrl);
        await this.delay(2000);

        // Run enumerateDevices via JavaScript
        const browserCameras = await controller.executeScript<
          Array<{ deviceId: string; label: string; kind: string }>
        >(`
          (async function() {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
              stream.getTracks().forEach(t => t.stop());

              const devices = await navigator.mediaDevices.enumerateDevices();
              return devices
                .filter(d => d.kind === 'videoinput')
                .map((d, i) => ({
                  deviceId: d.deviceId,
                  label: d.label || ('Camera ' + i),
                  kind: d.kind
                }));
            } catch (e) {
              console.error('[CameraDiscovery] Error:', e);
              return [];
            }
          })();
        `, 30000);

        await controller.closeBrowser();

        if (browserCameras && browserCameras.length > 0) {
          const updatedCameras = browserCameras.map((cam, index) => ({
            deviceId: cam.deviceId,
            label: cam.label,
            type: classifyCameraType(cam.label),
            index,
            isFrontFacing: /front|facing front/i.test(cam.label),
          }));

          const oldLabels = device.cameras.map((c) => c.label);
          const newLabels = updatedCameras.map((c) => c.label);
          this.logger.log(
            'info',
            `Camera discovery on ${device.name}: ` +
              `system=[${oldLabels.join(', ')}] → browser=[${newLabels.join(', ')}]`
          );

          device.cameras = updatedCameras;
          this.devices.set(deviceId, device);
        } else {
          this.logger.log('warn', `No cameras discovered via browser on ${device.name}`);
        }
      } catch (error) {
        this.logger.log(
          'warn',
          `Camera discovery failed for ${device.name}: ${error}. Using system-level labels.`
        );
        await controller.closeBrowser().catch(() => {});
      }
    }

    this.logger.log('info', 'Camera discovery complete.');
  }

  // ==========================================================================
  // Test Configuration Generation
  // ==========================================================================

  /**
   * Generate test configurations from matrix and devices
   */
  private generateTestConfigs(devices: IDeviceInfo[]): ITestConfig[] {
    const configs: ITestConfig[] = [];
    const { testMatrix, testUrl } = this.config;
    let testIndex = 0;

    // If parameters is empty, create a single default parameter set
    const parameterSets = testMatrix.parameters.length > 0
      ? testMatrix.parameters
      : [{}];

    for (const device of devices) {
      // Skip devices not in the matrix (unless 'all')
      if (
        !testMatrix.devices.includes('all') &&
        !testMatrix.devices.includes(device.id) &&
        !testMatrix.devices.includes(device.platform)
      ) {
        continue;
      }

      for (const browser of testMatrix.browsers) {
        // Skip unsupported browsers
        const controller = this.controllers.get(device.id);
        if (controller && !controller.supportedBrowsers.includes(browser)) {
          continue;
        }

        for (const camera of device.cameras) {
          const orientations = testMatrix.orientations || ['portrait'];

          for (const orientation of orientations) {
            for (const params of parameterSets) {
              for (let rep = 0; rep < testMatrix.repetitions; rep++) {
                const id = `test_${++testIndex}_${device.platform}_${browser}_${orientation}_rep${rep + 1}`;

                configs.push({
                  id,
                  device,
                  browser,
                  camera,
                  testUrl,
                  orientation,
                  parameters: params,
                  repetition: rep + 1,
                });
              }
            }
          }
        }
      }
    }

    return configs;
  }

  /**
   * Filter out incompatible configurations
   */
  private filterIncompatibleConfigs(configs: ITestConfig[]): ITestConfig[] {
    return configs.filter((config) => {
      const { device, browser } = config;

      // iOS only supports Safari
      if (device.platform === 'ios' && browser !== 'safari') {
        this.logger.log('debug', `Skipping: ${browser} on iOS (only Safari supported)`);
        return false;
      }

      // Android only supports Chrome
      if (device.platform === 'android' && browser !== 'chrome') {
        this.logger.log('debug', `Skipping: ${browser} on Android (only Chrome supported)`);
        return false;
      }

      // Safari not available on Windows/Linux
      if ((device.platform === 'windows' || device.platform === 'linux') && browser === 'safari') {
        this.logger.log('debug', `Skipping: Safari on ${device.platform} (not available)`);
        return false;
      }

      return true;
    });
  }

  // ==========================================================================
  // Test Execution
  // ==========================================================================

  /**
   * Start test execution
   */
  async run(): Promise<IExecutionTestResult[]> {
    if (this.isRunning) {
      throw new Error('Orchestrator is already running');
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.state.status = 'running';

    this.logger.log('info', '═'.repeat(60));
    this.logger.log('info', `Starting ${this.testExecutor.name} test execution...`);
    this.logger.log('info', `Total tests: ${this.testQueue.length}`);
    this.logger.log('info', '═'.repeat(60));

    const startTime = Date.now();

    for (let i = 0; i < this.testQueue.length && !this.shouldStop; i++) {
      const testConfig = this.testQueue[i];

      // Update progress
      this.state.progress.current = i + 1;
      this.state.progress.currentTestId = testConfig.id;
      this.state.progress.percentage = Math.round(((i + 1) / this.testQueue.length) * 100);

      const elapsed = Date.now() - startTime;
      const avgTimePerTest = elapsed / (i + 1);
      this.state.progress.estimatedRemaining = avgTimePerTest * (this.testQueue.length - i - 1);

      this.config.onProgress?.(this.state.progress);

      try {
        const result = await this.executeTest(testConfig);
        this.state.results.push(result);

        if (result.status === 'completed') {
          this.state.progress.successCount++;
        } else if (result.status === 'failed') {
          this.state.progress.failureCount++;

          if (this.config.stopOnFailure) {
            this.logger.log('warn', 'Stopping due to test failure (stopOnFailure=true)');
            break;
          }
        } else {
          this.state.progress.skippedCount++;
        }

        this.config.onTestComplete?.(result);

        // Memory management
        if (this.state.results.length > 50) {
          this.state.results = this.state.results.slice(-50);
        }

        if ((i + 1) % 100 === 0) {
          this.logger.log('debug', `Memory cleanup at test ${i + 1}`);
          if (global.gc) {
            global.gc();
          }
        }

        // Delay between tests
        if (i < this.testQueue.length - 1) {
          await this.delay(this.config.testMatrix.delayBetweenTests);
        }
      } catch (error) {
        this.logger.log('error', `Test ${testConfig.id} threw exception: ${error}`);
        this.config.onError?.(error as Error, testConfig.id);

        if (this.config.stopOnFailure) {
          break;
        }
      }
    }

    this.isRunning = false;
    this.state.status = this.shouldStop ? 'error' : 'completed';

    const summary = await this.logger.finalize();
    this.logger.log('info', `Session ID: ${summary.sessionId}`);
    this.logger.log('info', `Results saved to: ${this.logger.getSessionDir()}`);

    return this.state.results;
  }

  /**
   * Execute a single test using the injected test executor
   */
  protected async executeTest(config: ITestConfig): Promise<IExecutionTestResult> {
    const startTime = Date.now();
    this.logger.logTestStart(config);

    const controller = this.controllers.get(config.device.id);
    if (!controller) {
      return this.createFailedResult(config, 'No controller available for device', startTime);
    }

    if (!controller.supportedBrowsers.includes(config.browser)) {
      return this.createFailedResult(
        config,
        `Browser "${config.browser}" not supported on ${config.device.platform}. ` +
          `Supported: ${controller.supportedBrowsers.join(', ')}`,
        startTime
      );
    }

    try {
      // Launch browser
      await controller.launchBrowser(config.browser, {
        grantCameraPermission: true,
        cameraDeviceId: config.camera?.deviceId,
        width: config.device.screenResolution.width,
        height: config.device.screenResolution.height,
      });

      // Set orientation for mobile
      if (config.orientation && 'setOrientation' in controller) {
        await (controller as any).setOrientation(config.orientation);
      }

      // Navigate to test URL
      await controller.navigateTo(config.testUrl);

      // Run test executor setup (if defined)
      if (this.testExecutor.setup) {
        await this.testExecutor.setup(controller, config);
      }

      // Execute the test
      const testOutput = await this.testExecutor.execute(controller, config);

      // Run test executor teardown (if defined)
      if (this.testExecutor.teardown) {
        await this.testExecutor.teardown(controller, config);
      }

      // Collect environment metadata
      const environment = await this.collectEnvironment(controller, config);

      // Create result
      const testResult: IExecutionTestResult = {
        config,
        status: 'completed',
        output: testOutput,
        environment,
        duration: Date.now() - startTime,
        consoleLogs: await controller.getConsoleLogs(),
      };

      await this.logger.logTestResult(testResult);

      // Screenshot on completion (configurable)
      if (this.config.logConfig.screenshotsOnFailure) {
        const screenshotPath = await this.logger.saveScreenshot(
          config.id,
          await this.captureScreenshot(controller)
        );
        testResult.screenshotPath = screenshotPath;
      }

      return testResult;
    } catch (error) {
      const testResult = this.createFailedResult(
        config,
        (error as Error).message,
        startTime,
        (error as Error).stack
      );

      // Screenshot on failure
      if (this.config.logConfig.screenshotsOnFailure) {
        try {
          const screenshotPath = await this.logger.saveScreenshot(
            config.id,
            await this.captureScreenshot(controller),
            'error'
          );
          testResult.screenshotPath = screenshotPath;
        } catch {
          // Ignore screenshot errors
        }
      }

      await this.logger.logTestResult(testResult);
      return testResult;
    } finally {
      await controller.closeBrowser().catch(() => {});
    }
  }

  // ==========================================================================
  // Environment Collection
  // ==========================================================================

  private async collectEnvironment(
    controller: IBrowserController,
    config: ITestConfig
  ): Promise<IExecutionTestResult['environment']> {
    const browserInfo = await controller.executeScript<{
      userAgent: string;
      screenWidth: number;
      screenHeight: number;
      devicePixelRatio: number;
    }>(`
      ({
        userAgent: navigator.userAgent,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        devicePixelRatio: window.devicePixelRatio
      })
    `);

    return {
      timestamp: new Date().toISOString(),
      platform: config.device.platform,
      osVersion: config.device.osVersion,
      browserVersion: this.extractBrowserVersion(browserInfo.userAgent, config.browser),
      userAgent: browserInfo.userAgent,
      screenResolution: `${browserInfo.screenWidth}x${browserInfo.screenHeight}`,
      devicePixelRatio: browserInfo.devicePixelRatio,
      cameraLabel: config.camera?.label,
      cameraDeviceId: config.camera?.deviceId,
      cameraType: config.camera?.type || 'unknown',
      orientation: config.orientation,
    };
  }

  private extractBrowserVersion(userAgent: string, browser: string): string {
    const patterns: Record<string, RegExp> = {
      chrome: /Chrome\/(\d+\.\d+)/,
      firefox: /Firefox\/(\d+\.\d+)/,
      safari: /Version\/(\d+\.\d+).*Safari/,
      edge: /Edg\/(\d+\.\d+)/,
    };

    const pattern = patterns[browser];
    if (pattern) {
      const match = userAgent.match(pattern);
      if (match) return `${browser} ${match[1]}`;
    }

    return browser;
  }

  private async captureScreenshot(controller: IBrowserController): Promise<string> {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    const tempPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);
    await controller.takeScreenshot(tempPath);

    const data = fs.readFileSync(tempPath);
    fs.unlinkSync(tempPath);

    return `data:image/png;base64,${data.toString('base64')}`;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private createFailedResult(
    config: ITestConfig,
    error: string,
    startTime: number,
    errorStack?: string
  ): IExecutionTestResult {
    return {
      config,
      status: 'failed',
      environment: {
        timestamp: new Date().toISOString(),
        platform: config.device.platform,
        osVersion: config.device.osVersion,
        browserVersion: config.browser,
        userAgent: '',
        screenResolution: `${config.device.screenResolution.width}x${config.device.screenResolution.height}`,
        devicePixelRatio: 1,
        cameraLabel: config.camera?.label,
        cameraDeviceId: config.camera?.deviceId,
        cameraType: config.camera?.type || 'unknown',
        orientation: config.orientation,
      },
      duration: Date.now() - startTime,
      error,
      errorStack,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  stop(): void {
    this.logger.log('warn', 'Stop requested, finishing current test...');
    this.shouldStop = true;
    this.state.status = 'paused';
  }

  getState(): IOrchestratorState {
    return { ...this.state };
  }

  getDevices(): IDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  getSessionDir(): string {
    return this.logger.getSessionDir();
  }

  getSummary(): {
    totalTests: number;
    completed: number;
    failed: number;
    skipped: number;
    logFiles: string[];
  } {
    return {
      totalTests: this.state.progress.total,
      completed: this.state.progress.successCount,
      failed: this.state.progress.failureCount,
      skipped: this.state.progress.skippedCount,
      logFiles: [this.logger.getSessionDir()],
    };
  }

  async cleanup(): Promise<void> {
    this.logger.log('info', 'Cleaning up orchestrator resources...');

    for (const [id, controller] of this.controllers) {
      try {
        await controller.cleanup();
        this.logger.log('debug', `Cleaned up controller: ${id}`);
      } catch (error) {
        this.logger.log('warn', `Failed to cleanup controller ${id}: ${error}`);
      }
    }

    this.controllers.clear();
    this.state.activeControllers.clear();
  }
}

// ============================================================================
// Factory Function (with dependency injection)
// ============================================================================

export interface IOrchestratorFactoryOptions {
  config: Partial<IOrchestratorConfig>;
  logger: IExecutionLogger;
  controllerFactory: IControllerFactory;
  testExecutor: ITestExecutor;
}

/**
 * Create a generic test orchestrator with injected dependencies
 */
export function createOrchestrator(options: IOrchestratorFactoryOptions): TestOrchestrator {
  const defaultConfig: IOrchestratorConfig = {
    testMatrix: {
      parameters: [],
      devices: ['all'],
      browsers: ['chrome'],
      repetitions: 1,
      delayBetweenTests: 2000,
      maxParallel: 1,
    },
    logConfig: {
      outputDir: './logs',
      jsonLogs: true,
      csvSummary: true,
      screenshotsOnFailure: true,
      videoRecording: false,
      captureLogs: true,
      captureNetwork: false,
      organizeByDevice: true,
      compressLogs: false,
    },
    testUrl: 'https://localhost:8443',
    testTimeout: 60000,
    stopOnFailure: false,
    retryFailedTests: 0,
    ...options.config,
  };

  return new TestOrchestrator(
    defaultConfig,
    options.logger,
    options.controllerFactory,
    options.testExecutor
  );
}
