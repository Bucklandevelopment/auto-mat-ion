/**
 * auto-mat-ion - Execution Adapters
 *
 * Bridges between the Management Layer (API, gamification, users)
 * and the Execution Layer (real device control, browser automation).
 *
 * These adapters enable:
 * - Converting management-layer requests to execution commands
 * - Transforming execution results for storage and gamification
 * - Event emission for real-time updates
 */

import type {
  IDeviceInfo,
  ITestConfig,
  IExecutionTestResult,
  ITestOutput,
  IBrowserController,
  ITestExecutor,
  Platform,
  Browser,
  CameraType,
} from '../core/types.js';

import type {
  TestOrchestrator,
  IOrchestratorConfig,
  IExecutionLogger,
  IControllerFactory,
  ITestProgress,
} from '../core/orchestrator.js';

// ============================================================================
// Management Layer Types (from src/core/)
// ============================================================================

/** Device as seen by the management layer */
export interface IManagedDevice {
  id: string;
  fingerprint: string;
  name: string;
  platform: string;
  osVersion?: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy' | 'error';
  lastSeen: Date;
  metadata?: Record<string, unknown>;
}

/** Test request from the management layer */
export interface ITestRequest {
  id: string;
  projectId: string;
  userId: string;
  deviceIds: string[];
  testType: string;
  parameters: Record<string, unknown>;
  priority: number;
  createdAt: Date;
}

/** Result as stored by the management layer */
export interface IManagedResult {
  id: string;
  testRequestId: string;
  deviceId: string;
  userId: string;
  projectId: string;
  status: 'success' | 'failure' | 'error' | 'skipped';
  verdict?: string;
  confidence?: number;
  duration: number;
  environment: Record<string, unknown>;
  rawOutput?: unknown;
  screenshotUrl?: string;
  videoUrl?: string;
  createdAt: Date;
  pointsAwarded?: number;
}

/** Contribution for gamification */
export interface IContribution {
  userId: string;
  deviceId: string;
  testType: string;
  resultId: string;
  points: number;
  multipliers: {
    deviceRarity: number;
    firstOfDay: number;
    streak: number;
    quality: number;
  };
  timestamp: Date;
}

// ============================================================================
// Event Types for Real-time Updates
// ============================================================================

export type ExecutionEvent =
  | { type: 'device:connected'; device: IManagedDevice }
  | { type: 'device:disconnected'; deviceId: string }
  | { type: 'device:status'; deviceId: string; status: IManagedDevice['status'] }
  | { type: 'test:started'; testId: string; deviceId: string }
  | { type: 'test:progress'; testId: string; progress: ITestProgress }
  | { type: 'test:completed'; result: IManagedResult }
  | { type: 'test:error'; testId: string; error: string }
  | { type: 'session:started'; sessionId: string; totalTests: number }
  | { type: 'session:completed'; sessionId: string; summary: SessionSummary };

export interface SessionSummary {
  totalTests: number;
  completed: number;
  failed: number;
  skipped: number;
  duration: number;
  pointsAwarded: number;
}

export type EventHandler = (event: ExecutionEvent) => void | Promise<void>;

// ============================================================================
// Device Adapter
// ============================================================================

/**
 * Converts between execution layer devices and management layer devices
 */
export class DeviceAdapter {
  /**
   * Convert execution IDeviceInfo to management IManagedDevice
   */
  static toManaged(device: IDeviceInfo, status: IManagedDevice['status'] = 'online'): IManagedDevice {
    const capabilities: string[] = [];

    // Add platform-specific capabilities
    if (device.platform === 'android' || device.platform === 'ios') {
      capabilities.push('mobile', 'touch', 'orientation');
    } else {
      capabilities.push('desktop');
    }

    // Add camera capabilities
    for (const camera of device.cameras) {
      if (camera.type === 'real') {
        capabilities.push('hardware-camera');
      } else if (camera.type === 'virtual') {
        capabilities.push('virtual-camera');
      }
    }

    return {
      id: device.id,
      fingerprint: DeviceAdapter.generateFingerprint(device),
      name: device.name,
      platform: device.platform,
      osVersion: device.osVersion,
      capabilities,
      status,
      lastSeen: new Date(),
      metadata: {
        screenResolution: device.screenResolution,
        cameras: device.cameras,
        adbSerial: device.adbSerial,
        udid: device.udid,
      },
    };
  }

