/**
 * Tests for execution layer adapters
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeviceAdapter,
  ResultAdapter,
  type IManagedDevice,
  type IManagedResult,
  type ITestRequest,
} from '../../src/execution/adapters/index';
import type { IDeviceInfo, IExecutionTestResult } from '../../src/execution/core/types';

describe('DeviceAdapter', () => {
  const mockDevice: IDeviceInfo = {
    id: 'android-001',
    name: 'Samsung Galaxy S21',
    platform: 'android',
    deviceType: 'mobile',
    osVersion: 'Android 13',
    browsers: ['chrome'],
    cameras: [
      { deviceId: 'cam-back', label: 'Back Camera', type: 'real', isFrontFacing: false },
      { deviceId: 'cam-front', label: 'Front Camera', type: 'real', isFrontFacing: true },
    ],
    screenResolution: { width: 1080, height: 2400 },
    supportsOrientation: true,
    connectionType: 'usb',
    adbSerial: 'RF8M33XXXXX',
  };

  describe('toManaged', () => {
    it('should convert IDeviceInfo to IManagedDevice', () => {
      const managed = DeviceAdapter.toManaged(mockDevice);

      expect(managed.id).toBe('android-001');
      expect(managed.name).toBe('Samsung Galaxy S21');
      expect(managed.platform).toBe('android');
      expect(managed.status).toBe('online');
      expect(managed.capabilities).toContain('mobile');
      expect(managed.capabilities).toContain('touch');
      expect(managed.capabilities).toContain('hardware-camera');
    });

    it('should set custom status', () => {
      const managed = DeviceAdapter.toManaged(mockDevice, 'busy');
      expect(managed.status).toBe('busy');
    });

    it('should add desktop capabilities for desktop platforms', () => {
      const desktopDevice: IDeviceInfo = {
        ...mockDevice,
        id: 'macos-001',
        platform: 'macos',
        deviceType: 'desktop',
      };

      const managed = DeviceAdapter.toManaged(desktopDevice);
      expect(managed.capabilities).toContain('desktop');
      expect(managed.capabilities).not.toContain('mobile');
    });
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprint', () => {
      const fp1 = DeviceAdapter.generateFingerprint(mockDevice);
      const fp2 = DeviceAdapter.generateFingerprint(mockDevice);

      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^dev_[a-f0-9]+$/);
    });

    it('should generate different fingerprints for different devices', () => {
      const otherDevice: IDeviceInfo = {
        ...mockDevice,
        id: 'different-device',
        name: 'Pixel 7',
      };

      const fp1 = DeviceAdapter.generateFingerprint(mockDevice);
      const fp2 = DeviceAdapter.generateFingerprint(otherDevice);

      expect(fp1).not.toBe(fp2);
    });
  });
});

describe('ResultAdapter', () => {
  const mockDevice: IDeviceInfo = {
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

  const mockExecutionResult: IExecutionTestResult = {
    config: {
      id: 'test-001',
      device: mockDevice,
      browser: 'chrome',
      camera: mockDevice.cameras[0],
      testUrl: 'https://test.com',
      orientation: 'portrait',
      parameters: {},
      repetition: 1,
    },
    status: 'completed',
    output: {
      verdict: 'pass',
      confidence: 0.95,
    },
    environment: {
      timestamp: '2026-01-30T12:00:00Z',
      platform: 'android',
      osVersion: 'Android 13',
      browserVersion: 'Chrome 120',
      userAgent: 'Mozilla/5.0...',
      screenResolution: '1080x1920',
      devicePixelRatio: 2,
      cameraLabel: 'Camera',
      cameraDeviceId: 'cam',
      cameraType: 'real',
      orientation: 'portrait',
    },
    duration: 5000,
  };

  const mockTestRequest: ITestRequest = {
    id: 'request-001',
    projectId: 'project-001',
    userId: 'user-001',
    deviceIds: ['device-001'],
    testType: 'automation',
    parameters: {},
    priority: 1,
    createdAt: new Date(),
  };

  describe('toManaged', () => {
    it('should convert execution result to managed result', () => {
      const managed = ResultAdapter.toManaged(
        mockExecutionResult,
        mockTestRequest,
        'user-001'
      );

      expect(managed.testRequestId).toBe('request-001');
      expect(managed.deviceId).toBe('device-001');
      expect(managed.userId).toBe('user-001');
      expect(managed.projectId).toBe('project-001');
      expect(managed.status).toBe('success');
      expect(managed.verdict).toBe('pass');
      expect(managed.confidence).toBe(0.95);
      expect(managed.duration).toBe(5000);
    });

    it('should map failed status correctly', () => {
      const failedResult: IExecutionTestResult = {
        ...mockExecutionResult,
        status: 'failed',
        error: 'Test failed',
      };

      const managed = ResultAdapter.toManaged(failedResult, mockTestRequest, 'user-001');
      expect(managed.status).toBe('failure');
    });
  });

  describe('calculateContribution', () => {
    it('should calculate points with multipliers', () => {
      const managedDevice: IManagedDevice = {
        id: 'device-001',
        fingerprint: 'dev_abc123',
        name: 'Test Device',
        platform: 'android',
        capabilities: ['mobile', 'hardware-camera'],
        status: 'online',
        lastSeen: new Date(),
      };

      const managedResult: IManagedResult = {
        id: 'result-001',
        testRequestId: 'request-001',
        deviceId: 'device-001',
        userId: 'user-001',
        projectId: 'project-001',
        status: 'success',
        confidence: 0.95,
        duration: 5000,
        environment: {},
        createdAt: new Date(),
      };

      const contribution = ResultAdapter.calculateContribution(
        managedResult,
        managedDevice,
        { testsToday: 0, currentStreak: 5 }
      );

      expect(contribution.userId).toBe('user-001');
      expect(contribution.deviceId).toBe('device-001');
      expect(contribution.points).toBeGreaterThan(0);
      expect(contribution.multipliers.firstOfDay).toBe(2.0); // First test of day
      expect(contribution.multipliers.deviceRarity).toBe(1.3); // Android device
      expect(contribution.multipliers.streak).toBeGreaterThan(1.0); // Has streak
    });

    it('should give lower points for failed tests', () => {
      const managedDevice: IManagedDevice = {
        id: 'device-001',
        fingerprint: 'dev_abc123',
        name: 'Test Device',
        platform: 'windows',
        capabilities: ['desktop'],
        status: 'online',
        lastSeen: new Date(),
      };

      const successResult: IManagedResult = {
        id: 'result-001',
        testRequestId: 'request-001',
        deviceId: 'device-001',
        userId: 'user-001',
        projectId: 'project-001',
        status: 'success',
        duration: 5000,
        environment: {},
        createdAt: new Date(),
      };

      const failedResult: IManagedResult = {
        ...successResult,
        status: 'failure',
      };

      const userStats = { testsToday: 5, currentStreak: 0 };

      const successContrib = ResultAdapter.calculateContribution(successResult, managedDevice, userStats);
      const failedContrib = ResultAdapter.calculateContribution(failedResult, managedDevice, userStats);

      expect(successContrib.points).toBeGreaterThan(failedContrib.points);
    });
  });
});
