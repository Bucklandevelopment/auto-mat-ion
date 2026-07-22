/**
 * auto-mat-ion Motion Controller Implementation
 *
 * Concrete implementation of IMotionController that controls
 * accelerometer, gyroscope, and orientation sensors through browser automation.
 *
 * Uses IBrowserController.executeScript to inject JavaScript
 * that interacts with DeviceMotion and DeviceOrientation APIs.
 */

import type { IBrowserController, Platform, Browser, IBrowserLaunchOptions } from '../core/types.js';
import type {
  IMotionController,
  PermissionState,
  SensorStream,
  SensorReading,
  AccelerometerReading,
  GyroscopeReading,
  OrientationReading,
  MotionReading,
} from './sensor-controllers.js';

/**
 * Browser-side script storage key
 */
const STORAGE_KEY = '__autoMationMotion__';

/**
 * Browser-side initialization script
 */
const INIT_SCRIPT = `
  if (!window.${STORAGE_KEY}) {
    window.${STORAGE_KEY} = {
      // Sensor state
      accelerometerStream: null,
      gyroscopeStream: null,
      orientationStream: null,
      motionStream: null,

      // Calibration offsets
      calibration: { x: 0, y: 0, z: 0 },

      // Sample rate control
      sampleRate: 60, // Hz
      lastSampleTime: 0,

      // Event listeners
      motionHandler: null,
      orientationHandler: null,

      // Callbacks
      onShakeCallbacks: [],
      onTiltCallbacks: [],

      // Shake detection state
      lastAcceleration: null,
      shakeThreshold: 15,

      // Permission state
      permissionGranted: false,

      // Sensor availability cache
      hasAccelerometer: 'DeviceMotionEvent' in window,
      hasGyroscope: 'DeviceMotionEvent' in window,
      hasOrientation: 'DeviceOrientationEvent' in window,
    };
  }
  true;
`;

/**
 * MotionController implementation
 */
export class MotionController implements IMotionController {
  private baseController: IBrowserController;
  private initialized = false;

  constructor(controller: IBrowserController) {
    this.baseController = controller;
  }

  // ============================================================================
  // IBrowserController delegation
  // ============================================================================

  get platform(): Platform {
    return this.baseController.platform;
  }

  get supportedBrowsers(): Browser[] {
    return this.baseController.supportedBrowsers;
  }

  async initialize(): Promise<void> {
    await this.baseController.initialize();
    await this.baseController.executeScript(INIT_SCRIPT);
    this.initialized = true;
  }

  async isReady(): Promise<boolean> {
    return this.initialized && await this.baseController.isReady();
  }

  async launchBrowser(browser: Browser, options?: IBrowserLaunchOptions): Promise<void> {
    await this.baseController.launchBrowser(browser, options);
    await this.baseController.executeScript(INIT_SCRIPT);
  }

  async navigateTo(url: string): Promise<void> {
    await this.baseController.navigateTo(url);
    await this.baseController.executeScript(INIT_SCRIPT);
  }

  async executeScript<T>(script: string, timeout?: number): Promise<T> {
    return this.baseController.executeScript<T>(script, timeout);
  }

  async waitForElement(selector: string, timeout?: number): Promise<boolean> {
    return this.baseController.waitForElement(selector, timeout);
  }

  async clickElement(selector: string): Promise<void> {
    return this.baseController.clickElement(selector);
  }

  async getConsoleLogs(): Promise<string[]> {
    return this.baseController.getConsoleLogs();
  }

  async takeScreenshot(path: string): Promise<void> {
    return this.baseController.takeScreenshot(path);
  }

  async closeBrowser(): Promise<void> {
    await this.stopAllSensors();
    return this.baseController.closeBrowser();
  }

  async cleanup(): Promise<void> {
    await this.stopAllSensors();
    return this.baseController.cleanup();
  }

  private async stopAllSensors(): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        if (storage.motionHandler) {
          window.removeEventListener('devicemotion', storage.motionHandler);
          storage.motionHandler = null;
        }

        if (storage.orientationHandler) {
          window.removeEventListener('deviceorientation', storage.orientationHandler);
          storage.orientationHandler = null;
        }

        storage.accelerometerStream = null;
        storage.gyroscopeStream = null;
        storage.orientationStream = null;
        storage.motionStream = null;

