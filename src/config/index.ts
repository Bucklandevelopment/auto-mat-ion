import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(9090),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().default('postgresql://vital:vital_password@localhost:5432/vital_core'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379/0'),

  // vital-core integration
  VITAL_CORE_URL: z.string().default('http://localhost:8888'),
  VITAL_CORE_ENABLED: z.coerce.boolean().default(true),

  // ADB
  ADB_HOST: z.string().default('localhost'),
  ADB_PORT: z.coerce.number().default(5037),

  // Antifraude
  CONSENSUS_MIN_DEVICES: z.coerce.number().default(3),
  ANOMALY_DETECTION_THRESHOLD: z.coerce.number().default(0.85),
  DEVICE_FINGERPRINT_SALT: z.string().default('change-me-in-production'),

  // EUDI (opcional)
  EUDI_SANDBOX_URL: z.string().optional(),
  EUDI_CLIENT_ID: z.string().optional(),
  EUDI_ENABLED: z.coerce.boolean().default(false),

  // Puntos
  POINTS_TEST_BASIC: z.coerce.number().default(1),
  POINTS_TEST_SUITE: z.coerce.number().default(10),
  POINTS_DEVICE_24H: z.coerce.number().default(50),
  POINTS_BUG_FOUND: z.coerce.number().default(100),
  POINTS_UNIQUE_DEVICE: z.coerce.number().default(200),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid configuration:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

export default config;
