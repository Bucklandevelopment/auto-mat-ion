import { createHash, randomBytes } from 'crypto';
import config from '../config/index.js';

/**
 * Crea un fingerprint único para un dispositivo
 * basado en sus características de hardware
 */
export async function createFingerprint(rawData: string): Promise<string> {
  const saltedData = `${config.DEVICE_FINGERPRINT_SALT}:${rawData}`;
  return createHash('sha256').update(saltedData).digest('hex');
}

/**
 * Verifica si un fingerprint coincide con los datos raw
 */
export async function verifyFingerprint(rawData: string, fingerprint: string): Promise<boolean> {
  const computed = await createFingerprint(rawData);
  return computed === fingerprint;
}

/**
 * Genera un token seguro
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash de datos sensibles
 */
export function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Genera un ID de correlación para eventos
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${randomBytes(8).toString('hex')}`;
}
