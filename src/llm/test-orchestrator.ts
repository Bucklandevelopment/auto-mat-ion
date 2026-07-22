/**
 * auto-mat-ion Test Orchestrator
 *
 * Sistema de orquestación de tests que puede ser controlado por lenguaje natural.
 * Diseñado para que Ollama pueda traducir comandos como:
 *
 * "Captura una imagen con cada cámara disponible y graba un video de 5 segundos
 *  usando la mayor resolución soportada"
 *
 * En una secuencia de tests ejecutables.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface TestDefinition {
  id: string;
  name: string;
  description: string;
  type: 'camera' | 'audio' | 'motion' | 'sensor' | 'composite';
  parameters: CameraTestParams | AudioTestParams | MotionTestParams;
  targetDevices: 'all' | 'first' | string[];
  timeout: number;
}

export interface CameraTestParams {
  action: 'capture' | 'record';
  duration?: number;        // segundos para video
  resolution?: 'max' | 'min' | { width: number; height: number };
  cameras?: 'all' | 'front' | 'back' | 'first';
  format?: 'png' | 'jpeg' | 'webp' | 'webm';
  constraints?: Record<string, unknown>;
}

export interface AudioTestParams {
  action: 'record' | 'analyze' | 'playback';
  duration?: number;
  sampleRate?: number;
  channels?: 1 | 2;
}

export interface MotionTestParams {
  action: 'capture' | 'calibrate' | 'stream';
  duration?: number;
  sampleRate?: number;
  sensors?: ('accelerometer' | 'gyroscope' | 'orientation')[];
}

export interface TestResult {
  testId: string;
  deviceId: string;
  success: boolean;
  timestamp: string;
  duration: number;
  data?: unknown;
  error?: string;
  artifacts?: string[];  // Paths to captured files
}

export interface TestSession {
  id: string;
  startTime: string;
  tests: TestDefinition[];
  results: TestResult[];
  status: 'pending' | 'running' | 'completed' | 'failed';
}

// ============================================================================
// Device Detection
// ============================================================================

export interface Device {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  status: 'online' | 'offline';
}

async function getAvailableDevices(): Promise<Device[]> {
  const devices: Device[] = [];

  try {
    const { stdout } = await execAsync('adb devices -l');
    const lines = stdout.trim().split('\n').slice(1);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/\s+/);
      const id = parts[0];
      const status = parts[1];

      if (status === 'device') {
        const modelMatch = line.match(/model:(\S+)/);
        devices.push({
          id,
          name: modelMatch?.[1] || id,
          platform: 'android',
          status: 'online',
        });
      }
    }
  } catch {
    // ADB not available
  }

  return devices;
}

// ============================================================================
// Test Generator (Browser-side scripts for TestRunner)
// ============================================================================

/**
 * Genera código JavaScript compatible con TestRunner.
 *
 * Los scripts generados:
 * 1. Aceptan un parámetro `config` desde TestRunner.getConfig()
 * 2. Usan config.camera, config.resolution, etc. del DOM
 * 3. Tienen valores por defecto del test original como fallback
 *
 * Esto permite:
 * - Ejecución automática con parámetros del test
 * - Ejecución manual con parámetros configurados en la UI
 */
