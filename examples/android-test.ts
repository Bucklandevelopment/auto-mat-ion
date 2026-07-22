#!/usr/bin/env npx tsx
/**
 * Example: Android Emulator Test
 *
 * This script demonstrates how to use auto-mat-ion to:
 * 1. List connected Android devices
 * 2. Connect to an emulator
 * 3. Launch Chrome and navigate to a URL
 * 4. Execute a simple test
 * 5. Report results
 *
 * Prerequisites:
 * - Android emulator running (or physical device connected via ADB)
 * - ADB installed and in PATH
 *
 * Usage:
 *   npx tsx examples/android-test.ts
 *   npx tsx examples/android-test.ts emulator-5554 https://example.com
 */

import {
  listAndroidDevices,
  AndroidController,
  createExecutionLogger,
  type ITestExecutor,
  type ITestConfig,
} from '../src/execution/index.js';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================================================
// Simple Test Executor
// ============================================================================

const simpleTestExecutor: ITestExecutor = {
  name: 'SimplePageTest',

  async setup(controller, config) {
    log(`[Setup] Navigating to ${config.testUrl}...`, 'cyan');
    await controller.navigateTo(config.testUrl);
  },

  async execute(controller, config) {
    log('[Execute] Running page checks...', 'cyan');

    // Wait for page to load
    const pageLoaded = await controller.waitForElement('body', 10000);
    if (!pageLoaded) {
      return {
        verdict: 'fail',
        confidence: 1.0,
        data: { error: 'Page body not found' },
      };
    }

    // Get page title
    const title = await controller.executeScript<string>('document.title');
    log(`[Execute] Page title: ${title}`, 'green');

    // Get URL
    const url = await controller.executeScript<string>('window.location.href');
    log(`[Execute] Current URL: ${url}`, 'green');

    // Check for console errors
    const logs = await controller.getConsoleLogs();
    const errors = logs.filter((l) => l.includes('[error]'));

    if (errors.length > 0) {
      log(`[Execute] Found ${errors.length} console errors`, 'yellow');
    }

    return {
      verdict: errors.length === 0 ? 'pass' : 'warning',
      confidence: 0.95,
      data: {
        title,
        url,
        consoleErrorCount: errors.length,
      },
    };
  },

  async teardown(controller, config) {
    log('[Teardown] Taking screenshot...', 'cyan');
    try {
      await controller.takeScreenshot('./test-screenshot.png');
      log('[Teardown] Screenshot saved: ./test-screenshot.png', 'green');
    } catch (e) {
      log('[Teardown] Failed to take screenshot', 'yellow');
    }
  },
};

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let deviceId = args[0];
  const testUrl = args[1] || 'https://example.com';

  log('\n═══════════════════════════════════════════════════', 'bright');
  log('          auto-mat-ion Android Test Example', 'bright');
  log('═══════════════════════════════════════════════════\n', 'bright');

  // Step 1: List devices
  log('Step 1: Discovering devices...', 'cyan');
  const devices = await listAndroidDevices();

  if (devices.length === 0) {
    log('No Android devices found!', 'red');
    log('\nMake sure:', 'yellow');
    log('  - ADB is installed: adb version', 'yellow');
    log('  - Emulator is running: adb devices', 'yellow');
    log('  - USB debugging enabled (for physical devices)', 'yellow');
    process.exit(1);
  }

  log(`Found ${devices.length} device(s):`, 'green');
  for (const device of devices) {
    log(`  - ${device.serial} (${device.state})`, 'reset');
  }

  // Select device
  if (!deviceId) {
    deviceId = devices[0].serial;
    log(`\nUsing first device: ${deviceId}`, 'cyan');
  }

  const targetDevice = devices.find((d) => d.serial === deviceId);
  if (!targetDevice) {
    log(`Device not found: ${deviceId}`, 'red');
    process.exit(1);
  }

  // Step 2: Initialize controller
  log('\nStep 2: Initializing controller...', 'cyan');
  const controller = new AndroidController(deviceId);

  try {
    await controller.initialize();
    log('Controller initialized', 'green');

    // Get device info
    const deviceInfo = await controller.getDeviceInfo();
    log(`Device: ${deviceInfo.name}`, 'reset');
    log(`Platform: ${deviceInfo.platform}`, 'reset');
    log(`OS Version: ${deviceInfo.osVersion}`, 'reset');
    log(`Cameras: ${deviceInfo.cameras.length}`, 'reset');

    // Step 3: Launch browser
    log('\nStep 3: Launching Chrome...', 'cyan');
    await controller.launchBrowser('chrome', {
      grantCameraPermission: true,
    });
    log('Chrome launched', 'green');

    // Step 4: Run test
    log('\nStep 4: Running test...', 'cyan');
    log(`Test URL: ${testUrl}`, 'reset');

    const testConfig: ITestConfig = {
      id: `test_${Date.now()}`,
      device: deviceInfo,
      browser: 'chrome',
      camera: deviceInfo.cameras[0],
      testUrl,
      orientation: 'portrait',
      parameters: {},
      repetition: 1,
      scripts: {
        pageLoad: 'return document.readyState === "complete"',
      },
    };

    // Setup
    if (simpleTestExecutor.setup) {
      await simpleTestExecutor.setup(controller, testConfig);
    }

    // Execute
    const result = await simpleTestExecutor.execute(controller, testConfig);

    // Teardown
    if (simpleTestExecutor.teardown) {
      await simpleTestExecutor.teardown(controller, testConfig);
    }

    // Step 5: Report results
    log('\n═══════════════════════════════════════════════════', 'bright');
    log('                    TEST RESULTS', 'bright');
    log('═══════════════════════════════════════════════════\n', 'bright');

    const verdictColor = result.verdict === 'pass' ? 'green' : result.verdict === 'fail' ? 'red' : 'yellow';
    log(`Verdict: ${result.verdict!.toUpperCase()}`, verdictColor);
    log(`Confidence: ${((result.confidence || 0) * 100).toFixed(0)}%`, 'reset');

    if (result.data) {
      log('\nData:', 'cyan');
      for (const [key, value] of Object.entries(result.data)) {
        log(`  ${key}: ${value}`, 'reset');
      }
    }

    log('\n✓ Test completed successfully!', 'green');

  } catch (error) {
    log(`\n✗ Test failed: ${error}`, 'red');
    process.exit(1);

  } finally {
    // Cleanup
    log('\nCleaning up...', 'cyan');
    await controller.cleanup();
    log('Done.', 'green');
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
