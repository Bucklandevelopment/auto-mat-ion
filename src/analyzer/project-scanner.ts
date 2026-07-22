/**
 * TALMM Project Scanner
 *
 * Escanea proyectos para detectar estructura, componentes y oportunidades de test.
 * Primer uso: auto-análisis de la demo de auto-mat-ion.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ScanResult {
  projectPath: string;
  projectName: string;
  scanTime: string;

  // Tipo de proyecto
  projectType: 'npm' | 'makefile' | 'static' | 'unknown';
  framework: string;

  // Scripts disponibles
  scripts: Record<string, string>;
  startCommand: string;

  // Estructura detectada
  structure: {
    htmlPages: PageInfo[];
    jsFiles: string[];
    cssFiles: string[];
    configFiles: string[];
  };

  // APIs de sensores detectadas
  sensorApis: SensorApiUsage[];

  // Tests existentes vs faltantes
  coverage: {
    existing: string[];
    missing: string[];
    suggestions: TestSuggestion[];
  };
}

export interface PageInfo {
  path: string;
  name: string;
  title: string;
  type: 'sensor' | 'demo' | 'index' | 'other';
  apis: string[];
  hasTestRunner: boolean;
}

export interface SensorApiUsage {
  api: string;
  category: 'media' | 'device' | 'location' | 'network' | 'storage';
  pages: string[];
  hasTests: boolean;
}

export interface TestSuggestion {
  id: string;
  name: string;
  description: string;
  targetApi: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  complexity: 'simple' | 'medium' | 'complex';
}

// ============================================================================
// Sensor API Detection Patterns
// ============================================================================

const SENSOR_PATTERNS: Record<string, { pattern: RegExp; category: SensorApiUsage['category'] }> = {
  // Media APIs
  'getUserMedia': { pattern: /navigator\.mediaDevices\.getUserMedia/g, category: 'media' },
  'enumerateDevices': { pattern: /navigator\.mediaDevices\.enumerateDevices/g, category: 'media' },
  'MediaRecorder': { pattern: /new\s+MediaRecorder/g, category: 'media' },
  'AudioContext': { pattern: /new\s+(Audio|webkit)Context/g, category: 'media' },
  'createMediaStreamSource': { pattern: /createMediaStreamSource/g, category: 'media' },

  // Device APIs
  'DeviceMotionEvent': { pattern: /DeviceMotionEvent/g, category: 'device' },
  'DeviceOrientationEvent': { pattern: /DeviceOrientationEvent/g, category: 'device' },
  'Accelerometer': { pattern: /new\s+Accelerometer/g, category: 'device' },
  'Gyroscope': { pattern: /new\s+Gyroscope/g, category: 'device' },
  'vibrate': { pattern: /navigator\.vibrate/g, category: 'device' },
  'getBattery': { pattern: /navigator\.getBattery/g, category: 'device' },

  // Location APIs
  'geolocation': { pattern: /navigator\.geolocation/g, category: 'location' },
  'getCurrentPosition': { pattern: /getCurrentPosition/g, category: 'location' },
  'watchPosition': { pattern: /watchPosition/g, category: 'location' },

  // Network APIs
  'NetworkInformation': { pattern: /navigator\.connection/g, category: 'network' },
  'fetch': { pattern: /\bfetch\s*\(/g, category: 'network' },
  'WebSocket': { pattern: /new\s+WebSocket/g, category: 'network' },

  // Storage APIs
  'localStorage': { pattern: /localStorage\./g, category: 'storage' },
  'IndexedDB': { pattern: /indexedDB\./g, category: 'storage' },
};

// ============================================================================
// Scanner Class
// ============================================================================

export class ProjectScanner {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Escanea el proyecto completo
   */
  async scan(): Promise<ScanResult> {
    console.log(`[Scanner] Scanning: ${this.projectPath}`);

    const result: ScanResult = {
      projectPath: this.projectPath,
      projectName: basename(this.projectPath),
      scanTime: new Date().toISOString(),
      projectType: 'unknown',
      framework: 'unknown',
      scripts: {},
      startCommand: '',
      structure: {
        htmlPages: [],
        jsFiles: [],
        cssFiles: [],
        configFiles: [],
      },
      sensorApis: [],
      coverage: {
        existing: [],
        missing: [],
        suggestions: [],
      },
    };

    // Detectar tipo de proyecto
    this.detectProjectType(result);

    // Escanear estructura
    this.scanStructure(result, this.projectPath);

    // Detectar APIs de sensores
    this.detectSensorApis(result);

    // Analizar cobertura de tests
    this.analyzeCoverage(result);

    console.log(`[Scanner] Found ${result.structure.htmlPages.length} pages, ${result.sensorApis.length} sensor APIs`);

    return result;
  }

  /**
   * Detecta el tipo de proyecto
   */
  private detectProjectType(result: ScanResult): void {
    const packageJsonPath = join(this.projectPath, 'package.json');
    const makefilePath = join(this.projectPath, 'Makefile');

    if (existsSync(packageJsonPath)) {
      result.projectType = 'npm';

      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        result.scripts = pkg.scripts || {};
        result.projectName = pkg.name || result.projectName;

        // Detectar framework
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['react']) result.framework = 'react';
        else if (deps['vue']) result.framework = 'vue';
        else if (deps['@angular/core']) result.framework = 'angular';
        else if (deps['svelte']) result.framework = 'svelte';
        else result.framework = 'vanilla';

        // Determinar comando de inicio
        if (result.scripts['dev']) result.startCommand = 'npm run dev';
        else if (result.scripts['start']) result.startCommand = 'npm start';
        else if (result.scripts['serve']) result.startCommand = 'npm run serve';

      } catch (e) {
        console.warn('[Scanner] Failed to parse package.json');
      }

    } else if (existsSync(makefilePath)) {
      result.projectType = 'makefile';
      result.startCommand = 'make serve';

      // Parsear Makefile para targets
      try {
        const makefile = readFileSync(makefilePath, 'utf-8');
        const targets = makefile.match(/^([a-zA-Z_-]+):/gm);
        if (targets) {
          for (const target of targets) {
            const name = target.replace(':', '');
            result.scripts[name] = `make ${name}`;
          }
        }
      } catch (e) {
        // Ignore
      }

    } else {
      result.projectType = 'static';
    }
  }

  /**
   * Escanea la estructura de archivos
   */
  private scanStructure(result: ScanResult, dir: string, depth = 0): void {
    if (depth > 5) return; // Limitar profundidad

    const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        if (ignorePatterns.includes(entry)) continue;

        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          this.scanStructure(result, fullPath, depth + 1);
        } else {
          const ext = extname(entry).toLowerCase();
          const relativePath = fullPath.replace(this.projectPath, '').replace(/^\//, '');

          switch (ext) {
            case '.html':
              result.structure.htmlPages.push(this.analyzeHtmlPage(fullPath, relativePath));
              break;
            case '.js':
            case '.ts':
            case '.jsx':
            case '.tsx':
              result.structure.jsFiles.push(relativePath);
              break;
            case '.css':
            case '.scss':
            case '.less':
              result.structure.cssFiles.push(relativePath);
              break;
            case '.json':
            case '.yaml':
            case '.yml':
              if (!entry.includes('package-lock') && !entry.includes('yarn.lock')) {
                result.structure.configFiles.push(relativePath);
              }
              break;
          }
        }
      }
    } catch (e) {
      // Permission error, skip
    }
  }

  /**
   * Analiza una página HTML
   */
  private analyzeHtmlPage(fullPath: string, relativePath: string): PageInfo {
    const content = readFileSync(fullPath, 'utf-8');
    const name = basename(relativePath, '.html');

    // Extraer título
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1] || name;

    // Detectar tipo
    let type: PageInfo['type'] = 'other';
    if (name === 'index') type = 'index';
    else if (relativePath.includes('sensor') || this.detectsSensorApi(content)) type = 'sensor';
    else if (relativePath.includes('demo')) type = 'demo';

    // Detectar APIs usadas
    const apis: string[] = [];
    for (const [api, { pattern }] of Object.entries(SENSOR_PATTERNS)) {
      if (pattern.test(content)) {
        apis.push(api);
      }
    }

    // Verificar si tiene TestRunner
    const hasTestRunner = content.includes('test-runner.js') || content.includes('TestRunner');

    return {
      path: relativePath,
      name,
      title,
      type,
      apis,
      hasTestRunner,
    };
  }

  /**
   * Verifica si el contenido usa APIs de sensores
   */
  private detectsSensorApi(content: string): boolean {
    for (const { pattern } of Object.values(SENSOR_PATTERNS)) {
      if (pattern.test(content)) return true;
    }
    return false;
  }

  /**
   * Detecta todas las APIs de sensores usadas
   */
  private detectSensorApis(result: ScanResult): void {
    const apiUsage: Record<string, SensorApiUsage> = {};

    for (const page of result.structure.htmlPages) {
      for (const api of page.apis) {
        if (!apiUsage[api]) {
          const patternInfo = SENSOR_PATTERNS[api];
          apiUsage[api] = {
            api,
            category: patternInfo?.category || 'device',
            pages: [],
            hasTests: false,
          };
        }
        apiUsage[api].pages.push(page.path);
      }
    }

    // También escanear archivos JS
    for (const jsFile of result.structure.jsFiles) {
      try {
        const content = readFileSync(join(this.projectPath, jsFile), 'utf-8');
        for (const [api, { pattern, category }] of Object.entries(SENSOR_PATTERNS)) {
          if (pattern.test(content)) {
            if (!apiUsage[api]) {
              apiUsage[api] = { api, category, pages: [], hasTests: false };
            }
            if (!apiUsage[api].pages.includes(jsFile)) {
              apiUsage[api].pages.push(jsFile);
            }
          }
        }
      } catch (e) {
        // Skip unreadable files
      }
    }

    result.sensorApis = Object.values(apiUsage);
  }

  /**
   * Analiza cobertura de tests
   */
  private analyzeCoverage(result: ScanResult): void {
    // Buscar tests existentes
    const testResultsDir = join(this.projectPath, 'test-results');
    if (existsSync(testResultsDir)) {
      try {
        const files = readdirSync(testResultsDir);
        result.coverage.existing = files.filter(f => f.endsWith('.js'));
      } catch (e) {
        // Ignore
      }
    }

    // Determinar APIs sin tests
    const testedApis = new Set<string>();

    // Inferir qué APIs tienen tests basándose en nombres de archivos
    for (const testFile of result.coverage.existing) {
      const lower = testFile.toLowerCase();
      if (lower.includes('camera') || lower.includes('video')) {
        testedApis.add('getUserMedia');
        testedApis.add('MediaRecorder');
      }
      if (lower.includes('audio') || lower.includes('microphone')) {
        testedApis.add('AudioContext');
      }
      if (lower.includes('motion') || lower.includes('accelerometer')) {
        testedApis.add('DeviceMotionEvent');
      }
      if (lower.includes('location') || lower.includes('geo')) {
        testedApis.add('geolocation');
      }
    }

    // Marcar APIs con tests
    for (const apiUsage of result.sensorApis) {
      apiUsage.hasTests = testedApis.has(apiUsage.api);
      if (!apiUsage.hasTests) {
        result.coverage.missing.push(apiUsage.api);
      }
    }

    // Generar sugerencias de tests
    this.generateTestSuggestions(result);
  }

  /**
   * Genera sugerencias de tests basadas en el análisis
   */
  private generateTestSuggestions(result: ScanResult): void {
    const suggestions: TestSuggestion[] = [];

    // Sugerencias basadas en APIs sin tests
    for (const api of result.coverage.missing) {
      const usage = result.sensorApis.find(a => a.api === api);
      if (!usage) continue;

      const suggestion = this.createSuggestion(api, usage);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    // Sugerencias basadas en páginas sin TestRunner
    for (const page of result.structure.htmlPages) {
      if (page.type === 'sensor' && !page.hasTestRunner && page.apis.length > 0) {
        suggestions.push({
          id: `integrate-testrunner-${page.name}`,
          name: `Integrate TestRunner: ${page.name}`,
          description: `Add TestRunner bridge to ${page.path} for automated testing`,
          targetApi: page.apis[0],
          priority: 'medium',
          complexity: 'simple',
        });
      }
    }

    result.coverage.suggestions = suggestions;
  }

  /**
   * Crea una sugerencia de test para una API
   */
  private createSuggestion(api: string, usage: SensorApiUsage): TestSuggestion | null {
    const templates: Record<string, Partial<TestSuggestion>> = {
      'getUserMedia': {
        name: 'Camera Stream Test',
        description: 'Test camera access, stream initialization, and frame capture',
        priority: 'critical',
        complexity: 'medium',
      },
      'MediaRecorder': {
        name: 'Video Recording Test',
        description: 'Test video recording, encoding, and file generation',
        priority: 'high',
        complexity: 'medium',
      },
      'AudioContext': {
        name: 'Audio Analysis Test',
        description: 'Test audio capture, analysis, and Web Audio API integration',
        priority: 'high',
        complexity: 'medium',
      },
      'DeviceMotionEvent': {
        name: 'Motion Sensor Test',
        description: 'Test accelerometer and gyroscope data capture',
        priority: 'medium',
        complexity: 'simple',
      },
      'DeviceOrientationEvent': {
        name: 'Orientation Test',
        description: 'Test device orientation (compass, tilt) detection',
        priority: 'medium',
        complexity: 'simple',
      },
      'geolocation': {
        name: 'Geolocation Test',
        description: 'Test GPS/location access and position tracking',
        priority: 'medium',
        complexity: 'simple',
      },
      'vibrate': {
        name: 'Vibration Test',
        description: 'Test vibration patterns and haptic feedback',
        priority: 'low',
        complexity: 'simple',
      },
      'getBattery': {
        name: 'Battery Status Test',
        description: 'Test battery level monitoring and charging detection',
        priority: 'low',
        complexity: 'simple',
      },
      'NetworkInformation': {
        name: 'Network Status Test',
        description: 'Test network type detection and connection monitoring',
        priority: 'low',
        complexity: 'simple',
      },
    };

    const template = templates[api];
    if (!template) return null;

    return {
      id: `test-${api.toLowerCase()}-${Date.now()}`,
      targetApi: api,
      ...template,
    } as TestSuggestion;
  }
}

// ============================================================================
// CLI Helper
// ============================================================================

export async function scanProject(projectPath: string): Promise<ScanResult> {
  const scanner = new ProjectScanner(projectPath);
  return scanner.scan();
}

// ============================================================================
// Self-scan helper for demo
// ============================================================================

export async function scanDemo(): Promise<ScanResult> {
  const demoPath = join(process.cwd(), 'demo');
  if (!existsSync(demoPath)) {
    throw new Error('Demo directory not found. Run from auto-mat-ion root.');
  }

  return scanProject(demoPath);
}
