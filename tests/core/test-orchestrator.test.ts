/**
 * Tests for TestOrchestrator - lifecycle and consensus calculation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock config before importing modules that use it
vi.mock('../../src/config/index', () => ({
  default: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CONSENSUS_MIN_DEVICES: 3,
    POINTS_TEST_BASIC: 1,
    POINTS_TEST_SUITE: 10,
    DEVICE_FINGERPRINT_SALT: 'test-salt',
  },
  config: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CONSENSUS_MIN_DEVICES: 3,
    POINTS_TEST_BASIC: 1,
    POINTS_TEST_SUITE: 10,
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

import { TestOrchestrator, type CreateTestInput } from '../../src/core/TestOrchestrator';
import { DeviceManager } from '../../src/core/DeviceManager';

/**
 * Helper: register a test device in the device manager
 */
async function registerTestDevice(
  manager: DeviceManager,
  id: string,
): Promise<void> {
  const device = await manager.registerDevice({
    type: 'android_phone',
    name: `Test Device ${id}`,
    connectionType: 'usb',
    rawFingerprint: `fp-${id}`,
  });
  // Override the generated ID so our tests can reference a known device ID.
  // DeviceManager stores by ID in a Map, so we re-insert with the desired key.
  const allDevices = manager.getAllDevices();
  const registered = allDevices.find(d => d.fingerprint.length > 0 && d.name === `Test Device ${id}`);
  if (registered) {
    // We'll just use the generated ID - tests will look it up
    return;
  }
}

