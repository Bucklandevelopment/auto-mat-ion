/**
 * Results Client - Upload test results to auto-mat-ion server
 *
 * Usage:
 *   <script src="/lib/results-client.js"></script>
 *
 *   // Upload an image
 *   await ResultsClient.uploadImage(blob, 'camera-test');
 *
 *   // Upload a video
 *   await ResultsClient.uploadVideo(blob, 'video-recording');
 *
 *   // Upload JSON data
 *   await ResultsClient.uploadJSON({ data: 'test' }, 'sensor-readings');
 */

console.log('[ResultsClient] 🟢 Script starting execution...');

(function(global) {
  'use strict';

  const DEFAULT_SERVER = `${window.location.protocol}//${window.location.host}`;

  // Device identification
  function getDeviceId() {
    // Try to get from localStorage or generate
    let deviceId = localStorage.getItem('ami-device-id');
    if (!deviceId) {
      deviceId = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem('ami-device-id', deviceId);
    }
    return deviceId;
  }

  function getDeviceName() {
    const ua = navigator.userAgent;
    if (ua.includes('Android')) {
      const match = ua.match(/Android.*?;\s*([^;)]+)/);
      return match ? match[1].trim() : 'Android Device';
    }
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }

  const ResultsClient = {
    serverUrl: DEFAULT_SERVER,
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),

    /**
     * Configure the client
     */
    configure(options) {
      if (options.serverUrl) this.serverUrl = options.serverUrl;
      if (options.deviceId) this.deviceId = options.deviceId;
      if (options.deviceName) this.deviceName = options.deviceName;
    },

    /**
     * Upload a blob to the server
     */
    async upload(blob, testName, contentType) {
      const url = `${this.serverUrl}/api/results/upload`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': contentType || blob.type || 'application/octet-stream',
            'X-Device-Id': this.deviceId,
            'X-Device-Name': this.deviceName,
            'X-Test-Name': testName || 'unnamed-test',
          },
          body: blob,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`[ResultsClient] Uploaded: ${testName}`, result);
        return result;
      } catch (error) {
        console.error('[ResultsClient] Upload error:', error);
        throw error;
      }
    },

    /**
     * Upload an image (from canvas, blob, or data URL)
     */
    async uploadImage(source, testName) {
      let blob;

      if (source instanceof Blob) {
        blob = source;
      } else if (source instanceof HTMLCanvasElement) {
        blob = await new Promise(resolve => source.toBlob(resolve, 'image/png'));
      } else if (typeof source === 'string' && source.startsWith('data:')) {
        // Data URL
        const response = await fetch(source);
        blob = await response.blob();
      } else {
        throw new Error('Invalid image source');
      }

      return this.upload(blob, testName, 'image/png');
    },

    /**
     * Upload a video blob
     */
    async uploadVideo(blob, testName) {
      const contentType = blob.type || 'video/webm';
      return this.upload(blob, testName, contentType);
    },

    /**
     * Upload JSON data
     */
    async uploadJSON(data, testName) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      return this.upload(blob, testName, 'application/json');
    },

    /**
     * Upload a log/text
     */
    async uploadLog(text, testName) {
      const blob = new Blob([text], { type: 'text/plain' });
      return this.upload(blob, testName, 'text/plain');
    },

    /**
     * Get all results from server
     */
    async getResults() {
      const url = `${this.serverUrl}/api/results`;
      const response = await fetch(url);
      return response.json();
    },

    /**
     * Get results for this device
     */
    async getDeviceResults() {
      const url = `${this.serverUrl}/api/results/device/${encodeURIComponent(this.deviceId)}`;
      const response = await fetch(url);
      return response.json();
    },

    /**
     * Get latest results
     */
    async getLatestResults() {
      const url = `${this.serverUrl}/api/results/latest`;
      const response = await fetch(url);
      return response.json();
    },

    /**
     * Helper: Capture frame from video element and upload
     */
    async captureAndUpload(videoElement, testName) {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0);

      return this.uploadImage(canvas, testName);
    },

    /**
     * Helper: Record video from stream and upload
     */
    async recordAndUpload(stream, durationMs, testName) {
      return new Promise((resolve, reject) => {
        const chunks = [];
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm',
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const result = await this.uploadVideo(blob, testName);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };

        recorder.onerror = reject;

        recorder.start();
        setTimeout(() => recorder.stop(), durationMs);
      });
    },
  };

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultsClient;
  } else {
    global.ResultsClient = ResultsClient;
  }

})(typeof window !== 'undefined' ? window : this);
