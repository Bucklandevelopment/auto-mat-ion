/**
 * auto-mat-ion TestRunner Bridge
 *
 * Connects UI elements with test scripts.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  UI (camera.html)                                           │
 * │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
 * │  │ #ami-camera  │ │ #ami-resolution │ │ #ami-duration │     │
 * │  │   <select>   │ │    <select>     │ │   <input>     │     │
 * │  └──────────────┘ └──────────────┘ └──────────────┘        │
 * │           │              │                │                 │
 * │           └──────────────┼────────────────┘                 │
 * │                          ▼                                  │
 * │              ┌────────────────────┐                         │
 * │              │    TestRunner      │                         │
 * │              │  .getConfig()      │                         │
 * │              │  .execute(script)  │                         │
 * │              │  .onResult(cb)     │                         │
 * │              └────────────────────┘                         │
 * │                          │                                  │
 * │                          ▼                                  │
 * │              ┌────────────────────┐                         │
 * │              │   Test Script      │                         │
 * │              │ (from test-results)│                         │
 * │              └────────────────────┘                         │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Standard DOM IDs (prefix: ami-):
 * - ami-camera-select   : Camera device selector
 * - ami-resolution      : Resolution selector (max/min/custom)
 * - ami-duration        : Duration input (seconds)
 * - ami-format          : Output format (png/jpeg/webm)
 * - ami-capture-btn     : Manual capture trigger
 * - ami-record-btn      : Manual record trigger
 * - ami-run-test-btn    : Execute loaded test
 * - ami-test-output     : Results display area
 * - ami-preview         : Live preview element
 */

console.log('[TestRunner] 🟢 Script starting execution...');
console.log('[TestRunner] URL:', window.location.href);
console.log('[TestRunner] Search:', window.location.search);

