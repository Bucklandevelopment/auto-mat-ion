/**
 * auto-mat-ion Controllers
 *
 * Exports all controller interfaces and implementations.
 */

// Base controller class and constants
export {
  BaseBrowserController,
  CDP_PORTS,
} from './base-controller.js';

// Re-export IBrowserController from core types
export type { IBrowserController } from '../core/types.js';

// Sensor controller interfaces
export type {
  // Common types
  SensorReading,
  SensorStream,
  PermissionState,

  // Video
  VideoConstraints,
  VideoCapabilities,
  VideoSettings,
  CameraDevice,
  IVideoController,

  // Audio
  AudioConstraints,
  AudioCapabilities,
  AudioDevice,
  AudioAnalysis,
  IAudioController,

  // Motion
  AccelerometerReading,
  GyroscopeReading,
  OrientationReading,
  MotionReading,
  IMotionController,

  // Environment
  GeolocationReading,
  AmbientLightReading,
  ProximityReading,
  IEnvironmentController,

  // Connectivity
  BluetoothDevice,
  USBDevice,
  SerialPort,
  IConnectivityController,

  // Hardware
  BatteryStatus,
  GamepadState,
  IHardwareController,

  // Combined
  ISensorController,
  SensorControllerFactory,
  ControllerType,
  ControllerRegistry,
} from './sensor-controllers.js';

// Controller implementations
export { VideoController, createVideoController } from './video-controller.js';
export { AudioController, createAudioController } from './audio-controller.js';
export { MotionController, createMotionController } from './motion-controller.js';
