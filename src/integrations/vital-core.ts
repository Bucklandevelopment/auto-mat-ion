/**
 * auto-mat-ion - Vital Core Integration
 *
 * Integración con el ecosistema vital-core:
 * - Registro como servicio "testlab" o "automation"
 * - Emisión de eventos al Event Store
 * - Publicación via Redis Event Bus
 *
 * Para funcionar, vital-core debe estar corriendo en:
 * - Gateway: http://localhost:8888
 * - PostgreSQL: postgresql://vital:vital_password@localhost:5432/vital_core
 * - Redis: redis://localhost:6379/0
 */

import { Redis } from 'ioredis';
import { nanoid } from 'nanoid';

// ============================================================================
// Types
// ============================================================================

export interface VitalCoreConfig {
  /** URL del gateway vital-core */
  gatewayUrl: string;
  /** URL de PostgreSQL para Event Store directo (opcional) */
  databaseUrl?: string;
  /** URL de Redis para Event Bus */
  redisUrl: string;
  /** Nombre del servicio para registro */
  serviceName: string;
  /** Puerto donde escucha auto-mat-ion */
  servicePort: number;
  /** Endpoint de health */
  healthEndpoint: string;
  /** API key for authenticating with vital-core gateway */
  apiKey?: string;
}

export interface VitalEvent {
  eventId: string;
  correlationId?: string;
  category: string;
  subcategory?: string;
  source: string;
  action: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  timestamp: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_VITAL_CONFIG: VitalCoreConfig = {
  gatewayUrl: 'http://localhost:8888',
  redisUrl: 'redis://localhost:6379/0',
  serviceName: 'automation',
  servicePort: 8891, // imperio_lab_url port from config
  healthEndpoint: '/health',
};

// ============================================================================
// Vital Core Client
// ============================================================================

export class VitalCoreClient {
  private config: VitalCoreConfig;
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private sessionId: string;

  constructor(config: Partial<VitalCoreConfig> = {}) {
    this.config = { ...DEFAULT_VITAL_CONFIG, ...config };
    this.sessionId = nanoid();
  }

