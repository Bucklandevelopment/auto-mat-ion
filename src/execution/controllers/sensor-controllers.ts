/**
 * auto-mat-ion Sensor Controller Hierarchy
 *
 * Extensión de la arquitectura de controladores para sensores especializados.
 *
 * Jerarquía:
 *   IBrowserController (base)
 *     ├── IVideoController      - Camera, screen capture
 *     ├── IAudioController      - Microphone, speakers, Web Audio
 *     ├── IMotionController     - Accelerometer, gyroscope, orientation
 *     ├── IEnvironmentController - Geolocation, ambient light, proximity
 *     ├── IConnectivityController - Bluetooth, USB, NFC, Serial
 *     └── IHardwareController   - Battery, vibration, gamepad, wake lock
 *
 * Cada controlador especializado:
 * 1. Extiende las capacidades del controlador base
 * 2. Proporciona métodos específicos para su dominio
 * 3. Maneja permisos y restricciones del navegador
 * 4. Emite eventos para telemetría y gamificación
 */

import type { IBrowserController } from '../core/types.js';

// ============================================================================
// DOM Types (for TypeScript compilation in Node.js environment)
// These interfaces provide type safety without requiring DOM lib
// ============================================================================

/** @internal Browser MediaStream interface placeholder */
export interface MediaStreamLike {
  readonly id: string;
  readonly active: boolean;
  getTracks(): unknown[];
  getVideoTracks(): unknown[];
  getAudioTracks(): unknown[];
}

/** @internal Display media options placeholder */
export interface DisplayMediaOptionsLike {
  video?: boolean | object;
  audio?: boolean | object;
}

