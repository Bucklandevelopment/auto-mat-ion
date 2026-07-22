/**
 * auto-mat-ion Audio Controller Implementation
 *
 * Concrete implementation of IAudioController that controls
 * microphone, speakers, and Web Audio API through browser automation.
 *
 * Uses IBrowserController.executeScript to inject JavaScript
 * that interacts with MediaDevices API and Web Audio API.
 */

import type { IBrowserController, Platform, Browser, IBrowserLaunchOptions } from '../core/types.js';
import type {
  IAudioController,
  AudioConstraints,
  AudioCapabilities,
  AudioDevice,
  AudioAnalysis,
  MediaStreamLike,
} from './sensor-controllers.js';

/**
 * Browser-side script storage key
 */
const STORAGE_KEY = '__autoMationAudio__';

/**
 * Browser-side initialization script
 */
const INIT_SCRIPT = `
  if (!window.${STORAGE_KEY}) {
    window.${STORAGE_KEY} = {
      stream: null,
      audioContext: null,
      analyser: null,
      sourceNode: null,
      mediaRecorder: null,
      recordedChunks: [],
      currentMicId: null,
      currentSpeakerId: null,
      analysisRunning: false,
      frequencyData: null,
      timeDomainData: null,
      oscillator: null,
      currentAudio: null,
      onDeviceChangeCallbacks: [],
      onVolumeChangeCallbacks: [],
      lastVolume: 0,
    };

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(d =>
        d.kind === 'audioinput' || d.kind === 'audiooutput'
      ).map(d => ({
        deviceId: d.deviceId,
        label: d.label || (d.kind === 'audioinput' ? 'Microphone' : 'Speaker') + ' ' + d.deviceId.slice(0, 8),
        kind: d.kind
      }));
      window.${STORAGE_KEY}.onDeviceChangeCallbacks.forEach(cb => cb(audioDevices));
    });
  }
  true;
`;

/**
 * AudioController implementation
 */
export class AudioController implements IAudioController {
  private baseController: IBrowserController;
  private initialized = false;

  constructor(controller: IBrowserController) {
    this.baseController = controller;
  }

  // ============================================================================
  // IBrowserController delegation
  // ============================================================================

  get platform(): Platform {
    return this.baseController.platform;
  }

  get supportedBrowsers(): Browser[] {
    return this.baseController.supportedBrowsers;
  }

  async initialize(): Promise<void> {
    await this.baseController.initialize();
    await this.baseController.executeScript(INIT_SCRIPT);
    this.initialized = true;
  }

  async isReady(): Promise<boolean> {
    return this.initialized && await this.baseController.isReady();
  }

  async launchBrowser(browser: Browser, options?: IBrowserLaunchOptions): Promise<void> {
    await this.baseController.launchBrowser(browser, options);
    await this.baseController.executeScript(INIT_SCRIPT);
  }

  async navigateTo(url: string): Promise<void> {
    await this.baseController.navigateTo(url);
    await this.baseController.executeScript(INIT_SCRIPT);
  }

  async executeScript<T>(script: string, timeout?: number): Promise<T> {
    return this.baseController.executeScript<T>(script, timeout);
  }

  async waitForElement(selector: string, timeout?: number): Promise<boolean> {
    return this.baseController.waitForElement(selector, timeout);
  }

  async clickElement(selector: string): Promise<void> {
    return this.baseController.clickElement(selector);
  }

  async getConsoleLogs(): Promise<string[]> {
    return this.baseController.getConsoleLogs();
  }

  async takeScreenshot(path: string): Promise<void> {
    return this.baseController.takeScreenshot(path);
  }

  async closeBrowser(): Promise<void> {
    await this.stopAudioStream();
    await this.stopPlayback();
    return this.baseController.closeBrowser();
  }

  async cleanup(): Promise<void> {
    await this.stopAudioStream();
    await this.stopPlayback();
    return this.baseController.cleanup();
  }

  // ============================================================================
  // IAudioController - Device Management
  // ============================================================================

  async enumerateMicrophones(): Promise<AudioDevice[]> {
    const script = `
      (async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audioinput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Microphone ' + d.deviceId.slice(0, 8),
          kind: 'audioinput'
        }));
      })()
    `;
    return this.executeScript<AudioDevice[]>(script);
  }

  async enumerateSpeakers(): Promise<AudioDevice[]> {
    const script = `
      (async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audiooutput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Speaker ' + d.deviceId.slice(0, 8),
          kind: 'audiooutput'
        }));
      })()
    `;
    return this.executeScript<AudioDevice[]>(script);
  }

