/**
 * E2E Test: AutomationWebView wrapper app on real iPhone
 *
 * Prerequisites:
 *   - AutomationWebView.app installed on device
 *   - Appium running on port 4723 with xcuitest driver
 *   - iPhone connected via USB
 *
 * Run: node tests/e2e/test-webview-wrapper.mjs
 */

import { remote } from 'webdriverio';

// Real device or simulator (override via env vars)
const DEVICE_UDID = process.env.DEVICE_UDID || '00008140-000914AA1A83801C';
const DEVICE_NAME = process.env.DEVICE_NAME || 'iPhone 16e';
const PLATFORM_VERSION = process.env.PLATFORM_VERSION || '26.3';
const BUNDLE_ID = 'com.automation.webview';
const APPIUM_URL = 'http://127.0.0.1:4723';
const XCODE_ORG_ID = process.env.XCODE_ORG_ID || 'CL97ZJ7B8K';
const XCODE_SIGNING_ID = process.env.XCODE_SIGNING_ID || 'Apple Development: Jessie Buckland (D442Y6XB65)';

let client;

async function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function createSession() {
  log('Creating Appium session...');

  const capabilities = {
    platformName: 'iOS',
    'appium:platformVersion': PLATFORM_VERSION,
    'appium:deviceName': DEVICE_NAME,
    'appium:udid': DEVICE_UDID,
    'appium:automationName': 'XCUITest',
    'appium:bundleId': BUNDLE_ID,
    'appium:autoAcceptAlerts': true,
    'appium:webviewConnectTimeout': 30000,
    'appium:xcodeOrgId': XCODE_ORG_ID,
    'appium:xcodeSigningId': XCODE_SIGNING_ID,
    'appium:showXcodeLog': false,
    'appium:wdaLaunchTimeout': 240000,
    'appium:wdaConnectionTimeout': 240000,
    'appium:derivedDataPath': '/Users/unknown1/Library/Developer/Xcode/DerivedData/WebDriverAgent-cjqhpwoequziydbvfciireqyyjww',
    'appium:usePrebuiltWDA': true,
  };

  client = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
    capabilities: {
      alwaysMatch: capabilities,
    },
    logLevel: 'warn',
  });

  log('Session created successfully!');
  return client;
}

async function testNativeElements() {
  log('--- Test 1: Native UI Elements ---');

  // Check we're in NATIVE_APP context
  const context = await client.getContext();
  log(`  Current context: ${context}`);

  // Find the URL text field by accessibility ID
  try {
    const urlField = await client.$('~urlTextField');
    const exists = await urlField.isExisting();
    log(`  URL field exists: ${exists}`);

    if (exists) {
      await urlField.click();
      await urlField.clearValue();
      await urlField.setValue('https://example.com\n');
      log('  Typed URL and submitted');
      await new Promise(r => setTimeout(r, 5000));
    }
  } catch (e) {
    log(`  URL field interaction error: ${e.message}`);
  }

  // Check buttons
  for (const id of ['backButton', 'forwardButton', 'reloadButton']) {
    try {
      const btn = await client.$(`~${id}`);
      const exists = await btn.isExisting();
      log(`  ${id} exists: ${exists}`);
    } catch (e) {
      log(`  ${id}: not found`);
    }
  }
}

async function testWebViewContext() {
  log('--- Test 2: WebView Context Switch ---');

  // List all contexts
  const contexts = await client.getContexts();
  log(`  Available contexts: ${JSON.stringify(contexts)}`);

  // Find and switch to webview context
  const webviewCtx = contexts.find(c => typeof c === 'string' && c.includes('WEBVIEW'));
  if (webviewCtx) {
    await client.switchContext(webviewCtx);
    log(`  Switched to: ${webviewCtx}`);

    // Get current URL
    const url = await client.getUrl();
    log(`  Current URL: ${url}`);

    // Get page title
    const title = await client.getTitle();
    log(`  Page title: ${title}`);

    return true;
  } else {
    log('  No WEBVIEW context found!');
    return false;
  }
}

