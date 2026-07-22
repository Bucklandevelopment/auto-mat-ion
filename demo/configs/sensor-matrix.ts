/**
 * auto-mat-ion Sensor Test Matrix
 *
 * Configuración extensible de pruebas para sensores del navegador.
 * Basado en el concepto de config-matrix.ts de solar-lab, extendido
 * para cubrir todos los sensores web: video, audio, motion, connectivity, etc.
 *
 * Ejemplo de uso:
 *   const configs = generateSensorMatrix('video', 'standard');
 *   const configs = generateSensorMatrix('audio', { sampleRates: [44100, 48000] });
 */

// ============================================================================
// Sensor Categories
// ============================================================================

export type SensorCategory =
  | 'video'           // Camera, screen capture
  | 'audio'           // Microphone, speakers
  | 'motion'          // Accelerometer, gyroscope, orientation
  | 'environment'     // Geolocation, ambient light, proximity
  | 'connectivity'    // Bluetooth, USB, NFC, Serial
  | 'hardware';       // Battery, vibration, gamepad

// ============================================================================
// Video Sensor Configuration
// ============================================================================

export interface VideoConstraints {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: 'user' | 'environment';
  aspectRatio?: number;
  deviceId?: string;
}

export interface VideoTestConfig {
  id: string;
  name: string;
  constraints: VideoConstraints;
  duration?: number;           // Test duration in ms
  captureFrames?: number;      // Number of frames to capture
  checkTorch?: boolean;        // Test torch/flash
  checkAutoFocus?: boolean;    // Test autofocus
  checkExposure?: boolean;     // Test exposure control
}

export const VIDEO_PRESETS: Record<string, Partial<VideoConstraints>[]> = {
  // Quick sanity check
  quick: [
    { width: 640, height: 480, frameRate: 30 },
  ],

  // Standard test suite
  standard: [
    { width: 640, height: 480, frameRate: 30, facingMode: 'environment' },
    { width: 1280, height: 720, frameRate: 30, facingMode: 'environment' },
    { width: 640, height: 480, frameRate: 30, facingMode: 'user' },
    { width: 1280, height: 720, frameRate: 30, facingMode: 'user' },
  ],

  // Resolution sweep
  resolutions: [
    { width: 320, height: 240, frameRate: 30 },
    { width: 640, height: 480, frameRate: 30 },
    { width: 1280, height: 720, frameRate: 30 },
    { width: 1920, height: 1080, frameRate: 30 },
    { width: 2560, height: 1440, frameRate: 30 },
    { width: 3840, height: 2160, frameRate: 30 },
  ],

  // Frame rate sweep
  frameRates: [
    { width: 1280, height: 720, frameRate: 15 },
    { width: 1280, height: 720, frameRate: 24 },
    { width: 1280, height: 720, frameRate: 30 },
    { width: 1280, height: 720, frameRate: 60 },
  ],

  // Aspect ratio sweep
  aspectRatios: [
    { width: 640, height: 480, aspectRatio: 4/3 },
    { width: 1280, height: 720, aspectRatio: 16/9 },
    { width: 720, height: 720, aspectRatio: 1 },
    { width: 1080, height: 1920, aspectRatio: 9/16 }, // Portrait
  ],

  // Comprehensive (all combinations)
  comprehensive: [
    // All resolutions × both cameras × multiple frame rates
    ...['environment', 'user'].flatMap(facing =>
      [480, 720, 1080].flatMap(h =>
        [15, 30, 60].map(fps => ({
          width: Math.round(h * 16/9),
          height: h,
          frameRate: fps,
          facingMode: facing as 'user' | 'environment',
        }))
      )
    ),
  ],
};

// ============================================================================
// Audio Sensor Configuration
// ============================================================================

export interface AudioConstraints {
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  deviceId?: string;
}

export interface AudioTestConfig {
  id: string;
  name: string;
  constraints: AudioConstraints;
  duration?: number;
  recordSample?: boolean;
  measureLatency?: boolean;
  checkVolume?: boolean;
}