describe('TestOrchestrator', () => {
  let orchestrator: TestOrchestrator;
  let deviceManager: DeviceManager;
  let deviceIds: string[];

  beforeEach(async () => {
    deviceManager = new DeviceManager();
    orchestrator = new TestOrchestrator(deviceManager);
    deviceIds = [];

    // Register 3 test devices and capture their IDs
    for (let i = 1; i <= 3; i++) {
      const device = await deviceManager.registerDevice({
        type: 'android_phone',
        name: `TestDevice${i}`,
        connectionType: 'usb',
        rawFingerprint: `test-fp-${i}`,
        sensors: ['camera', 'accelerometer'],
      });
      deviceIds.push(device.id);
    }
  });

  afterEach(() => {
    orchestrator.dispose();
    deviceManager.dispose();
  });

  describe('createTest', () => {
    it('should create a test with generated ID and queued status', () => {
      const input: CreateTestInput = {
        projectId: 'project-001',
        type: 'unit',
        name: 'Test basic sensor reading',
      };

      const test = orchestrator.createTest(input);

      expect(test.id).toBeTruthy();
      expect(test.projectId).toBe('project-001');
      expect(test.type).toBe('unit');
      expect(test.name).toBe('Test basic sensor reading');
      expect(test.status).toBe('queued');
      expect(test.priority).toBe(0);
      expect(test.retries).toBe(0);
      expect(test.maxRetries).toBe(3);
    });

    it('should respect custom priority and timeout', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'e2e',
        name: 'High priority test',
        priority: 10,
        timeout: 60000,
      });

      expect(test.priority).toBe(10);
      expect(test.timeout).toBe(60000);
    });

    it('should emit test:queued event', () => {
      const handler = vi.fn();
      orchestrator.on('test:queued', handler);

      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(test);
    });

    it('should set default requirements', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
      });

      expect(test.requirements.minDevices).toBe(1);
    });

    it('should accept custom requirements', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'sensor_reading',
        name: 'Multi-device sensor test',
        requirements: {
          sensors: ['camera', 'accelerometer'],
          minDevices: 3,
          maxDevices: 10,
        },
      });

      expect(test.requirements.sensors).toEqual(['camera', 'accelerometer']);
      expect(test.requirements.minDevices).toBe(3);
      expect(test.requirements.maxDevices).toBe(10);
    });
  });

  describe('getTest', () => {
    it('should return test by ID', () => {
      const created = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
      });

      const retrieved = orchestrator.getTest(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return undefined for unknown ID', () => {
      expect(orchestrator.getTest('nonexistent')).toBeUndefined();
    });
  });

  describe('receiveResult', () => {
    it('should store result for a test', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
        requirements: { minDevices: 2 }, // need 2 so first result doesn't auto-complete
      });

      // Set test to running
      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      const result = orchestrator.receiveResult(test.id, deviceIds[0], { value: 42 });

      expect(result.id).toBeTruthy();
      expect(result.testId).toBe(test.id);
      expect(result.deviceId).toBe(deviceIds[0]);
      expect(result.output).toEqual({ value: 42 });
    });

    it('should mark result as rejected when error is present', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
        requirements: { minDevices: 2 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      const result = orchestrator.receiveResult(
        test.id,
        deviceIds[0],
        null,
        undefined,
        'Device crashed'
      );

      expect(result.status).toBe('rejected');
      expect(result.error).toBe('Device crashed');
    });

    it('should emit result:received event', () => {
      const handler = vi.fn();
      orchestrator.on('result:received', handler);

      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
        requirements: { minDevices: 2 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      orchestrator.receiveResult(test.id, deviceIds[0], 100);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should throw for unknown test ID', () => {
      expect(() =>
        orchestrator.receiveResult('unknown', deviceIds[0], null)
      ).toThrow('Test unknown not found');
    });

    it('should auto-complete test when minDevices results received', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
        requirements: { minDevices: 1 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      orchestrator.receiveResult(test.id, deviceIds[0], 42);

      // Test should be completed after receiving minDevices results
      expect(orchestrator.getTest(test.id)!.status).toBe('completed');
    });
  });

  describe('validateResult - consensus calculation', () => {
    it('should validate with low confidence when not enough devices for consensus', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Test',
        requirements: { minDevices: 2 }, // not enough for CONSENSUS_MIN_DEVICES=3
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      // First result (won't trigger completion)
      orchestrator.receiveResult(test.id, deviceIds[0], 42);

      // Get the result and manually validate it (before auto-completion)
      const results = orchestrator.getTestResults(test.id);
      const validated = orchestrator.validateResult(results[0].id, test.id);

      expect(validated.status).toBe('validated');
      expect(validated.validation).toBeDefined();
      expect(validated.validation!.confidence).toBe(0.5);
      expect(validated.validation!.consensusDevices).toBe(1);
      expect(validated.validation!.anomalyDetected).toBe(false);
    });

    it('should validate with consensus when enough numeric results agree', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'sensor_reading',
        name: 'Temperature test',
        requirements: { minDevices: 4 }, // set high so we can add 3 results without auto-completing
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      // Submit multiple similar results
      orchestrator.receiveResult(test.id, deviceIds[0], 22.5);
      orchestrator.receiveResult(test.id, deviceIds[1], 22.3);
      const r3 = orchestrator.receiveResult(test.id, deviceIds[2], 22.4);

      // Validate the third result - should have high confidence since values agree
      const validated = orchestrator.validateResult(r3.id, test.id);

      expect(validated.status).toBe('validated');
      expect(validated.validation!.confidence).toBeGreaterThan(0.7);
      expect(validated.validation!.anomalyDetected).toBe(false);
    });

    it('should detect anomaly when result deviates significantly', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'sensor_reading',
        name: 'Temperature test',
        requirements: { minDevices: 4 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      // Submit consistent results
      orchestrator.receiveResult(test.id, deviceIds[0], 22.5);
      orchestrator.receiveResult(test.id, deviceIds[1], 22.3);
      // Submit anomalous result
      const anomaly = orchestrator.receiveResult(test.id, deviceIds[2], 100.0);

      const validated = orchestrator.validateResult(anomaly.id, test.id);

      expect(validated.validation!.anomalyDetected).toBe(true);
      expect(validated.status).toBe('anomaly');
    });

    it('should accept non-numeric results with medium confidence', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'e2e',
        name: 'UI test',
        requirements: { minDevices: 4 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      orchestrator.receiveResult(test.id, deviceIds[0], { pass: true });
      orchestrator.receiveResult(test.id, deviceIds[1], { pass: true });
      const r3 = orchestrator.receiveResult(test.id, deviceIds[2], { pass: true });

      const validated = orchestrator.validateResult(r3.id, test.id);

      expect(validated.status).toBe('validated');
      expect(validated.validation!.confidence).toBe(0.75);
    });
  });

  describe('points calculation', () => {
    it('should award basic points for unit tests', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'unit',
        name: 'Basic test',
        requirements: { minDevices: 2 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      const result = orchestrator.receiveResult(test.id, deviceIds[0], 42);
      const validated = orchestrator.validateResult(result.id, test.id);

      expect(validated.pointsAwarded).toBe(1); // POINTS_TEST_BASIC
    });

    it('should award suite points for e2e tests', () => {
      const test = orchestrator.createTest({
        projectId: 'p1',
        type: 'e2e',
        name: 'E2E test',
        requirements: { minDevices: 2 },
      });

      const t = orchestrator.getTest(test.id)!;
      t.status = 'running';

      const result = orchestrator.receiveResult(test.id, deviceIds[0], { pass: true });
      const validated = orchestrator.validateResult(result.id, test.id);

      // e2e gets POINTS_TEST_SUITE (10), confidence 0.5, so no 1.5x bonus
      expect(validated.pointsAwarded).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty orchestrator', () => {
      const stats = orchestrator.getStats();

      expect(stats.totalTests).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.totalResults).toBe(0);
      expect(stats.validatedResults).toBe(0);
    });

    it('should track tests correctly', () => {
      orchestrator.createTest({ projectId: 'p1', type: 'unit', name: 'T1' });
      orchestrator.createTest({ projectId: 'p1', type: 'unit', name: 'T2' });

      const stats = orchestrator.getStats();

      expect(stats.totalTests).toBe(2);
      expect(stats.queued).toBe(2);
    });
  });

  describe('dispose', () => {
    it('should clear all state', () => {
      orchestrator.createTest({ projectId: 'p1', type: 'unit', name: 'T1' });
      orchestrator.createTest({ projectId: 'p1', type: 'unit', name: 'T2' });

      orchestrator.dispose();

      const stats = orchestrator.getStats();
      expect(stats.totalTests).toBe(0);
    });
  });
});
