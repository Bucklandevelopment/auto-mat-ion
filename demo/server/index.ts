#!/usr/bin/env npx tsx
/**
 * auto-mat-ion Demo Server
 *
 * Servidor web local que:
 * 1. Sirve páginas de demo para testing de sensores
 * 2. Ejecuta post-hooks tras iniciar (enumeración de dispositivos, adb reverse)
 * 3. Proporciona API para configuración dinámica de tests
 * 4. Soporta HTTPS para APIs que requieren contexto seguro (getUserMedia, etc.)
 *
 * Usage:
 *   npx tsx demo/server/index.ts
 *   npx tsx demo/server/index.ts --port 8080 --https
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { networkInterfaces, hostname } from 'os';
import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

interface ServerConfig {
  port: number;
  https: boolean;
  autoEnumerate: boolean;
  adbReverse: boolean;
  openBrowser: boolean;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: parseInt(process.env.PORT || '8891'),
  https: false,
  autoEnumerate: true,
  adbReverse: true,
  openBrowser: false,
};

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Results directory
const RESULTS_DIR = join(import.meta.dirname, '..', '..', 'data', 'results');

// Ensure results directory exists
function ensureResultsDir(): void {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }
}

// Test result structure
interface TestResult {
  id: string;
  testName: string;
  deviceId: string;
  deviceName: string;
  timestamp: string;
  type: 'image' | 'video' | 'log' | 'json';
  filename: string;
  size: number;
  metadata?: Record<string, unknown>;
}

// Results index (in-memory, persisted to disk)
let resultsIndex: TestResult[] = [];
const RESULTS_INDEX_FILE = join(RESULTS_DIR, 'index.json');

function loadResultsIndex(): void {
  ensureResultsDir();
  if (existsSync(RESULTS_INDEX_FILE)) {
    try {
      resultsIndex = JSON.parse(readFileSync(RESULTS_INDEX_FILE, 'utf-8'));
    } catch {
      resultsIndex = [];
    }
  }
}

function saveResultsIndex(): void {
  ensureResultsDir();
  writeFileSync(RESULTS_INDEX_FILE, JSON.stringify(resultsIndex, null, 2));
}

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================================================
// Network Utilities
// ============================================================================

function getLocalIPs(): string[] {
  const interfaces = networkInterfaces();
  const ips: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

// ============================================================================
// Device Enumeration
// ============================================================================

interface DeviceInfo {
  serial: string;
  type: 'emulator' | 'usb' | 'wifi';
  state: string;
  model?: string;
  sdk?: string;
}

async function enumerateDevices(): Promise<DeviceInfo[]> {
  const devices: DeviceInfo[] = [];

  try {
    const output = execSync('adb devices -l', { encoding: 'utf-8' });
    const lines = output.split('\n').slice(1); // Skip header

    for (const line of lines) {
      if (!line.trim()) continue;

      const match = line.match(/^(\S+)\s+(\w+)\s*(.*)$/);
      if (match) {
        const [, serial, state, extra] = match;

        const device: DeviceInfo = {
          serial,
          state,
          type: serial.startsWith('emulator') ? 'emulator' :
                serial.includes(':') ? 'wifi' : 'usb',
        };

        // Extract model from extra info
        const modelMatch = extra.match(/model:(\S+)/);
        if (modelMatch) device.model = modelMatch[1];

        const productMatch = extra.match(/product:(\S+)/);
        if (productMatch && !device.model) device.model = productMatch[1];

        // Get SDK version
        if (state === 'device') {
          try {
            device.sdk = execSync(
              `adb -s ${serial} shell getprop ro.build.version.sdk`,
              { encoding: 'utf-8' }
            ).trim();
          } catch {
            // Ignore
          }
        }

        devices.push(device);
      }
    }
  } catch (error) {
    log(`Warning: Could not enumerate devices: ${error}`, 'yellow');
  }

  return devices;
}

// ============================================================================
// ADB Reverse Setup
// ============================================================================

async function setupAdbReverse(port: number): Promise<void> {
  const devices = await enumerateDevices();
  const activeDevices = devices.filter(d => d.state === 'device');

  if (activeDevices.length === 0) {
    log('No active devices for adb reverse', 'yellow');
    return;
  }

  log(`\n📡 Setting up adb reverse for ${activeDevices.length} device(s)...`, 'cyan');

  for (const device of activeDevices) {
    try {
      execSync(`adb -s ${device.serial} reverse tcp:${port} tcp:${port}`, {
        encoding: 'utf-8',
      });
      log(`  ✓ ${device.serial} → localhost:${port}`, 'green');
    } catch (error) {
      log(`  ✗ ${device.serial}: Failed to setup reverse`, 'red');
    }
  }
}

// ============================================================================
// Request Handler
// ============================================================================

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;
  const timestamp = new Date().toISOString().substr(11, 12);

  // Log all requests with query string
  const clientIP = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
  const queryString = url.search || '';

  // Highlight autorun requests
  if (queryString.includes('ping=testrunner')) {
    console.log('');
    log(`╔══════════════════════════════════════════════════════════╗`, 'yellow');
    log(`║  📡 TESTRUNNER PING RECEIVED                             ║`, 'yellow');
    log(`╠══════════════════════════════════════════════════════════╣`, 'yellow');
    log(`║  autorun: ${(url.searchParams.get('autorun') || 'null').padEnd(44)}║`, 'yellow');
    log(`║  action:  ${(url.searchParams.get('action') || 'null').padEnd(44)}║`, 'yellow');
    log(`║  from:    ${clientIP.padEnd(44)}║`, 'yellow');
    log(`╚══════════════════════════════════════════════════════════╝`, 'yellow');
    console.log('');
  } else if (queryString.includes('autorun')) {
    log(`[${timestamp}] 🚀 ${req.method} ${pathname}${queryString} ← ${clientIP}`, 'cyan');
  } else {
    log(`[${timestamp}] ${req.method} ${pathname}${queryString} ← ${clientIP}`, 'dim');
  }

  // API endpoints
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname);
    return;
  }

  // Static files
  if (pathname === '/') pathname = '/index.html';

  const demoDir = join(import.meta.dirname, '..');
  const pagesDir = join(demoDir, 'pages');
  const libDir = join(demoDir, 'lib');

  // Determine which directory to serve from
  let filePath: string;
  let baseDir: string;

  if (pathname.startsWith('/lib/')) {
    // Serve from demo/lib/
    baseDir = libDir;
    filePath = join(libDir, pathname.replace('/lib/', ''));
  } else {
    // Serve from demo/pages/
    baseDir = pagesDir;
    filePath = join(pagesDir, pathname);
  }

  // Security: prevent directory traversal
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    log(`   ⚠️ 404: ${filePath}`, 'yellow');
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
      // Allow cross-origin for testing
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<void> {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id, X-Device-Name, X-Test-Name');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Results upload endpoint
  if (pathname === '/api/results/upload' && req.method === 'POST') {
    await handleResultUpload(req, res);
    return;
  }

  // Results list endpoint
  if (pathname === '/api/results' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({
      results: resultsIndex,
      total: resultsIndex.length,
      directory: RESULTS_DIR,
    }));
    return;
  }

  // Results by device
  if (pathname.startsWith('/api/results/device/') && req.method === 'GET') {
    const deviceId = pathname.split('/').pop();
    const deviceResults = resultsIndex.filter(r => r.deviceId === deviceId);
    res.writeHead(200);
    res.end(JSON.stringify({ results: deviceResults, total: deviceResults.length }));
    return;
  }

  // Results by test
  if (pathname.startsWith('/api/results/test/') && req.method === 'GET') {
    const testName = decodeURIComponent(pathname.split('/').pop() || '');
    const testResults = resultsIndex.filter(r => r.testName === testName);
    res.writeHead(200);
    res.end(JSON.stringify({ results: testResults, total: testResults.length }));
    return;
  }

  // Get specific result file
  if (pathname.startsWith('/api/results/file/') && req.method === 'GET') {
    const resultId = pathname.split('/').pop();
    const result = resultsIndex.find(r => r.id === resultId);

    if (!result) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Result not found' }));
      return;
    }

    const filePath = join(RESULTS_DIR, result.filename);
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'File not found' }));
      return;
    }

    const content = readFileSync(filePath);
    const mimeType = result.type === 'image' ? 'image/png' :
                     result.type === 'video' ? 'video/webm' :
                     result.type === 'json' ? 'application/json' : 'text/plain';

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
    return;
  }

  // Clear all results
  if (pathname === '/api/results/clear' && req.method === 'DELETE') {
    resultsIndex = [];
    saveResultsIndex();
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'Results cleared', total: 0 }));
    return;
  }

  // Latest results summary
  if (pathname === '/api/results/latest' && req.method === 'GET') {
    const latest = resultsIndex.slice(-10).reverse();
    res.writeHead(200);
    res.end(JSON.stringify({ results: latest, total: latest.length }));
    return;
  }

  switch (pathname) {
    case '/api/devices':
      const devices = await enumerateDevices();
      res.writeHead(200);
      res.end(JSON.stringify({ devices }));
      break;

    case '/api/health':
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        resultsCount: resultsIndex.length,
      }));
      break;

    case '/api/network':
      res.writeHead(200);
      res.end(JSON.stringify({
        ips: getLocalIPs(),
        port: parseInt(process.env.PORT || '8891'),
      }));
      break;

    default:
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// Handle file upload for test results
async function handleResultUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const deviceId = req.headers['x-device-id'] as string || `host_${hostname()}`;
  const deviceName = req.headers['x-device-name'] as string || hostname();
  const testName = req.headers['x-test-name'] as string || 'unknown-test';
  const contentType = req.headers['content-type'] || '';

  // Collect body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);

  // Determine file type
  let type: TestResult['type'] = 'log';
  let ext = '.txt';

  if (contentType.includes('image/png')) {
    type = 'image';
    ext = '.png';
  } else if (contentType.includes('image/jpeg')) {
    type = 'image';
    ext = '.jpg';
  } else if (contentType.includes('video/webm')) {
    type = 'video';
    ext = '.webm';
  } else if (contentType.includes('video/mp4')) {
    type = 'video';
    ext = '.mp4';
  } else if (contentType.includes('application/json')) {
    type = 'json';
    ext = '.json';
  }

  // Generate unique filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = randomUUID().slice(0, 8);
  const safeTestName = testName.replace(/[^a-zA-Z0-9-_]/g, '_');
  const safeDeviceId = deviceId.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${safeTestName}_${safeDeviceId}_${timestamp}_${id}${ext}`;

  // Save file
  ensureResultsDir();
  const filePath = join(RESULTS_DIR, filename);
  writeFileSync(filePath, body);

  // Create result entry
  const result: TestResult = {
    id,
    testName,
    deviceId,
    deviceName,
    timestamp: new Date().toISOString(),
    type,
    filename,
    size: body.length,
    metadata: {
      contentType,
      userAgent: req.headers['user-agent'],
    },
  };

  // Add to index and save
  resultsIndex.push(result);
  saveResultsIndex();

  // Prominent logging for uploads
  console.log('');
  log(`╔════════════════════════════════════════════════════════╗`, 'green');
  log(`║  📥 TEST RESULT RECEIVED                               ║`, 'green');
  log(`╠════════════════════════════════════════════════════════╣`, 'green');
  log(`║  Type:   ${type.padEnd(46)}║`, 'green');
  log(`║  Device: ${deviceName.slice(0, 46).padEnd(46)}║`, 'green');
  log(`║  Test:   ${testName.slice(0, 46).padEnd(46)}║`, 'green');
  log(`║  Size:   ${((body.length / 1024).toFixed(1) + ' KB').padEnd(46)}║`, 'green');
  log(`║  File:   ${filename.slice(0, 46).padEnd(46)}║`, 'green');
  log(`╚════════════════════════════════════════════════════════╝`, 'green');
  console.log('');

  res.writeHead(200);
  res.end(JSON.stringify({
    success: true,
    result,
    url: `/api/results/file/${id}`,
  }));
}

// ============================================================================
// Post-Hooks
// ============================================================================

interface PostHook {
  name: string;
  execute: (config: ServerConfig) => Promise<void>;
}

const postHooks: PostHook[] = [
  {
    name: 'Device Enumeration',
    execute: async (config) => {
      if (!config.autoEnumerate) return;

      log('\n📱 Enumerating connected devices...', 'cyan');
      const devices = await enumerateDevices();

      if (devices.length === 0) {
        log('  No devices found', 'yellow');
        log('  Run: adb devices', 'dim');
        return;
      }

      for (const device of devices) {
        const status = device.state === 'device' ? '✓' : '○';
        const color = device.state === 'device' ? 'green' : 'yellow';
        log(`  ${status} ${device.serial} [${device.type}] ${device.model || ''} SDK ${device.sdk || '?'}`, color);
      }
    },
  },
  {
    name: 'ADB Reverse',
    execute: async (config) => {
      if (!config.adbReverse) return;
      await setupAdbReverse(config.port);
    },
  },
];

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const config: ServerConfig = { ...DEFAULT_CONFIG };

  // Load results index
  loadResultsIndex();
  log(`📂 Results loaded: ${resultsIndex.length} previous result(s)`, 'dim');

  // Parse args
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        config.port = parseInt(args[++i]) || DEFAULT_CONFIG.port;
        break;
      case '--https':
        config.https = true;
        break;
      case '--no-enumerate':
        config.autoEnumerate = false;
        break;
      case '--no-adb-reverse':
        config.adbReverse = false;
        break;
      case '--open':
        config.openBrowser = true;
        break;
    }
  }

  log('\n═══════════════════════════════════════════════════', 'bright');
  log('        auto-mat-ion Demo Server', 'bright');
  log('═══════════════════════════════════════════════════\n', 'bright');

  // Create server
  const server = config.https
    ? createHttpsServer({
        // Self-signed cert for local dev (generate with openssl)
        key: existsSync('./certs/key.pem') ? readFileSync('./certs/key.pem') : undefined,
        cert: existsSync('./certs/cert.pem') ? readFileSync('./certs/cert.pem') : undefined,
      }, handleRequest)
    : createServer(handleRequest);

  // Start server
  server.listen(config.port, '0.0.0.0', async () => {
    const protocol = config.https ? 'https' : 'http';
    const localIPs = getLocalIPs();

    log('🚀 Server started!', 'green');
    log(`\n   Local:    ${protocol}://localhost:${config.port}`, 'cyan');

    for (const ip of localIPs) {
      log(`   Network:  ${protocol}://${ip}:${config.port}`, 'cyan');
    }

    log(`\n   API:      ${protocol}://localhost:${config.port}/api/devices`, 'dim');
    log(`   Health:   ${protocol}://localhost:${config.port}/api/health`, 'dim');
    log(`   Results:  ${protocol}://localhost:${config.port}/api/results`, 'dim');
    log(`   Upload:   POST ${protocol}://localhost:${config.port}/api/results/upload`, 'dim');

    // Run post-hooks
    for (const hook of postHooks) {
      try {
        await hook.execute(config);
      } catch (error) {
        log(`Post-hook "${hook.name}" failed: ${error}`, 'red');
      }
    }

    log('\n═══════════════════════════════════════════════════', 'bright');
    log('  Press Ctrl+C to stop the MADAFUCKING server', 'dim');
    log('═══════════════════════════════════════════════════\n', 'bright');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('\n\nShutting down...', 'yellow');
    server.close(() => {
      log('Server stopped.', 'green');
      process.exit(0);
    });
  });
}

main().catch(console.error);
