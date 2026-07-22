import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { Test, TestResult, TestStatus, TestType, Device, ResultStatus } from '../models/types.js';
import { DeviceManager } from './DeviceManager.js';
import { createLogger } from '../utils/logger.js';
import config from '../config/index.js';

const logger = createLogger('TestOrchestrator');

interface TestOrchestratorEvents {
  'test:queued': (test: Test) => void;
  'test:started': (test: Test, devices: Device[]) => void;
  'test:completed': (test: Test, results: TestResult[]) => void;
  'test:failed': (test: Test, error: string) => void;
  'result:received': (result: TestResult) => void;
  'result:validated': (result: TestResult) => void;
}

export interface CreateTestInput {
  projectId: string;
  type: TestType;
  name: string;
  description?: string;
  script?: string;
  config?: Record<string, unknown>;
  requirements?: {
    deviceTypes?: string[];
    sensors?: string[];
    minDevices?: number;
    maxDevices?: number;
    regions?: string[];
  };
  priority?: number;
  timeout?: number;
}

export class TestOrchestrator extends EventEmitter<TestOrchestratorEvents> {
  private tests: Map<string, Test> = new Map();
  private results: Map<string, TestResult[]> = new Map(); // testId -> results
  private testQueue: string[] = []; // IDs ordenados por prioridad
  private runningTests: Set<string> = new Set();

  constructor(private deviceManager: DeviceManager) {
    super();
    logger.info('TestOrchestrator initialized');
  }

  /**
   * Crea y encola un nuevo test
   */
  createTest(input: CreateTestInput): Test {
    const now = new Date();
    const test: Test = {
      id: nanoid(),
      projectId: input.projectId,
      type: input.type,
      name: input.name,
      description: input.description,
      script: input.script,
      config: input.config || {},
      requirements: {
        deviceTypes: input.requirements?.deviceTypes as any,
        sensors: input.requirements?.sensors,
        minDevices: input.requirements?.minDevices || 1,
        maxDevices: input.requirements?.maxDevices,
        regions: input.requirements?.regions,
      },
      status: 'queued',
      priority: input.priority || 0,
      timeout: input.timeout || 300000,
      retries: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    };

    this.tests.set(test.id, test);
    this.results.set(test.id, []);
    this.enqueue(test);

    logger.info({ testId: test.id, projectId: test.projectId }, 'Test created and queued');
    this.emit('test:queued', test);

    return test;
  }

  /**
   * Obtiene un test por ID
   */
  getTest(testId: string): Test | undefined {
    return this.tests.get(testId);
  }

  /**
   * Obtiene los resultados de un test
   */
  getTestResults(testId: string): TestResult[] {
    return this.results.get(testId) || [];
  }

  /**
   * Intenta ejecutar el siguiente test en la cola
   */
  async processQueue(): Promise<void> {
    if (this.testQueue.length === 0) {
      return;
    }

    const testId = this.testQueue[0];
    const test = this.tests.get(testId);

    if (!test || this.runningTests.has(testId)) {
      return;
    }

    // Buscar dispositivos disponibles
    const availableDevices = this.deviceManager.findDevicesForTest({
      deviceTypes: test.requirements.deviceTypes,
      sensors: test.requirements.sensors,
      regions: test.requirements.regions,
    });

    if (availableDevices.length < test.requirements.minDevices) {
      logger.debug(
        {
          testId,
          required: test.requirements.minDevices,
          available: availableDevices.length,
        },
        'Not enough devices available'
      );
      return;
    }

    // Seleccionar dispositivos
    const selectedDevices = availableDevices.slice(
      0,
      test.requirements.maxDevices || availableDevices.length
    );

    // Iniciar test
    await this.startTest(test, selectedDevices);
  }

