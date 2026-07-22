import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { contributionTracker } from '../../core/index.js';
import { ContributionTypeEnum } from '../../models/types.js';

const RecordContributionSchema = z.object({
  deviceId: z.string(),
  type: ContributionTypeEnum,
  projectId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function contributionRoutes(fastify: FastifyInstance) {
  // POST /api/v1/contributions
  fastify.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RecordContributionSchema> }>,
      reply: FastifyReply
    ) => {
      const parsed = RecordContributionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request', details: parsed.error.format() });
      }

      try {
        const contribution = contributionTracker.recordContribution(
          parsed.data.deviceId,
          parsed.data.type,
          parsed.data.projectId,
          parsed.data.metadata
        );
        return reply.status(201).send({ contribution });
      } catch (error) {
        request.log.error(error, 'Failed to record contribution');
        return reply.status(500).send({ error: 'Failed to record contribution' });
      }
    }
  );

  // GET /api/v1/contributions/stats
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = contributionTracker.getStats();
    return reply.send(stats);
  });

  // GET /api/v1/contributions/leaderboard
  fastify.get(
    '/leaderboard',
    async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const limit = parseInt(request.query.limit || '100', 10);
      const leaderboard = contributionTracker.getLeaderboard(limit);
      return reply.send({ leaderboard, total: leaderboard.length });
    }
  );

  // GET /api/v1/contributions/device/:deviceId
  fastify.get(
    '/device/:deviceId',
    async (request: FastifyRequest<{ Params: { deviceId: string } }>, reply: FastifyReply) => {
      const { deviceId } = request.params;
      const contributions = contributionTracker.getDeviceContributions(deviceId);
      const totalPoints = contributionTracker.getDevicePoints(deviceId);

      return reply.send({
        deviceId,
        totalPoints,
        contributions,
        contributionCount: contributions.length,
      });
    }
  );

  // GET /api/v1/contributions/project/:projectId
  fastify.get(
    '/project/:projectId',
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const contributions = contributionTracker.getProjectContributions(projectId);

      const totalPoints = contributions.reduce((sum, c) => sum + c.points, 0);
      const uniqueDevices = new Set(contributions.map((c) => c.deviceId)).size;

      return reply.send({
        projectId,
        totalPoints,
        uniqueDevices,
        contributions,
        contributionCount: contributions.length,
      });
    }
  );
}
