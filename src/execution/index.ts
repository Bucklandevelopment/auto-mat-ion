/**
 * auto-mat-ion - Execution Layer
 *
 * This is the real device testing engine extracted and decoupled from solar-lab.
 * It provides cross-platform browser automation for:
 * - Desktop: macOS, Windows, Linux
 * - Mobile: Android (via ADB), iOS (via Appium/WebDriverAgent)
 *
 * USAGE:
 *
 * ```typescript
 * import {
 *   createOrchestrator,
 *   AndroidController,
 *   ExecutionAdapter,
 *   type ITestExecutor
 * } from 'auto-mat-ion/execution';
 *
 * // Create a custom test executor
 * const myTestExecutor: ITestExecutor = {
 *   name: 'MyTest',
 *   async setup(controller, config) {
 *     // Prepare test
 *   },
 *   async execute(controller, config) {
 *     // Run test and return results
 *     return { verdict: 'pass', confidence: 0.95 };
 *   }
 * };
 *
 * // Use the adapter for management integration
 * const adapter = new ExecutionAdapter(logger, controllerFactory);
 * const results = await adapter.executeRequest(request, myTestExecutor, options);
 * ```
 */

// ============================================================================
// Internal Imports (for utility functions)
// ============================================================================

import type {
  Platform,
  Browser,
  ITestConfig,
  ITestExecutor,
  IExecutionTestResult,
} from './core/types.js';

import type {
  IExecutionLogger,
  IControllerFactory,
  ITestMatrix,
} from './core/orchestrator.js';

import type {
  IManagedResult,
  ITestRequest,
} from './adapters/index.js';

import {
  detectPlatform as _detectPlatform,
  createLocalDeviceInfo as _createLocalDeviceInfo,
} from './controllers/base-controller.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Device & Platform
  Platform,
  Browser,
  Orientation,
  CameraType,
  ICameraInfo,
  IDeviceInfo,

  // Test Configuration
  ITestConfig,
  IBrowserLaunchOptions,

  // Results
  ITestOutput,
  IExecutionTestResult,

  // Controllers
  IBrowserController,
  IMobileController,

  // Test Executor (Strategy Pattern)
  ITestExecutor,
} from './core/types.js';

// ============================================================================
// Orchestrator
// ============================================================================

export {
  TestOrchestrator,
  createOrchestrator,
  type IOrchestratorConfig,
  type IOrchestratorState,
  type ITestMatrix,
  type ITestProgress,
  type ILogConfig,
  type IExecutionLogger,
  type IControllerFactory,
  type IOrchestratorFactoryOptions,
} from './core/orchestrator.js';

// Logger
export {
  ExecutionLogger,
  createExecutionLogger,
  type ILogConfig as ILoggerConfig,
  type ISessionSummary,
} from './core/logger.js';

// ============================================================================
// Controllers
// ============================================================================

export {
  BaseBrowserController,
  detectPlatform,
  detectSystemCameras,
  createLocalDeviceInfo,
  classifyCameraType,
  BROWSER_PATHS,
  getBrowserPath,
  getChromeArgsForCamera,
  CDP_PORTS,
} from './controllers/base-controller.js';

// Platform Controllers
export {
  AndroidController,
  createAndroidController,
  listAndroidDevices,
} from './platforms/android.js';

export {
  IOSController,
  createIOSController,
  listIOSDevices,
  startAppiumServer,
} from './platforms/ios.js';

export {
  MacOSController,
  createMacOSController,
} from './platforms/macos.js';

export {
  WindowsController,
  createWindowsController,
} from './platforms/windows.js';

export {
  LinuxController,
  createLinuxController,
} from './platforms/linux.js';

// ============================================================================
// Adapters (Bridge to Management Layer)
// ============================================================================

export {
  // Adapters
  DeviceAdapter,
  ResultAdapter,
  ExecutionAdapter,

  // Types
  type IManagedDevice,
  type ITestRequest,
  type IManagedResult,
  type IContribution,
  type ExecutionEvent,
  type EventHandler,
  type SessionSummary,
} from './adapters/index.js';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Create a simple console logger for testing
 */
