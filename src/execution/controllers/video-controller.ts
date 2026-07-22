/**
 * auto-mat-ion Video Controller Implementation
 *
 * Concrete implementation of IVideoController that controls
 * camera and screen capture through browser automation.
 *
 * Uses IBrowserController.executeScript to inject JavaScript
 * that interacts with MediaDevices API.
 */

import type { IBrowserController, Platform, Browser, IBrowserLaunchOptions } from '../core/types.js';
import type {
  IVideoController,
  VideoConstraints,
  VideoCapabilities,
  VideoSettings,
  CameraDevice,
  MediaStreamLike,
  DisplayMediaOptionsLike,
} from './sensor-controllers.js';

/**
 * Browser-side script storage key
 */
const STORAGE_KEY = '__autoMationVideo__';

/**
 * Browser-side initialization script
 */
const INIT_SCRIPT = `
  if (!window.${STORAGE_KEY}) {
    window.${STORAGE_KEY} = {
      stream: null,
      screenStream: null,
      currentDeviceId: null,
      torchEnabled: false,
      zoomLevel: 1,
      videoTrack: null,
      capabilities: null,
      cameras: [],
      onCameraChangeCallbacks: [],
      onErrorCallbacks: [],
    };

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || 'Camera ' + d.deviceId.slice(0, 8),
        kind: 'videoinput',
        facingMode: d.label?.toLowerCase().includes('front') ? 'user' :
                    d.label?.toLowerCase().includes('back') ? 'environment' : undefined
      }));
      window.${STORAGE_KEY}.cameras = cameras;
      window.${STORAGE_KEY}.onCameraChangeCallbacks.forEach(cb => cb(cameras));
    });
  }
  true;
`;

/**
 * VideoController implementation
 */
