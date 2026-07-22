/**
 * auto-mat-ion
 *
 * Framework opensource para granjas de pruebas distribuidas
 * con dispositivos reales y gamificación científica.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARQUITECTURA DE DOS CAPAS:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        MANAGEMENT LAYER                                 │
 * │   API REST, Usuarios, Proyectos, Gamificación, Integración vital-core   │
 * │                      (Orquestación de alto nivel)                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                            ExecutionAdapter
 *                                    │
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                        EXECUTION LAYER                                  │
 * │   Control real de dispositivos: ADB, Puppeteer, Appium, browser control │
 * │                      (Extraído de solar-lab)                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Parte del ecosistema UTOP.IA
 * Orquestado por vital-core
 */

// ============================================================================
// MANAGEMENT LAYER (Alto nivel: API, usuarios, gamificación)
// ============================================================================

// Core management
export { DeviceManager, deviceManager } from './core/DeviceManager.js';
export { TestOrchestrator as ManagementOrchestrator } from './core/TestOrchestrator.js';
export { ContributionTracker, contributionTracker } from './core/ContributionTracker.js';

// Types (management layer)
export * from './models/types.js';

// Config
export { config } from './config/index.js';

// Utils
export { createLogger } from './utils/logger.js';
export * from './utils/crypto.js';

// Server (API REST)
export { createServer, startServer } from './api/server.js';

// ============================================================================
// EXECUTION LAYER (Bajo nivel: control real de dispositivos)
// ============================================================================

// Re-export the entire execution layer with a namespace
export * as execution from './execution/index.js';

// Most commonly used execution exports (for convenience)
export {
  // Types
  type Platform,
  type Browser,
  type IDeviceInfo,
  type ITestConfig,
  type ITestExecutor,
  type IExecutionTestResult,

  // Orchestrator
  TestOrchestrator as ExecutionOrchestrator,
  createOrchestrator,

  // Controllers
  AndroidController,
  createAndroidController,
  listAndroidDevices,
  detectPlatform,
  createLocalDeviceInfo,

  // Adapters (bridge between layers)
  ExecutionAdapter,
  DeviceAdapter,
  ResultAdapter,
  type IManagedDevice,
  type IManagedResult,
  type IContribution,
  type ExecutionEvent,

  // Utilities
  createConsoleLogger,
  createDefaultControllerFactory,
  quickExecute,
} from './execution/index.js';

// ============================================================================
// INTEGRATIONS (vital-core ecosystem)
// ============================================================================

export * as integrations from './integrations/index.js';

export {
  VitalCoreClient,
  getVitalCoreClient,
  createVitalCoreClient,
  type VitalCoreConfig,
} from './integrations/index.js';

// ============================================================================
// CLI Entry Point
// ============================================================================

import { startServer } from './api/server.js';

// Si se ejecuta directamente, iniciar el servidor
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer().catch((error) => {
    console.error('Failed to start auto-mat-ion:', error);
    process.exit(1);
  });
}