  /**
   * Generate a stable fingerprint for a device
   */
  static generateFingerprint(device: IDeviceInfo): string {
    const parts = [
      device.platform,
      device.name.replace(/\s+/g, '-').toLowerCase(),
      device.osVersion || 'unknown',
      device.screenResolution.width,
      device.screenResolution.height,
      device.adbSerial || device.udid || 'local',
    ];

    // Simple hash
    const str = parts.join(':');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return `dev_${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}

// ============================================================================
// Result Adapter
// ============================================================================

/**
 * Converts execution results to management layer format and calculates points
 */
export class ResultAdapter {
  private static readonly BASE_POINTS = 10;

  /**
   * Convert execution result to managed result with gamification
   */
  static toManaged(
    result: IExecutionTestResult,
    testRequest: ITestRequest,
    userId: string
  ): IManagedResult {
    const status = ResultAdapter.mapStatus(result.status);
    const verdict = result.output?.verdict;
    const confidence = result.output?.confidence;

    return {
      id: `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      testRequestId: testRequest.id,
      deviceId: result.config.device.id,
      userId,
      projectId: testRequest.projectId,
      status,
      verdict,
      confidence,
      duration: result.duration,
      environment: result.environment as unknown as Record<string, unknown>,
      rawOutput: result.output,
      screenshotUrl: result.screenshotPath,
      createdAt: new Date(),
    };
  }

  /**
   * Calculate contribution points for a result
   */
  static calculateContribution(
    result: IManagedResult,
    device: IManagedDevice,
    userStats: { testsToday: number; currentStreak: number }
  ): IContribution {
    const multipliers = {
      deviceRarity: ResultAdapter.calculateDeviceRarity(device),
      firstOfDay: userStats.testsToday === 0 ? 2.0 : 1.0,
      streak: Math.min(1 + userStats.currentStreak * 0.1, 2.0),
      quality: ResultAdapter.calculateQualityMultiplier(result),
    };

    const basePoints = result.status === 'success' ? ResultAdapter.BASE_POINTS :
                       result.status === 'failure' ? ResultAdapter.BASE_POINTS * 0.5 : 0;

    const totalMultiplier = Object.values(multipliers).reduce((a, b) => a * b, 1);
    const points = Math.round(basePoints * totalMultiplier);

    return {
      userId: result.userId,
      deviceId: result.deviceId,
      testType: 'automation', // Could be parameterized
      resultId: result.id,
      points,
      multipliers,
      timestamp: new Date(),
    };
  }

  private static mapStatus(status: IExecutionTestResult['status']): IManagedResult['status'] {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'failure';
      case 'skipped': return 'skipped';
      default: return 'error';
    }
  }

  private static calculateDeviceRarity(device: IManagedDevice): number {
    // Rarer devices get more points
    // Mobile devices are rarer than desktop
    if (device.platform === 'ios') return 1.5;
    if (device.platform === 'android') return 1.3;
    if (device.capabilities.includes('hardware-camera')) return 1.2;
    return 1.0;
  }

  private static calculateQualityMultiplier(result: IManagedResult): number {
    if (!result.confidence) return 1.0;
    // Higher confidence = higher quality
    return 0.8 + (result.confidence * 0.4); // Range: 0.8 - 1.2
  }
}

// ============================================================================
// Execution Adapter (Main Bridge)
// ============================================================================

/**
 * Main adapter that bridges management requests to execution layer
 */
export class ExecutionAdapter {
  private orchestrator: TestOrchestrator | null = null;
  private eventHandlers: EventHandler[] = [];
  private activeDevices: Map<string, IManagedDevice> = new Map();

  constructor(
    private logger: IExecutionLogger,
    private controllerFactory: IControllerFactory
  ) {}