export const AUDIO_PRESETS: Record<string, Partial<AudioConstraints>[]> = {
  quick: [
    { sampleRate: 48000, channelCount: 1 },
  ],

  standard: [
    { sampleRate: 44100, channelCount: 1, echoCancellation: true },
    { sampleRate: 48000, channelCount: 1, echoCancellation: true },
    { sampleRate: 48000, channelCount: 2, echoCancellation: false },
  ],

  sampleRates: [
    { sampleRate: 8000, channelCount: 1 },
    { sampleRate: 16000, channelCount: 1 },
    { sampleRate: 22050, channelCount: 1 },
    { sampleRate: 44100, channelCount: 1 },
    { sampleRate: 48000, channelCount: 1 },
    { sampleRate: 96000, channelCount: 1 },
  ],

  processing: [
    { sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    { sampleRate: 48000, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    { sampleRate: 48000, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    { sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  ],

  comprehensive: [
    ...[44100, 48000].flatMap(rate =>
      [1, 2].flatMap(channels =>
        [true, false].map(echo => ({
          sampleRate: rate,
          channelCount: channels,
          echoCancellation: echo,
          noiseSuppression: echo,
          autoGainControl: echo,
        }))
      )
    ),
  ],
};

// ============================================================================
// Motion Sensor Configuration
// ============================================================================

export interface MotionSensorConfig {
  sensor: 'accelerometer' | 'gyroscope' | 'magnetometer' | 'orientation' | 'motion';
  frequency?: number;         // Hz
  referenceFrame?: 'device' | 'screen';
}

export interface MotionTestConfig {
  id: string;
  name: string;
  sensors: MotionSensorConfig[];
  duration?: number;
  sampleCount?: number;
  checkCalibration?: boolean;
}

export const MOTION_PRESETS: Record<string, MotionSensorConfig[][]> = {
  quick: [
    [{ sensor: 'accelerometer', frequency: 60 }],
  ],

  standard: [
    [{ sensor: 'accelerometer', frequency: 60 }],
    [{ sensor: 'gyroscope', frequency: 60 }],
    [{ sensor: 'orientation' }],
    [{ sensor: 'motion' }],
  ],

  frequencies: [
    [{ sensor: 'accelerometer', frequency: 10 }],
    [{ sensor: 'accelerometer', frequency: 30 }],
    [{ sensor: 'accelerometer', frequency: 60 }],
    [{ sensor: 'accelerometer', frequency: 120 }],
  ],

  allSensors: [
    [
      { sensor: 'accelerometer', frequency: 60 },
      { sensor: 'gyroscope', frequency: 60 },
      { sensor: 'magnetometer', frequency: 60 },
    ],
  ],

  comprehensive: [
    // Each sensor at multiple frequencies
    ...(['accelerometer', 'gyroscope', 'magnetometer'] as const).flatMap(s =>
      [30, 60, 120].map(f => [{ sensor: s, frequency: f }])
    ),
    [{ sensor: 'orientation' }],
    [{ sensor: 'motion' }],
  ],
};

// ============================================================================
// Environment Sensor Configuration
// ============================================================================

export interface GeolocationConfig {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export interface EnvironmentTestConfig {
  id: string;
  name: string;
  sensors: Array<{
    type: 'geolocation' | 'ambientLight' | 'proximity' | 'magnetometer';
    config?: GeolocationConfig | Record<string, unknown>;
  }>;
  duration?: number;
  sampleCount?: number;
}

export const ENVIRONMENT_PRESETS: Record<string, EnvironmentTestConfig['sensors'][]> = {
  quick: [
    [{ type: 'geolocation', config: { enableHighAccuracy: false, timeout: 5000 } }],
  ],

  standard: [
    [{ type: 'geolocation', config: { enableHighAccuracy: true } }],
    [{ type: 'ambientLight' }],
    [{ type: 'proximity' }],
  ],

  geolocationModes: [
    [{ type: 'geolocation', config: { enableHighAccuracy: false, timeout: 5000 } }],
    [{ type: 'geolocation', config: { enableHighAccuracy: true, timeout: 10000 } }],
    [{ type: 'geolocation', config: { enableHighAccuracy: true, maximumAge: 0 } }],
  ],

  comprehensive: [
    [{ type: 'geolocation', config: { enableHighAccuracy: true } }],
    [{ type: 'ambientLight' }],
    [{ type: 'proximity' }],
    [{ type: 'magnetometer' }],
  ],
};

// ============================================================================
// Connectivity Sensor Configuration
// ============================================================================

export interface BluetoothConfig {
  filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

export interface USBConfig {
  filters?: Array<{ vendorId?: number; productId?: number }>;
}

export interface ConnectivityTestConfig {
  id: string;
  name: string;
  type: 'bluetooth' | 'usb' | 'nfc' | 'serial';
  config?: BluetoothConfig | USBConfig | Record<string, unknown>;
  timeout?: number;
  requirePairing?: boolean;
}

export const CONNECTIVITY_PRESETS: Record<string, Omit<ConnectivityTestConfig, 'id' | 'name'>[]> = {
  quick: [
    { type: 'bluetooth', config: { acceptAllDevices: true }, timeout: 5000 },
  ],

  standard: [
    { type: 'bluetooth', config: { acceptAllDevices: true } },
    { type: 'usb' },
    { type: 'serial' },
  ],

  bluetoothServices: [
    { type: 'bluetooth', config: { filters: [{ services: ['heart_rate'] }] } },
    { type: 'bluetooth', config: { filters: [{ services: ['battery_service'] }] } },
    { type: 'bluetooth', config: { filters: [{ services: ['device_information'] }] } },
  ],

  comprehensive: [
    { type: 'bluetooth', config: { acceptAllDevices: true } },
    { type: 'usb' },
    { type: 'nfc' },
    { type: 'serial' },
  ],
};

// ============================================================================
// Hardware Feature Configuration
// ============================================================================

export interface HardwareTestConfig {
  id: string;
  name: string;
  feature: 'battery' | 'vibration' | 'gamepad' | 'wakeLock';
  config?: {
    vibrationPattern?: number[];
    wakeLockType?: 'screen';
  };
}

export const HARDWARE_PRESETS: Record<string, Omit<HardwareTestConfig, 'id' | 'name'>[]> = {
  quick: [
    { feature: 'battery' },
  ],

  standard: [
    { feature: 'battery' },
    { feature: 'vibration', config: { vibrationPattern: [100] } },
    { feature: 'wakeLock', config: { wakeLockType: 'screen' } },
  ],

  vibrationPatterns: [
    { feature: 'vibration', config: { vibrationPattern: [50] } },
    { feature: 'vibration', config: { vibrationPattern: [100, 50, 100] } },
    { feature: 'vibration', config: { vibrationPattern: [200, 100, 200, 100, 200] } },
  ],

  comprehensive: [
    { feature: 'battery' },
    { feature: 'vibration', config: { vibrationPattern: [100] } },
    { feature: 'gamepad' },
    { feature: 'wakeLock' },
  ],
};

// ============================================================================
// Matrix Generation
// ============================================================================

export type PresetName = 'quick' | 'standard' | 'comprehensive' | string;

export interface MatrixOptions {
  devices?: string[];              // Device IDs to test
  browsers?: string[];             // Browsers to test
  repetitions?: number;            // Repeat each test N times
  parallel?: boolean;              // Run tests in parallel
  timeout?: number;                // Test timeout in ms
  captureScreenshots?: boolean;    // Capture screenshots on failure
  captureVideo?: boolean;          // Record test video
}

export interface TestMatrixEntry<T> {
  id: string;
  device?: string;
  browser?: string;
  repetition: number;
  config: T;
}

/**
 * Generate a test matrix for a sensor category
 */
export function generateSensorMatrix<T>(
  category: SensorCategory,
  preset: PresetName | T[],
  options: MatrixOptions = {}
): TestMatrixEntry<T>[] {
  const {
    devices = ['default'],
    browsers = ['chrome'],
    repetitions = 1,
  } = options;

  // Get preset configurations
  let configs: T[];

  if (Array.isArray(preset)) {
    configs = preset;
  } else {
    const presets = getPresetsForCategory(category);
    configs = (presets[preset] || presets['standard']) as T[];
  }

  // Generate matrix (cartesian product)
  const matrix: TestMatrixEntry<T>[] = [];
  let index = 0;

  for (const device of devices) {
    for (const browser of browsers) {
      for (let rep = 1; rep <= repetitions; rep++) {
        for (const config of configs) {
          matrix.push({
            id: `${category}_${index++}`,
            device,
            browser,
            repetition: rep,
            config,
          });
        }
      }
    }
  }

  return matrix;
}

function getPresetsForCategory(category: SensorCategory): Record<string, unknown[]> {
  switch (category) {
    case 'video':
      return VIDEO_PRESETS;
    case 'audio':
      return AUDIO_PRESETS;
    case 'motion':
      return MOTION_PRESETS;
    case 'environment':
      return ENVIRONMENT_PRESETS;
    case 'connectivity':
      return CONNECTIVITY_PRESETS;
    case 'hardware':
      return HARDWARE_PRESETS;
    default:
      return { standard: [] };
  }
}

/**
 * Calculate matrix statistics
 */
export function calculateMatrixStats(
  matrix: TestMatrixEntry<unknown>[],
  avgTestDurationMs: number = 5000
): {
  totalTests: number;
  estimatedDurationMs: number;
  estimatedDurationFormatted: string;
  byDevice: Record<string, number>;
  byBrowser: Record<string, number>;
} {
  const byDevice: Record<string, number> = {};
  const byBrowser: Record<string, number> = {};

  for (const entry of matrix) {
    byDevice[entry.device || 'default'] = (byDevice[entry.device || 'default'] || 0) + 1;
    byBrowser[entry.browser || 'default'] = (byBrowser[entry.browser || 'default'] || 0) + 1;
  }

  const totalMs = matrix.length * avgTestDurationMs;
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.round((totalMs % 60000) / 1000);

  return {
    totalTests: matrix.length,
    estimatedDurationMs: totalMs,
    estimatedDurationFormatted: `${minutes}m ${seconds}s`,
    byDevice,
    byBrowser,
  };
}

// ============================================================================
// Export Combined Configuration
// ============================================================================

export interface FullTestSuite {
  name: string;
  description?: string;
  categories: {
    category: SensorCategory;
    preset: PresetName;
    options?: MatrixOptions;
  }[];
  globalOptions?: MatrixOptions;
}

export const PREDEFINED_SUITES: Record<string, FullTestSuite> = {
  smoke: {
    name: 'Smoke Test',
    description: 'Quick sanity check for all sensor categories',
    categories: [
      { category: 'video', preset: 'quick' },
      { category: 'audio', preset: 'quick' },
      { category: 'motion', preset: 'quick' },
      { category: 'environment', preset: 'quick' },
      { category: 'hardware', preset: 'quick' },
    ],
    globalOptions: { repetitions: 1 },
  },

  standard: {
    name: 'Standard Test Suite',
    description: 'Comprehensive testing of common configurations',
    categories: [
      { category: 'video', preset: 'standard' },
      { category: 'audio', preset: 'standard' },
      { category: 'motion', preset: 'standard' },
      { category: 'environment', preset: 'standard' },
      { category: 'hardware', preset: 'standard' },
    ],
    globalOptions: { repetitions: 3 },
  },

  mediaOnly: {
    name: 'Media Sensors',
    description: 'Video and audio sensor testing',
    categories: [
      { category: 'video', preset: 'comprehensive' },
      { category: 'audio', preset: 'comprehensive' },
    ],
  },

  motionOnly: {
    name: 'Motion Sensors',
    description: 'Accelerometer, gyroscope, orientation testing',
    categories: [
      { category: 'motion', preset: 'comprehensive' },
    ],
  },
};