/** @internal Position options placeholder */
export interface PositionOptionsLike {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/** @internal Bluetooth request options placeholder */
export interface BluetoothRequestOptionsLike {
  filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

/** @internal USB request options placeholder */
export interface USBRequestOptionsLike {
  filters?: Array<{ vendorId?: number; productId?: number }>;
}

/** @internal Serial port request options placeholder */
export interface SerialRequestOptionsLike {
  filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
}

/** @internal Serial options placeholder */
export interface SerialOptionsLike {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

/** Buffer source type */
export type BufferSourceLike = ArrayBuffer | ArrayBufferView;

/** Orientation lock type */
export type OrientationLockTypeLike =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

/** Orientation type */
export type OrientationTypeLike =
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

// ============================================================================
// Common Types
// ============================================================================

export interface SensorReading<T> {
  timestamp: number;
  data: T;
  accuracy?: 'high' | 'medium' | 'low';
}

export interface SensorStream<T> {
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): void;
  resume(): void;
  onReading(callback: (reading: SensorReading<T>) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface PermissionState {
  granted: boolean;
  denied: boolean;
  prompt: boolean;
  error?: string;
}

// ============================================================================
// Video Controller
// ============================================================================

export interface VideoConstraints {
  width?: number | { min?: number; ideal?: number; max?: number };
  height?: number | { min?: number; ideal?: number; max?: number };
  frameRate?: number | { min?: number; ideal?: number; max?: number };
  facingMode?: 'user' | 'environment' | { exact: 'user' | 'environment' };
  aspectRatio?: number;
  deviceId?: string | { exact: string };
}

export interface VideoCapabilities {
  width: { min: number; max: number };
  height: { min: number; max: number };
  frameRate: { min: number; max: number };
  facingModes: ('user' | 'environment')[];
  torch: boolean;
  focusModes: string[];
  exposureModes: string[];
  whiteBalanceModes: string[];
  zoom: { min: number; max: number } | null;
}

export interface VideoSettings {
  width: number;
  height: number;
  frameRate: number;
  facingMode?: string;
  deviceId: string;
  torch?: boolean;
  focusMode?: string;
  exposureMode?: string;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
  kind: 'videoinput';
  facingMode?: 'user' | 'environment';
  capabilities?: VideoCapabilities;
}

export interface IVideoController extends IBrowserController {
  // Device management
  enumerateCameras(): Promise<CameraDevice[]>;
  selectCamera(deviceId: string): Promise<void>;
  getCurrentCamera(): CameraDevice | null;

  // Stream control
  startVideoStream(constraints?: VideoConstraints): Promise<MediaStreamLike>;
  stopVideoStream(): Promise<void>;
  getVideoStream(): MediaStreamLike | null;

  // Settings
  getVideoSettings(): VideoSettings | null;
  getVideoCapabilities(): VideoCapabilities | null;
  applyVideoConstraints(constraints: VideoConstraints): Promise<void>;

  // Controls
  setTorch(enabled: boolean): Promise<void>;
  getTorchState(): boolean;
  setZoom(level: number): Promise<void>;
  getZoom(): number | null;
  setFocusMode(mode: string): Promise<void>;
  setExposureMode(mode: string): Promise<void>;

  // Capture
  captureFrame(format?: 'png' | 'jpeg' | 'webp'): Promise<string>; // Data URL
  captureFrameAsBlob(format?: 'png' | 'jpeg' | 'webp'): Promise<Blob>;

  // Screen capture
  startScreenCapture(options?: DisplayMediaOptionsLike): Promise<MediaStreamLike>;
  stopScreenCapture(): Promise<void>;

  // Events
  onCameraChange(callback: (cameras: CameraDevice[]) => void): void;
  onStreamError(callback: (error: Error) => void): void;
}

// ============================================================================
// Audio Controller
// ============================================================================

export interface AudioConstraints {
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  deviceId?: string | { exact: string };
}

export interface AudioCapabilities {
  sampleRate: { min: number; max: number };
  sampleSize: { min: number; max: number };
  channelCount: { min: number; max: number };
  echoCancellation: boolean[];
  noiseSuppression: boolean[];
  autoGainControl: boolean[];
}

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface AudioAnalysis {
  volume: number;           // 0-1
  peakLevel: number;        // dB
  rmsLevel: number;         // dB
  frequencyData?: Float32Array;
  timeDomainData?: Float32Array;
}

export interface IAudioController extends IBrowserController {
  // Device management
  enumerateMicrophones(): Promise<AudioDevice[]>;
  enumerateSpeakers(): Promise<AudioDevice[]>;
  selectMicrophone(deviceId: string): Promise<void>;
  selectSpeaker(deviceId: string): Promise<void>;

  // Stream control
  startAudioStream(constraints?: AudioConstraints): Promise<MediaStreamLike>;
  stopAudioStream(): Promise<void>;
  getAudioStream(): MediaStreamLike | null;

  // Analysis
  getAudioAnalysis(): AudioAnalysis | null;
  startAnalysis(fftSize?: number): void;
  stopAnalysis(): void;

  // Recording
  startRecording(mimeType?: string): Promise<void>;
  stopRecording(): Promise<Blob>;
  isRecording(): boolean;

  // Playback
  playTone(frequency: number, duration: number, volume?: number): Promise<void>;
  playAudio(url: string): Promise<void>;
  stopPlayback(): void;

  // Latency
  measureLatency(): Promise<number>; // ms

  // Events
  onDeviceChange(callback: (devices: AudioDevice[]) => void): void;
  onVolumeChange(callback: (volume: number) => void): void;
}

// ============================================================================
// Motion Controller
// ============================================================================

export interface AccelerometerReading {
  x: number;  // m/s²
  y: number;
  z: number;
}

export interface GyroscopeReading {
  x: number;  // rad/s
  y: number;
  z: number;
}

export interface OrientationReading {
  alpha: number | null;  // 0-360 (compass)
  beta: number | null;   // -180 to 180 (front-back tilt)
  gamma: number | null;  // -90 to 90 (left-right tilt)
  absolute: boolean;
}

export interface MotionReading {
  acceleration: AccelerometerReading | null;
  accelerationIncludingGravity: AccelerometerReading | null;
  rotationRate: GyroscopeReading | null;
  interval: number;
}

export interface IMotionController extends IBrowserController {
  // Permission
  requestMotionPermission(): Promise<PermissionState>;

  // Accelerometer
  isAccelerometerAvailable(): boolean;
  startAccelerometer(frequency?: number): Promise<SensorStream<AccelerometerReading>>;

  // Gyroscope
  isGyroscopeAvailable(): boolean;
  startGyroscope(frequency?: number): Promise<SensorStream<GyroscopeReading>>;

  // Orientation
  isOrientationAvailable(): boolean;
  startOrientation(): Promise<SensorStream<OrientationReading>>;

  // Motion (combined)
  isMotionAvailable(): boolean;
  startMotion(): Promise<SensorStream<MotionReading>>;

  // Calibration
  calibrateSensors(): Promise<void>;
  resetCalibration(): void;

  // Sampling
  getSampleRate(): number;
  setSampleRate(hz: number): void;

  // Events
  onShake(callback: (intensity: number) => void, threshold?: number): void;
  onTilt(callback: (angle: { x: number; y: number }) => void): void;
}

// ============================================================================
// Environment Controller
// ============================================================================

export interface GeolocationReading {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface AmbientLightReading {
  illuminance: number;  // lux
}

export interface ProximityReading {
  distance: number | null;  // cm
  near: boolean;
}

export interface IEnvironmentController extends IBrowserController {
  // Geolocation
  requestGeolocationPermission(): Promise<PermissionState>;
  getCurrentPosition(options?: PositionOptionsLike): Promise<GeolocationReading>;
  watchPosition(
    callback: (position: GeolocationReading) => void,
    options?: PositionOptionsLike
  ): number;
  clearWatch(watchId: number): void;

  // Ambient Light
  isAmbientLightAvailable(): boolean;
  startAmbientLight(): Promise<SensorStream<AmbientLightReading>>;

  // Proximity
  isProximityAvailable(): boolean;
  startProximity(): Promise<SensorStream<ProximityReading>>;

  // Network info (bonus)
  getNetworkInfo(): Promise<{
    type: string;
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  } | null>;
}

// ============================================================================
// Connectivity Controller
// ============================================================================

export interface BluetoothDevice {
  id: string;
  name: string | null;
  gatt?: {
    connected: boolean;
    services: string[];
  };
}

export interface USBDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
}

export interface SerialPort {
  path?: string;
  info: {
    usbVendorId?: number;
    usbProductId?: number;
  };
}

export interface IConnectivityController extends IBrowserController {
  // Bluetooth
  isBluetoothAvailable(): boolean;
  requestBluetoothDevice(options?: BluetoothRequestOptionsLike): Promise<BluetoothDevice>;
  getBluetoothDevices(): Promise<BluetoothDevice[]>;
  connectBluetooth(deviceId: string): Promise<void>;
  disconnectBluetooth(deviceId: string): Promise<void>;
  readBluetoothCharacteristic(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string
  ): Promise<DataView>;
  writeBluetoothCharacteristic(
    deviceId: string,
    serviceUuid: string,
    characteristicUuid: string,
    value: BufferSourceLike
  ): Promise<void>;

  // USB
  isUSBAvailable(): boolean;
  requestUSBDevice(options?: USBRequestOptionsLike): Promise<USBDevice>;
  getUSBDevices(): Promise<USBDevice[]>;
  openUSBDevice(device: USBDevice): Promise<void>;
  closeUSBDevice(device: USBDevice): Promise<void>;

  // NFC
  isNFCAvailable(): boolean;
  startNFCReader(): Promise<SensorStream<{ message: unknown; serialNumber: string }>>;
  writeNFC(records: unknown[]): Promise<void>;

  // Serial
  isSerialAvailable(): boolean;
  requestSerialPort(options?: SerialRequestOptionsLike): Promise<SerialPort>;
  openSerialPort(port: SerialPort, options?: SerialOptionsLike): Promise<void>;
  closeSerialPort(port: SerialPort): Promise<void>;
  readSerial(port: SerialPort, length: number): Promise<Uint8Array>;
  writeSerial(port: SerialPort, data: BufferSourceLike): Promise<void>;
}

// ============================================================================
// Hardware Controller
// ============================================================================

export interface BatteryStatus {
  charging: boolean;
  level: number;           // 0-1
  chargingTime: number;    // seconds
  dischargingTime: number; // seconds
}

export interface GamepadState {
  id: string;
  index: number;
  connected: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  timestamp: number;
}

export interface IHardwareController extends IBrowserController {
  // Battery
  isBatteryAvailable(): boolean;
  getBatteryStatus(): Promise<BatteryStatus>;
  onBatteryChange(callback: (status: BatteryStatus) => void): void;

  // Vibration
  isVibrationAvailable(): boolean;
  vibrate(pattern: number | number[]): boolean;
  stopVibration(): void;

  // Wake Lock
  isWakeLockAvailable(): boolean;
  requestWakeLock(type?: 'screen'): Promise<void>;
  releaseWakeLock(): Promise<void>;
  isWakeLockActive(): boolean;

  // Gamepad
  isGamepadAvailable(): boolean;
  getGamepads(): GamepadState[];
  onGamepadConnected(callback: (gamepad: GamepadState) => void): void;
  onGamepadDisconnected(callback: (gamepad: GamepadState) => void): void;
  pollGamepad(index: number): GamepadState | null;

  // Fullscreen
  requestFullscreen(): Promise<void>;
  exitFullscreen(): Promise<void>;
  isFullscreen(): boolean;

  // Screen orientation
  lockOrientation(orientation: OrientationLockTypeLike): Promise<void>;
  unlockOrientation(): void;
  getOrientation(): OrientationTypeLike;
}

// ============================================================================
// Combined Controller Factory
// ============================================================================

export interface ISensorController extends
  IVideoController,
  IAudioController,
  IMotionController,
  IEnvironmentController,
  IConnectivityController,
  IHardwareController {}

/**
 * Factory function to create a combined sensor controller
 * that wraps all specialized controllers
 */
export interface SensorControllerFactory {
  createVideoController(deviceId: string): Promise<IVideoController>;
  createAudioController(deviceId: string): Promise<IAudioController>;
  createMotionController(deviceId: string): Promise<IMotionController>;
  createEnvironmentController(deviceId: string): Promise<IEnvironmentController>;
  createConnectivityController(deviceId: string): Promise<IConnectivityController>;
  createHardwareController(deviceId: string): Promise<IHardwareController>;
  createFullController(deviceId: string): Promise<ISensorController>;
}

// ============================================================================
// Controller Registry
// ============================================================================

export type ControllerType =
  | 'video'
  | 'audio'
  | 'motion'
  | 'environment'
  | 'connectivity'
  | 'hardware'
  | 'full';

export interface ControllerRegistry {
  register<T extends IBrowserController>(
    type: ControllerType,
    factory: (deviceId: string) => Promise<T>
  ): void;

  get<T extends IBrowserController>(
    type: ControllerType,
    deviceId: string
  ): Promise<T>;

  getAll(deviceId: string): Promise<Map<ControllerType, IBrowserController>>;

  dispose(deviceId: string): Promise<void>;
  disposeAll(): Promise<void>;
}
