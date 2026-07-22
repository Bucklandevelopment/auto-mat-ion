#!/usr/bin/env npx tsx
/**
 * auto-mat-ion Device Enumeration Script
 *
 * Enumera dispositivos conectados y configura acceso de red:
 * 1. Lista dispositivos Android via ADB
 * 2. Lista simuladores iOS via xcrun
 * 3. Configura adb reverse para acceso al servidor local
 * 4. Genera informe de capacidades de cada dispositivo
 *
 * Usage:
 *   npx tsx demo/scripts/enumerate-devices.ts
 *   npx tsx demo/scripts/enumerate-devices.ts --port 8891 --setup-reverse
 */

import { execSync, spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

interface AndroidDevice {
  serial: string;
  type: 'emulator' | 'usb' | 'wifi';
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions';
  model?: string;
  manufacturer?: string;
  sdk?: string;
  androidVersion?: string;
  abi?: string;
  screenSize?: string;
  density?: number;
}

interface IOSDevice {
  udid: string;
  name: string;
  state: 'Booted' | 'Shutdown' | string;
  runtime: string;
  deviceType: string;
  isSimulator: boolean;
}

interface DeviceCapabilities {
  // Media
  hasFrontCamera: boolean;
  hasBackCamera: boolean;
  hasFlash: boolean;
  hasMicrophone: boolean;
  hasSpeaker: boolean;

  // Sensors
  hasAccelerometer: boolean;
  hasGyroscope: boolean;
  hasCompass: boolean;
  hasProximity: boolean;
  hasAmbientLight: boolean;
  hasBarometer: boolean;

  // Connectivity
  hasBluetooth: boolean;
  hasBluetoothLE: boolean;
  hasNFC: boolean;
  hasWifi: boolean;
  hasGPS: boolean;

  // Hardware
  hasFingerprintSensor: boolean;
  hasVibrator: boolean;
  batteryLevel?: number;
}

interface EnumeratedDevice {
  platform: 'android' | 'ios';
  id: string;
  name: string;
  state: string;
  details: AndroidDevice | IOSDevice;
  capabilities?: DeviceCapabilities;
  networkReady: boolean;
}

// ============================================================================
// Colors
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg: string, color: keyof typeof colors = 'reset'): void {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// ============================================================================
// Android Enumeration
// ============================================================================

function checkAdb(): boolean {
  try {
    execSync('adb version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getAndroidDevices(): AndroidDevice[] {
  const devices: AndroidDevice[] = [];

  try {
    const output = execSync('adb devices -l', { encoding: 'utf-8' });
    const lines = output.split('\n').slice(1);

    for (const line of lines) {
      if (!line.trim()) continue;

      const match = line.match(/^(\S+)\s+(\S+)\s*(.*)$/);
      if (!match) continue;

      const [, serial, state, extra] = match;

      const device: AndroidDevice = {
        serial,
        state: state as AndroidDevice['state'],
        type: serial.startsWith('emulator') ? 'emulator' :
              serial.includes(':') ? 'wifi' : 'usb',
      };

      // Parse extra info
      const modelMatch = extra.match(/model:(\S+)/);
      if (modelMatch) device.model = modelMatch[1].replace(/_/g, ' ');

      const productMatch = extra.match(/product:(\S+)/);
      if (productMatch && !device.model) device.model = productMatch[1];

      // Get detailed info if device is online
      if (state === 'device') {
        try {
          device.sdk = execSync(
            `adb -s ${serial} shell getprop ro.build.version.sdk`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();

          device.androidVersion = execSync(
            `adb -s ${serial} shell getprop ro.build.version.release`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();

          device.manufacturer = execSync(
            `adb -s ${serial} shell getprop ro.product.manufacturer`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();

          device.abi = execSync(
            `adb -s ${serial} shell getprop ro.product.cpu.abi`,
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();

          // Screen info
          const wmSize = execSync(
            `adb -s ${serial} shell wm size`,
            { encoding: 'utf-8', timeout: 5000 }
          );
          const sizeMatch = wmSize.match(/(\d+x\d+)/);
          if (sizeMatch) device.screenSize = sizeMatch[1];

          const wmDensity = execSync(
            `adb -s ${serial} shell wm density`,
            { encoding: 'utf-8', timeout: 5000 }
          );
          const densityMatch = wmDensity.match(/(\d+)/);
          if (densityMatch) device.density = parseInt(densityMatch[1]);

        } catch {
          // Ignore timeout/errors
        }
      }

      devices.push(device);
    }
  } catch (error) {
    log(`ADB error: ${error}`, 'red');
  }

  return devices;
}

function getAndroidCapabilities(serial: string): Partial<DeviceCapabilities> {
  const caps: Partial<DeviceCapabilities> = {};

  try {
    // Camera check
    const cameras = execSync(
      `adb -s ${serial} shell "ls /dev/video* 2>/dev/null | wc -l"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const cameraCount = parseInt(cameras.trim()) || 0;
    caps.hasBackCamera = cameraCount > 0;
    caps.hasFrontCamera = cameraCount > 1;

    // Flash/torch
    const flash = execSync(
      `adb -s ${serial} shell "ls /sys/class/leds/*flash* 2>/dev/null | wc -l"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    caps.hasFlash = parseInt(flash.trim()) > 0;

    // Sensors via dumpsys
    const sensors = execSync(
      `adb -s ${serial} shell "dumpsys sensorservice | grep -E 'Accelerometer|Gyroscope|Magnetic|Proximity|Light|Pressure'"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    caps.hasAccelerometer = sensors.includes('Accelerometer');
    caps.hasGyroscope = sensors.includes('Gyroscope');
    caps.hasCompass = sensors.includes('Magnetic');
    caps.hasProximity = sensors.includes('Proximity');
    caps.hasAmbientLight = sensors.includes('Light');
    caps.hasBarometer = sensors.includes('Pressure');

    // Bluetooth
    const btState = execSync(
      `adb -s ${serial} shell "settings get global bluetooth_on"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    caps.hasBluetooth = true; // Almost all devices have BT

    // NFC
    const nfc = execSync(
      `adb -s ${serial} shell "pm list features | grep nfc"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    caps.hasNFC = nfc.includes('nfc');

    // GPS
    const gps = execSync(
      `adb -s ${serial} shell "pm list features | grep gps"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    caps.hasGPS = gps.includes('gps');

    // Vibrator
    caps.hasVibrator = true; // Almost universal

    // Battery
    const battery = execSync(
      `adb -s ${serial} shell "dumpsys battery | grep level"`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const levelMatch = battery.match(/level:\s*(\d+)/);
    if (levelMatch) caps.batteryLevel = parseInt(levelMatch[1]);

  } catch {
    // Ignore errors, return partial caps
  }

  return caps;
}

// ============================================================================
// iOS Enumeration
// ============================================================================

function checkXcrun(): boolean {
  try {
    execSync('xcrun simctl list --json', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getIOSDevices(): IOSDevice[] {
  const devices: IOSDevice[] = [];

  try {
    const output = execSync('xcrun simctl list devices --json', { encoding: 'utf-8' });
    const data = JSON.parse(output);

    for (const [runtime, deviceList] of Object.entries(data.devices)) {
      if (!Array.isArray(deviceList)) continue;

      for (const device of deviceList) {
        devices.push({
          udid: device.udid,
          name: device.name,
          state: device.state,
          runtime: runtime.replace('com.apple.CoreSimulator.SimRuntime.', ''),
          deviceType: device.deviceTypeIdentifier?.split('.').pop() || 'Unknown',
          isSimulator: true,
        });
      }
    }
  } catch (error) {
    log(`xcrun error: ${error}`, 'red');
  }

  return devices;
}

// ============================================================================
// Network Setup
// ============================================================================

function setupAdbReverse(serial: string, port: number): boolean {
  try {
    execSync(`adb -s ${serial} reverse tcp:${port} tcp:${port}`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function listAdbReverse(serial: string): string[] {
  try {
    const output = execSync(`adb -s ${serial} reverse --list`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let port = 8891;
  let setupReverse = false;
  let outputJson = false;
  let showCapabilities = false;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
      case '-p':
        port = parseInt(args[++i]) || 8891;
        break;
      case '--setup-reverse':
      case '-r':
        setupReverse = true;
        break;
      case '--json':
        outputJson = true;
        break;
      case '--capabilities':
      case '-c':
        showCapabilities = true;
        break;
    }
  }

  log('\n═══════════════════════════════════════════════════', 'bright');
  log('      auto-mat-ion Device Enumeration', 'bright');
  log('═══════════════════════════════════════════════════\n', 'bright');

  const allDevices: EnumeratedDevice[] = [];

  // ========== Android ==========
  const hasAdb = checkAdb();
  log(`📱 Android (ADB): ${hasAdb ? 'Available' : 'Not found'}`, hasAdb ? 'green' : 'yellow');

  if (hasAdb) {
    const androidDevices = getAndroidDevices();

    if (androidDevices.length === 0) {
      log('   No Android devices found', 'dim');
    } else {
      for (const device of androidDevices) {
        const isOnline = device.state === 'device';
        const statusIcon = isOnline ? '✓' : '○';
        const statusColor = isOnline ? 'green' : 'yellow';

        log(`   ${statusIcon} ${device.serial}`, statusColor);
        log(`     Type: ${device.type}`, 'dim');

        if (device.model) {
          log(`     Model: ${device.manufacturer || ''} ${device.model}`, 'dim');
        }
        if (device.androidVersion) {
          log(`     Android: ${device.androidVersion} (SDK ${device.sdk})`, 'dim');
        }
        if (device.screenSize) {
          log(`     Screen: ${device.screenSize} @${device.density}dpi`, 'dim');
        }

        // Capabilities
        let caps: Partial<DeviceCapabilities> = {};
        if (showCapabilities && isOnline) {
          caps = getAndroidCapabilities(device.serial);
          const capsStr = [
            caps.hasBackCamera ? '📷' : '',
            caps.hasFrontCamera ? '🤳' : '',
            caps.hasFlash ? '🔦' : '',
            caps.hasAccelerometer ? '📐' : '',
            caps.hasGyroscope ? '🔄' : '',
            caps.hasCompass ? '🧭' : '',
            caps.hasNFC ? '📱' : '',
            caps.hasGPS ? '📍' : '',
          ].filter(Boolean).join(' ');
          if (capsStr) log(`     Sensors: ${capsStr}`, 'cyan');
          if (caps.batteryLevel !== undefined) {
            log(`     Battery: ${caps.batteryLevel}%`, 'dim');
          }
        }

        // Network setup
        let networkReady = false;
        if (setupReverse && isOnline) {
          networkReady = setupAdbReverse(device.serial, port);
          log(`     Reverse: ${networkReady ? `tcp:${port} ✓` : 'Failed'}`, networkReady ? 'green' : 'red');
        }

        allDevices.push({
          platform: 'android',
          id: device.serial,
          name: device.model || device.serial,
          state: device.state,
          details: device,
          capabilities: caps as DeviceCapabilities,
          networkReady,
        });
      }
    }
  }

  // ========== iOS ==========
  const hasXcrun = checkXcrun();
  log(`\n🍎 iOS (xcrun): ${hasXcrun ? 'Available' : 'Not found'}`, hasXcrun ? 'green' : 'yellow');

  if (hasXcrun) {
    const iosDevices = getIOSDevices();
    const bootedDevices = iosDevices.filter(d => d.state === 'Booted');

    if (bootedDevices.length === 0) {
      log('   No booted iOS simulators', 'dim');
    } else {
      for (const device of bootedDevices) {
        log(`   ✓ ${device.name}`, 'green');
        log(`     UDID: ${device.udid.substring(0, 8)}...`, 'dim');
        log(`     Runtime: ${device.runtime}`, 'dim');
        log(`     Type: ${device.deviceType}`, 'dim');

        allDevices.push({
          platform: 'ios',
          id: device.udid,
          name: device.name,
          state: device.state,
          details: device,
          networkReady: true, // Simulators share host network
        });
      }
    }
  }

  // ========== Summary ==========
  log('\n═══════════════════════════════════════════════════', 'bright');

  const androidCount = allDevices.filter(d => d.platform === 'android').length;
  const iosCount = allDevices.filter(d => d.platform === 'ios').length;
  const readyCount = allDevices.filter(d => d.networkReady).length;

  log(`Total: ${allDevices.length} device(s)`, 'cyan');
  log(`  Android: ${androidCount}`, 'dim');
  log(`  iOS: ${iosCount}`, 'dim');
  if (setupReverse) {
    log(`  Network ready: ${readyCount}`, 'dim');
  }

  log('═══════════════════════════════════════════════════\n', 'bright');

  // ========== Output ==========
  if (outputJson) {
    const outputPath = join(process.cwd(), 'devices.json');
    writeFileSync(outputPath, JSON.stringify(allDevices, null, 2));
    log(`Device info saved to: ${outputPath}`, 'green');
  }

  // Export for programmatic use
  if (typeof module !== 'undefined') {
    (global as any).enumeratedDevices = allDevices;
  }
}

main().catch(console.error);

// Export for use as module
export { getAndroidDevices, getIOSDevices, setupAdbReverse, getAndroidCapabilities };