export class VideoController implements IVideoController {
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
    // Ensure camera permission is granted
    const opts = {
      ...options,
      grantCameraPermission: true,
    };
    await this.baseController.launchBrowser(browser, opts);
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
    await this.stopVideoStream();
    await this.stopScreenCapture();
    return this.baseController.closeBrowser();
  }

  async cleanup(): Promise<void> {
    await this.stopVideoStream();
    await this.stopScreenCapture();
    return this.baseController.cleanup();
  }

  // ============================================================================
  // IVideoController - Device Management
  // ============================================================================

  async enumerateCameras(): Promise<CameraDevice[]> {
    const script = `
      (async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'videoinput').map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Camera ' + d.deviceId.slice(0, 8),
          kind: 'videoinput',
          facingMode: d.label?.toLowerCase().includes('front') ? 'user' :
                      d.label?.toLowerCase().includes('back') ? 'environment' : undefined
        }));
      })()
    `;
    return this.executeScript<CameraDevice[]>(script);
  }

  async selectCamera(deviceId: string): Promise<void> {
    const script = `
      window.${STORAGE_KEY}.currentDeviceId = '${deviceId}';
      true;
    `;
    await this.executeScript(script);
  }

  getCurrentCamera(): CameraDevice | null {
    // This is synchronous but we need async to get from browser
    // Return null, use async getSelectedCamera() pattern
    return null;
  }

  async getSelectedCamera(): Promise<CameraDevice | null> {
    const script = `
      (async () => {
        const deviceId = window.${STORAGE_KEY}.currentDeviceId;
        if (!deviceId) return null;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const device = devices.find(d => d.deviceId === deviceId && d.kind === 'videoinput');
        if (!device) return null;
        return {
          deviceId: device.deviceId,
          label: device.label || 'Camera',
          kind: 'videoinput'
        };
      })()
    `;
    return this.executeScript<CameraDevice | null>(script);
  }

  // ============================================================================
  // IVideoController - Stream Control
  // ============================================================================

  async startVideoStream(constraints?: VideoConstraints): Promise<MediaStreamLike> {
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
        const videoConstraints = {
          ...baseConstraints,
        };

        // Use selected device if set
        if (storage.currentDeviceId && !videoConstraints.deviceId) {
          videoConstraints.deviceId = { exact: storage.currentDeviceId };
        }

        // Get stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });

        storage.stream = stream;
        storage.videoTrack = stream.getVideoTracks()[0];

        // Get capabilities
        if (storage.videoTrack.getCapabilities) {
          storage.capabilities = storage.videoTrack.getCapabilities();
        }

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

  async stopVideoStream(): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (storage.stream) {
          storage.stream.getTracks().forEach(t => t.stop());
          storage.stream = null;
          storage.videoTrack = null;
        }
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  getVideoStream(): MediaStreamLike | null {
    // Synchronous accessor - return null, use async pattern
    return null;
  }

  // ============================================================================
  // IVideoController - Settings
  // ============================================================================

  getVideoSettings(): VideoSettings | null {
    return null;
  }

  async getVideoSettingsAsync(): Promise<VideoSettings | null> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) return null;

        const settings = storage.videoTrack.getSettings();
        return {
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          facingMode: settings.facingMode,
          deviceId: settings.deviceId,
          torch: settings.torch,
          focusMode: settings.focusMode,
          exposureMode: settings.exposureMode
        };
      })()
    `;
    return this.executeScript<VideoSettings | null>(script);
  }

  getVideoCapabilities(): VideoCapabilities | null {
    return null;
  }

  async getVideoCapabilitiesAsync(): Promise<VideoCapabilities | null> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) return null;

        const caps = storage.videoTrack.getCapabilities?.();
        if (!caps) return null;

        return {
          width: { min: caps.width?.min || 0, max: caps.width?.max || 0 },
          height: { min: caps.height?.min || 0, max: caps.height?.max || 0 },
          frameRate: { min: caps.frameRate?.min || 0, max: caps.frameRate?.max || 0 },
          facingModes: caps.facingMode || [],
          torch: !!caps.torch,
          focusModes: caps.focusMode || [],
          exposureModes: caps.exposureMode || [],
          whiteBalanceModes: caps.whiteBalanceMode || [],
          zoom: caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max } : null
        };
      })()
    `;
    return this.executeScript<VideoCapabilities | null>(script);
  }

  async applyVideoConstraints(constraints: VideoConstraints): Promise<void> {
    const constraintsJson = JSON.stringify(constraints);
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) {
          throw new Error('No active video track');
        }
        await storage.videoTrack.applyConstraints(${constraintsJson});
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  // ============================================================================
  // IVideoController - Controls
  // ============================================================================

  async setTorch(enabled: boolean): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) {
          throw new Error('No active video track');
        }

        const caps = storage.videoTrack.getCapabilities?.();
        if (!caps?.torch) {
          throw new Error('Torch not supported on this device');
        }

        await storage.videoTrack.applyConstraints({
          advanced: [{ torch: ${enabled} }]
        });

        storage.torchEnabled = ${enabled};
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  getTorchState(): boolean {
    return false; // Sync - use async pattern
  }

  async getTorchStateAsync(): Promise<boolean> {
    const script = `window.${STORAGE_KEY}.torchEnabled`;
    return this.executeScript<boolean>(script);
  }

  async setZoom(level: number): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) {
          throw new Error('No active video track');
        }

        const caps = storage.videoTrack.getCapabilities?.();
        if (!caps?.zoom) {
          throw new Error('Zoom not supported on this device');
        }

        const clampedLevel = Math.max(caps.zoom.min, Math.min(caps.zoom.max, ${level}));

        await storage.videoTrack.applyConstraints({
          advanced: [{ zoom: clampedLevel }]
        });

        storage.zoomLevel = clampedLevel;
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  getZoom(): number | null {
    return null;
  }

  async getZoomAsync(): Promise<number | null> {
    const script = `window.${STORAGE_KEY}.zoomLevel`;
    return this.executeScript<number>(script);
  }

  async setFocusMode(mode: string): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) {
          throw new Error('No active video track');
        }
        await storage.videoTrack.applyConstraints({
          advanced: [{ focusMode: '${mode}' }]
        });
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  async setExposureMode(mode: string): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.videoTrack) {
          throw new Error('No active video track');
        }
        await storage.videoTrack.applyConstraints({
          advanced: [{ exposureMode: '${mode}' }]
        });
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  // ============================================================================
  // IVideoController - Capture
  // ============================================================================

  async captureFrame(format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<string> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (!storage.stream) {
          throw new Error('No active video stream');
        }

        // Create video element
        const video = document.createElement('video');
        video.srcObject = storage.stream;
        video.autoplay = true;
        await new Promise(r => video.onloadedmetadata = r);
        await video.play();

        // Create canvas and capture
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Convert to data URL
        const mimeType = 'image/${format === 'jpeg' ? 'jpeg' : format}';
        return canvas.toDataURL(mimeType, 0.92);
      })()
    `;
    return this.executeScript<string>(script);
  }

  async captureFrameAsBlob(format: 'png' | 'jpeg' | 'webp' = 'png'): Promise<Blob> {
    // In browser context, we get base64 and convert
    const dataUrl = await this.captureFrame(format);
    const response = await fetch(dataUrl);
    return response.blob();
  }

  // ============================================================================
  // IVideoController - Screen Capture
  // ============================================================================

  async startScreenCapture(options?: DisplayMediaOptionsLike): Promise<MediaStreamLike> {
    const optionsJson = JSON.stringify(options || { video: true });
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};

        // Stop existing screen stream
        if (storage.screenStream) {
          storage.screenStream.getTracks().forEach(t => t.stop());
        }

        const stream = await navigator.mediaDevices.getDisplayMedia(${optionsJson});
        storage.screenStream = stream;

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

  async stopScreenCapture(): Promise<void> {
    const script = `
      (async () => {
        const storage = window.${STORAGE_KEY};
        if (storage.screenStream) {
          storage.screenStream.getTracks().forEach(t => t.stop());
          storage.screenStream = null;
        }
        return true;
      })()
    `;
    await this.executeScript(script);
  }

  // ============================================================================
  // IVideoController - Events
  // ============================================================================

  onCameraChange(callback: (cameras: CameraDevice[]) => void): void {
    // Note: This would require setting up a polling mechanism or WebSocket
    // For now, store callback reference for future implementation
    console.log('onCameraChange registered - polling not yet implemented');
  }

  onStreamError(callback: (error: Error) => void): void {
    console.log('onStreamError registered - event forwarding not yet implemented');
  }
}

/**
 * Factory function to create VideoController
 */
export function createVideoController(baseController: IBrowserController): IVideoController {
  return new VideoController(baseController);
}
