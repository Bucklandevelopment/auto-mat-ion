import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import { Device, DeviceStatus, DeviceType, ConnectionType } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import { createFingerprint } from '../utils/crypto.js';

const logger = createLogger('DeviceManager');

interface DeviceManagerEvents {
  'device:connected': (device: Device) => void;
  'device:disconnected': (deviceId: string) => void;
  'device:status_changed': (deviceId: string, status: DeviceStatus) => void;
  'device:heartbeat': (deviceId: string) => void;
}

export interface RegisterDeviceInput {
  type: DeviceType;
  name?: string;
  model?: string;
  manufacturer?: string;
  osVersion?: string;
  sensors?: string[];
  connectionType: ConnectionType;
  regionCode?: string;
  eudiPseudonym?: string;
  rawFingerprint: string; // Datos únicos del dispositivo para fingerprinting
}

export class DeviceManager extends EventEmitter<DeviceManagerEvents> {
  private devices: Map<string, Device> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly heartbeatTimeout = 60000; // 1 minuto sin heartbeat = offline

  constructor() {
    super();
    logger.info('DeviceManager initialized');
  }

  /**
   * Registra un nuevo dispositivo en la red
   */
  async registerDevice(input: RegisterDeviceInput): Promise<Device> {
    const fingerprint = await createFingerprint(input.rawFingerprint);

    // Verificar si el dispositivo ya existe por fingerprint
    const existingDevice = this.findByFingerprint(fingerprint);
    if (existingDevice) {
      logger.info({ deviceId: existingDevice.id }, 'Device reconnected');
      return this.updateDeviceStatus(existingDevice.id, 'online');
    }

    const now = new Date();
    const device: Device = {
      id: nanoid(),
      fingerprint,
      type: input.type,
      name: input.name,
      model: input.model,
      manufacturer: input.manufacturer,
      osVersion: input.osVersion,
      sensors: input.sensors || [],
      connectionType: input.connectionType,
      status: 'online',
      lastHeartbeat: now,
      regionCode: input.regionCode,
      eudiPseudonym: input.eudiPseudonym,
      totalPoints: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.devices.set(device.id, device);
    this.startHeartbeatMonitor(device.id);

    logger.info({ deviceId: device.id, type: device.type }, 'Device registered');
    this.emit('device:connected', device);

    return device;
  }

  /**
   * Actualiza el estado de un dispositivo
   */
  updateDeviceStatus(deviceId: string, status: DeviceStatus): Device {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const previousStatus = device.status;
    device.status = status;
    device.updatedAt = new Date();

    if (status === 'online') {
      device.lastHeartbeat = new Date();
      this.startHeartbeatMonitor(deviceId);
    }

    this.devices.set(deviceId, device);

    if (previousStatus !== status) {
      logger.info({ deviceId, previousStatus, newStatus: status }, 'Device status changed');
      this.emit('device:status_changed', deviceId, status);
    }

    return device;
  }

  /**
   * Procesa un heartbeat de un dispositivo
   */
  heartbeat(deviceId: string): Device | null {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn({ deviceId }, 'Heartbeat from unknown device');
      return null;
    }

    device.lastHeartbeat = new Date();
    device.updatedAt = new Date();

    if (device.status === 'offline') {
      device.status = 'online';
      this.emit('device:status_changed', deviceId, 'online');
    }

    this.devices.set(deviceId, device);
    this.emit('device:heartbeat', deviceId);

    return device;
  }

  /**
   * Desconecta un dispositivo
   */
  disconnectDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    this.stopHeartbeatMonitor(deviceId);
    device.status = 'offline';
    device.updatedAt = new Date();
    this.devices.set(deviceId, device);

    logger.info({ deviceId }, 'Device disconnected');
    this.emit('device:disconnected', deviceId);
  }

  /**
   * Obtiene un dispositivo por ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Busca un dispositivo por fingerprint
   */
  findByFingerprint(fingerprint: string): Device | undefined {
    for (const device of this.devices.values()) {
      if (device.fingerprint === fingerprint) {
        return device;
      }
    }
    return undefined;
  }

  /**
   * Obtiene todos los dispositivos
   */
  getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * Obtiene dispositivos online
   */
  getOnlineDevices(): Device[] {
    return this.getAllDevices().filter((d) => d.status === 'online');
  }

  /**
   * Obtiene dispositivos que cumplen ciertos requisitos
   */
  findDevicesForTest(requirements: {
    deviceTypes?: DeviceType[];
    sensors?: string[];
    regions?: string[];
    minDevices?: number;
  }): Device[] {
    let candidates = this.getOnlineDevices();

    if (requirements.deviceTypes?.length) {
      candidates = candidates.filter((d) => requirements.deviceTypes!.includes(d.type));
    }

    if (requirements.sensors?.length) {
      candidates = candidates.filter((d) =>
        requirements.sensors!.every((sensor) => d.sensors.includes(sensor))
      );
    }

    if (requirements.regions?.length) {
      candidates = candidates.filter(
        (d) => d.regionCode && requirements.regions!.includes(d.regionCode)
      );
    }

    return candidates;
  }

  /**
   * Añade puntos a un dispositivo
   */
  addPoints(deviceId: string, points: number): Device {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    device.totalPoints += points;
    device.updatedAt = new Date();
    this.devices.set(deviceId, device);

    logger.debug({ deviceId, points, totalPoints: device.totalPoints }, 'Points added to device');

    return device;
  }

  /**
   * Obtiene estadísticas de la red
   */
  getStats(): {
    total: number;
    online: number;
    offline: number;
    busy: number;
    byType: Record<string, number>;
    byRegion: Record<string, number>;
  } {
    const devices = this.getAllDevices();
    const byType: Record<string, number> = {};
    const byRegion: Record<string, number> = {};

    for (const device of devices) {
      byType[device.type] = (byType[device.type] || 0) + 1;
      if (device.regionCode) {
        byRegion[device.regionCode] = (byRegion[device.regionCode] || 0) + 1;
      }
    }

    return {
      total: devices.length,
      online: devices.filter((d) => d.status === 'online').length,
      offline: devices.filter((d) => d.status === 'offline').length,
      busy: devices.filter((d) => d.status === 'busy').length,
      byType,
      byRegion,
    };
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private startHeartbeatMonitor(deviceId: string): void {
    this.stopHeartbeatMonitor(deviceId);

    const interval = setInterval(() => {
      const device = this.devices.get(deviceId);
      if (!device) {
        this.stopHeartbeatMonitor(deviceId);
        return;
      }

      const timeSinceLastHeartbeat = Date.now() - device.lastHeartbeat.getTime();
      if (timeSinceLastHeartbeat > this.heartbeatTimeout && device.status === 'online') {
        logger.warn({ deviceId, timeSinceLastHeartbeat }, 'Device heartbeat timeout');
        this.updateDeviceStatus(deviceId, 'offline');
      }
    }, 30000); // Check every 30 seconds

    this.heartbeatIntervals.set(deviceId, interval);
  }

  private stopHeartbeatMonitor(deviceId: string): void {
    const interval = this.heartbeatIntervals.get(deviceId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(deviceId);
    }
  }

  /**
   * Limpia recursos al cerrar
   */
  dispose(): void {
    for (const deviceId of this.heartbeatIntervals.keys()) {
      this.stopHeartbeatMonitor(deviceId);
    }
    this.devices.clear();
    this.removeAllListeners();
    logger.info('DeviceManager disposed');
  }
}

// Singleton export
export const deviceManager = new DeviceManager();
