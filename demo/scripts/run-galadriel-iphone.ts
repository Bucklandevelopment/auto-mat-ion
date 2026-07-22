#!/usr/bin/env npx tsx
/**
 * Drive the sauron demo (with Galadriel preset enabled) on a real iPhone via
 * the AutomationWebView wrapper. The demo is authoritative: it runs the
 * production preset, records the clip, uploads to the sauron demo server, and
 * exposes the result on `window.__sauronTestComplete`.
 *
 * Prerequisites:
 *   - sauron demo server running on the Mac (`cd ~/.../sauron && npm run start`)
 *   - sauron self-signed cert trusted on the iPhone (or wrapper allows arbitrary loads)
 *   - iPhone connected via USB, AutomationWebView signed build available
 *
 * Usage:
 *   npm run demo:galadriel-iphone
 *   PRESET=standard CAPTURE_LABEL=sintetico npm run demo:galadriel-iphone
 *   SAURON_HOST=192.168.1.42 SAURON_PORT=3000 npm run demo:galadriel-iphone
 */

import { networkInterfaces } from 'os';
import { createIOSController, startAppiumServer } from '../../src/execution/index.js';

const DEVICE_UDID = process.env.DEVICE_UDID || '00008140-000914AA1A83801C';
const WRAPPER_APP_PATH =
  process.env.WRAPPER_APP_PATH ||
  '/Users/unknown1/Library/Developer/Xcode/DerivedData/AutomationWebView-cbhraxxkvicecrgimyaqpjewmcfo/Build/Products/Debug-iphoneos/AutomationWebView.app';
const APPIUM_PORT = Number(process.env.APPIUM_PORT || 4723);

const PRESET = (process.env.PRESET || 'minimal') as 'minimal' | 'standard';
const CAMERA_INDEX = Number(process.env.CAMERA_INDEX || 0);
const CAPTURE_LABEL = process.env.CAPTURE_LABEL || 'real';
const TEST_ID = process.env.TEST_ID || `iphone-${PRESET}-${CAPTURE_LABEL}-${Date.now()}`;

const SAURON_PORT = Number(process.env.SAURON_PORT || 3000);
const SAURON_HOST = process.env.SAURON_HOST || detectLanIp();
const SAURON_SCHEME = process.env.SAURON_SCHEME || 'https';

const POLL_INTERVAL_MS = 1000;
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 90_000);

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function detectLanIp(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  throw new Error('Could not detect LAN IPv4 — set SAURON_HOST explicitly.');
}

async function appiumReachable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function sauronReachable(host: string, port: number, scheme: string): Promise<boolean> {
  try {
    // Self-signed certs on https — Node fetch will reject. Use http probe instead.
    const probeScheme = scheme === 'https' ? 'http' : scheme;
    const probePort = scheme === 'https' ? port + 1 : port;
    const res = await fetch(`${probeScheme}://${host}:${probePort}/api/recordings`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok || res.status < 500;
  } catch {
    return true; // Skip the probe — let the iPhone be the truth source
  }
}

async function main(): Promise<void> {
  const url = `${SAURON_SCHEME}://${SAURON_HOST}:${SAURON_PORT}/?galadrielPreset=${PRESET}&autoStart=true&testId=${encodeURIComponent(TEST_ID)}&cameraIndex=${CAMERA_INDEX}`;

  log(`Test ID:     ${TEST_ID}`);
  log(`Preset:      ${PRESET}`);
  log(`Label (GT):  ${CAPTURE_LABEL}`);
  log(`Sauron URL:  ${url}`);
  log(`Device:      ${DEVICE_UDID}`);

  await sauronReachable(SAURON_HOST, SAURON_PORT, SAURON_SCHEME);

  if (!(await appiumReachable(APPIUM_PORT))) {
    log(`Appium not running on :${APPIUM_PORT} — starting...`);
    await startAppiumServer(APPIUM_PORT);
    log('Appium up.');
  }

  const controller = createIOSController(DEVICE_UDID, {
    appiumUrl: `http://127.0.0.1:${APPIUM_PORT}`,
    useWrapperApp: true,
    wrapperAppPath: WRAPPER_APP_PATH,
  });

  log('Initializing controller...');
  await controller.initialize();

  log('Connecting (auto-installs wrapper, opens Appium session)...');
  await controller.connect();

  log(`Navigating to sauron demo with Galadriel ${PRESET}...`);
  await controller.navigateTo(url);

  log('Polling window.__sauronTestComplete...');
  const startedAt = Date.now();
  let result: any = null;
  let lastProgress = '';

  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    try {
      result = await controller.executeScript<unknown>(
        'window.__sauronTestComplete',
      );
      if (result && typeof result === 'object') break;

      const cams = await controller.executeScript<number | null>(
        'window.__sauronCameraCount || null',
      );
      const progress = `cameras=${cams ?? '?'}`;
      if (progress !== lastProgress) {
        log(`  ${progress}, elapsed=${Math.round((Date.now() - startedAt) / 1000)}s`);
        lastProgress = progress;
      }
    } catch (err) {
      log(`  poll error (transient?): ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!result) {
    log(`TIMEOUT after ${TEST_TIMEOUT_MS}ms — no __sauronTestComplete signal.`);
    await controller.disconnect();
    process.exit(2);
  }

  if (result.error) {
    log(`Test reported error: ${result.error}`);
    await controller.disconnect();
    process.exit(3);
  }

  log('Test complete. Summary:');
  console.log(JSON.stringify(
    {
      testId: result.testId,
      browser: result.browser,
      success: result.success,
      constraintChanges: Array.isArray(result.constraintChanges) ? result.constraintChanges.length : null,
      jitterAnalysis: result.jitterAnalysis ? {
        stdDeviationMs: result.jitterAnalysis.stdDeviationMs,
        coefficientOfVariation: result.jitterAnalysis.coefficientOfVariation,
        autocorrLag1: result.jitterAnalysis.autocorrLag1,
      } : null,
      catStats: result.catStats,
      pcr: result.pcr,
    },
    null,
    2,
  ));

  log(`Video + sidecar uploaded by demo to sauron's recordings/.`);
  log(`Run \`cd <sauron> && npm run analyze\` to feed the training pipeline.`);

  log('Disconnecting...');
  await controller.disconnect();
  log('Done.');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