  /**
   * Subscribe to execution events
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index >= 0) this.eventHandlers.splice(index, 1);
    };
  }

  private emit(event: ExecutionEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Execute a test request from the management layer
   */
  async executeRequest(
    request: ITestRequest,
    testExecutor: ITestExecutor,
    options: {
      testUrl: string;
      browsers?: Browser[];
      timeout?: number;
    }
  ): Promise<IManagedResult[]> {
    const { createOrchestrator } = await import('../core/orchestrator.js');

    // Convert request to orchestrator config
    const config: Partial<IOrchestratorConfig> = {
      testMatrix: {
        parameters: [request.parameters],
        devices: request.deviceIds.length > 0 ? request.deviceIds : ['all'],
        browsers: options.browsers || ['chrome'],
        repetitions: 1,
        delayBetweenTests: 2000,
        maxParallel: 1,
      },
      testUrl: options.testUrl,
      testTimeout: options.timeout || 60000,
      stopOnFailure: false,
      retryFailedTests: 1,
      onProgress: (progress: ITestProgress) => {
        this.emit({
          type: 'test:progress',
          testId: request.id,
          progress,
        });
      },
      onTestComplete: (result: IExecutionTestResult) => {
        const managed = ResultAdapter.toManaged(result, request, request.userId);
        this.emit({
          type: 'test:completed',
          result: managed,
        });
      },
      onError: (error: Error, testId?: string) => {
        this.emit({
          type: 'test:error',
          testId: testId || request.id,
          error: error.message,
        });
      },
    };

    // Create and run orchestrator
    this.orchestrator = createOrchestrator({
      config,
      logger: this.logger,
      controllerFactory: this.controllerFactory,
      testExecutor,
    });

    this.emit({
      type: 'test:started',
      testId: request.id,
      deviceId: request.deviceIds[0] || 'all',
    });

    const startTime = Date.now();

    try {
      await this.orchestrator!.initialize();

      this.emit({
        type: 'session:started',
        sessionId: this.orchestrator!.getSessionDir(),
        totalTests: this.orchestrator!.getState().progress.total,
      });

      const results = await this.orchestrator!.run();
      const summary = this.orchestrator!.getSummary();

      this.emit({
        type: 'session:completed',
        sessionId: this.orchestrator!.getSessionDir(),
        summary: {
          totalTests: summary.totalTests,
          completed: summary.completed,
          failed: summary.failed,
          skipped: summary.skipped,
          duration: Date.now() - startTime,
          pointsAwarded: 0, // Calculated by management layer
        },
      });

      // Convert all results to managed format
      return results.map((r) => ResultAdapter.toManaged(r, request, request.userId));
    } finally {
      await this.orchestrator?.cleanup();
      this.orchestrator = null;
    }
  }

  /**
   * Discover available devices
   */
  async discoverDevices(): Promise<IManagedDevice[]> {
    const localDevice = await this.controllerFactory.createLocalDeviceInfo();
    const managed = DeviceAdapter.toManaged(localDevice);

    this.activeDevices.set(managed.id, managed);
    this.emit({ type: 'device:connected', device: managed });

    // Discover Android devices
    if (this.controllerFactory.listAndroidDevices) {
      try {
        const androidDevices = await this.controllerFactory.listAndroidDevices();
        for (const android of androidDevices) {
          const controller = await this.controllerFactory.createController('android', {
            adbSerial: android.serial,
          });
          await controller.initialize();
          const deviceInfo = controller.getDeviceInfo ? await controller.getDeviceInfo() : localDevice;
          const managedAndroid = DeviceAdapter.toManaged(deviceInfo);

          this.activeDevices.set(managedAndroid.id, managedAndroid);
          this.emit({ type: 'device:connected', device: managedAndroid });
        }
      } catch {
        // Android detection failed, continue
      }
    }

    return Array.from(this.activeDevices.values());
  }

  /**
   * Stop current execution
   */
  stop(): void {
    this.orchestrator?.stop();
  }

  /**
   * Get active devices
   */
  getActiveDevices(): IManagedDevice[] {
    return Array.from(this.activeDevices.values());
  }
}

// Types are exported inline via `export class/interface` above