  /**
   * Inicia la ejecución de un test en los dispositivos seleccionados
   */
  private async startTest(test: Test, devices: Device[]): Promise<void> {
    this.testQueue = this.testQueue.filter((id) => id !== test.id);
    this.runningTests.add(test.id);

    test.status = 'running';
    test.updatedAt = new Date();
    this.tests.set(test.id, test);

    // Marcar dispositivos como busy
    for (const device of devices) {
      this.deviceManager.updateDeviceStatus(device.id, 'busy');
    }

    logger.info(
      {
        testId: test.id,
        deviceCount: devices.length,
        deviceIds: devices.map((d) => d.id),
      },
      'Test started'
    );

    this.emit('test:started', test, devices);

    // Configurar timeout
    setTimeout(() => {
      if (this.runningTests.has(test.id)) {
        this.handleTestTimeout(test.id);
      }
    }, test.timeout);
  }

  /**
   * Recibe un resultado de un dispositivo
   */
  receiveResult(
    testId: string,
    deviceId: string,
    output: unknown,
    metrics?: TestResult['metrics'],
    error?: string
  ): TestResult {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const now = new Date();
    const result: TestResult = {
      id: nanoid(),
      testId,
      deviceId,
      status: error ? 'rejected' : 'pending', // Se validará después si no hay error
      output,
      metrics,
      error,
      pointsAwarded: 0,
      startedAt: test.updatedAt, // Aproximación
      completedAt: now,
      createdAt: now,
    };

    const testResults = this.results.get(testId) || [];
    testResults.push(result);
    this.results.set(testId, testResults);

    // Liberar dispositivo
    const device = this.deviceManager.getDevice(deviceId);
    if (device) {
      this.deviceManager.updateDeviceStatus(deviceId, 'online');
    }

    logger.info({ testId, deviceId, resultId: result.id }, 'Result received');
    this.emit('result:received', result);

    // Verificar si el test está completo
    this.checkTestCompletion(testId);

    return result;
  }

  /**
   * Valida un resultado usando consenso
   */
  validateResult(resultId: string, testId: string): TestResult {
    const testResults = this.results.get(testId) || [];
    const result = testResults.find((r) => r.id === resultId);

    if (!result) {
      throw new Error(`Result ${resultId} not found`);
    }

    // Obtener otros resultados del mismo test para consenso
    const otherResults = testResults.filter((r) => r.id !== resultId && !r.error);

    if (otherResults.length < config.CONSENSUS_MIN_DEVICES - 1) {
      // No hay suficientes dispositivos para consenso, aceptar provisionalmente
      result.status = 'validated';
      result.validation = {
        consensusDevices: 1,
        confidence: 0.5,
        anomalyDetected: false,
      };
    } else {
      // Implementar lógica de consenso
      const { isValid, confidence, isAnomaly } = this.calculateConsensus(result, otherResults);

      result.status = isValid ? 'validated' : isAnomaly ? 'anomaly' : 'rejected';
      result.validation = {
        consensusDevices: otherResults.length + 1,
        confidence,
        anomalyDetected: isAnomaly,
      };
    }

    // Calcular puntos si es válido
    if (result.status === 'validated') {
      result.pointsAwarded = this.calculatePoints(result);
      this.deviceManager.addPoints(result.deviceId, result.pointsAwarded);
    }

    logger.info(
      {
        resultId,
        status: result.status,
        confidence: result.validation?.confidence,
        points: result.pointsAwarded,
      },
      'Result validated'
    );

    this.emit('result:validated', result);

    return result;
  }

  /**
   * Calcula el consenso entre resultados
   */
  private calculateConsensus(
    result: TestResult,
    otherResults: TestResult[]
  ): {
    isValid: boolean;
    confidence: number;
    isAnomaly: boolean;
  } {
    // Implementación simplificada
    // En producción, esto debería comparar los outputs de forma más sofisticada

    if (otherResults.length === 0) {
      return { isValid: true, confidence: 0.5, isAnomaly: false };
    }

    // Para resultados numéricos simples, calcular desviación
    if (typeof result.output === 'number') {
      const values = otherResults
        .map((r) => r.output)
        .filter((v): v is number => typeof v === 'number');

      if (values.length > 0) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const stdDev = Math.sqrt(
          values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        );

        const zScore = stdDev > 0 ? Math.abs((result.output as number) - mean) / stdDev : 0;

        const isAnomaly = zScore > 2; // Más de 2 desviaciones estándar
        const confidence = Math.max(0, 1 - zScore / 4);

        return {
          isValid: !isAnomaly,
          confidence,
          isAnomaly,
        };
      }
    }

