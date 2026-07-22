/**
 * Tests for vital-core integration client.
 *
 * Validates that VitalCoreClient aligns with vital-core contracts:
 * - Redis channels use "vital.{category}" format (matching EventBus.CHANNELS)
 * - postEventToGateway sends snake_case fields (matching EventCreate Pydantic model)
 * - Default config matches vital-core settings (ports, URLs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VitalCoreClient,
  getVitalCoreClient,
  createVitalCoreClient,
  DEFAULT_VITAL_CONFIG,
  type VitalCoreConfig,
} from '../../src/integrations/vital-core';

// Mock ioredis
const mockPublish = vi.fn().mockResolvedValue(1);
const mockSetex = vi.fn().mockResolvedValue('OK');
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockQuit = vi.fn().mockResolvedValue('OK');

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      publish: mockPublish,
      setex: mockSetex,
      quit: mockQuit,
    })),
  };
});

describe('VitalCoreClient', () => {
  let client: VitalCoreClient;

  beforeEach(() => {
    client = new VitalCoreClient();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (client.isActive()) {
      await client.disconnect();
    }
  });

  describe('DEFAULT_VITAL_CONFIG', () => {
    it('should have correct gateway URL matching vital-core gateway_port 8888', () => {
      expect(DEFAULT_VITAL_CONFIG.gatewayUrl).toBe('http://localhost:8888');
    });

    it('should have correct Redis URL matching vital-core redis_url', () => {
      expect(DEFAULT_VITAL_CONFIG.redisUrl).toBe('redis://localhost:6379/0');
    });

    it('should have correct service name', () => {
      expect(DEFAULT_VITAL_CONFIG.serviceName).toBe('automation');
    });

    it('should have correct service port matching vital-core imperio_lab_url', () => {
      expect(DEFAULT_VITAL_CONFIG.servicePort).toBe(8891);
    });

    it('should have /health as health endpoint matching vital-core ServiceRegistry', () => {
      expect(DEFAULT_VITAL_CONFIG.healthEndpoint).toBe('/health');
    });
  });

  describe('constructor', () => {
    it('should use default config when no config provided', () => {
      const c = new VitalCoreClient();
      expect(c.isActive()).toBe(false);
    });

    it('should allow partial config override', () => {
      const c = new VitalCoreClient({
        gatewayUrl: 'http://localhost:9999',
        serviceName: 'custom-automation',
      });
      expect(c.isActive()).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to Redis and mark as active', async () => {
      await client.connect();
      expect(client.isActive()).toBe(true);
    });

    it('should emit a startup event on connect', async () => {
      await client.connect();
      expect(mockPublish).toHaveBeenCalled();
    });

    it('should publish startup event to vital.system channel', async () => {
      await client.connect();
      // The connect method emits a 'system' category event
      const firstPublishCall = mockPublish.mock.calls[0];
      expect(firstPublishCall[0]).toBe('vital.system');
    });
  });

  describe('disconnect', () => {
    it('should disconnect and mark as inactive', async () => {
      await client.connect();
      expect(client.isActive()).toBe(true);

      await client.disconnect();
      expect(client.isActive()).toBe(false);
    });

    it('should emit shutdown event to vital.system channel before disconnecting', async () => {
      await client.connect();
      vi.clearAllMocks();

      await client.disconnect();
      const shutdownPublish = mockPublish.mock.calls[0];
      expect(shutdownPublish[0]).toBe('vital.system');
      const payload = JSON.parse(shutdownPublish[1]);
      expect(payload.eventType).toBe('service.stopped');
    });
  });

  describe('emitEvent', () => {
    it('should return null when not connected', async () => {
      const result = await client.emitEvent({
        category: 'testing',
        action: 'started',
        eventType: 'test.started',
        payload: {},
      });
      expect(result).toBeNull();
    });

    it('should return event ID when connected', async () => {
      await client.connect();
      const result = await client.emitEvent({
        category: 'testing',
        action: 'started',
        eventType: 'test.started',
        payload: { testId: 'test-001' },
      });
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should publish to vital.{category} Redis channel', async () => {
      await client.connect();
      vi.clearAllMocks();

      await client.emitEvent({
        category: 'testing',
        action: 'started',
        eventType: 'test.started',
        payload: { testId: 'test-001' },
      });

      expect(mockPublish).toHaveBeenCalledWith(
        'vital.testing',
        expect.any(String),
      );
    });

    it('should include source as serviceName in published event', async () => {
      await client.connect();
      vi.clearAllMocks();

      await client.emitEvent({
        category: 'testing',
        action: 'started',
        eventType: 'test.started',
        payload: {},
      });

      const publishedData = JSON.parse(mockPublish.mock.calls[0][1]);
      expect(publishedData.source).toBe('automation');
    });

    it('should store event in Redis with 24h TTL', async () => {
      await client.connect();
      vi.clearAllMocks();

      await client.emitEvent({
        category: 'testing',
        action: 'started',
        eventType: 'test.started',
        payload: {},
      });

      expect(mockSetex).toHaveBeenCalledWith(
        expect.stringMatching(/^vital:event:/),
        86400,
        expect.any(String),
      );
    });
  });

  // =========================================================================
  // Redis channel contract tests
  // =========================================================================

  describe('Redis channel naming (vital-core EventBus contract)', () => {
    beforeEach(async () => {
      await client.connect();
      vi.clearAllMocks();
    });

    it('emitTestStarted publishes to vital.testing', async () => {
      await client.emitTestStarted('t1', 'd1', 'e2e');
      expect(mockPublish.mock.calls[0][0]).toBe('vital.testing');
    });

    it('emitTestCompleted publishes to vital.testing', async () => {
      await client.emitTestCompleted('t1', 'd1', 'success');
      expect(mockPublish.mock.calls[0][0]).toBe('vital.testing');
    });

    it('emitDeviceConnected publishes to vital.devices', async () => {
      await client.emitDeviceConnected('d1', 'android', 'Pixel 8');
      expect(mockPublish.mock.calls[0][0]).toBe('vital.devices');
    });

    it('emitDeviceDisconnected publishes to vital.devices', async () => {
      await client.emitDeviceDisconnected('d1');
      expect(mockPublish.mock.calls[0][0]).toBe('vital.devices');
    });

    it('emitContribution publishes to vital.gamification', async () => {
      await client.emitContribution('u1', 100, 'test_completed');
      expect(mockPublish.mock.calls[0][0]).toBe('vital.gamification');
    });
  });

  // =========================================================================
  // Event payload contract tests
  // =========================================================================

  describe('Event payload structure (vital-core EventStore contract)', () => {
    beforeEach(async () => {
      await client.connect();
      vi.clearAllMocks();
    });

    it('should include all fields expected by VitalEventModel', async () => {
      await client.emitTestStarted('t1', 'd1', 'unit');
      const payload = JSON.parse(mockPublish.mock.calls[0][1]);

      // Fields matching VitalEventModel columns
      expect(payload).toHaveProperty('eventId');
      expect(payload).toHaveProperty('source');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('category');
      expect(payload).toHaveProperty('subcategory');
      expect(payload).toHaveProperty('action');
      expect(payload).toHaveProperty('eventType');
      expect(payload).toHaveProperty('payload');
      expect(payload).toHaveProperty('tags');
    });

    it('emitTestStarted should have correct event structure', async () => {
      await client.emitTestStarted('test-abc', 'device-xyz', 'integration');
      const event = JSON.parse(mockPublish.mock.calls[0][1]);

      expect(event.category).toBe('testing');
      expect(event.subcategory).toBe('execution');
      expect(event.action).toBe('started');
      expect(event.eventType).toBe('test.started');
      expect(event.payload.testId).toBe('test-abc');
      expect(event.payload.deviceId).toBe('device-xyz');
      expect(event.payload.testType).toBe('integration');
    });

    it('emitTestCompleted should encode status in eventType', async () => {
      await client.emitTestCompleted('t1', 'd1', 'failure', {
        verdict: 'fail',
        confidence: 0.8,
        duration: 3000,
      });
      const event = JSON.parse(mockPublish.mock.calls[0][1]);

      expect(event.eventType).toBe('test.failure');
      expect(event.payload.status).toBe('failure');
      expect(event.payload.verdict).toBe('fail');
      expect(event.payload.confidence).toBe(0.8);
      expect(event.payload.durationMs).toBe(3000);
    });

    it('emitDeviceConnected should include platform tag', async () => {
      await client.emitDeviceConnected('d1', 'android', 'Samsung Galaxy');
      const event = JSON.parse(mockPublish.mock.calls[0][1]);

      expect(event.tags).toContain('device');
      expect(event.tags).toContain('android');
    });

    it('emitContribution should include points and reason', async () => {
      await client.emitContribution('user-1', 50, 'bug_report', { quality: 1.5 });
      const event = JSON.parse(mockPublish.mock.calls[0][1]);

      expect(event.category).toBe('gamification');
      expect(event.payload.userId).toBe('user-1');
      expect(event.payload.points).toBe(50);
      expect(event.payload.reason).toBe('bug_report');
      expect(event.payload.multipliers).toEqual({ quality: 1.5 });
    });
  });

  // =========================================================================
  // Gateway API contract tests
  // =========================================================================

  describe('postEventToGateway (vital-core EventCreate contract)', () => {
    it('should send snake_case fields matching EventCreate Pydantic model', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ event_id: 'abc', status: 'created' }), { status: 200 }),
      );

      const result = await client.postEventToGateway({
        category: 'system',
        subcategory: 'lifecycle',
        action: 'registered',
        eventType: 'service.registered',
        payload: { service: 'automation' },
        metadata: { env: 'test' },
        tags: ['automation'],
      });

      expect(result).toBe(true);

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      // Must be snake_case to match EventCreate
      expect(body).toHaveProperty('event_type', 'service.registered');
      expect(body).toHaveProperty('category', 'system');
      expect(body).toHaveProperty('subcategory', 'lifecycle');
      expect(body).toHaveProperty('source', 'automation');
      expect(body).toHaveProperty('action', 'registered');
      expect(body).toHaveProperty('payload');
      expect(body).toHaveProperty('metadata');
      expect(body).toHaveProperty('tags');

      // Must NOT have camelCase eventType at top level
      expect(body).not.toHaveProperty('eventType');

      fetchSpy.mockRestore();
    });

    it('should default metadata and tags to empty when not provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('{}', { status: 200 }),
      );

      await client.postEventToGateway({
        category: 'testing',
        action: 'test',
        eventType: 'test.event',
        payload: {},
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.metadata).toEqual({});
      expect(body.tags).toEqual([]);

      fetchSpy.mockRestore();
    });

    it('should return false when gateway is unreachable', async () => {
      const result = await client.postEventToGateway({
        category: 'testing',
        action: 'test',
        eventType: 'test.event',
        payload: {},
      });
      expect(result).toBe(false);
    });
  });

  describe('registerService', () => {
    it('should check gateway health at /api/v1/health', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('{"status":"ok"}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await client.connect();
      const result = await client.registerService();

      expect(result).toBe(true);
      expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8888/api/v1/health');

      fetchSpy.mockRestore();
    });

    it('should return false when gateway is unreachable', async () => {
      const result = await client.registerService();
      expect(result).toBe(false);
    });
  });
});

describe('Factory functions', () => {
  it('createVitalCoreClient should create a new instance', () => {
    const c = createVitalCoreClient({ serviceName: 'test' });
    expect(c).toBeInstanceOf(VitalCoreClient);
  });

  it('getVitalCoreClient should return a VitalCoreClient instance', () => {
    const c1 = getVitalCoreClient();
    expect(c1).toBeInstanceOf(VitalCoreClient);
  });
});
