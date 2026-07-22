import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { deviceManager, RegisterDeviceInput } from '../../core/index.js';
import { DeviceTypeEnum, ConnectionTypeEnum } from '../../models/types.js';

const RegisterDeviceSchema = z.object({
  type: DeviceTypeEnum,
  name: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  osVersion: z.string().optional(),
  sensors: z.array(z.string()).optional(),
  connectionType: ConnectionTypeEnum,
  regionCode: z.string().optional(),
  eudiPseudonym: z.string().optional(),
  rawFingerprint: z.string(),
});

const HeartbeatSchema = z.object({
  deviceId: z.string(),
});

export async function deviceRoutes(fastify: FastifyInstance) {
  // POST /api/v1/devices/register
  fastify.post(
    '/register',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RegisterDeviceSchema> }>,
      reply: FastifyReply
    ) => {
      const parsed = RegisterDeviceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.format() });
      }

      try {
        const device = await deviceManager.registerDevice(parsed.data as RegisterDeviceInput);
        return reply.status(201).send({ device });
      } catch (error) {
        request.log.error(error, 'Failed to register device');
        return reply.status(500).send({ error: 'Failed to register device' });
      }
    }
  );

  // GET /api/v1/devices
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const devices = deviceManager.getAllDevices();
    return reply.send({ devices, total: devices.length });
  });

  // GET /api/v1/devices/online
  fastify.get('/online', async (request: FastifyRequest, reply: FastifyReply) => {
    const devices = deviceManager.getOnlineDevices();
    return reply.send({ devices, total: devices.length });
  });

  // GET /api/v1/devices/stats
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = deviceManager.getStats();
    return reply.send(stats);
  });

  // GET /api/v1/devices/:deviceId
  fastify.get(
    '/:deviceId',
    async (request: FastifyRequest<{ Params: { deviceId: string } }>, reply: FastifyReply) => {
      const { deviceId } = request.params;
      const device = deviceManager.getDevice(deviceId);

      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      return reply.send({ device });
    }
  );

  // PUT /api/v1/devices/:deviceId/heartbeat
  fastify.put(
    '/:deviceId/heartbeat',
    async (request: FastifyRequest<{ Params: { deviceId: string } }>, reply: FastifyReply) => {
      const { deviceId } = request.params;
      const device = deviceManager.heartbeat(deviceId);

      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      return reply.send({ device, timestamp: new Date().toISOString() });
    }
  );

  // DELETE /api/v1/devices/:deviceId
  fastify.delete(
    '/:deviceId',
    async (request: FastifyRequest<{ Params: { deviceId: string } }>, reply: FastifyReply) => {
      const { deviceId } = request.params;
      deviceManager.disconnectDevice(deviceId);
      return reply.status(204).send();
    }
  );
}
