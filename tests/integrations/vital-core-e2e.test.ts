/**
 * E2E test for auto-mat-ion <-> vital-core integration.
 *
 * Validates the full lifecycle:
 *   connect -> emit events -> verify Redis channels/payloads -> disconnect
 *
 * Uses mocked Redis to verify that:
 * - Channels match vital-core EventBus CHANNELS (vital.{category})
 * - Event payloads contain all fields expected by VitalEventModel
 * - postEventToGateway sends snake_case matching EventCreate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VitalCoreClient } from '../../src/integrations/vital-core';

// ============================================================================
// Mock Redis - capture all publish calls for verification
// ============================================================================

const publishedMessages: Array<{ channel: string; data: Record<string, unknown> }> = [];
const storedKeys: Array<{ key: string; ttl: number; data: Record<string, unknown> }> = [];

const mockPublish = vi.fn().mockImplementation((channel: string, data: string) => {
  publishedMessages.push({ channel, data: JSON.parse(data) });
  return Promise.resolve(1);
});
const mockSetex = vi.fn().mockImplementation((key: string, ttl: number, data: string) => {
  storedKeys.push({ key, ttl, data: JSON.parse(data) });
  return Promise.resolve('OK');
});
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockQuit = vi.fn().mockResolvedValue('OK');

vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    publish: mockPublish,
    setex: mockSetex,
    quit: mockQuit,
  })),
}));

// ============================================================================
// vital-core EventBus channels (from app/services/event_bus.py)
// ============================================================================

const VITAL_CORE_CHANNELS = {
  health: 'vital.health',
  education: 'vital.education',
  identity: 'vital.identity',
  security: 'vital.security',
  system: 'vital.system',
  ai: 'vital.ai',
  energy: 'vital.energy',
  // auto-mat-ion extends with:
  testing: 'vital.testing',
  devices: 'vital.devices',
  gamification: 'vital.gamification',
};

// ============================================================================
// E2E Tests
// ============================================================================

describe('vital-core E2E integration', () => {
  let client: VitalCoreClient;

  beforeEach(() => {
    publishedMessages.length = 0;
    storedKeys.length = 0;
    vi.clearAllMocks();
    client = new VitalCoreClient();
  });

  afterEach(async () => {
    if (client.isActive()) {
      await client.disconnect();
    }
  });

  describe('Full lifecycle: connect -> emit -> disconnect', () => {
    it('should complete the full service lifecycle', async () => {
      // --- Phase 1: Connect ---
      await client.connect();
      expect(client.isActive()).toBe(true);

      // Startup event should be published to vital.system
      expect(publishedMessages).toHaveLength(1);
      const startupEvent = publishedMessages[0];
      expect(startupEvent.channel).toBe(VITAL_CORE_CHANNELS.system);
      expect(startupEvent.data.eventType).toBe('service.started');
      expect(startupEvent.data.source).toBe('automation');
      expect(startupEvent.data.category).toBe('system');
      expect(startupEvent.data.payload).toMatchObject({
        service: 'automation',
        port: 8891,
      });

      // --- Phase 2: Emit test events ---
      const testEventId = await client.emitTestStarted('test-001', 'device-abc', 'e2e');
      expect(testEventId).toBeTruthy();

      const testMsg = publishedMessages[1];
      expect(testMsg.channel).toBe(VITAL_CORE_CHANNELS.testing);
      expect(testMsg.data.eventType).toBe('test.started');
      expect(testMsg.data.payload).toMatchObject({
        testId: 'test-001',
        deviceId: 'device-abc',
        testType: 'e2e',
      });

      // --- Phase 3: Emit test completion ---
      await client.emitTestCompleted('test-001', 'device-abc', 'success', {
        verdict: 'pass',
        confidence: 0.99,
        duration: 2500,
      });

      const completeMsg = publishedMessages[2];
      expect(completeMsg.channel).toBe(VITAL_CORE_CHANNELS.testing);
      expect(completeMsg.data.eventType).toBe('test.success');
      expect(completeMsg.data.payload).toMatchObject({
        status: 'success',
        verdict: 'pass',
        confidence: 0.99,
        durationMs: 2500,
      });

      // --- Phase 4: Emit device events ---
      await client.emitDeviceConnected('device-abc', 'android', 'Pixel 8');
      expect(publishedMessages[3].channel).toBe(VITAL_CORE_CHANNELS.devices);
      expect(publishedMessages[3].data.eventType).toBe('device.connected');

      // --- Phase 5: Emit gamification event ---
      await client.emitContribution('user-001', 150, 'test_completed', { quality: 2.0 });
      expect(publishedMessages[4].channel).toBe(VITAL_CORE_CHANNELS.gamification);
      expect(publishedMessages[4].data.payload).toMatchObject({
        userId: 'user-001',
        points: 150,
        reason: 'test_completed',
        multipliers: { quality: 2.0 },
      });

      // --- Phase 6: Disconnect ---
      await client.disconnect();
      expect(client.isActive()).toBe(false);

      // Shutdown event
      const shutdownMsg = publishedMessages[publishedMessages.length - 1];
      expect(shutdownMsg.channel).toBe(VITAL_CORE_CHANNELS.system);
      expect(shutdownMsg.data.eventType).toBe('service.stopped');
    });
  });

  describe('Redis persistence layer', () => {
    it('should store each event with vital:event:{id} key and 24h TTL', async () => {
      await client.connect();
      storedKeys.length = 0; // clear startup event

      await client.emitTestStarted('t1', 'd1', 'unit');

      expect(storedKeys).toHaveLength(1);
      expect(storedKeys[0].key).toMatch(/^vital:event:.+/);
      expect(storedKeys[0].ttl).toBe(86400);
      expect(storedKeys[0].data.eventType).toBe('test.started');
    });
  });

  describe('All channel names follow vital.{category} convention', () => {
    beforeEach(async () => {
      await client.connect();
      publishedMessages.length = 0;
    });

    it('no channel should use colon-separated format', async () => {
      await client.emitTestStarted('t1', 'd1', 'e2e');
      await client.emitDeviceConnected('d1', 'ios', 'iPhone');
      await client.emitContribution('u1', 10, 'test');

      for (const msg of publishedMessages) {
        // Must use dot notation, not colon
        expect(msg.channel).toMatch(/^vital\.[a-z]+$/);
        expect(msg.channel).not.toContain(':');
      }
    });
  });

  describe('Event field completeness (VitalEventModel compatibility)', () => {
    const REQUIRED_FIELDS = ['eventId', 'source', 'timestamp', 'category', 'action', 'eventType', 'payload'];

    beforeEach(async () => {
      await client.connect();
      publishedMessages.length = 0;
    });

    it('every emitted event should have all required fields', async () => {
      await client.emitTestStarted('t1', 'd1', 'unit');
      await client.emitTestCompleted('t1', 'd1', 'success');
      await client.emitDeviceConnected('d1', 'android', 'Galaxy');
      await client.emitDeviceDisconnected('d1');
      await client.emitContribution('u1', 10, 'test');

      for (const msg of publishedMessages) {
        for (const field of REQUIRED_FIELDS) {
          expect(msg.data, `Event ${msg.data.eventType} missing field ${field}`).toHaveProperty(field);
        }
      }
    });

    it('events should have ISO 8601 timestamps', async () => {
      await client.emitTestStarted('t1', 'd1', 'unit');
      const ts = publishedMessages[0].data.timestamp as string;
      // ISO 8601 check
      expect(new Date(ts).toISOString()).toBe(ts);
    });
  });

  describe('postEventToGateway snake_case contract', () => {
    it('should convert VitalEvent fields to snake_case for EventCreate', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ event_id: 'abc', status: 'created' }), { status: 200 }),
      );

      await client.postEventToGateway({
        category: 'testing',
        subcategory: 'execution',
        action: 'started',
        eventType: 'test.started',
        payload: { testId: 'test-001' },
        metadata: { source_version: '0.2.0' },
        tags: ['test', 'e2e'],
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);

      // Validate snake_case keys match EventCreate model
      expect(Object.keys(body).sort()).toEqual([
        'action', 'category', 'event_type', 'metadata', 'payload', 'source', 'subcategory', 'tags',
      ]);

      // Validate values
      expect(body.category).toBe('testing');
      expect(body.subcategory).toBe('execution');
      expect(body.source).toBe('automation');
      expect(body.action).toBe('started');
      expect(body.event_type).toBe('test.started');
      expect(body.payload).toEqual({ testId: 'test-001' });
      expect(body.metadata).toEqual({ source_version: '0.2.0' });
      expect(body.tags).toEqual(['test', 'e2e']);

      fetchSpy.mockRestore();
    });
  });
});
