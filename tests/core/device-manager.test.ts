/**
 * Tests for DeviceManager - registration, heartbeat, and status management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config before importing modules that use it
vi.mock('../../src/config/index', () => ({
  default: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DEVICE_FINGERPRINT_SALT: 'test-salt',
  },
  config: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DEVICE_FINGERPRINT_SALT: 'test-salt',
  },
}));

// Mock pino logger
vi.mock('pino', () => ({
  pino: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

import { DeviceManager, type RegisterDeviceInput } from '../../src/core/DeviceManager';

describe('DeviceManager', () => {
  let manager: DeviceManager;

  const sampleInput: RegisterDeviceInput = {
    type: 'android_phone',
    name: 'Samsung Galaxy S21',
    model: 'SM-G991B',
    manufacturer: 'Samsung',
    osVersion: 'Android 13',
    sensors: ['camera', 'accelerometer', 'gps'],
    connectionType: 'usb',
    regionCode: 'ES-AN',
    rawFingerprint: 'samsung-sm-g991b-serial-12345',
  };

  beforeEach(() => {
    manager = new DeviceManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('registerDevice', () => {
    it('should register a new device with generated ID and fingerprint', async () => {
      const device = await manager.registerDevice(sampleInput);

      expect(device.id).toBeTruthy();
      expect(device.fingerprint).toBeTruthy();
      expect(device.type).toBe('android_phone');
      expect(device.name).toBe('Samsung Galaxy S21');
      expect(device.model).toBe('SM-G991B');
      expect(device.manufacturer).toBe('Samsung');
      expect(device.osVersion).toBe('Android 13');
      expect(device.sensors).toEqual(['camera', 'accelerometer', 'gps']);
      expect(device.connectionType).toBe('usb');
      expect(device.status).toBe('online');
      expect(device.totalPoints).toBe(0);
    });

    it('should emit device:connected event on registration', async () => {
      const handler = vi.fn();
      manager.on('device:connected', handler);

      const device = await manager.registerDevice(sampleInput);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(device);
    });

    it('should reconnect existing device by fingerprint', async () => {
      const first = await manager.registerDevice(sampleInput);

      // Disconnect and re-register with same fingerprint data
      manager.disconnectDevice(first.id);
      expect(manager.getDevice(first.id)!.status).toBe('offline');

      const second = await manager.registerDevice(sampleInput);

      // Should return the same device, now online again
      expect(second.id).toBe(first.id);
      expect(second.status).toBe('online');
    });

    it('should register multiple distinct devices', async () => {
      await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        name: 'Pixel 7',
        rawFingerprint: 'pixel-7-serial-99999',
      });

      expect(manager.getAllDevices()).toHaveLength(2);
    });
  });

  describe('getDevice / getAllDevices / getOnlineDevices', () => {
    it('should return device by ID', async () => {
      const device = await manager.registerDevice(sampleInput);
      expect(manager.getDevice(device.id)).toBeDefined();
      expect(manager.getDevice(device.id)!.name).toBe('Samsung Galaxy S21');
    });

    it('should return undefined for unknown ID', () => {
      expect(manager.getDevice('nonexistent')).toBeUndefined();
    });

    it('should list all devices', async () => {
      await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        rawFingerprint: 'different-device',
      });

      expect(manager.getAllDevices()).toHaveLength(2);
    });

    it('should list only online devices', async () => {
      const d1 = await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        rawFingerprint: 'different-device',
      });

      manager.disconnectDevice(d1.id);

      expect(manager.getOnlineDevices()).toHaveLength(1);
    });
  });

  describe('updateDeviceStatus', () => {
    it('should update status and emit event', async () => {
      const device = await manager.registerDevice(sampleInput);
      const handler = vi.fn();
      manager.on('device:status_changed', handler);

      manager.updateDeviceStatus(device.id, 'busy');

      expect(manager.getDevice(device.id)!.status).toBe('busy');
      expect(handler).toHaveBeenCalledWith(device.id, 'busy');
    });

    it('should not emit event when status is the same', async () => {
      const device = await manager.registerDevice(sampleInput);
      const handler = vi.fn();
      manager.on('device:status_changed', handler);

      manager.updateDeviceStatus(device.id, 'online'); // already online

      expect(handler).not.toHaveBeenCalled();
    });

    it('should throw for unknown device', () => {
      expect(() => manager.updateDeviceStatus('unknown', 'busy')).toThrow(
        'Device unknown not found'
      );
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat timestamp', async () => {
      const device = await manager.registerDevice(sampleInput);
      const initialHeartbeat = device.lastHeartbeat;

      // Small delay to ensure time difference
      await new Promise(r => setTimeout(r, 10));

      const updated = manager.heartbeat(device.id);

      expect(updated).toBeDefined();
      expect(updated!.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(
        initialHeartbeat.getTime()
      );
    });

    it('should emit device:heartbeat event', async () => {
      const device = await manager.registerDevice(sampleInput);
      const handler = vi.fn();
      manager.on('device:heartbeat', handler);

      manager.heartbeat(device.id);

      expect(handler).toHaveBeenCalledWith(device.id);
    });

    it('should bring offline device back online', async () => {
      const device = await manager.registerDevice(sampleInput);
      manager.disconnectDevice(device.id);
      expect(manager.getDevice(device.id)!.status).toBe('offline');

      manager.heartbeat(device.id);

      expect(manager.getDevice(device.id)!.status).toBe('online');
    });

    it('should return null for unknown device', () => {
      expect(manager.heartbeat('unknown')).toBeNull();
    });
  });

  describe('disconnectDevice', () => {
    it('should set device to offline', async () => {
      const device = await manager.registerDevice(sampleInput);

      manager.disconnectDevice(device.id);

      expect(manager.getDevice(device.id)!.status).toBe('offline');
    });

    it('should emit device:disconnected event', async () => {
      const device = await manager.registerDevice(sampleInput);
      const handler = vi.fn();
      manager.on('device:disconnected', handler);

      manager.disconnectDevice(device.id);

      expect(handler).toHaveBeenCalledWith(device.id);
    });

    it('should silently ignore unknown device', () => {
      // Should not throw
      manager.disconnectDevice('unknown');
    });
  });

  describe('findDevicesForTest', () => {
    it('should filter by device type', async () => {
      await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        type: 'android_tablet',
        rawFingerprint: 'tablet-fp',
      });

      const phones = manager.findDevicesForTest({
        deviceTypes: ['android_phone'],
      });

      expect(phones).toHaveLength(1);
      expect(phones[0].type).toBe('android_phone');
    });

    it('should filter by required sensors', async () => {
      await manager.registerDevice(sampleInput); // has camera, accelerometer, gps
      await manager.registerDevice({
        ...sampleInput,
        sensors: ['camera'],
        rawFingerprint: 'camera-only',
      });

      const withGps = manager.findDevicesForTest({
        sensors: ['gps'],
      });

      expect(withGps).toHaveLength(1);
    });

    it('should filter by region', async () => {
      await manager.registerDevice(sampleInput); // ES-AN
      await manager.registerDevice({
        ...sampleInput,
        regionCode: 'ES-CT',
        rawFingerprint: 'cat-device',
      });

      const andalucian = manager.findDevicesForTest({
        regions: ['ES-AN'],
      });

      expect(andalucian).toHaveLength(1);
    });

    it('should only return online devices', async () => {
      const d1 = await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        rawFingerprint: 'other-fp',
      });

      manager.disconnectDevice(d1.id);

      const available = manager.findDevicesForTest({});
      expect(available).toHaveLength(1);
    });
  });

  describe('addPoints', () => {
    it('should add points to device', async () => {
      const device = await manager.registerDevice(sampleInput);
      expect(device.totalPoints).toBe(0);

      manager.addPoints(device.id, 100);
      expect(manager.getDevice(device.id)!.totalPoints).toBe(100);

      manager.addPoints(device.id, 50);
      expect(manager.getDevice(device.id)!.totalPoints).toBe(150);
    });

    it('should throw for unknown device', () => {
      expect(() => manager.addPoints('unknown', 10)).toThrow('Device unknown not found');
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      const d1 = await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        type: 'android_tablet',
        rawFingerprint: 'tablet-fp',
        regionCode: 'ES-CT',
      });

      manager.updateDeviceStatus(d1.id, 'busy');

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.online).toBe(1);
      expect(stats.busy).toBe(1);
      expect(stats.offline).toBe(0);
      expect(stats.byType['android_phone']).toBe(1);
      expect(stats.byType['android_tablet']).toBe(1);
      expect(stats.byRegion['ES-AN']).toBe(1);
      expect(stats.byRegion['ES-CT']).toBe(1);
    });

    it('should return empty stats when no devices', () => {
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
      expect(stats.online).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should clear all devices and timers', async () => {
      await manager.registerDevice(sampleInput);
      await manager.registerDevice({
        ...sampleInput,
        rawFingerprint: 'other-fp',
      });

      manager.dispose();

      expect(manager.getAllDevices()).toHaveLength(0);
    });
  });
});