    // Para otros tipos, asumir válido con confianza media
    return { isValid: true, confidence: 0.75, isAnomaly: false };
  }

  /**
   * Calcula los puntos a otorgar por un resultado
   */
  private calculatePoints(result: TestResult): number {
    const test = this.tests.get(result.testId);
    if (!test) return 0;

    let points = config.POINTS_TEST_BASIC;

    // Bonus por tipo de test
    if (test.type === 'e2e' || test.type === 'performance') {
      points = config.POINTS_TEST_SUITE;
    }

    // Bonus por alta confianza
    if (result.validation && result.validation.confidence > 0.9) {
      points = Math.floor(points * 1.5);
    }

    return points;
  }

  /**
   * Verifica si un test ha completado
   */
  private checkTestCompletion(testId: string): void {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return;

    const testResults = this.results.get(testId) || [];

    // Verificar si tenemos suficientes resultados
    if (testResults.length >= test.requirements.minDevices) {
      this.completeTest(testId);
    }
  }

  /**
   * Marca un test como completado
   */
  private completeTest(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;

    this.runningTests.delete(testId);
    test.status = 'completed';
    test.updatedAt = new Date();
    this.tests.set(testId, test);

    const results = this.results.get(testId) || [];

    // Validar todos los resultados pendientes
    for (const result of results) {
      if (result.status === 'pending') {
        this.validateResult(result.id, testId);
      }
    }

    logger.info(
      {
        testId,
        resultCount: results.length,
        validatedCount: results.filter((r) => r.status === 'validated').length,
      },
      'Test completed'
    );

    this.emit('test:completed', test, results);
  }

  /**
   * Maneja el timeout de un test
   */
  private handleTestTimeout(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;

    if (test.retries < test.maxRetries) {
      test.retries++;
      test.status = 'queued';
      test.updatedAt = new Date();
      this.tests.set(testId, test);
      this.runningTests.delete(testId);
      this.enqueue(test);

      logger.warn({ testId, retries: test.retries }, 'Test timeout, retrying');
    } else {
      test.status = 'timeout';
      test.updatedAt = new Date();
      this.tests.set(testId, test);
      this.runningTests.delete(testId);

      logger.error({ testId }, 'Test timeout, max retries exceeded');
      this.emit('test:failed', test, 'Timeout exceeded max retries');
    }
  }

  /**
   * Añade un test a la cola ordenada por prioridad
   */
  private enqueue(test: Test): void {
    this.testQueue.push(test.id);
    this.testQueue.sort((a, b) => {
      const testA = this.tests.get(a);
      const testB = this.tests.get(b);
      if (!testA || !testB) return 0;
      return testB.priority - testA.priority; // Mayor prioridad primero
    });
  }

  /**
   * Obtiene estadísticas del orquestador
   */
  getStats(): {
    totalTests: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    totalResults: number;
    validatedResults: number;
  } {
    const tests = Array.from(this.tests.values());
    let totalResults = 0;
    let validatedResults = 0;

    for (const results of this.results.values()) {
      totalResults += results.length;
      validatedResults += results.filter((r) => r.status === 'validated').length;
    }

    return {
      totalTests: tests.length,
      queued: tests.filter((t) => t.status === 'queued').length,
      running: tests.filter((t) => t.status === 'running').length,
      completed: tests.filter((t) => t.status === 'completed').length,
      failed: tests.filter((t) => t.status === 'failed' || t.status === 'timeout').length,
      totalResults,
      validatedResults,
    };
  }

  /**
   * Limpia recursos
   */
  dispose(): void {
    this.tests.clear();
    this.results.clear();
    this.testQueue = [];
    this.runningTests.clear();
    this.removeAllListeners();
    logger.info('TestOrchestrator disposed');
  }
}