export function createConsoleLogger(outputDir: string = './logs'): IExecutionLogger {
  const sessionId = `session_${Date.now()}`;

  const sessionDir = `${outputDir}/${sessionId}`;

  // Lazy-initialize filesystem on first use
  let fsDirCreated = false;
  async function ensureDir() {
    if (!fsDirCreated) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(sessionDir, { recursive: true });
      fsDirCreated = true;
    }
  }

  return {
    log(level: string, message: string) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    },
    logTestStart(config: ITestConfig) {
      this.log('info', `Starting test: ${config.id}`);
    },
    async logTestResult(result: IExecutionTestResult) {
      await ensureDir();
      const { writeFileSync } = await import('node:fs');
      const filepath = `${sessionDir}/${result.config.id}.json`;
      writeFileSync(filepath, JSON.stringify(result, null, 2));
      this.log('info', `Result saved: ${result.config.id} - ${result.status}`);
    },
    async saveScreenshot(testId: string, data: string, suffix: string = '') {
      await ensureDir();
      const { writeFileSync } = await import('node:fs');
      const filename = `${testId}${suffix ? '_' + suffix : ''}.png`;
      const filepath = `${sessionDir}/${filename}`;
      const base64Data = data.replace(/^data:image\/png;base64,/, '');
      writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
      return filepath;
    },
    setTestMatrix(_matrix: ITestMatrix) {},
    async finalize() {
      return { sessionId };
    },
    getSessionDir() {
      return sessionDir;
    },
  };
}

/**
 * Create a default controller factory
 */
export function createDefaultControllerFactory(): IControllerFactory {
  return {
    async createController(platform: Platform, options: Record<string, unknown> = {}) {
      switch (platform) {
        case 'android': {
          const { createAndroidController } = await import('./platforms/android.js');
          return createAndroidController(options.adbSerial as string);
        }
        case 'ios': {
          const { createIOSController } = await import('./platforms/ios.js');
          return createIOSController(options.udid as string, {
            appiumUrl: options.appiumUrl as string,
            useWrapperApp: options.useWrapperApp as boolean,
            wrapperAppBundleId: options.wrapperAppBundleId as string,
            wrapperAppPath: options.wrapperAppPath as string,
          });
        }
        case 'macos': {
          const { createMacOSController } = await import('./platforms/macos.js');
          return createMacOSController();
        }
        case 'windows': {
          const { createWindowsController } = await import('./platforms/windows.js');
          return createWindowsController();
        }
        case 'linux': {
          const { createLinuxController } = await import('./platforms/linux.js');
          return createLinuxController();
        }
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    },
    detectPlatform() {
      return _detectPlatform();
    },
    async createLocalDeviceInfo() {
      return _createLocalDeviceInfo();
    },
    async listAndroidDevices() {
      const { listAndroidDevices: lad } = await import('./platforms/android.js');
      return lad();
    },
    async listIOSDevices() {
      const { listIOSDevices: lid } = await import('./platforms/ios.js');
      return lid();
    },
  };
}

// ============================================================================
// Quick Start Helper
// ============================================================================

/**
 * Quick start function for simple test execution
 *
 * @example
 * ```typescript
 * const results = await quickExecute({
 *   testUrl: 'https://myapp.com',
 *   executor: {
 *     name: 'SimpleTest',
 *     async execute(controller, config) {
 *       await controller.waitForElement('#ready', 5000);
 *       const result = await controller.executeScript('return window.testResult');
 *       return { verdict: result.pass ? 'pass' : 'fail' };
 *     }
 *   }
 * });
 * ```
 */
export async function quickExecute(options: {
  testUrl: string;
  executor: ITestExecutor;
  browsers?: Browser[];
  outputDir?: string;
}): Promise<IManagedResult[]> {
  const logger = createConsoleLogger(options.outputDir || './logs');
  const factory = createDefaultControllerFactory();

  const { ExecutionAdapter } = await import('./adapters/index.js');
  const adapter = new ExecutionAdapter(logger, factory);

  const request: ITestRequest = {
    id: `quick_${Date.now()}`,
    projectId: 'quick-test',
    userId: 'anonymous',
    deviceIds: [],
    testType: options.executor.name,
    parameters: {},
    priority: 1,
    createdAt: new Date(),
  };

  return adapter.executeRequest(request, options.executor, {
    testUrl: options.testUrl,
    browsers: options.browsers,
  });
}