(function(global) {
  'use strict';

  console.log('[TestRunner] 🔵 IIFE starting...');

  // ============================================================================
  // Configuration Schema
  // ============================================================================

  const CONFIG_SCHEMA = {
    camera: {
      selector: '#ami-camera-select',
      default: 'all',
      parse: (el) => el?.value || 'all'
    },
    resolution: {
      selector: '#ami-resolution',
      default: 'max',
      parse: (el) => {
        if (!el) return 'max';
        const val = el.value;
        if (val === 'custom') {
          const w = document.querySelector('#ami-width')?.value;
          const h = document.querySelector('#ami-height')?.value;
          return { width: parseInt(w) || 1920, height: parseInt(h) || 1080 };
        }
        return val;
      }
    },
    duration: {
      selector: '#ami-duration',
      default: 5,
      parse: (el) => parseInt(el?.value) || 5
    },
    format: {
      selector: '#ami-format',
      default: 'png',
      parse: (el) => el?.value || 'png'
    },
    action: {
      selector: '#ami-action',
      default: 'capture',
      parse: (el) => el?.value || 'capture'
    }
  };

  // ============================================================================
  // TestRunner Class
  // ============================================================================

  class TestRunner {
    constructor() {
      this.currentTest = null;
      this.results = [];
      this.listeners = {
        result: [],
        progress: [],
        error: [],
        upload: []
      };
      this.isRunning = false;
      this.autoUpload = true;  // Auto-upload results to server
      this.testName = 'manual-test';
    }

    /**
     * Configure auto-upload behavior
     */
    setAutoUpload(enabled, testName) {
      this.autoUpload = enabled;
      if (testName) this.testName = testName;
      return this;
    }

    /**
     * Read configuration from DOM elements
     */
    getConfig() {
      const config = {};

      for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
        const element = document.querySelector(schema.selector);
        config[key] = schema.parse(element);
      }

      // Add metadata
      config._timestamp = new Date().toISOString();
      config._source = 'dom';

      return config;
    }

    /**
     * Set configuration to DOM elements
     */
    setConfig(config) {
      for (const [key, value] of Object.entries(config)) {
        if (key.startsWith('_')) continue;

        const schema = CONFIG_SCHEMA[key];
        if (!schema) continue;

        const element = document.querySelector(schema.selector);
        if (element) {
          if (typeof value === 'object') {
            // Handle custom resolution
            element.value = 'custom';
            if (value.width) {
              const wEl = document.querySelector('#ami-width');
              if (wEl) wEl.value = value.width;
            }
            if (value.height) {
              const hEl = document.querySelector('#ami-height');
              if (hEl) hEl.value = value.height;
            }
          } else {
            element.value = value;
          }
          // Trigger change event
          element.dispatchEvent(new Event('change'));
        }
      }
    }

    /**
     * Load a test script from URL or inline
     */
    async loadTest(source) {
      if (typeof source === 'string') {
        if (source.startsWith('http') || source.startsWith('/')) {
          // Load from URL
          const response = await fetch(source);
          const scriptText = await response.text();
          this.currentTest = this._parseScript(scriptText);
        } else {
          // Inline script
          this.currentTest = this._parseScript(source);
        }
      } else if (typeof source === 'function') {
        this.currentTest = source;
      }

      return this;
    }

    /**
     * Parse script text into executable function
     */
    _parseScript(scriptText) {
      // Wrap IIFE to accept config parameter
      // Scripts should be in format: (async function(config) { ... })
      try {
        // If it's already an IIFE, extract the function body
        const match = scriptText.match(/\(async\s+function\s*\([^)]*\)\s*\{([\s\S]*)\}\s*\)\s*\(\s*\)/);
        if (match) {
          const body = match[1];
          return new Function('config', `return (async function(config) {${body}})(config);`);
        }

        // Otherwise, wrap it
        return new Function('config', `return (async function(config) { ${scriptText} })(config);`);
      } catch (e) {
        console.error('Failed to parse test script:', e);
        throw e;
      }
    }

    /**
     * Execute the loaded test with current config
     */
    async execute(configOverride = {}) {
      if (!this.currentTest) {
        throw new Error('No test loaded. Call loadTest() first.');
      }

      if (this.isRunning) {
        throw new Error('Test already running');
      }

      this.isRunning = true;
      const startTime = performance.now();

      try {
        // Merge DOM config with overrides
        const config = { ...this.getConfig(), ...configOverride };

        this._emit('progress', { stage: 'starting', config });

        // Execute test
        const result = await this.currentTest(config);

        const duration = performance.now() - startTime;

        const testResult = {
          success: true,
          data: result,
          config,
          duration,
          timestamp: new Date().toISOString()
        };

        this.results.push(testResult);
        this._emit('result', testResult);

        // Auto-upload results if enabled and ResultsClient is available
        if (this.autoUpload && typeof ResultsClient !== 'undefined') {
          await this._uploadResults(result, this.testName);
        }

        return testResult;

      } catch (error) {
        const duration = performance.now() - startTime;

        const testResult = {
          success: false,
          error: error.message,
          stack: error.stack,
          config: this.getConfig(),
          duration,
          timestamp: new Date().toISOString()
        };

        this.results.push(testResult);
        this._emit('error', testResult);

        return testResult;

      } finally {
        this.isRunning = false;
        this._emit('progress', { stage: 'completed' });
      }
    }

    /**
     * Execute a test script directly without loading
     */
    async run(scriptOrUrl, configOverride = {}) {
      await this.loadTest(scriptOrUrl);
      return this.execute(configOverride);
    }

    /**
     * Register event listener
     */
    on(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event].push(callback);
      }
      return this;
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
      }
      return this;
    }

    /**
     * Emit event
     */
    _emit(event, data) {
      if (this.listeners[event]) {
        for (const callback of this.listeners[event]) {
          try {
            callback(data);
          } catch (e) {
            console.error(`Error in ${event} listener:`, e);
          }
        }
      }
    }

    /**
     * Convenience: onResult
     */
    onResult(callback) {
      return this.on('result', callback);
    }

    /**
     * Convenience: onError
     */
    onError(callback) {
      return this.on('error', callback);
    }

    /**
     * Get all results
     */
    getResults() {
      return [...this.results];
    }

    /**
     * Clear results
     */
    clearResults() {
      this.results = [];
      return this;
    }

    /**
     * Auto-wire DOM elements
     * Call this after DOM is ready to connect buttons to actions
     */
    autoWire() {
      // Capture button
      const captureBtn = document.querySelector('#ami-capture-btn');
      if (captureBtn) {
        captureBtn.addEventListener('click', () => {
          this.run(BUILTIN_TESTS.capture, { action: 'capture' });
        });
      }

      // Record button
      const recordBtn = document.querySelector('#ami-record-btn');
      if (recordBtn) {
        recordBtn.addEventListener('click', () => {
          this.run(BUILTIN_TESTS.record, { action: 'record' });
        });
      }

      // Run test button (for loaded external tests)
      const runTestBtn = document.querySelector('#ami-run-test-btn');
      if (runTestBtn) {
        runTestBtn.addEventListener('click', () => {
          if (this.currentTest) {
            this.execute();
          } else {
            console.warn('No test loaded');
          }
        });
      }

      // Result display
      this.on('result', (result) => {
        const output = document.querySelector('#ami-test-output');
        if (output) {
          this._displayResult(output, result);
        }
      });

      this.on('error', (result) => {
        const output = document.querySelector('#ami-test-output');
        if (output) {
          this._displayResult(output, result);
        }
      });

      console.log('[TestRunner] Auto-wired DOM elements');
      return this;
    }

    /**
     * Upload results to server
     */
    async _uploadResults(results, testName) {
      const items = Array.isArray(results) ? results : [results];

      for (const item of items) {
        if (!item.dataUrl || !item.success) continue;

        try {
          const isVideo = item.dataUrl.startsWith('data:video');
          const fullTestName = `${testName}_${item.camera || 'unknown'}_${item.type || 'capture'}`;

          if (isVideo) {
            const uploadResult = await ResultsClient.uploadVideo(
              await this._dataUrlToBlob(item.dataUrl),
              fullTestName
            );
            this._emit('upload', { type: 'video', testName: fullTestName, result: uploadResult });
            console.log(`[TestRunner] Uploaded video: ${fullTestName}`);
          } else {
            const uploadResult = await ResultsClient.uploadImage(item.dataUrl, fullTestName);
            this._emit('upload', { type: 'image', testName: fullTestName, result: uploadResult });
            console.log(`[TestRunner] Uploaded image: ${fullTestName}`);
          }
        } catch (error) {
          console.warn(`[TestRunner] Upload failed:`, error);
        }
      }
    }

    /**
     * Convert data URL to Blob
     */
    async _dataUrlToBlob(dataUrl) {
      const response = await fetch(dataUrl);
      return response.blob();
    }

    /**
     * Display result in output element
     */
    _displayResult(container, result) {
      const div = document.createElement('div');
      div.className = `test-result ${result.success ? 'success' : 'error'}`;
      div.innerHTML = `
        <div class="result-header">
          <span class="status">${result.success ? '✓' : '✗'}</span>
          <span class="time">${result.timestamp}</span>
          <span class="duration">${result.duration.toFixed(0)}ms</span>
        </div>
        <div class="result-body">
          ${result.success ? this._formatResultData(result.data) : `<pre class="error">${result.error}</pre>`}
        </div>
      `;
      container.insertBefore(div, container.firstChild);
    }

    /**
     * Format result data for display
     */
    _formatResultData(data) {
      if (!data) return '<em>No data</em>';

      if (Array.isArray(data)) {
        return data.map(item => this._formatSingleResult(item)).join('');
      }

      return this._formatSingleResult(data);
    }

    /**
     * Format single result item
     */
    _formatSingleResult(item) {
      if (item.dataUrl) {
        // Image or video capture
        const isVideo = item.dataUrl.startsWith('data:video');
        if (isVideo) {
          return `
            <div class="capture-result">
              <video controls src="${item.dataUrl}" style="max-width:200px"></video>
              <div class="meta">${item.camera || 'Camera'} - ${item.resolution || ''} - ${item.duration || ''}s</div>
            </div>
          `;
        } else {
          return `
            <div class="capture-result">
              <img src="${item.dataUrl}" style="max-width:200px" />
              <div class="meta">${item.camera || 'Camera'} - ${item.resolution || ''}</div>
            </div>
          `;
        }
      }

      return `<pre>${JSON.stringify(item, null, 2)}</pre>`;
    }
  }

  // ============================================================================
  // Built-in Test Scripts
  // ============================================================================

  const BUILTIN_TESTS = {
    /**
     * Camera capture test
     */
    capture: async function(config) {
      const results = [];

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');

      // Filter cameras based on config
      let targetCameras = cameras;
      if (config.camera === 'front') {
        targetCameras = cameras.filter(d =>
          d.label.toLowerCase().includes('front') || d.label.includes('user'));
      } else if (config.camera === 'back') {
        targetCameras = cameras.filter(d =>
          d.label.toLowerCase().includes('back') || d.label.includes('environment'));
      } else if (config.camera !== 'all') {
        targetCameras = cameras.filter(d => d.deviceId === config.camera);
      }

      for (const camera of targetCameras) {
        try {
          const constraints = {
            video: { deviceId: { exact: camera.deviceId } }
          };

          // Apply resolution
          if (config.resolution === 'max') {
            constraints.video.width = { ideal: 4096 };
            constraints.video.height = { ideal: 2160 };
          } else if (config.resolution === 'min') {
            constraints.video.width = { ideal: 320 };
            constraints.video.height = { ideal: 240 };
          } else if (typeof config.resolution === 'object') {
            constraints.video.width = { ideal: config.resolution.width };
            constraints.video.height = { ideal: config.resolution.height };
          }

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const track = stream.getVideoTracks()[0];
          const settings = track.getSettings();

          // Create video element for capture
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.playsInline = true;

          await new Promise(r => video.onloadedmetadata = r);
          await video.play();

          // Wait for stable frame
          await new Promise(r => setTimeout(r, 500));

          // Capture frame
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);

          const format = config.format || 'png';
          const dataUrl = canvas.toDataURL(`image/${format}`, 0.95);

          stream.getTracks().forEach(t => t.stop());

          results.push({
            camera: camera.label || camera.deviceId,
            type: 'capture',
            resolution: `${settings.width}x${settings.height}`,
            format,
            dataUrl,
            success: true
          });

        } catch (error) {
          results.push({
            camera: camera.label || camera.deviceId,
            type: 'capture',
            success: false,
            error: error.message
          });
        }
      }

      return results;
    },

    /**
     * Video record test
     */
    record: async function(config) {
      const results = [];
      const duration = config.duration || 5;

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === 'videoinput');

      let targetCameras = cameras;
      if (config.camera !== 'all') {
        targetCameras = cameras.filter(d =>
          d.deviceId === config.camera ||
          (config.camera === 'front' && (d.label.toLowerCase().includes('front') || d.label.includes('user'))) ||
          (config.camera === 'back' && (d.label.toLowerCase().includes('back') || d.label.includes('environment')))
        );
      }

      for (const camera of targetCameras) {
        try {
          const constraints = {
            video: { deviceId: { exact: camera.deviceId } }
          };

          if (config.resolution === 'max') {
            constraints.video.width = { ideal: 4096 };
            constraints.video.height = { ideal: 2160 };
          }

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const settings = stream.getVideoTracks()[0].getSettings();

          const chunks = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

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
          await new Promise(r => setTimeout(r, duration * 1000));
          recorder.stop();
          stream.getTracks().forEach(t => t.stop());

          const dataUrl = await recordingPromise;

          results.push({
            camera: camera.label || camera.deviceId,
            type: 'record',
            resolution: `${settings.width}x${settings.height}`,
            duration,
            format: 'webm',
            dataUrl,
            success: true
          });

        } catch (error) {
          results.push({
            camera: camera.label || camera.deviceId,
            type: 'record',
            success: false,
            error: error.message
          });
        }
      }

      return results;
    }
  };

  // ============================================================================
  // URL Parameter Handling for Auto-Execution
  // ============================================================================

  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      autorun: params.get('autorun') === 'true' || params.get('autorun') === '1',
      script: params.get('script'),
      testName: params.get('testname') || params.get('test'),
      action: params.get('action') || 'capture',  // capture, record, all
      config: params.get('config'),  // JSON config override
    };
  }

  // Visual banner for autorun status
  let autorunBanner = null;
  function showAutorunBanner(message, isError = false) {
    if (!autorunBanner) {
      autorunBanner = document.createElement('div');
      autorunBanner.id = 'ami-autorun-banner';
      autorunBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: 15px 20px;
        font-family: -apple-system, sans-serif;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        z-index: 999999;
        transition: all 0.3s;
      `;
      document.body.appendChild(autorunBanner);
    }

    autorunBanner.textContent = message;
    autorunBanner.style.background = isError ? '#ef4444' : '#3b82f6';
    autorunBanner.style.color = 'white';

    // Log to console as well
    console.log(`[AutoRun] ${message}`);
  }

  async function handleAutoRun(runner) {
    console.log('[TestRunner] 🔶 handleAutoRun called');
    const params = getUrlParams();

    // Debug: Send ping to server to confirm script loaded
    console.log('[TestRunner] 🔶 URL params raw:', window.location.search);
    console.log('[TestRunner] 🔶 Parsed params:', JSON.stringify(params));
    console.log('[TestRunner] 🔶 autorun value:', params.autorun, 'type:', typeof params.autorun);

    // Send debug ping to server FIRST
    console.log('[TestRunner] 🔶 Sending ping to server...');
    try {
      const pingUrl = '/api/health?ping=testrunner&autorun=' + params.autorun + '&action=' + params.action + '&url=' + encodeURIComponent(window.location.href);
      console.log('[TestRunner] 🔶 Ping URL:', pingUrl);
      const pingResp = await fetch(pingUrl);
      console.log('[TestRunner] 🔶 Ping response:', pingResp.status);
    } catch (e) {
      console.warn('[TestRunner] ⚠️ Could not ping server:', e);
    }

    if (!params.autorun) {
      console.log('[TestRunner] ⛔ Autorun NOT enabled (autorun=' + params.autorun + '), waiting for manual interaction');
      return;
    }

    // Show autorun banner
    showAutorunBanner('🚀 Auto-run mode - requesting permissions...');
    console.log('[TestRunner] ====== AUTO-RUN MODE ======');
    console.log('[TestRunner] Params:', params);

    // Set test name if provided
    if (params.testName) {
      runner.testName = params.testName;
    }

    // Parse config override if provided
    let configOverride = {};
    if (params.config) {
      try {
        configOverride = JSON.parse(decodeURIComponent(params.config));
      } catch (e) {
        console.warn('[TestRunner] Failed to parse config:', e);
      }
    }

    // Wait for page to be fully ready
    await new Promise(r => setTimeout(r, 500));

    // First, request camera permission to avoid blocking
    try {
      showAutorunBanner('📷 Requesting camera permission...');
      console.log('[TestRunner] Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop()); // Release immediately
      console.log('[TestRunner] ✓ Camera permission granted');
      showAutorunBanner('✓ Permission granted - running tests...');
    } catch (e) {
      console.error('[TestRunner] ✗ Camera permission denied:', e);
      showAutorunBanner('⚠️ Camera permission denied - click to retry', true);

      // Upload error result
      if (typeof ResultsClient !== 'undefined') {
        await ResultsClient.uploadJSON({
          error: 'Camera permission denied',
          message: e.message,
          userAgent: navigator.userAgent
        }, params.testName || 'permission-error');
      }
      return;
    }

    // Wait a bit after permission
    await new Promise(r => setTimeout(r, 500));

    // Determine which tests to run
    const action = params.action;

    try {
      if (params.script) {
        // Load and run external script
        console.log(`[TestRunner] Loading script: ${params.script}`);
        showAutorunBanner('📜 Loading external script...');
        await runner.loadTest(params.script);
        await runner.execute(configOverride);
      } else if (action === 'all') {
        // Run both capture and record
        console.log('[TestRunner] Running all tests (capture + record)');
        showAutorunBanner('📷 Running capture test...');
        runner.testName = (params.testName || 'auto') + '_capture';
        await runner.run(BUILTIN_TESTS.capture, { ...configOverride, action: 'capture' });

        showAutorunBanner('🎥 Running record test...');
        runner.testName = (params.testName || 'auto') + '_record';
        await runner.run(BUILTIN_TESTS.record, { ...configOverride, action: 'record' });
      } else if (action === 'record') {
        // Run record test
        console.log('[TestRunner] Running record test');
        showAutorunBanner('🎥 Running record test...');
        runner.testName = (params.testName || 'auto') + '_record';
        await runner.run(BUILTIN_TESTS.record, { ...configOverride, action: 'record' });
      } else {
        // Default: run capture test
        console.log('[TestRunner] Running capture test');
        showAutorunBanner('📷 Running capture test...');
        runner.testName = (params.testName || 'auto') + '_capture';
        await runner.run(BUILTIN_TESTS.capture, { ...configOverride, action: 'capture' });
      }

      console.log('[TestRunner] ====== AUTO-RUN COMPLETE ======');

      // Update banner to success
      if (autorunBanner) {
        autorunBanner.style.background = '#22c55e';
        autorunBanner.textContent = '✅ Tests Complete - Results uploaded to server';
      }

      // Signal completion (for external monitoring)
      window.postMessage({ type: 'ami-test-complete', success: true }, '*');

    } catch (error) {
      console.error('[TestRunner] Auto-run failed:', error);

      // Update banner to error
      if (autorunBanner) {
        autorunBanner.style.background = '#ef4444';
        autorunBanner.textContent = `❌ Test Failed: ${error.message}`;
      }

      // Upload error to server
      if (typeof ResultsClient !== 'undefined') {
        try {
          await ResultsClient.uploadJSON({
            error: error.message,
            stack: error.stack,
            userAgent: navigator.userAgent,
            url: window.location.href
          }, (params.testName || 'auto') + '_error');
        } catch (e) {
          console.warn('[TestRunner] Could not upload error:', e);
        }
      }

      window.postMessage({ type: 'ami-test-complete', success: false, error: error.message }, '*');
    }
  }

  // ============================================================================
  // Export
  // ============================================================================

  // Create singleton instance
  const testRunner = new TestRunner();

  // Expose globally
  global.TestRunner = testRunner;
  global.TestRunnerClass = TestRunner;
  global.BUILTIN_TESTS = BUILTIN_TESTS;

  // Auto-wire when DOM is ready
  console.log('[TestRunner] 🔵 Document readyState:', document.readyState);

  if (document.readyState === 'loading') {
    console.log('[TestRunner] 🔵 Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[TestRunner] 🔵 DOMContentLoaded fired!');
      testRunner.autoWire();
      console.log('[TestRunner] 🔵 Calling handleAutoRun...');
      handleAutoRun(testRunner);
    });
  } else {
    console.log('[TestRunner] 🔵 DOM already ready, calling immediately');
    testRunner.autoWire();
    console.log('[TestRunner] 🔵 Calling handleAutoRun...');
    handleAutoRun(testRunner);
  }

  // Check for ResultsClient
  if (typeof ResultsClient !== 'undefined') {
    console.log('[TestRunner] Initialized with auto-upload enabled (ResultsClient found)');
  } else {
    console.log('[TestRunner] Initialized. Include results-client.js for auto-upload.');
  }

  // Log URL params if present
  const params = getUrlParams();
  if (params.autorun) {
    console.log('[TestRunner] URL params:', params);
  }

})(typeof window !== 'undefined' ? window : this);
