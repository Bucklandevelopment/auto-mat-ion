/**
 * TALMM - Testing Automatizado Local MultiProyecto MultiDispositivo
 *
 * Módulo de análisis de proyectos para generación automática de tests.
 *
 * @module analyzer
 * @author Auto-Mat-ION / UTOP.IA
 */

// ============================================================================
// Re-export implemented modules
// ============================================================================

export {
  ProjectScanner,
  scanProject,
  scanDemo,
  type ScanResult,
  type PageInfo,
  type SensorApiUsage,
  type TestSuggestion,
} from './project-scanner.js';

export {
  CodeAnalyzer,
  analyzeProject,
  analyzeDemo,
  type AnalyzerConfig,
  type AnalysisResult,
  type GeneratedTest,
  type ModelInfo,
} from './code-analyzer.js';

// ============================================================================
// Additional Types (for future expansion)
// ============================================================================

/**
 * Tipo de proyecto detectado
 */
export type ProjectType = 'npm' | 'yarn' | 'pnpm' | 'makefile' | 'static' | 'unknown';

/**
 * Framework frontend detectado
 */
export type Framework =
  | 'react'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'nextjs'
  | 'nuxt'
  | 'vanilla'
  | 'unknown';

/**
 * Patrones de negocio detectados
 */
export interface BusinessPatterns {
  hasAuth: boolean;
  hasRegistration: boolean;
  hasCRUD: boolean;
  hasSearch: boolean;
  hasPayment: boolean;
  hasFileUpload: boolean;
  hasCameraAccess: boolean;
  hasAudioAccess: boolean;
  hasGeolocation: boolean;
  hasNotifications: boolean;
}

// ============================================================================
// Version & Info
// ============================================================================

export const TALMM_VERSION = '0.2.0';
export const TALMM_CODENAME = 'Genesis';

// Only log in verbose mode
if (process.env.TALMM_VERBOSE) {
  console.log(`[TALMM] Module loaded - v${TALMM_VERSION} "${TALMM_CODENAME}"`);
}