  /**
   * Initialize connection to vital-core
   */
  async connect(): Promise<void> {
    try {
      // Connect to Redis for Event Bus
      this.redis = new Redis(this.config.redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      await this.redis.connect();
      this.isConnected = true;

      console.log(`[VitalCore] Connected to Redis at ${this.config.redisUrl}`);

      // Emit startup event
      await this.emitEvent({
        category: 'system',
        subcategory: 'lifecycle',
        action: 'started',
        eventType: 'service.started',
        payload: {
          service: this.config.serviceName,
          port: this.config.servicePort,
          sessionId: this.sessionId,
        },
        tags: ['automation', 'startup'],
      });

    } catch (error) {
      console.warn(`[VitalCore] Failed to connect: ${error}`);
      this.isConnected = false;
    }
  }

  /**
   * Disconnect from vital-core
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.emitEvent({
        category: 'system',
        subcategory: 'lifecycle',
        action: 'stopped',
        eventType: 'service.stopped',
        payload: {
          service: this.config.serviceName,
          sessionId: this.sessionId,
        },
        tags: ['automation', 'shutdown'],
      });
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.isConnected = false;
    console.log('[VitalCore] Disconnected');
  }

  /**
   * Check if connected
   */
  isActive(): boolean {
    return this.isConnected && this.redis !== null;
  }

  /**
   * Emit an event to vital-core
   */
  async emitEvent(event: Omit<VitalEvent, 'eventId' | 'timestamp' | 'source'>): Promise<string | null> {
    if (!this.isActive()) {
      console.debug('[VitalCore] Not connected, skipping event');
      return null;
    }

    const fullEvent: VitalEvent = {
      eventId: nanoid(),
      source: this.config.serviceName,
      timestamp: new Date().toISOString(),
      ...event,
    };

    try {
      // Publish to Redis channel (matches vital-core EventBus: vital.{category})
      const channel = `vital.${event.category}`;
      await this.redis!.publish(channel, JSON.stringify(fullEvent));

      // Also store in Redis for persistence (vital-core can process)
      const key = `vital:event:${fullEvent.eventId}`;
      await this.redis!.setex(key, 86400, JSON.stringify(fullEvent)); // 24h TTL

      console.debug(`[VitalCore] Event emitted: ${fullEvent.eventType}`);
      return fullEvent.eventId;

    } catch (error) {
      console.error(`[VitalCore] Failed to emit event: ${error}`);
      return null;
    }
  }

  // ===========================================================================
  // Test Events
  // ===========================================================================

  /**
   * Emit test started event
   */
  async emitTestStarted(testId: string, deviceId: string, testType: string): Promise<string | null> {
    return this.emitEvent({
      category: 'testing',
      subcategory: 'execution',
      action: 'started',
      eventType: 'test.started',
      payload: {
        testId,
        deviceId,
        testType,
        sessionId: this.sessionId,
      },
      tags: ['test', 'started'],
    });
  }

  /**
   * Emit test completed event
   */
  async emitTestCompleted(
    testId: string,
    deviceId: string,
    status: 'success' | 'failure' | 'skipped',
    result?: {
      verdict?: string;
      confidence?: number;
      duration?: number;
    }
  ): Promise<string | null> {
    return this.emitEvent({
      category: 'testing',
      subcategory: 'execution',
      action: 'completed',
      eventType: `test.${status}`,
      payload: {
        testId,
        deviceId,
        status,
        verdict: result?.verdict,
        confidence: result?.confidence,
        durationMs: result?.duration,
        sessionId: this.sessionId,
      },
      tags: ['test', status],
    });
  }

  /**
   * Emit device connected event
   */
  async emitDeviceConnected(
    deviceId: string,
    platform: string,
    deviceName: string
  ): Promise<string | null> {
    return this.emitEvent({
      category: 'devices',
      subcategory: 'connectivity',
      action: 'connected',
      eventType: 'device.connected',
      payload: {
        deviceId,
        platform,
        deviceName,
        sessionId: this.sessionId,
      },
      tags: ['device', platform],
    });
  }

  /**
   * Emit device disconnected event
   */
  async emitDeviceDisconnected(deviceId: string): Promise<string | null> {
    return this.emitEvent({
      category: 'devices',
      subcategory: 'connectivity',
      action: 'disconnected',
      eventType: 'device.disconnected',
      payload: {
        deviceId,
        sessionId: this.sessionId,
      },
      tags: ['device', 'disconnected'],
    });
  }

  // ===========================================================================
  // Gamification Events
  // ===========================================================================

  /**
   * Emit contribution points earned
   */
  async emitContribution(
    userId: string,
    points: number,
    reason: string,
    multipliers?: Record<string, number>
  ): Promise<string | null> {
    return this.emitEvent({
      category: 'gamification',
      subcategory: 'contributions',
      action: 'earned',
      eventType: 'contribution.points',
      payload: {
        userId,
        points,
        reason,
        multipliers,
        sessionId: this.sessionId,
      },
      tags: ['gamification', 'points'],
    });
  }

  // ===========================================================================
  // Gateway API Integration
  // ===========================================================================

  /**
   * Verify connectivity with vital-core gateway.
   *
   * Note: vital-core uses a config-driven service registry
   * (ServiceRegistry in service_registry.py) rather than a dynamic
   * registration endpoint. The "testlab" service is auto-discovered
   * by vital-core from its settings (imperio_lab_url). This method
   * verifies that the gateway is reachable and announces via an event.
   */
  async registerService(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/v1/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {}),
        },
      });

      if (response.ok) {
        console.log(`[VitalCore] Gateway reachable at ${this.config.gatewayUrl}`);

        // Announce presence via event
        await this.postEventToGateway({
          category: 'system',
          subcategory: 'lifecycle',
          action: 'registered',
          eventType: 'service.registered',
          payload: {
            service: this.config.serviceName,
            url: `http://localhost:${this.config.servicePort}`,
            healthEndpoint: this.config.healthEndpoint,
          },
          tags: ['automation', 'registration'],
        });

        return true;
      }

      console.warn(`[VitalCore] Gateway health check failed: ${response.status}`);
      return false;

    } catch (error) {
      console.warn(`[VitalCore] Gateway not available: ${error}`);
      return false;
    }
  }

  /**
   * Post event to gateway API (alternative to Redis).
   * Converts to snake_case to match vital-core's EventCreate Pydantic model.
   */
  async postEventToGateway(event: Omit<VitalEvent, 'eventId' | 'timestamp' | 'source'>): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.gatewayUrl}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {}),
        },
        body: JSON.stringify({
          category: event.category,
          subcategory: event.subcategory,
          source: this.config.serviceName,
          action: event.action,
          event_type: event.eventType,
          payload: event.payload,
          metadata: event.metadata ?? {},
          tags: event.tags ?? [],
        }),
      });

      return response.ok;

    } catch (error) {
      console.debug(`[VitalCore] Failed to post event to gateway: ${error}`);
      return false;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalClient: VitalCoreClient | null = null;

/**
 * Get or create the global vital-core client
 */
export function getVitalCoreClient(config?: Partial<VitalCoreConfig>): VitalCoreClient {
  if (!globalClient) {
    globalClient = new VitalCoreClient(config);
  }
  return globalClient;
}

/**
 * Create a new vital-core client instance
 */
export function createVitalCoreClient(config?: Partial<VitalCoreConfig>): VitalCoreClient {
  return new VitalCoreClient(config);
}
