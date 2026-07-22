/**
 * Tests for execution layer types
 */

import { describe, it, expect } from 'vitest';
import type {
  Platform,
  Browser,
  CameraType,
  IDeviceInfo,
  ITestConfig,
  ITestExecutor,
  IBrowserController,
} from '../../src/execution/core/types';

describe('Execution Types', () => {
  describe('Platform type', () => {
    it('should accept valid platforms', () => {
      const platforms: Platform[] = ['android', 'ios', 'macos', 'windows', 'linux'];
      expect(platforms).toHaveLength(5);
    });
  });

  describe('Browser type', () => {
    it('should accept valid browsers', () => {
      const browsers: Browser[] = ['chrome', 'firefox', 'safari', 'edge', 'chromium'];
      expect(browsers).toHaveLength(5);
    });
  });

  describe('CameraType', () => {
    it('should accept valid camera types', () => {
      const types: CameraType[] = ['real', 'virtual', 'unknown'];
      expect(types).toHaveLength(3);
    });
  });

  describe('IDeviceInfo', () => {
    it('should create valid device info', () => {
      const device: IDeviceInfo = {
        id: 'test-device-001',
        name: 'Test Android Device',
        platform: 'android',
        deviceType: 'mobile',
        osVersion: 'Android 13',
        browsers: ['chrome'],
        cameras: [
          {
            deviceId: 'cam-001',
            label: 'Back Camera',
            type: 'real',
            isFrontFacing: false,
          },
        ],
        screenResolution: { width: 1080, height: 2400 },
        supportsOrientation: true,
        connectionType: 'usb',
        adbSerial: 'emulator-5554',
      };

      expect(device.id).toBe('test-device-001');
      expect(device.platform).toBe('android');
      expect(device.cameras).toHaveLength(1);
      expect(device.cameras[0].type).toBe('real');
    });
  });

  describe('ITestConfig', () => {
    it('should create valid test config', () => {
      const device: IDeviceInfo = {
        id: 'device-001',
        name: 'Test Device',
        platform: 'android',
        deviceType: 'mobile',
        osVersion: 'Android 13',
        browsers: ['chrome'],
        cameras: [{ deviceId: 'cam', label: 'Camera', type: 'real' }],
        screenResolution: { width: 1080, height: 1920 },
        supportsOrientation: true,
        connectionType: 'usb',
      };

      const config: ITestConfig = {
        id: 'test-001',
        device,
        browser: 'chrome',
        camera: device.cameras[0],
        testUrl: 'https://example.com/test',
        orientation: 'portrait',
        parameters: { timeout: 30000 },
        repetition: 1,
      };

      expect(config.id).toBe('test-001');
      expect(config.browser).toBe('chrome');
      expect(config.testUrl).toBe('https://example.com/test');
    });
  });

  describe('ITestExecutor', () => {
    it('should create valid test executor', async () => {
      const mockController = {} as IBrowserController;
      const mockConfig = {} as ITestConfig;

      const executor: ITestExecutor = {
        name: 'SimpleTest',
        async setup(controller, config) {
          // Setup logic
        },
        async execute(controller, config) {
          return {
            verdict: 'pass',
            confidence: 0.95,
            data: { someResult: true },
          };
        },
        async teardown(controller, config) {
          // Teardown logic
        },
      };

      expect(executor.name).toBe('SimpleTest');

      const result = await executor.execute(mockController, mockConfig);
      expect(result.verdict).toBe('pass');
      expect(result.confidence).toBe(0.95);
    });
  });
});
