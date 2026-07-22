import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TestOrchestrator, deviceManager, CreateTestInput } from '../../core/index.js';
import { TestTypeEnum, DeviceTypeEnum } from '../../models/types.js';

const CreateTestSchema = z.object({
  projectId: z.string(),
  type: TestTypeEnum,
  name: z.string(),
  description: z.string().optional(),
  script: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  requirements: z
    .object({
      deviceTypes: z.array(z.string()).optional(),
      sensors: z.array(z.string()).optional(),
      minDevices: z.number().optional(),
      maxDevices: z.number().optional(),
      regions: z.array(z.string()).optional(),
    })
    .optional(),
  priority: z.number().optional(),
  timeout: z.number().optional(),
});

const SubmitResultSchema = z.object({
  deviceId: z.string(),
  output: z.unknown(),
  metrics: z
    .object({
      duration: z.number().optional(),
      memoryUsage: z.number().optional(),
      cpuUsage: z.number().optional(),
      batteryDrain: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

// Crear instancia del orquestador
const testOrchestrator = new TestOrchestrator(deviceManager);

export async function testRoutes(fastify: FastifyInstance) {
  // POST /api/v1/tests
  fastify.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateTestSchema> }>,
      reply: FastifyReply
    ) => {
      const parsed = CreateTestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.format() });
      }

      try {
        const test = testOrchestrator.createTest(parsed.data as CreateTestInput);
        return reply.status(201).send({ test });
      } catch (error) {
        request.log.error(error, 'Failed to create test');
        return reply.status(500).send({ error: 'Failed to create test' });
      }
    }
  );

  // GET /api/v1/tests/stats
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = testOrchestrator.getStats();
    return reply.send(stats);
  });

  // GET /api/v1/tests/:testId
  fastify.get(
    '/:testId',
    async (request: FastifyRequest<{ Params: { testId: string } }>, reply: FastifyReply) => {
      const { testId } = request.params;
      const test = testOrchestrator.getTest(testId);

      if (!test) {
        return reply.status(404).send({ error: 'Test not found' });
      }

      return reply.send({ test });
    }
  );

  // GET /api/v1/tests/:testId/results
  fastify.get(
    '/:testId/results',
    async (request: FastifyRequest<{ Params: { testId: string } }>, reply: FastifyReply) => {
      const { testId } = request.params;
      const test = testOrchestrator.getTest(testId);

      if (!test) {
        return reply.status(404).send({ error: 'Test not found' });
      }

      const results = testOrchestrator.getTestResults(testId);
      return reply.send({ test, results, total: results.length });
    }
  );

  // POST /api/v1/tests/:testId/results
  fastify.post(
    '/:testId/results',
    async (
      request: FastifyRequest<{
        Params: { testId: string };
        Body: z.infer<typeof SubmitResultSchema>;
      }>,
      reply: FastifyReply
    ) => {
      const { testId } = request.params;
      const parsed = SubmitResultSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.format() });
      }

      try {
        const result = testOrchestrator.receiveResult(
          testId,
          parsed.data.deviceId,
          parsed.data.output,
          parsed.data.metrics,
          parsed.data.error
        );
        return reply.status(201).send({ result });
      } catch (error: any) {
        if (error.message?.includes('not found')) {
          return reply.status(404).send({ error: error.message });
        }
        request.log.error(error, 'Failed to submit result');
        return reply.status(500).send({ error: 'Failed to submit result' });
      }
    }
  );

  // POST /api/v1/tests/process-queue
  fastify.post('/process-queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await testOrchestrator.processQueue();
      return reply.send({ message: 'Queue processed' });
    } catch (error) {
      request.log.error(error, 'Failed to process queue');
      return reply.status(500).send({ error: 'Failed to process queue' });
    }
  });
}

export { testOrchestrator };
