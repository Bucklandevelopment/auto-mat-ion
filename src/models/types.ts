import { z } from 'zod';

// ============================================
// DEVICE TYPES
// ============================================

export const DeviceTypeEnum = z.enum([
  'android_phone',
  'android_tablet',
  'estacion_semilla_v1',
  'estacion_semilla_v2',
  'custom_iot',
]);
export type DeviceType = z.infer<typeof DeviceTypeEnum>;

export const ConnectionTypeEnum = z.enum(['usb', 'wifi', 'adb_wireless', 'lora', 'bluetooth']);
export type ConnectionType = z.infer<typeof ConnectionTypeEnum>;

export const DeviceStatusEnum = z.enum(['online', 'offline', 'busy', 'error', 'maintenance']);
export type DeviceStatus = z.infer<typeof DeviceStatusEnum>;

export const DeviceSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  type: DeviceTypeEnum,
  name: z.string().optional(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  osVersion: z.string().optional(),
  sensors: z.array(z.string()).default([]),
  connectionType: ConnectionTypeEnum,
  status: DeviceStatusEnum,
  lastHeartbeat: z.date(),
  regionCode: z.string().optional(), // ISO 3166-2 (ES-AN, ES-CT, etc.)
  eudiPseudonym: z.string().optional(),
  totalPoints: z.number().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Device = z.infer<typeof DeviceSchema>;

// ============================================
// TEST TYPES
// ============================================

export const TestStatusEnum = z.enum([
  'queued',
  'assigned',
  'running',
  'completed',
  'failed',
  'timeout',
  'cancelled',
]);
export type TestStatus = z.infer<typeof TestStatusEnum>;

export const TestTypeEnum = z.enum([
  'unit',
  'integration',
  'e2e',
  'performance',
  'sensor_reading',
  'app_testing',
  'custom',
]);
export type TestType = z.infer<typeof TestTypeEnum>;

export const TestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: TestTypeEnum,
  name: z.string(),
  description: z.string().optional(),
  script: z.string().optional(), // Script o comando a ejecutar
  config: z.record(z.unknown()).default({}),
  requirements: z.object({
    deviceTypes: z.array(DeviceTypeEnum).optional(),
    sensors: z.array(z.string()).optional(),
    minDevices: z.number().default(1),
    maxDevices: z.number().optional(),
    regions: z.array(z.string()).optional(),
  }),
  status: TestStatusEnum,
  priority: z.number().default(0),
  timeout: z.number().default(300000), // 5 min default
  retries: z.number().default(0),
  maxRetries: z.number().default(3),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Test = z.infer<typeof TestSchema>;

// ============================================
// RESULT TYPES
// ============================================

export const ResultStatusEnum = z.enum(['pending', 'validated', 'rejected', 'anomaly']);
export type ResultStatus = z.infer<typeof ResultStatusEnum>;

export const TestResultSchema = z.object({
  id: z.string(),
  testId: z.string(),
  deviceId: z.string(),
  status: ResultStatusEnum,
  output: z.unknown(),
  metrics: z
    .object({
      duration: z.number().optional(),
      memoryUsage: z.number().optional(),
      cpuUsage: z.number().optional(),
      batteryDrain: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
  validation: z
    .object({
      consensusDevices: z.number(),
      confidence: z.number(),
      anomalyDetected: z.boolean(),
    })
    .optional(),
  pointsAwarded: z.number().default(0),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  createdAt: z.date(),
});
export type TestResult = z.infer<typeof TestResultSchema>;

// ============================================
// PROJECT TYPES
// ============================================

export const ProjectStatusEnum = z.enum(['draft', 'active', 'paused', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusEnum>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  founderId: z.string(),
  status: ProjectStatusEnum,
  requirements: z.object({
    sensors: z.array(z.string()).optional(),
    minDevices: z.number().default(10),
    regions: z.array(z.string()).optional(),
    duration: z.string().optional(), // ISO 8601 duration
  }),
  stats: z.object({
    totalDevices: z.number().default(0),
    totalTests: z.number().default(0),
    completedTests: z.number().default(0),
    totalPoints: z.number().default(0),
  }),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Project = z.infer<typeof ProjectSchema>;

// ============================================
// CONTRIBUTION TYPES
// ============================================

export const ContributionTypeEnum = z.enum([
  'test_execution',
  'device_uptime',
  'bug_report',
  'unique_device',
  'sensor_calibration',
  'data_validation',
]);
export type ContributionType = z.infer<typeof ContributionTypeEnum>;

export const ContributionSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  projectId: z.string().optional(),
  type: ContributionTypeEnum,
  points: z.number(),
  metadata: z.record(z.unknown()).default({}),
  eudiCredentialIssued: z.boolean().default(false),
  createdAt: z.date(),
});
export type Contribution = z.infer<typeof ContributionSchema>;

// ============================================
// EVENT TYPES (para vital-core)
// ============================================

export const VitalEventCategoryEnum = z.enum([
  'testing', 'devices', 'gamification', 'system',
]);
export type VitalEventCategory = z.infer<typeof VitalEventCategoryEnum>;

export const VitalEventSchema = z.object({
  eventId: z.string(),
  correlationId: z.string().optional(),
  timestamp: z.date(),
  category: VitalEventCategoryEnum,
  subcategory: z.string().optional(),
  source: z.string(),
  action: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
});
export type VitalEvent = z.infer<typeof VitalEventSchema>;

// ============================================
// API TYPES
// ============================================

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  });

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