        return true;
      })()
    `;
    await this.executeScript(script);
  }

  // ============================================================================
  // IMotionController - Permission
  // ============================================================================

  async requestMotionPermission(): Promise<PermissionState> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        // Check if permission API exists (iOS 13+)
        if (typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function') {
          try {
            const response = await DeviceMotionEvent.requestPermission();
            storage.permissionGranted = response === 'granted';
            return {
              granted: response === 'granted',
              denied: response === 'denied',
              prompt: response === 'prompt',
            };
          } catch (error) {
            return {
              granted: false,
              denied: true,
              prompt: false,
              error: error.message
            };
          }
        }

        // No permission needed (Android, desktop)
        storage.permissionGranted = true;
        return {
          granted: true,
          denied: false,
          prompt: false,
        };
      })()
    `;
    return this.executeScript<PermissionState>(script);
  }

  // ============================================================================
  // IMotionController - Accelerometer
  // ============================================================================

  isAccelerometerAvailable(): boolean {
    return true; // Sync - actual check is async
  }

  async isAccelerometerAvailableAsync(): Promise<boolean> {
    const script = `'DeviceMotionEvent' in window`;
    return this.executeScript<boolean>(script);
  }

  async startAccelerometer(frequency: number = 60): Promise<SensorStream<AccelerometerReading>> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        storage.sampleRate = ${frequency};
        storage.accelerometerStream = {
          running: true,
          callbacks: [],
          errorCallbacks: [],
          readings: [],
        };

        // Create or update motion handler
        if (!storage.motionHandler) {
          storage.motionHandler = (event) => {
            const now = Date.now();
            const interval = 1000 / storage.sampleRate;

            if (now - storage.lastSampleTime < interval) return;
            storage.lastSampleTime = now;

            if (event.accelerationIncludingGravity) {
              const reading = {
                timestamp: now,
                data: {
                  x: (event.accelerationIncludingGravity.x || 0) - storage.calibration.x,
                  y: (event.accelerationIncludingGravity.y || 0) - storage.calibration.y,
                  z: (event.accelerationIncludingGravity.z || 0) - storage.calibration.z,
                },
                accuracy: 'medium'
              };

              if (storage.accelerometerStream?.running) {
                storage.accelerometerStream.readings.push(reading);
                storage.accelerometerStream.callbacks.forEach(cb => cb(reading));

                // Keep only last 100 readings
                if (storage.accelerometerStream.readings.length > 100) {
                  storage.accelerometerStream.readings.shift();
                }
              }

              // Shake detection
              if (storage.lastAcceleration) {
                const deltaX = Math.abs(reading.data.x - storage.lastAcceleration.x);
                const deltaY = Math.abs(reading.data.y - storage.lastAcceleration.y);
                const deltaZ = Math.abs(reading.data.z - storage.lastAcceleration.z);
                const totalDelta = deltaX + deltaY + deltaZ;

                if (totalDelta > storage.shakeThreshold) {
                  storage.onShakeCallbacks.forEach(cb => cb(totalDelta));
                }
              }
              storage.lastAcceleration = reading.data;
            }
          };

          window.addEventListener('devicemotion', storage.motionHandler, true);
        }

        return { streamId: 'accelerometer-' + Date.now() };
      })()
    `;

    await this.executeScript<{ streamId: string }>(script);

    // Return a proxy stream object
    const controller = this;
    return {
      async start() {
        // Already started above
      },
      async stop() {
        await controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.accelerometerStream) {
            storage.accelerometerStream.running = false;
          }
        `);
      },
      pause() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.accelerometerStream) {
            storage.accelerometerStream.running = false;
          }
        `);
      },
      resume() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.accelerometerStream) {
            storage.accelerometerStream.running = true;
          }
        `);
      },
      onReading(callback: (reading: SensorReading<AccelerometerReading>) => void) {
        // Would need polling mechanism
        console.log('onReading registered - needs polling implementation');
      },
      onError(callback: (error: Error) => void) {
        console.log('onError registered - needs polling implementation');
      },
    };
  }

  // ============================================================================
  // IMotionController - Gyroscope
  // ============================================================================

  isGyroscopeAvailable(): boolean {
    return true;
  }

  async startGyroscope(frequency: number = 60): Promise<SensorStream<GyroscopeReading>> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        storage.sampleRate = ${frequency};
        storage.gyroscopeStream = {
          running: true,
          callbacks: [],
          errorCallbacks: [],
          readings: [],
        };

        // Extend motion handler for gyroscope
        const existingHandler = storage.motionHandler;
        storage.motionHandler = (event) => {
          // Call existing accelerometer handler
          if (existingHandler) existingHandler(event);

          const now = Date.now();
          if (event.rotationRate && storage.gyroscopeStream?.running) {
            const reading = {
              timestamp: now,
              data: {
                x: event.rotationRate.alpha || 0,
                y: event.rotationRate.beta || 0,
                z: event.rotationRate.gamma || 0,
              },
              accuracy: 'medium'
            };

            storage.gyroscopeStream.readings.push(reading);
            storage.gyroscopeStream.callbacks.forEach(cb => cb(reading));

            if (storage.gyroscopeStream.readings.length > 100) {
              storage.gyroscopeStream.readings.shift();
            }
          }
        };

        // Ensure listener is set
        window.removeEventListener('devicemotion', existingHandler, true);
        window.addEventListener('devicemotion', storage.motionHandler, true);

        return { streamId: 'gyroscope-' + Date.now() };
      })()
    `;

    await this.executeScript<{ streamId: string }>(script);

    const controller = this;
    return {
      async start() {},
      async stop() {
        await controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.gyroscopeStream) {
            storage.gyroscopeStream.running = false;
          }
        `);
      },
      pause() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.gyroscopeStream) {
            storage.gyroscopeStream.running = false;
          }
        `);
      },
      resume() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.gyroscopeStream) {
            storage.gyroscopeStream.running = true;
          }
        `);
      },
      onReading(callback: (reading: SensorReading<GyroscopeReading>) => void) {
        console.log('onReading registered - needs polling implementation');
      },
      onError(callback: (error: Error) => void) {
        console.log('onError registered - needs polling implementation');
      },
    };
  }

  // ============================================================================
  // IMotionController - Orientation
  // ============================================================================

  isOrientationAvailable(): boolean {
    return true;
  }

  async startOrientation(): Promise<SensorStream<OrientationReading>> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        storage.orientationStream = {
          running: true,
          callbacks: [],
          errorCallbacks: [],
          readings: [],
        };

        storage.orientationHandler = (event) => {
          if (!storage.orientationStream?.running) return;

          const now = Date.now();
          const reading = {
            timestamp: now,
            data: {
              alpha: event.alpha,
              beta: event.beta,
              gamma: event.gamma,
              absolute: event.absolute || false,
            },
            accuracy: event.absolute ? 'high' : 'medium'
          };

          storage.orientationStream.readings.push(reading);
          storage.orientationStream.callbacks.forEach(cb => cb(reading));

          // Tilt detection
          storage.onTiltCallbacks.forEach(cb => cb({
            x: event.beta || 0,
            y: event.gamma || 0
          }));

          if (storage.orientationStream.readings.length > 100) {
            storage.orientationStream.readings.shift();
          }
        };

        window.addEventListener('deviceorientation', storage.orientationHandler, true);

        return { streamId: 'orientation-' + Date.now() };
      })()
    `;

    await this.executeScript<{ streamId: string }>(script);

    const controller = this;
    return {
      async start() {},
      async stop() {
        await controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.orientationHandler) {
            window.removeEventListener('deviceorientation', storage.orientationHandler, true);
            storage.orientationHandler = null;
          }
          storage.orientationStream = null;
        `);
      },
      pause() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.orientationStream) {
            storage.orientationStream.running = false;
          }
        `);
      },
      resume() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.orientationStream) {
            storage.orientationStream.running = true;
          }
        `);
      },
      onReading(callback: (reading: SensorReading<OrientationReading>) => void) {
        console.log('onReading registered - needs polling implementation');
      },
      onError(callback: (error: Error) => void) {
        console.log('onError registered - needs polling implementation');
      },
    };
  }

  // ============================================================================
  // IMotionController - Combined Motion
  // ============================================================================

  isMotionAvailable(): boolean {
    return true;
  }

  async startMotion(): Promise<SensorStream<MotionReading>> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        storage.motionStream = {
          running: true,
          callbacks: [],
          errorCallbacks: [],
          readings: [],
        };

        storage.motionHandler = (event) => {
          if (!storage.motionStream?.running) return;

          const now = Date.now();
          const reading = {
            timestamp: now,
            data: {
              acceleration: event.acceleration ? {
                x: event.acceleration.x || 0,
                y: event.acceleration.y || 0,
                z: event.acceleration.z || 0,
              } : null,
              accelerationIncludingGravity: event.accelerationIncludingGravity ? {
                x: event.accelerationIncludingGravity.x || 0,
                y: event.accelerationIncludingGravity.y || 0,
                z: event.accelerationIncludingGravity.z || 0,
              } : null,
              rotationRate: event.rotationRate ? {
                x: event.rotationRate.alpha || 0,
                y: event.rotationRate.beta || 0,
                z: event.rotationRate.gamma || 0,
              } : null,
              interval: event.interval || 16,
            },
            accuracy: 'medium'
          };

          storage.motionStream.readings.push(reading);
          storage.motionStream.callbacks.forEach(cb => cb(reading));

          if (storage.motionStream.readings.length > 100) {
            storage.motionStream.readings.shift();
          }
        };

        window.addEventListener('devicemotion', storage.motionHandler, true);

        return { streamId: 'motion-' + Date.now() };
      })()
    `;

    await this.executeScript<{ streamId: string }>(script);

    const controller = this;
    return {
      async start() {},
      async stop() {
        await controller.stopAllSensors();
      },
      pause() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.motionStream) {
            storage.motionStream.running = false;
          }
        `);
      },
      resume() {
        controller.executeScript(`
          const storage = window.${STORAGE_KEY};
          if (storage.motionStream) {
            storage.motionStream.running = true;
          }
        `);
      },
      onReading(callback: (reading: SensorReading<MotionReading>) => void) {
        console.log('onReading registered - needs polling implementation');
      },
      onError(callback: (error: Error) => void) {
        console.log('onError registered - needs polling implementation');
      },
    };
  }

  // ============================================================================
  // IMotionController - Calibration
  // ============================================================================

  async calibrateSensors(): Promise<void> {
    const script = `
      new Promise((resolve) => {
        const storage = window.${STORAGE_KEY};
        let samples = [];
        let count = 0;
        const sampleCount = 10;

        const calibrationHandler = (event) => {
          if (event.accelerationIncludingGravity && count < sampleCount) {
            samples.push({
              x: event.accelerationIncludingGravity.x || 0,
              y: event.accelerationIncludingGravity.y || 0,
              z: event.accelerationIncludingGravity.z || 0,
            });
            count++;

            if (count >= sampleCount) {
              // Calculate average
              const avg = samples.reduce((acc, s) => ({
                x: acc.x + s.x / sampleCount,
                y: acc.y + s.y / sampleCount,
                z: acc.z + s.z / sampleCount,
              }), { x: 0, y: 0, z: 0 });

              // Store calibration (subtract gravity on Z axis)
              storage.calibration = {
                x: avg.x,
                y: avg.y,
                z: avg.z - 9.81, // Assume device is flat, Z = gravity
              };

              window.removeEventListener('devicemotion', calibrationHandler);
              resolve(true);
            }
          }
        };

        window.addEventListener('devicemotion', calibrationHandler, true);

        // Timeout after 2 seconds
        setTimeout(() => {
          window.removeEventListener('devicemotion', calibrationHandler);
          resolve(false);
        }, 2000);
      })
    `;
    await this.executeScript(script);
  }

  resetCalibration(): void {
    const script = `
      window.${STORAGE_KEY}.calibration = { x: 0, y: 0, z: 0 };
      true;
    `;
    this.executeScript(script);
  }

  // ============================================================================
  // IMotionController - Sampling
  // ============================================================================

  getSampleRate(): number {
    return 60; // Default, actual value is in browser
  }

  async getSampleRateAsync(): Promise<number> {
    const script = `window.${STORAGE_KEY}.sampleRate`;
    return this.executeScript<number>(script);
  }

  setSampleRate(hz: number): void {
    const script = `window.${STORAGE_KEY}.sampleRate = ${hz}; true;`;
    this.executeScript(script);
  }

  // ============================================================================
  // IMotionController - Events
  // ============================================================================

  onShake(callback: (intensity: number) => void, threshold: number = 15): void {
    const script = `
      window.${STORAGE_KEY}.shakeThreshold = ${threshold};
      true;
    `;
    this.executeScript(script);
    console.log('onShake registered - needs polling implementation');
  }

  onTilt(callback: (angle: { x: number; y: number }) => void): void {
    console.log('onTilt registered - needs polling implementation');
  }

  // ============================================================================
  // Utility: Get latest readings
  // ============================================================================

  async getLatestAccelerometerReadings(count: number = 10): Promise<SensorReading<AccelerometerReading>[]> {
    const script = `
      const storage = window.${STORAGE_KEY};
      const readings = storage.accelerometerStream?.readings || [];
      return readings.slice(-${count});
    `;
    return this.executeScript<SensorReading<AccelerometerReading>[]>(script);
  }

  async getLatestGyroscopeReadings(count: number = 10): Promise<SensorReading<GyroscopeReading>[]> {
    const script = `
      const storage = window.${STORAGE_KEY};
      const readings = storage.gyroscopeStream?.readings || [];
      return readings.slice(-${count});
    `;
    return this.executeScript<SensorReading<GyroscopeReading>[]>(script);
  }

  async getLatestOrientationReadings(count: number = 10): Promise<SensorReading<OrientationReading>[]> {
    const script = `
      const storage = window.${STORAGE_KEY};
      const readings = storage.orientationStream?.readings || [];
      return readings.slice(-${count});
    `;
    return this.executeScript<SensorReading<OrientationReading>[]>(script);
  }
}

/**
 * Factory function to create MotionController
 */
export function createMotionController(baseController: IBrowserController): IMotionController {
  return new MotionController(baseController);
}