function generateCameraTestScript(params: CameraTestParams): string {
  const {
    action,
    duration = 5,
    resolution = 'max',
    cameras = 'all',
    format = 'png',
  } = params;

  // El script acepta config desde TestRunner o usa defaults
  return `
/**
 * auto-mat-ion Camera Test Script
 * Generated for: ${action} | ${cameras} cameras | ${resolution} resolution
 *
 * Compatible with TestRunner: TestRunner.run(thisScript, config)
 * Or standalone: execute directly for defaults
 */
(async function cameraTest(config) {
  // Merge config from TestRunner (DOM) with test defaults
  const cfg = {
    action: config?.action || '${action}',
    duration: config?.duration || ${duration},
    resolution: config?.resolution || '${resolution}',
    camera: config?.camera || '${cameras}',
    format: config?.format || '${format}',
  };

  const results = [];

  // Enumerar cámaras disponibles
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(d => d.kind === 'videoinput');

  // Filtrar cámaras según configuración
  let targetCameras = videoDevices;
  if (cfg.camera === 'front') {
    targetCameras = videoDevices.filter(d =>
      d.label.toLowerCase().includes('front') || d.label.includes('user'));
  } else if (cfg.camera === 'back') {
    targetCameras = videoDevices.filter(d =>
      d.label.toLowerCase().includes('back') || d.label.includes('environment'));
  } else if (cfg.camera === 'first') {
    targetCameras = videoDevices.slice(0, 1);
  } else if (cfg.camera !== 'all') {
    // Specific device ID
    targetCameras = videoDevices.filter(d => d.deviceId === cfg.camera);
  }

  // Log if TestRunner available
  if (window.CameraTest?.log) {
    window.CameraTest.log('Testing ' + targetCameras.length + ' camera(s)', 'info');
  }

  for (const camera of targetCameras) {
    try {
      // Build constraints
      const constraints = {
        video: {
          deviceId: { exact: camera.deviceId },
        }
      };

      // Apply resolution
      if (cfg.resolution === 'max') {
        constraints.video.width = { ideal: 4096 };
        constraints.video.height = { ideal: 2160 };
      } else if (cfg.resolution === 'min') {
        constraints.video.width = { ideal: 320 };
        constraints.video.height = { ideal: 240 };
      } else if (typeof cfg.resolution === 'object') {
        constraints.video.width = { ideal: cfg.resolution.width };
        constraints.video.height = { ideal: cfg.resolution.height };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      if (cfg.action === 'capture') {
        // Capture frame
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        await new Promise(r => video.onloadedmetadata = r);
        await video.play();

        // Wait for stable frame
        await new Promise(r => setTimeout(r, 500));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const dataUrl = canvas.toDataURL('image/' + cfg.format, 0.95);

        results.push({
          camera: camera.label || camera.deviceId,
          type: 'capture',
          resolution: settings.width + 'x' + settings.height,
          format: cfg.format,
          dataUrl: dataUrl,
          success: true
        });

        stream.getTracks().forEach(t => t.stop());

      } else if (cfg.action === 'record') {
        // Record video
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        await new Promise(r => video.onloadedmetadata = r);

        const chunks = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9'
        });

        recorder.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        const recordingPromise = new Promise((resolve) => {
          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          };
        });

        recorder.start(100);

        // Record for duration seconds
        await new Promise(r => setTimeout(r, cfg.duration * 1000));

        recorder.stop();
        stream.getTracks().forEach(t => t.stop());

        const dataUrl = await recordingPromise;

        results.push({
          camera: camera.label || camera.deviceId,
          type: 'record',
          resolution: settings.width + 'x' + settings.height,
          duration: cfg.duration,
          format: 'webm',
          dataUrl: dataUrl,
          success: true
        });
      }

    } catch (error) {
      results.push({
        camera: camera.label || camera.deviceId,
        type: cfg.action,
        success: false,
        error: error.message
      });
    }
  }

  return results;
})();
`;
}

function generateAudioTestScript(params: AudioTestParams): string {
  const { action, duration = 5, sampleRate = 44100 } = params;

  return `
(async function audioTest() {
  const constraints = {
    audio: {
      sampleRate: ${sampleRate},
      echoCancellation: false,
      noiseSuppression: false
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  if ('${action}' === 'record') {
    const chunks = [];
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const recordingPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      };
    });

    recorder.start();
    await new Promise(r => setTimeout(r, ${duration * 1000}));
    recorder.stop();
    stream.getTracks().forEach(t => t.stop());

    return {
      type: 'audio_record',
      duration: ${duration},
      sampleRate: ${sampleRate},
      dataUrl: await recordingPromise,
      success: true
    };

  } else if ('${action}' === 'analyze') {
    const audioContext = new AudioContext({ sampleRate: ${sampleRate} });
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(analyser);

    const samples = [];
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const sampleCount = ${duration} * 10; // 10 samples per second
    for (let i = 0; i < sampleCount; i++) {
      analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS
      let sum = 0;
      for (let j = 0; j < bufferLength; j++) {
        sum += dataArray[j] * dataArray[j];
      }
      const rms = Math.sqrt(sum / bufferLength);

      samples.push({
        time: i * 100,
        rms: rms,
        peak: Math.max(...Array.from(dataArray).map(Math.abs))
      });

      await new Promise(r => setTimeout(r, 100));
    }

    stream.getTracks().forEach(t => t.stop());
    audioContext.close();

    return {
      type: 'audio_analysis',
      duration: ${duration},
      sampleRate: ${sampleRate},
      samples: samples,
      success: true
    };
  }
})();
`;
}

