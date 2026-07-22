/**
 * auto-mat-ion Execution Logger
 *
 * Adapted from solar-lab for structured logging, result collection,
 * and file organization for test runs.
 *
 * Features:
 * - Memory-optimized result tracking (keeps only last N results)
 * - JSON/CSV output
 * - Screenshot saving
 * - Session organization
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ITestConfig, IExecutionTestResult } from './types.js';
import type { IExecutionLogger, ITestMatrix } from './orchestrator.js';

// ============================================================================
// Types
// ============================================================================

export interface ILogConfig {
  outputDir: string;
  jsonLogs: boolean;
  csvSummary: boolean;
  screenshotsOnFailure: boolean;
  organizeByDevice: boolean;
  verbose: boolean;
}

export interface ISessionSummary {
  sessionId: string;
  startTime: string;
  endTime: string;
  totalDuration: number;
  totalTests: number;
  resultsByStatus: Record<string, number>;
  logFiles: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_LOG_CONFIG: ILogConfig = {
  outputDir: './logs',
  jsonLogs: true,
  csvSummary: true,
  screenshotsOnFailure: true,
  organizeByDevice: true,
  verbose: false,
};

// ============================================================================
// Logger Class
// ============================================================================

export class ExecutionLogger implements IExecutionLogger {
  private config: ILogConfig;
  private sessionId: string;
  private sessionDir: string;
  private startTime: Date;
  private results: IExecutionTestResult[] = [];
  private testMatrix: ITestMatrix | null = null;

  // Memory optimization: Track counts separately
  private resultCount = 0;
  private resultsByStatusCount: Record<string, number> = {};

  // Maximum results to keep in memory
  private static readonly MAX_RESULTS_IN_MEMORY = 100;

  constructor(config: Partial<ILogConfig> = {}) {
    this.config = { ...DEFAULT_LOG_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.sessionDir = path.join(this.config.outputDir, this.sessionId);
    this.startTime = new Date();

    this.initializeDirectories();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const random = Math.random().toString(36).substring(2, 6);
    return `session_${dateStr}_${timeStr}_${random}`;
  }

  /**
   * Initialize directory structure
   */
  private initializeDirectories(): void {
    const dirs = [
      this.sessionDir,
      path.join(this.sessionDir, 'results'),
      path.join(this.sessionDir, 'screenshots'),
      path.join(this.sessionDir, 'logs'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.log('info', `Session initialized: ${this.sessionId}`);
    this.log('info', `Output directory: ${this.sessionDir}`);
  }

  /**
   * Get session directory
   */
  getSessionDir(): string {
    return this.sessionDir;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Set test matrix for this session
   */
  setTestMatrix(matrix: ITestMatrix): void {
    this.testMatrix = matrix;

    const matrixPath = path.join(this.sessionDir, 'test-matrix.json');
    fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2));
    this.log('info', `Test matrix saved: ${matrixPath}`);
  }

  /**
   * Log message with level
   */
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const fullMessage = `${prefix} ${message}`;

    // Console output with colors
    const colors: Record<string, string> = {
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[90m',
      reset: '\x1b[0m',
    };

    if (level !== 'debug' || this.config.verbose) {
      console.log(`${colors[level]}${fullMessage}${colors.reset}`);
      if (data && this.config.verbose) {
        console.log(data);
      }
    }

    // Write to log file
    const logEntry = { timestamp, level, message, data };
    const logPath = path.join(this.sessionDir, 'logs', 'session.log');
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  }

  /**
   * Log test start
   */
  logTestStart(config: ITestConfig): void {
    this.log('info', `Starting test: ${config.id}`, {
      device: config.device.name,
      browser: config.browser,
      camera: config.camera?.label,
      orientation: config.orientation,
    });
  }

  /**
   * Log test result and save to file
   */
  async logTestResult(result: IExecutionTestResult): Promise<void> {
    // Track counts
    this.resultCount++;
    const status = result.status;
    this.resultsByStatusCount[status] = (this.resultsByStatusCount[status] || 0) + 1;

    // Memory optimization: keep only last N results
    if (this.results.length >= ExecutionLogger.MAX_RESULTS_IN_MEMORY) {
      this.results.shift();
    }
    this.results.push(result);

    // Log message
    const statusEmoji = result.status === 'completed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
    const verdict = result.output?.verdict ? ` - ${result.output.verdict}` : '';
    const confidence = result.output?.confidence ? ` (${(result.output.confidence * 100).toFixed(0)}%)` : '';

    this.log(
      result.status === 'completed' ? 'info' : 'error',
      `${statusEmoji} Test ${result.config.id}: ${result.status}${verdict}${confidence}`
    );

    // Save JSON result
    if (this.config.jsonLogs) {
      let resultPath: string;
      if (this.config.organizeByDevice) {
        const deviceDir = path.join(
          this.sessionDir,
          'results',
          this.sanitizeFilename(result.config.device.name)
        );
        if (!fs.existsSync(deviceDir)) {
          fs.mkdirSync(deviceDir, { recursive: true });
        }
        resultPath = path.join(deviceDir, `${result.config.id}.json`);
      } else {
        resultPath = path.join(this.sessionDir, 'results', `${result.config.id}.json`);
      }

      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
    }
  }

  /**
   * Save screenshot
   */
  async saveScreenshot(testId: string, screenshotData: string, label?: string): Promise<string> {
    const filename = label ? `${testId}_${label}.png` : `${testId}.png`;
    const screenshotPath = path.join(this.sessionDir, 'screenshots', filename);

    // Handle base64 data URL or raw base64
    const base64Data = screenshotData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(screenshotPath, Buffer.from(base64Data, 'base64'));

    this.log('debug', `Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  /**
   * Finalize session and generate summary
   */
  async finalize(): Promise<ISessionSummary> {
    const endTime = new Date();
    const totalDuration = endTime.getTime() - this.startTime.getTime();

    const summary: ISessionSummary = {
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDuration,
      totalTests: this.resultCount,
      resultsByStatus: { ...this.resultsByStatusCount },
      logFiles: this.collectLogFiles(),
    };

    // Save summary
    const summaryPath = path.join(this.sessionDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    // Generate CSV if enabled
    if (this.config.csvSummary) {
      await this.generateCSV();
    }

    // Final log
    this.log('info', '═'.repeat(50));
    this.log('info', `Session completed: ${this.sessionId}`);
    this.log('info', `Total tests: ${this.resultCount}`);
    this.log('info', `Duration: ${this.formatDuration(totalDuration)}`);
    this.log('info', `Results: ${Object.entries(this.resultsByStatusCount).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    this.log('info', '═'.repeat(50));

    return summary;
  }

  /**
   * Generate CSV summary
   */
  private async generateCSV(): Promise<void> {
    const headers = [
      'test_id',
      'timestamp',
      'device',
      'platform',
      'browser',
      'camera',
      'orientation',
      'status',
      'verdict',
      'confidence',
      'duration_ms',
      'error',
    ];

    const rows = this.results.map((result) => [
      result.config.id,
      result.environment?.timestamp || '',
      result.config.device.name,
      result.config.device.platform,
      result.config.browser,
      result.config.camera?.label || '',
      result.config.orientation || '',
      result.status,
      result.output?.verdict || '',
      result.output?.confidence || '',
      result.duration || '',
      result.error || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    const csvPath = path.join(this.sessionDir, 'results.csv');
    fs.writeFileSync(csvPath, csvContent);
    this.log('info', `CSV summary saved: ${csvPath}`);
  }

  /**
   * Collect all log file paths
   */
  private collectLogFiles(): string[] {
    const files: string[] = [];

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (
          item.endsWith('.json') ||
          item.endsWith('.csv') ||
          item.endsWith('.log')
        ) {
          files.push(fullPath);
        }
      }
    };

    walkDir(this.sessionDir);
    return files;
  }

  /**
   * Sanitize string for filename
   */
  private sanitizeFilename(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  }

  /**
   * Format duration as human-readable string
   */
  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
  }

  /**
   * Get results in memory
   */
  getResults(): IExecutionTestResult[] {
    return [...this.results];
  }

  /**
   * Get total result count
   */
  getTotalResultCount(): number {
    return this.resultCount;
  }

  /**
   * Clear memory cache (for long-running sessions)
   */
  clearMemoryCache(): void {
    this.results.length = 0;
    this.log('debug', 'Memory cache cleared');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createExecutionLogger(outputDir?: string): ExecutionLogger {
  return new ExecutionLogger(outputDir ? { outputDir } : undefined);
}
