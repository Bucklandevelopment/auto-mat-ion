/**
 * TALMM Code Analyzer
 *
 * Usa Ollama para análisis inteligente de código y generación de tests.
 * Soporta modelos separados para lectura (análisis) y escritura (generación).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ScanResult, TestSuggestion } from './project-scanner.js';

// ============================================================================
// Types
// ============================================================================

export interface AnalyzerConfig {
  // Modelos de Ollama
  readerModel: string;   // Modelo para análisis/lectura
  writerModel: string;   // Modelo para generación/escritura

  // Configuración de Ollama
  ollamaHost: string;
  ollamaPort: number;
  timeout: number;

  // Opciones
  verbose: boolean;
  saveResponses: boolean;
  outputDir: string;
}

export interface ModelInfo {
  name: string;
  role: 'reader' | 'writer';
  size?: string;
  activeAt?: string;
}

export interface AnalysisResult {
  scanResult: ScanResult;
  llmAnalysis: {
    summary: string;
    patterns: string[];
    recommendations: string[];
    testPlan: GeneratedTest[];
  };
  modelsUsed: {
    reader: ModelInfo;
    writer: ModelInfo;
  };
  timestamp: string;
}

export interface GeneratedTest {
  id: string;
  name: string;
  description: string;
  targetApi: string;
  script: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Logger with Model Tracking
// ============================================================================

class ModelLogger {
  private logs: Array<{
    timestamp: string;
    model: string;
    role: 'reader' | 'writer';
    action: string;
    details?: string;
  }> = [];

  log(model: string, role: 'reader' | 'writer', action: string, details?: string): void {
    const entry = {
      timestamp: new Date().toISOString(),
      model,
      role,
      action,
      details,
    };
    this.logs.push(entry);

    // Console output con colores
    const roleIcon = role === 'reader' ? '📖' : '✍️';
    const roleColor = role === 'reader' ? '\x1b[36m' : '\x1b[33m';
    const reset = '\x1b[0m';

    console.log(`${roleColor}[${roleIcon} ${role.toUpperCase()}]${reset} ${model}: ${action}`);
    if (details) {
      console.log(`   ${details.substring(0, 100)}${details.length > 100 ? '...' : ''}`);
    }
  }

  getLogs() {
    return [...this.logs];
  }
}

// ============================================================================
// Ollama Client
// ============================================================================

async function queryOllama(
  config: AnalyzerConfig,
  model: string,
  prompt: string,
  system?: string
): Promise<string> {
  const url = `http://${config.ollamaHost}:${config.ollamaPort}/api/generate`;

  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  };

  if (system) {
    body.system = system;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response;

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama timeout after ${config.timeout}ms`);
    }
    throw error;
  }
}

async function listOllamaModels(config: AnalyzerConfig): Promise<string[]> {
  const url = `http://${config.ollamaHost}:${config.ollamaPort}/api/tags`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json() as { models?: Array<{ name: string }> };
    return data.models?.map(m => m.name) || [];
  } catch {
    return [];
  }
}

// ============================================================================
// Code Analyzer Class
// ============================================================================

export class CodeAnalyzer {
  private config: AnalyzerConfig;
  private logger: ModelLogger;

  constructor(config: Partial<AnalyzerConfig> = {}) {
    this.config = {
      readerModel: config.readerModel || 'llama3.2',
      writerModel: config.writerModel || 'llama3.2',
      ollamaHost: config.ollamaHost || 'localhost',
      ollamaPort: config.ollamaPort || 11434,
      timeout: config.timeout || 60000,
      verbose: config.verbose ?? true,
      saveResponses: config.saveResponses ?? true,
      outputDir: config.outputDir || './analyzer-output',
    };

    this.logger = new ModelLogger();
  }

  /**
   * Verifica disponibilidad de Ollama y modelos
   */
  async checkModels(): Promise<{ available: boolean; models: string[]; reader: boolean; writer: boolean }> {
    const models = await listOllamaModels(this.config);

    return {
      available: models.length > 0,
      models,
      reader: models.some(m => m.includes(this.config.readerModel.split(':')[0])),
      writer: models.some(m => m.includes(this.config.writerModel.split(':')[0])),
    };
  }

  /**
   * Analiza un proyecto usando el scan result
   */
  async analyze(scanResult: ScanResult): Promise<AnalysisResult> {
    console.log('\n════════════════════════════════════════════════════════');
    console.log('🧠 TALMM Code Analyzer');
    console.log('════════════════════════════════════════════════════════\n');

    // Verificar modelos
    const modelStatus = await this.checkModels();
    if (!modelStatus.available) {
      throw new Error('Ollama not available. Start with: ollama serve');
    }

    console.log(`📚 Reader Model: ${this.config.readerModel}`);
    console.log(`✏️  Writer Model: ${this.config.writerModel}`);
    console.log(`📁 Project: ${scanResult.projectName}\n`);

    // Crear directorio de output
    if (this.config.saveResponses && !existsSync(this.config.outputDir)) {
      mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Fase 1: Análisis con modelo lector
    this.logger.log(this.config.readerModel, 'reader', 'Starting code analysis');
    const llmSummary = await this.analyzeWithReader(scanResult);

    // Fase 2: Generación con modelo escritor
    this.logger.log(this.config.writerModel, 'writer', 'Starting test generation');
    const testPlan = await this.generateWithWriter(scanResult, llmSummary);

    // Compilar resultado
    const result: AnalysisResult = {
      scanResult,
      llmAnalysis: {
        summary: llmSummary.summary,
        patterns: llmSummary.patterns,
        recommendations: llmSummary.recommendations,
        testPlan,
      },
      modelsUsed: {
        reader: {
          name: this.config.readerModel,
          role: 'reader',
          activeAt: new Date().toISOString(),
        },
        writer: {
          name: this.config.writerModel,
          role: 'writer',
          activeAt: new Date().toISOString(),
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Guardar resultado
    if (this.config.saveResponses) {
      const outputPath = join(this.config.outputDir, `analysis-${Date.now()}.json`);
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n💾 Analysis saved to: ${outputPath}`);
    }

    return result;
  }

  /**
   * Fase de análisis con modelo lector
   */
  private async analyzeWithReader(scanResult: ScanResult): Promise<{
    summary: string;
    patterns: string[];
    recommendations: string[];
  }> {
    // Preparar contexto
    const context = this.buildAnalysisContext(scanResult);

    const systemPrompt = `You are a code analyzer for web applications with sensor APIs.
Your task is to analyze the project structure and identify testing opportunities.
Be concise and technical. Output in JSON format.`;

    const prompt = `Analyze this web project for sensor testing:

${context}

Respond with JSON:
{
  "summary": "Brief summary of what this project does",
  "patterns": ["List of sensor/API patterns found"],
  "recommendations": ["List of testing recommendations"],
  "missingTests": ["APIs that need tests"]
}`;

    this.logger.log(this.config.readerModel, 'reader', 'Analyzing project structure', context.substring(0, 200));

    const response = await queryOllama(this.config, this.config.readerModel, prompt, systemPrompt);

    this.logger.log(this.config.readerModel, 'reader', 'Analysis complete', response.substring(0, 200));

    // Parse JSON response
    try {
      // Extraer JSON del response (puede venir con texto extra)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'No summary provided',
          patterns: parsed.patterns || [],
          recommendations: parsed.recommendations || [],
        };
      }
    } catch (e) {
      console.warn('[Analyzer] Failed to parse LLM response as JSON, using raw');
    }

    // Fallback
    return {
      summary: response.substring(0, 500),
      patterns: scanResult.sensorApis.map(a => a.api),
      recommendations: scanResult.coverage.suggestions.map(s => s.description),
    };
  }

  /**
   * Fase de generación con modelo escritor
   */
  private async generateWithWriter(
    scanResult: ScanResult,
    analysis: { summary: string; patterns: string[]; recommendations: string[] }
  ): Promise<GeneratedTest[]> {
    const tests: GeneratedTest[] = [];

    // Generar tests para APIs sin cobertura
    for (const suggestion of scanResult.coverage.suggestions.slice(0, 3)) {
      this.logger.log(this.config.writerModel, 'writer', `Generating test: ${suggestion.name}`);

      const test = await this.generateSingleTest(suggestion, scanResult);
      if (test) {
        tests.push(test);

        // Guardar script
        if (this.config.saveResponses) {
          const scriptPath = join(this.config.outputDir, `${test.id}-script.js`);
          writeFileSync(scriptPath, test.script);
          this.logger.log(this.config.writerModel, 'writer', `Saved: ${scriptPath}`);
        }
      }
    }

    return tests;
  }

  /**
   * Genera un test individual
   */
  private async generateSingleTest(
    suggestion: TestSuggestion,
    scanResult: ScanResult
  ): Promise<GeneratedTest | null> {
    const systemPrompt = `You are a test script generator for auto-mat-ion framework.
Generate JavaScript tests compatible with TestRunner bridge.
Tests should:
1. Accept a config parameter from TestRunner.getConfig()
2. Use Web APIs for sensors (getUserMedia, DeviceMotion, etc.)
3. Return results array with success/error status
4. Be self-contained IIFEs`;

    const prompt = `Generate a test script for: ${suggestion.name}

Target API: ${suggestion.targetApi}
Description: ${suggestion.description}
Complexity: ${suggestion.complexity}

The test should work with this project structure:
- Pages: ${scanResult.structure.htmlPages.map(p => p.path).join(', ')}
- APIs in use: ${scanResult.sensorApis.map(a => a.api).join(', ')}

Output ONLY the JavaScript code, no explanations. Start with a comment header.`;

    try {
      const script = await queryOllama(this.config, this.config.writerModel, prompt, systemPrompt);

      // Limpiar respuesta (quitar markdown code blocks si hay)
      let cleanScript = script
        .replace(/```javascript\n?/g, '')
        .replace(/```js\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Verificar que parece JavaScript válido
      if (!cleanScript.includes('function') && !cleanScript.includes('=>')) {
        console.warn(`[Writer] Generated script may be invalid for ${suggestion.name}`);
      }

      return {
        id: suggestion.id,
        name: suggestion.name,
        description: suggestion.description,
        targetApi: suggestion.targetApi,
        script: cleanScript,
        priority: suggestion.priority,
      };

    } catch (error) {
      console.error(`[Writer] Failed to generate test ${suggestion.name}:`, error);
      return null;
    }
  }

  /**
   * Construye contexto de análisis
   */
  private buildAnalysisContext(scanResult: ScanResult): string {
    const lines: string[] = [
      `Project: ${scanResult.projectName}`,
      `Type: ${scanResult.projectType} (${scanResult.framework})`,
      `Start command: ${scanResult.startCommand}`,
      '',
      'HTML Pages:',
      ...scanResult.structure.htmlPages.map(p =>
        `  - ${p.path} [${p.type}] APIs: ${p.apis.join(', ') || 'none'}`
      ),
      '',
      'Sensor APIs detected:',
      ...scanResult.sensorApis.map(a =>
        `  - ${a.api} (${a.category}) in ${a.pages.length} file(s) - Tests: ${a.hasTests ? 'YES' : 'NO'}`
      ),
      '',
      'Existing tests:',
      ...(scanResult.coverage.existing.length > 0
        ? scanResult.coverage.existing.map(t => `  - ${t}`)
        : ['  (none)']),
      '',
      'Missing test coverage:',
      ...(scanResult.coverage.missing.length > 0
        ? scanResult.coverage.missing.map(m => `  - ${m}`)
        : ['  (all covered)']),
    ];

    return lines.join('\n');
  }

  /**
   * Get logs from this session
   */
  getLogs() {
    return this.logger.getLogs();
  }
}

// ============================================================================
// CLI Helper
// ============================================================================

export async function analyzeProject(
  scanResult: ScanResult,
  options: Partial<AnalyzerConfig> = {}
): Promise<AnalysisResult> {
  const analyzer = new CodeAnalyzer(options);
  return analyzer.analyze(scanResult);
}

// ============================================================================
// Quick analyze for demo
// ============================================================================

export async function analyzeDemo(options: Partial<AnalyzerConfig> = {}): Promise<AnalysisResult> {
  const { scanDemo } = await import('./project-scanner.js');
  const scanResult = await scanDemo();
  return analyzeProject(scanResult, options);
}