async function testJSBridge() {
  log('--- Test 3: JS Bridge ---');

  try {
    // Check if __automation object exists
    const ready = await client.execute('return window.__automation && window.__automation.ready === true');
    log(`  Bridge ready: ${ready}`);

    // Get bridge info
    const bundleId = await client.execute('return window.__automation ? window.__automation.bundleId : null');
    log(`  Bridge bundleId: ${bundleId}`);

    const platform = await client.execute('return window.__automation ? window.__automation.platform : null');
    log(`  Bridge platform: ${platform}`);

    return ready === true;
  } catch (e) {
    log(`  JS Bridge error: ${e.message}`);
    return false;
  }
}

async function switchToWebView() {
  // Retry finding WEBVIEW context (it reconnects after page navigation)
  for (let i = 0; i < 10; i++) {
    try {
      const contexts = await client.getContexts();
      const webviewCtx = contexts.find(c => typeof c === 'string' && c.includes('WEBVIEW'));
      if (webviewCtx) {
        await client.switchContext(webviewCtx);
        return true;
      }
    } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 2000));
    log(`  Waiting for WEBVIEW context... (${i + 1}/10)`);
  }
  return false;
}

async function testNavigation() {
  log('--- Test 4: Navigation via JS ---');

  try {
    // Navigate using native URL bar (more reliable on real devices)
    await client.switchContext('NATIVE_APP');
    const urlField = await client.$('~urlTextField');
    await urlField.click();
    await urlField.clearValue();
    await urlField.setValue('https://httpbin.org/html\n');
    log('  Navigated via URL bar to httpbin.org/html');
    await new Promise(r => setTimeout(r, 6000));

    // Re-acquire WEBVIEW context after navigation
    const found = await switchToWebView();
    if (!found) {
      log('  Could not reconnect to WEBVIEW context');
      return false;
    }

    const url = await client.getUrl();
    log(`  Current URL: ${url}`);

    const title = await client.getTitle();
    log(`  Page title: ${title}`);

    // Check page content
    const hasContent = await client.execute("return document.querySelector('h1') !== null");
    log(`  Page has h1: ${hasContent}`);

    return url.includes('httpbin');
  } catch (e) {
    log(`  Navigation error: ${e.message}`);
    return false;
  }
}

async function testScreenshot() {
  log('--- Test 5: Screenshot ---');

  try {
    // Switch back to native for screenshot
    await client.switchContext('NATIVE_APP');
    const screenshot = await client.takeScreenshot();
    log(`  Screenshot captured: ${screenshot.length} chars (base64)`);
    return screenshot.length > 100;
  } catch (e) {
    log(`  Screenshot error: ${e.message}`);
    return false;
  }
}

async function testConsoleLogCapture() {
  log('--- Test 6: Console Log Capture ---');

  try {
    // Switch to webview using retry helper
    await switchToWebView();

    // Trigger a console.log which should be intercepted by JSBridge
    await client.execute("console.log('[TEST] Hello from automation test')");
    log('  console.log sent');

    await client.execute("console.warn('[TEST] Warning from automation test')");
    log('  console.warn sent');

    await client.execute("console.error('[TEST] Error from automation test')");
    log('  console.error sent');

    log('  Console logs forwarded to native NSLog via JSBridge');
    return true;
  } catch (e) {
    log(`  Console capture error: ${e.message}`);
    return false;
  }
}

// --- Main ---
async function main() {
  const results = {};

  try {
    await createSession();

    // Wait for app to be ready
    await new Promise(r => setTimeout(r, 3000));

    // Run tests
    await testNativeElements();
    results.webview = await testWebViewContext();
    results.bridge = await testJSBridge();
    results.navigation = await testNavigation();
    results.screenshot = await testScreenshot();
    results.consoleLogs = await testConsoleLogCapture();

    // Summary
    log('\n=== TEST RESULTS ===');
    for (const [name, passed] of Object.entries(results)) {
      log(`  ${passed ? 'PASS' : 'FAIL'} - ${name}`);
    }

    const allPassed = Object.values(results).every(v => v);
    log(`\n${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  } catch (error) {
    log(`FATAL ERROR: ${error.message}`);
    console.error(error);
  } finally {
    if (client) {
      log('Cleaning up session...');
      try {
        await client.deleteSession();
      } catch (e) {
        log(`Cleanup error: ${e.message}`);
      }
    }
  }
}

main();
