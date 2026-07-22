#!/usr/bin/env npx tsx
/**
 * Drive the AutomationWebView wrapper app on a real iPhone using auto-mat-ion's
 * IOSController. This is the "both projects working together" demo:
 *
 *   - Wrapper app:  auto-mat-ion-webview (built via Xcode, signed)
 *   - Orchestrator: auto-mat-ion (this repo, IOSController)
 *
 * Defaults match the iPhone + signed build that already passed
 * tests/e2e/test-webview-wrapper.mjs. Override anything via env vars.
 *
 * Usage:
 *   npm run demo:iphone-webview
 *   URL=https://news.ycombinator.com npm run demo:iphone-webview
 *   DEVICE_UDID=... WRAPPER_APP_PATH=/path/to/AutomationWebView.app npm run demo:iphone-webview
 */

import { mkdirSync } from 'fs';
import { join } from 'path';
import { createIOSController, startAppiumServer } from '../../src/execution/index.js';

const DEVICE_UDID = process.env.DEVICE_UDID || '00008140-000914AA1A83801C';
const WRAPPER_APP_PATH =
  process.env.WRAPPER_APP_PATH ||
  '/Users/unknown1/Library/Developer/Xcode/DerivedData/AutomationWebView-cbhraxxkvicecrgimyaqpjewmcfo/Build/Products/Debug-iphoneos/AutomationWebView.app';
const URL = process.env.URL || 'https://example.com';
const APPIUM_PORT = Number(process.env.APPIUM_PORT || 4723);
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || join(process.cwd(), 'data', 'screenshots');

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function appiumReachable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  log(`Device UDID:   ${DEVICE_UDID}`);
  log(`Wrapper .app:  ${WRAPPER_APP_PATH}`);
  log(`Target URL:    ${URL}`);

  if (!(await appiumReachable(APPIUM_PORT))) {
    log(`Appium not running on :${APPIUM_PORT} — starting...`);
    await startAppiumServer(APPIUM_PORT);
    log('Appium up.');
  } else {
    log(`Appium already running on :${APPIUM_PORT}.`);
  }

  const controller = createIOSController(DEVICE_UDID, {
    appiumUrl: `http://127.0.0.1:${APPIUM_PORT}`,
    useWrapperApp: true,
    wrapperAppPath: WRAPPER_APP_PATH,
  });

  log('Initializing controller...');
  await controller.initialize();

  log('Connecting (auto-installs wrapper app, opens Appium session)...');
  await controller.connect();

  log(`Navigating to ${URL}...`);
  await controller.navigateTo(URL);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const shotPath = join(SCREENSHOT_DIR, `iphone-webview-${Date.now()}.png`);
  log(`Saving screenshot → ${shotPath}`);
  await controller.takeScreenshot(shotPath);

  log('Disconnecting...');
  await controller.disconnect();
  log('Done.');
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
