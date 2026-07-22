import { createRequire } from 'node:module';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import config from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { deviceRoutes } from './routes/devices.js';
import { testRoutes } from './routes/tests.js';
import { contributionRoutes } from './routes/contributions.js';
import { getVitalCoreClient, type VitalCoreClient } from '../integrations/vital-core.js';

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require('../../package.json');

const logger = createLogger('Server');

export async function createServer() {
  const fastify = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
              },
            }
          : undefined,
    },
  });

  // Plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(websocket);

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    service: 'auto-mat-ion',
    version: PKG_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // API info
  fastify.get('/', async () => ({
    name: 'auto-mat-ion',
    description: 'Framework para granjas de pruebas distribuidas',
    version: PKG_VERSION,
    docs: '/docs',
    endpoints: {
      health: '/health',
      devices: '/api/v1/devices',
      tests: '/api/v1/tests',
      contributions: '/api/v1/contributions',
    },
  }));

  // Routes
  await fastify.register(deviceRoutes, { prefix: '/api/v1/devices' });
  await fastify.register(testRoutes, { prefix: '/api/v1/tests' });
  await fastify.register(contributionRoutes, { prefix: '/api/v1/contributions' });

  // WebSocket endpoint para dispositivos
  fastify.register(async function (fastify) {
    fastify.get('/ws/devices', { websocket: true }, (socket, request) => {
      logger.info('WebSocket client connected');

      socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.debug({ type: data.type }, 'WebSocket message received');

          // Manejar diferentes tipos de mensajes
          switch (data.type) {
            case 'heartbeat':
              // Procesar heartbeat
              socket.socket.send(JSON.stringify({ type: 'heartbeat_ack', timestamp: Date.now() }));
              break;

            case 'result':
              // Procesar resultado de test
              socket.socket.send(JSON.stringify({ type: 'result_ack', resultId: data.resultId }));
              break;

            default:
              logger.warn({ type: data.type }, 'Unknown WebSocket message type');
          }
        } catch (error) {
          logger.error(error, 'Failed to process WebSocket message');
        }
      });

      socket.on('close', () => {
        logger.info('WebSocket client disconnected');
      });
    });
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error(error, 'Request error');
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
      statusCode: error.statusCode || 500,
    });
  });

  return fastify;
}

export async function startServer() {
  const server = await createServer();

  let vitalClient: VitalCoreClient | null = null;

  try {
    await server.listen({
      host: config.HOST,
      port: config.PORT,
    });

    logger.info(
      {
        host: config.HOST,
        port: config.PORT,
        env: config.NODE_ENV,
      },
      '🚀 auto-mat-ion server started'
    );

    // Connect to vital-core if enabled (graceful degradation: failure does not crash the server)
    if (config.VITAL_CORE_ENABLED) {
      try {
        vitalClient = getVitalCoreClient({
          gatewayUrl: config.VITAL_CORE_URL,
          redisUrl: config.REDIS_URL,
          serviceName: 'auto-mat-ion',
          servicePort: config.PORT,
          apiKey: process.env.VITAL_CORE_API_KEY || '',
        });

        await vitalClient.connect();
        await vitalClient.registerService();

        logger.info(
          { gatewayUrl: config.VITAL_CORE_URL },
          'vital-core integration connected'
        );
      } catch (error) {
        logger.warn(
          { error },
          'vital-core integration unavailable, running standalone'
        );
        // Null out so shutdown handler knows there is nothing to disconnect
        vitalClient = null;
      }
    } else {
      logger.info('vital-core integration disabled by config');
    }

    // Graceful shutdown
    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info({ signal }, 'Shutting down gracefully');

      try {
        if (vitalClient?.isActive()) {
          await vitalClient.disconnect();
          logger.info('vital-core client disconnected');
        }
      } catch (error) {
        logger.warn({ error }, 'Error disconnecting vital-core client during shutdown');
      }

      try {
        await server.close();
        logger.info('Server closed');
      } catch (error) {
        logger.error({ error }, 'Error closing server during shutdown');
      }

      process.exit(0);
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    return server;
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}
