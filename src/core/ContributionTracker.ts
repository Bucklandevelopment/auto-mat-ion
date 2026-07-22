import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { Contribution, ContributionType } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';

const logger = createLogger('ContributionTracker');

interface ContributionTrackerEvents {
  'contribution:recorded': (contribution: Contribution) => void;
  'milestone:reached': (deviceId: string, milestone: string, totalPoints: number) => void;
}

interface LeaderboardEntry {
  deviceId: string;
  eudiPseudonym?: string;
  totalPoints: number;
  contributionCount: number;
  lastContribution: Date;
}

export class ContributionTracker extends EventEmitter<ContributionTrackerEvents> {
  private contributions: Map<string, Contribution> = new Map();
  private deviceContributions: Map<string, string[]> = new Map(); // deviceId -> contributionIds
  private devicePoints: Map<string, number> = new Map();

  private readonly milestones = [100, 500, 1000, 5000, 10000, 50000, 100000];

  constructor() {
    super();
    logger.info('ContributionTracker initialized');
  }

  /**
   * Registra una nueva contribución
   */
  recordContribution(
    deviceId: string,
    type: ContributionType,
    projectId?: string,
    metadata?: Record<string, unknown>
  ): Contribution {
    const points = this.calculatePoints(type, metadata);

    const contribution: Contribution = {
      id: nanoid(),
      deviceId,
      projectId,
      type,
      points,
      metadata: metadata || {},
      eudiCredentialIssued: false,
      createdAt: new Date(),
    };

    this.contributions.set(contribution.id, contribution);

    // Actualizar índice por dispositivo
    const deviceContribs = this.deviceContributions.get(deviceId) || [];
    deviceContribs.push(contribution.id);
    this.deviceContributions.set(deviceId, deviceContribs);

    // Actualizar puntos totales
    const currentPoints = this.devicePoints.get(deviceId) || 0;
    const newPoints = currentPoints + points;
    this.devicePoints.set(deviceId, newPoints);

    logger.info(
      {
        contributionId: contribution.id,
        deviceId,
        type,
        points,
        totalPoints: newPoints,
      },
      'Contribution recorded'
    );

    this.emit('contribution:recorded', contribution);

    // Verificar milestones
    this.checkMilestones(deviceId, currentPoints, newPoints);

    return contribution;
  }

  /**
   * Calcula los puntos según el tipo de contribución
   */
  private calculatePoints(type: ContributionType, metadata?: Record<string, unknown>): number {
    switch (type) {
      case 'test_execution':
        return config.POINTS_TEST_BASIC;

      case 'device_uptime':
        // Puntos proporcionales a las horas de uptime
        const hours = (metadata?.hours as number) || 1;
        return Math.floor((config.POINTS_DEVICE_24H / 24) * hours);

      case 'bug_report':
        return config.POINTS_BUG_FOUND;

      case 'unique_device':
        return config.POINTS_UNIQUE_DEVICE;

      case 'sensor_calibration':
        return Math.floor(config.POINTS_TEST_SUITE * 0.5);

      case 'data_validation':
        return Math.floor(config.POINTS_TEST_BASIC * 2);

      default:
        return config.POINTS_TEST_BASIC;
    }
  }

  /**
   * Verifica si se han alcanzado milestones
   */
  private checkMilestones(deviceId: string, previousPoints: number, currentPoints: number): void {
    for (const milestone of this.milestones) {
      if (previousPoints < milestone && currentPoints >= milestone) {
        logger.info({ deviceId, milestone, currentPoints }, 'Milestone reached');
        this.emit('milestone:reached', deviceId, `${milestone}_points`, currentPoints);
      }
    }
  }

  /**
   * Obtiene las contribuciones de un dispositivo
   */
  getDeviceContributions(deviceId: string): Contribution[] {
    const contributionIds = this.deviceContributions.get(deviceId) || [];
    return contributionIds.map((id) => this.contributions.get(id)!).filter(Boolean);
  }

  /**
   * Obtiene los puntos totales de un dispositivo
   */
  getDevicePoints(deviceId: string): number {
    return this.devicePoints.get(deviceId) || 0;
  }

  /**
   * Obtiene el leaderboard
   */
  getLeaderboard(limit: number = 100): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];

    for (const [deviceId, points] of this.devicePoints.entries()) {
      const contributions = this.getDeviceContributions(deviceId);
      const lastContribution = contributions.length > 0 ? contributions[contributions.length - 1] : null;

      entries.push({
        deviceId,
        totalPoints: points,
        contributionCount: contributions.length,
        lastContribution: lastContribution?.createdAt || new Date(),
      });
    }

    return entries.sort((a, b) => b.totalPoints - a.totalPoints).slice(0, limit);
  }

  /**
   * Obtiene contribuciones por proyecto
   */
  getProjectContributions(projectId: string): Contribution[] {
    return Array.from(this.contributions.values()).filter((c) => c.projectId === projectId);
  }

  /**
   * Obtiene estadísticas globales
   */
  getStats(): {
    totalContributions: number;
    totalPoints: number;
    uniqueDevices: number;
    contributionsByType: Record<string, number>;
    avgPointsPerDevice: number;
  } {
    const contributions = Array.from(this.contributions.values());
    const contributionsByType: Record<string, number> = {};

    let totalPoints = 0;
    for (const contribution of contributions) {
      totalPoints += contribution.points;
      contributionsByType[contribution.type] = (contributionsByType[contribution.type] || 0) + 1;
    }

    const uniqueDevices = this.devicePoints.size;

    return {
      totalContributions: contributions.length,
      totalPoints,
      uniqueDevices,
      contributionsByType,
      avgPointsPerDevice: uniqueDevices > 0 ? Math.floor(totalPoints / uniqueDevices) : 0,
    };
  }

  /**
   * Marca una contribución como con credencial EUDI emitida
   */
  markCredentialIssued(contributionId: string): void {
    const contribution = this.contributions.get(contributionId);
    if (contribution) {
      contribution.eudiCredentialIssued = true;
      this.contributions.set(contributionId, contribution);
    }
  }

  /**
   * Limpia recursos
   */
  dispose(): void {
    this.contributions.clear();
    this.deviceContributions.clear();
    this.devicePoints.clear();
    this.removeAllListeners();
    logger.info('ContributionTracker disposed');
  }
}

// Singleton export
export const contributionTracker = new ContributionTracker();