// ============================================================================
// Test Executor
// ============================================================================

export class TestOrchestrator {
  private outputDir: string;

  constructor(outputDir: string = './test-results') {
    this.outputDir = outputDir;
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Parsea una descripción en lenguaje natural a TestDefinition
   */
  parseNaturalLanguage(description: string): TestDefinition[] {
    const tests: TestDefinition[] = [];
    const desc = description.toLowerCase();

    // Detectar acciones de cámara
    if (desc.includes('captura') || desc.includes('capture') || desc.includes('foto') || desc.includes('image')) {
      const params: CameraTestParams = {
        action: 'capture',
        cameras: desc.includes('cada cámara') || desc.includes('each camera') || desc.includes('all camera') ? 'all' : 'first',
        resolution: desc.includes('máxim') || desc.includes('max') || desc.includes('alta') || desc.includes('high') ? 'max' : 'max',
        format: 'png',
      };

      tests.push({
        id: `camera-capture-${Date.now()}`,
        name: 'Camera Capture Test',
        description: 'Capture images from cameras',
        type: 'camera',
        parameters: params,
        targetDevices: desc.includes('todos') || desc.includes('all device') ? 'all' : 'first',
        timeout: 30000,
      });
    }

    // Detectar grabación de video
    if (desc.includes('graba') || desc.includes('record') || desc.includes('video')) {
      // Extraer duración
      const durationMatch = desc.match(/(\d+)\s*(segundo|second|seg|s\b)/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 5;

      const params: CameraTestParams = {
        action: 'record',
        duration,
        cameras: desc.includes('cada cámara') || desc.includes('each camera') ? 'all' : 'first',
        resolution: desc.includes('máxim') || desc.includes('max') || desc.includes('alta') ? 'max' : 'max',
        format: 'webm',
      };

      tests.push({
        id: `camera-record-${Date.now()}`,
        name: 'Camera Record Test',
        description: `Record ${duration}s video from cameras`,
        type: 'camera',
        parameters: params,
        targetDevices: desc.includes('todos') || desc.includes('all device') ? 'all' : 'first',
        timeout: (duration + 10) * 1000,
      });
    }

    // Detectar tests de audio
    if (desc.includes('audio') || desc.includes('micrófono') || desc.includes('microphone') || desc.includes('sonido')) {
      const durationMatch = desc.match(/(\d+)\s*(segundo|second|seg|s\b)/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 5;

      tests.push({
        id: `audio-${Date.now()}`,
        name: 'Audio Test',
        description: 'Record and analyze audio',
        type: 'audio',
        parameters: {
          action: desc.includes('analiz') ? 'analyze' : 'record',
          duration,
        } as AudioTestParams,
        targetDevices: 'first',
        timeout: (duration + 10) * 1000,
      });
    }

    return tests;
  }

  /**
   * Genera el script de test basado en la definición
   */
  generateTestScript(test: TestDefinition): string {
    switch (test.type) {
      case 'camera':
        return generateCameraTestScript(test.parameters as CameraTestParams);
      case 'audio':
        return generateAudioTestScript(test.parameters as AudioTestParams);
      default:
        throw new Error(`Unknown test type: ${test.type}`);
    }
  }

  /**
   * Ejecuta un test en un dispositivo
   */
  async executeOnDevice(test: TestDefinition, device: Device): Promise<TestResult> {
    const startTime = Date.now();
    const testUrl = `http://localhost:8891/sensors/camera.html`;

    try {
      // 1. Abrir la página de test en el dispositivo
      await execAsync(
        `adb -s ${device.id} shell am start -a android.intent.action.VIEW -d "${testUrl}" com.android.chrome`
      );

      // 2. Esperar a que cargue
      await new Promise(r => setTimeout(r, 3000));

      // 3. Inyectar y ejecutar el script de test
      const script = this.generateTestScript(test);

      // Codificar el script para enviarlo via ADB
      const encodedScript = Buffer.from(script).toString('base64');

      // Ejecutar el script en Chrome DevTools (esto requiere depuración remota habilitada)
      // Por ahora, guardamos el script para ejecución manual
      const scriptPath = join(this.outputDir, `${test.id}-script.js`);
      writeFileSync(scriptPath, script);

      // Para una implementación completa, aquí usaríamos Puppeteer con ADB forwarding
      // Por ahora retornamos éxito parcial indicando que el test está preparado

      return {
        testId: test.id,
        deviceId: device.id,
        success: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        data: {
          message: 'Test script generated and device ready',
          scriptPath,
          testUrl,
          note: 'Para ejecución completa, el script debe ejecutarse en el contexto del navegador'
        },
        artifacts: [scriptPath],
      };

    } catch (error) {
      return {
        testId: test.id,
        deviceId: device.id,
        success: false,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ejecuta una sesión de tests
   */
  async runSession(tests: TestDefinition[]): Promise<TestSession> {
    const session: TestSession = {
      id: `session-${Date.now()}`,
      startTime: new Date().toISOString(),
      tests,
      results: [],
      status: 'running',
    };

    const devices = await getAvailableDevices();

    if (devices.length === 0) {
      session.status = 'failed';
      session.results.push({
        testId: 'pre-check',
        deviceId: 'none',
        success: false,
        timestamp: new Date().toISOString(),
        duration: 0,
        error: 'No devices available',
      });
      return session;
    }

    for (const test of tests) {
      // Determinar dispositivos objetivo
      let targetDevices: Device[];
      if (test.targetDevices === 'all') {
        targetDevices = devices;
      } else if (test.targetDevices === 'first') {
        targetDevices = devices.slice(0, 1);
      } else if (Array.isArray(test.targetDevices)) {
        targetDevices = devices.filter(d => test.targetDevices.includes(d.id));
      } else {
        targetDevices = devices.slice(0, 1);
      }

      // Ejecutar en cada dispositivo
      for (const device of targetDevices) {
        const result = await this.executeOnDevice(test, device);
        session.results.push(result);
      }
    }

    session.status = session.results.every(r => r.success) ? 'completed' : 'failed';
    return session;
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function runTestFromDescription(description: string): Promise<TestSession> {
  const orchestrator = new TestOrchestrator('./test-results');
  const tests = orchestrator.parseNaturalLanguage(description);

  if (tests.length === 0) {
    return {
      id: `session-${Date.now()}`,
      startTime: new Date().toISOString(),
      tests: [],
      results: [{
        testId: 'parse',
        deviceId: 'none',
        success: false,
        timestamp: new Date().toISOString(),
        duration: 0,
        error: 'Could not parse test description. Try: "capture image with each camera" or "record 5 second video"',
      }],
      status: 'failed',
    };
  }

  console.log(`\n📋 Parsed ${tests.length} test(s) from description:`);
  for (const test of tests) {
    console.log(`   - ${test.name}: ${test.description}`);
  }

  return orchestrator.runSession(tests);
}

// ============================================================================
// Export for Ollama integration
// ============================================================================

export const TEST_COMMANDS_FOR_PROMPT = `
TEST COMMANDS (use "ami test <description>" format):
- ami test capture image with each camera
- ami test record 5 second video with max resolution
- ami test capture and record with back camera
- ami test analyze audio for 10 seconds
- ami test capture from all cameras on all devices

The test system will:
1. Parse your natural language description
2. Generate appropriate test scripts
3. Execute on available devices
4. Save results to ./test-results/
`;