  async selectMicrophone(deviceId: string): Promise<void> {
    const script = `
      window.${STORAGE_KEY}.currentMicId = '${deviceId}';
      true;
    `;
    await this.executeScript(script);
  }

  async selectSpeaker(deviceId: string): Promise<void> {
    const script = `
      window.${STORAGE_KEY}.currentSpeakerId = '${deviceId}';
      true;
    `;
    await this.executeScript(script);
  }

  // ============================================================================
  // IAudioController - Stream Control
  // ============================================================================

  async startAudioStream(constraints?: AudioConstraints): Promise<MediaStreamLike> {
    const constraintsJson = JSON.stringify(constraints || {});
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        // Stop existing stream
        if (storage.stream) {
          storage.stream.getTracks().forEach(t => t.stop());
        }

        // Build constraints
        const baseConstraints = ${constraintsJson};
        const audioConstraints = {
          ...baseConstraints,
        };

        // Use selected device if set
        if (storage.currentMicId && !audioConstraints.deviceId) {
          audioConstraints.deviceId = { exact: storage.currentMicId };
        }

        // Get stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioConstraints
        });

        storage.stream = stream;

        // Setup Web Audio for analysis
        storage.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        storage.sourceNode = storage.audioContext.createMediaStreamSource(stream);

        return {
          id: stream.id,
          active: stream.active,
          tracks: stream.getTracks().length
        };
      })()
    `;
    const result = await this.executeScript<{ id: string; active: boolean; tracks: number }>(script);
    return {
      id: result.id,
      active: result.active,
      getTracks: () => [],
      getVideoTracks: () => [],
      getAudioTracks: () => [],
    };
  }

  async stopAudioStream(): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        if (storage.analyser) {
          storage.analyser.disconnect();
          storage.analyser = null;
        }

        if (storage.sourceNode) {
          storage.sourceNode.disconnect();
          storage.sourceNode = null;
        }

        if (storage.audioContext) {
          await storage.audioContext.close();
          storage.audioContext = null;
        }

        if (storage.stream) {
          storage.stream.getTracks().forEach(t => t.stop());
          storage.stream = null;
        }

        storage.analysisRunning = false;
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  getAudioStream(): MediaStreamLike | null {
    return null; // Sync - use async pattern
  }

  // ============================================================================
  // IAudioController - Analysis
  // ============================================================================

  getAudioAnalysis(): AudioAnalysis | null {
    return null; // Sync - use async pattern
  }

  async getAudioAnalysisAsync(): Promise<AudioAnalysis | null> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.analyser || !storage.analysisRunning) return null;

        const bufferLength = storage.analyser.frequencyBinCount;
        const frequencyData = new Float32Array(bufferLength);
        const timeDomainData = new Float32Array(bufferLength);

        storage.analyser.getFloatFrequencyData(frequencyData);
        storage.analyser.getFloatTimeDomainData(timeDomainData);

        // Calculate RMS volume
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
          const val = Math.abs(timeDomainData[i]);
          sumSquares += val * val;
          if (val > peak) peak = val;
        }
        const rms = Math.sqrt(sumSquares / timeDomainData.length);

        // Convert to dB
        const rmsDb = 20 * Math.log10(rms + 0.0001);
        const peakDb = 20 * Math.log10(peak + 0.0001);

        return {
          volume: rms,
          peakLevel: peakDb,
          rmsLevel: rmsDb,
          // Note: Can't transfer Float32Array directly, would need serialization
          frequencyData: Array.from(frequencyData),
          timeDomainData: Array.from(timeDomainData)
        };
      })()
    `;
    return this.executeScript<AudioAnalysis | null>(script);
  }

  startAnalysis(fftSize: number = 2048): void {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.audioContext || !storage.sourceNode) {
          throw new Error('No active audio stream');
        }

        // Create analyser if not exists
        if (!storage.analyser) {
          storage.analyser = storage.audioContext.createAnalyser();
          storage.analyser.fftSize = ${fftSize};
          storage.sourceNode.connect(storage.analyser);
        }

        storage.analysisRunning = true;
        return true;
      })()
    `;
    this.executeScript(script);
  }

  stopAnalysis(): void {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        storage.analysisRunning = false;
        if (storage.analyser) {
          storage.analyser.disconnect();
          storage.analyser = null;
        }
        return true;
      })()
    `;
    this.executeScript(script);
  }

  // ============================================================================
  // IAudioController - Recording
  // ============================================================================

  async startRecording(mimeType: string = 'audio/webm'): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.stream) {
          throw new Error('No active audio stream');
        }

        storage.recordedChunks = [];

        const options = { mimeType: '${mimeType}' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'audio/webm';
        }

        storage.mediaRecorder = new MediaRecorder(storage.stream, options);

        storage.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            storage.recordedChunks.push(e.data);
          }
        };

        storage.mediaRecorder.start(100); // 100ms chunks
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  async stopRecording(): Promise<Blob> {
    const script = `
      new Promise((resolve, reject) => {
        const storage = window.${STORAGE_KEY};
        if (!storage.mediaRecorder) {
          reject(new Error('No active recording'));
          return;
        }

        storage.mediaRecorder.onstop = () => {
          const blob = new Blob(storage.recordedChunks, {
            type: storage.mediaRecorder.mimeType
          });

          // Convert to base64 for transfer
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              dataUrl: reader.result,
              mimeType: storage.mediaRecorder.mimeType,
              size: blob.size
            });
          };
          reader.readAsDataURL(blob);

          storage.mediaRecorder = null;
          storage.recordedChunks = [];
        };

        storage.mediaRecorder.stop();
      })
    `;
    const result = await this.executeScript<{ dataUrl: string; mimeType: string; size: number }>(script);
    const response = await fetch(result.dataUrl);
    return response.blob();
  }

  isRecording(): boolean {
    return false; // Sync - use async
  }

  async isRecordingAsync(): Promise<boolean> {
    const script = `
      window.${STORAGE_KEY}.mediaRecorder?.state === 'recording'
    `;
    return this.executeScript<boolean>(script);
  }

  // ============================================================================
  // IAudioController - Playback
  // ============================================================================

  async playTone(frequency: number, duration: number, volume: number = 0.5): Promise<void> {
    const script = `
      new Promise((resolve, reject) => {
        const storage = window.${STORAGE_KEY};

        // Create or resume audio context
        const ctx = storage.audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        // Create oscillator
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(${frequency}, ctx.currentTime);
        gainNode.gain.setValueAtTime(${volume}, ctx.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Handle speaker selection
        if (storage.currentSpeakerId && ctx.setSinkId) {
          ctx.setSinkId(storage.currentSpeakerId);
        }

        oscillator.start();
        storage.oscillator = oscillator;

        setTimeout(() => {
          oscillator.stop();
          storage.oscillator = null;
          resolve(true);
        }, ${duration});
      })
    `;
    await this.executeScript(script);
  }

  async playAudio(url: string): Promise<void> {
    const script = `
      new Promise((resolve, reject) => {
        const storage = window.${STORAGE_KEY};

        // Stop current audio if playing
        if (storage.currentAudio) {
          storage.currentAudio.pause();
          storage.currentAudio = null;
        }

        const audio = new Audio('${url}');

        // Handle speaker selection
        if (storage.currentSpeakerId && audio.setSinkId) {
          audio.setSinkId(storage.currentSpeakerId);
        }

        audio.onended = () => {
          storage.currentAudio = null;
          resolve(true);
        };

        audio.onerror = (e) => {
          storage.currentAudio = null;
          reject(new Error('Audio playback error'));
        };

        storage.currentAudio = audio;
        audio.play().catch(reject);
      })
    `;
    await this.executeScript(script);
  }

  stopPlayback(): void {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        if (storage.oscillator) {
          storage.oscillator.stop();
          storage.oscillator = null;
        }

        if (storage.currentAudio) {
          storage.currentAudio.pause();
          storage.currentAudio = null;
        }

        return true;
      })()
    `;
    this.executeScript(script);
  }

  // ============================================================================
  // IAudioController - Latency
  // ============================================================================

  async measureLatency(): Promise<number> {
    const script = `
      new Promise((resolve) => {
        const storage = window.${STORAGE_KEY};

        if (!storage.audioContext) {
          resolve(-1);
          return;
        }

        // Base latency is available in newer browsers
        let latency = storage.audioContext.baseLatency || 0;

        // Add output latency if available
        if (storage.audioContext.outputLatency) {
          latency += storage.audioContext.outputLatency;
        }

        // Convert to milliseconds
        resolve(Math.round(latency * 1000));
      })
    `;
    return this.executeScript<number>(script);
  }

  // ============================================================================
  // IAudioController - Events
  // ============================================================================

  onDeviceChange(callback: (devices: AudioDevice[]) => void): void {
    console.log('onDeviceChange registered - polling not yet implemented');
  }

  onVolumeChange(callback: (volume: number) => void): void {
    console.log('onVolumeChange registered - polling not yet implemented');
  }
}

/**
 * Factory function to create AudioController
 */
export function createAudioController(baseController: IBrowserController): IAudioController {
  return new AudioController(baseController);
}
