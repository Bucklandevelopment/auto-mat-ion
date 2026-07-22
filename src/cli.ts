#!/usr/bin/env node
/**
 * auto-mat-ion CLI (ami)
 *
 * Unified command-line interface for device testing and automation.
 *
 * Command Groups:
 *   demo     - Demo server and pages
 *   devices  - Device management
 *   run      - Test execution
 *   clean    - Cleanup operations
 *   analysis - Analysis tools
 *   status   - System status
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Get package root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');

// ============================================================================
// Terminal Colors & Utilities
// ============================================================================

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const log = (msg: string, color: keyof typeof c = 'reset') =>
  console.log(`${c[color]}${msg}${c.reset}`);

const logHeader = (title: string) => {
  console.log();
  log(`═══ ${title} ═══`, 'bold');
};

const logSuccess = (msg: string) => log(`✓ ${msg}`, 'green');
const logError = (msg: string) => log(`✗ ${msg}`, 'red');
const logWarn = (msg: string) => log(`⚠ ${msg}`, 'yellow');
const logInfo = (msg: string) => log(`ℹ ${msg}`, 'cyan');

// ============================================================================
// Device Detection
// ============================================================================

interface DetectedDevice {
  id: string;
  name: string;
  platform: 'android' | 'ios' | 'host' | 'usb';
  status: 'online' | 'offline' | 'unauthorized';
  type: string;
  connection?: 'usb' | 'wifi' | 'local';
  capabilities?: string[];
}

interface HostHardware {
  cameras: Array<{ id: string; name: string }>;
  microphones: Array<{ id: string; name: string }>;
  speakers: Array<{ id: string; name: string }>;
}

async function detectAndroidDevices(): Promise<DetectedDevice[]> {
  const devices: DetectedDevice[] = [];

  try {
    const { stdout } = await execAsync('adb devices -l 2>/dev/null');
    const lines = stdout.trim().split('\n').slice(1);

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split(/\s+/);
      const id = parts[0];
      const statusStr = parts[1];

      if (id === 'List' || !id) continue;

      const modelMatch = line.match(/model:(\S+)/);
      const deviceMatch = line.match(/device:(\S+)/);

      let status: 'online' | 'offline' | 'unauthorized' = 'online';
      if (statusStr === 'unauthorized') status = 'unauthorized';
      if (statusStr === 'offline') status = 'offline';

      const isWifi = id.includes(':');

      devices.push({
        id,
        name: modelMatch?.[1] || deviceMatch?.[1] || id,
        platform: 'android',
        status,
        type: statusStr === 'device' ? 'device' : statusStr,
        connection: isWifi ? 'wifi' : 'usb',
      });
    }
  } catch {
    // ADB not available
  }

  return devices;
}

async function detectIOSDevices(): Promise<DetectedDevice[]> {
  const devices: DetectedDevice[] = [];
  const seenIds = new Set<string>();

  // Method 1: libimobiledevice (idevice_id)
  try {
    const { stdout } = await execAsync('idevice_id -l 2>/dev/null');
    const udids = stdout.trim().split('\n').filter(Boolean);

    for (const udid of udids) {
      if (seenIds.has(udid)) continue;
      seenIds.add(udid);

      let name = 'iOS Device';
      let model = '';

      try {
        const { stdout: nameOut } = await execAsync(`ideviceinfo -u ${udid} -k DeviceName 2>/dev/null`);
        name = nameOut.trim() || name;
      } catch { /* ignore */ }

      try {
        const { stdout: modelOut } = await execAsync(`ideviceinfo -u ${udid} -k ProductType 2>/dev/null`);
        model = modelOut.trim();
      } catch { /* ignore */ }

      devices.push({
        id: udid,
        name: model ? `${name} (${model})` : name,
        platform: 'ios',
        status: 'online',
        type: 'device',
        connection: 'usb',
      });
    }
  } catch {
    // libimobiledevice not available
  }

  // Method 2: Apple Configurator 2 CLI (cfgutil)
  if (devices.length === 0) {
    try {
      const { stdout } = await execAsync('cfgutil list 2>/dev/null');
      const lines = stdout.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        // Format: "UDID    Name    ECID    ..."
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const udid = parts[0].trim();
          const name = parts[1].trim() || 'iOS Device';

          if (udid && !seenIds.has(udid)) {
            seenIds.add(udid);
            devices.push({
              id: udid,
              name,
              platform: 'ios',
              status: 'online',
              type: 'device',
              connection: 'usb',
            });
          }
        }
      }
    } catch {
      // cfgutil not available
    }
  }

  // Method 3: system_profiler (macOS fallback - detects connected iPhones)
  if (devices.length === 0 && process.platform === 'darwin') {
    try {
      const { stdout } = await execAsync('system_profiler SPUSBDataType 2>/dev/null');
      const lines = stdout.split('\n');

      let currentDevice = '';
      let currentSerial = '';
      let isIPhone = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('iPhone') || trimmed.startsWith('iPad')) {
          isIPhone = true;
          currentDevice = trimmed.replace(/:$/, '');
        } else if (isIPhone && trimmed.startsWith('Serial Number:')) {
          currentSerial = trimmed.split(':')[1]?.trim() || '';

          if (currentSerial && !seenIds.has(currentSerial)) {
            seenIds.add(currentSerial);
            devices.push({
              id: currentSerial,
              name: currentDevice || 'iOS Device',
              platform: 'ios',
              status: 'online',
              type: 'device',
              connection: 'usb',
              capabilities: ['needs-trust'],  // Might need to trust computer
            });
          }
          isIPhone = false;
          currentDevice = '';
        }
      }
    } catch {
      // system_profiler failed
    }
  }

  // Method 4: pymobiledevice3 (Python alternative)
  if (devices.length === 0) {
    try {
      const { stdout } = await execAsync('python3 -m pymobiledevice3 usbmux list --no-color 2>/dev/null');
      const data = JSON.parse(stdout);

      for (const device of data || []) {
        const udid = device.UniqueDeviceID || device.SerialNumber;
        if (udid && !seenIds.has(udid)) {
          seenIds.add(udid);
          devices.push({
            id: udid,
            name: device.DeviceName || 'iOS Device',
            platform: 'ios',
            status: 'online',
            type: 'device',
            connection: 'usb',
          });
        }
      }
    } catch {
      // pymobiledevice3 not available
    }
  }

  // iOS Simulators (Xcode)
  try {
    const { stdout } = await execAsync('xcrun simctl list devices booted --json 2>/dev/null');
    const data = JSON.parse(stdout);

    for (const [runtime, deviceList] of Object.entries(data.devices || {})) {
      if (runtime.includes('iOS')) {
        for (const device of deviceList as Array<{ udid: string; name: string; state: string }>) {
          if (device.state === 'Booted' && !seenIds.has(device.udid)) {
            seenIds.add(device.udid);
            devices.push({
              id: device.udid,
              name: `${device.name} (Simulator)`,
              platform: 'ios',
              status: 'online',
              type: 'simulator',
              connection: 'local',
            });
          }
        }
      }
    }
  } catch {
    // Xcode not available
  }

  return devices;
}

// Check what iOS tools are available
async function checkIOSTools(): Promise<{ tool: string; available: boolean }[]> {
  const tools = [
    { name: 'libimobiledevice', cmd: 'idevice_id --version' },
    { name: 'cfgutil', cmd: 'cfgutil --version' },
    { name: 'pymobiledevice3', cmd: 'python3 -m pymobiledevice3 version' },
    { name: 'Xcode', cmd: 'xcrun simctl help' },
  ];

  const results = [];

  for (const tool of tools) {
    try {
      await execAsync(`${tool.cmd} 2>/dev/null`);
      results.push({ tool: tool.name, available: true });
    } catch {
      results.push({ tool: tool.name, available: false });
    }
  }

  return results;
}

async function detectHostHardware(): Promise<HostHardware> {
  const hardware: HostHardware = { cameras: [], microphones: [], speakers: [] };
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: Use system_profiler
      try {
        const { stdout } = await execAsync('system_profiler SPCameraDataType -json 2>/dev/null');
        const data = JSON.parse(stdout);
        const cameras = data.SPCameraDataType || [];
        for (const cam of cameras) {
          hardware.cameras.push({
            id: cam._name?.replace(/\s+/g, '_').toLowerCase() || 'camera',
            name: cam._name || 'Camera',
          });
        }
      } catch { /* no cameras */ }

      try {
        const { stdout } = await execAsync('system_profiler SPAudioDataType -json 2>/dev/null');
        const data = JSON.parse(stdout);
        const audioDevices = data.SPAudioDataType || [];
        for (const group of audioDevices) {
          const items = group._items || [];
          for (const item of items) {
            if (item.coreaudio_input_source) {
              hardware.microphones.push({
                id: item._name?.replace(/\s+/g, '_').toLowerCase() || 'mic',
                name: item._name || 'Microphone',
              });
            }
            if (item.coreaudio_output_source) {
              hardware.speakers.push({
                id: item._name?.replace(/\s+/g, '_').toLowerCase() || 'speaker',
                name: item._name || 'Speaker',
              });
            }
          }
        }
      } catch { /* no audio */ }
    } else if (platform === 'linux') {
      // Linux: Use v4l2 and arecord
      try {
        const { stdout } = await execAsync('v4l2-ctl --list-devices 2>/dev/null');
        const lines = stdout.split('\n');
        let currentDevice = '';
        for (const line of lines) {
          if (!line.startsWith('\t') && line.includes(':')) {
            currentDevice = line.split(':')[0].trim();
          } else if (line.includes('/dev/video') && currentDevice) {
            hardware.cameras.push({
              id: line.trim(),
              name: currentDevice,
            });
          }
        }
      } catch { /* no v4l2 */ }

      try {
        const { stdout } = await execAsync('arecord -l 2>/dev/null');
        const lines = stdout.split('\n');
        for (const line of lines) {
          const match = line.match(/card (\d+):.*\[(.+?)\]/);
          if (match) {
            hardware.microphones.push({
              id: `hw:${match[1]}`,
              name: match[2],
            });
          }
        }
      } catch { /* no arecord */ }
    } else if (platform === 'win32') {
      // Windows: Use PowerShell
      try {
        const { stdout } = await execAsync('powershell -c "Get-PnpDevice -Class Camera | Select-Object -Property FriendlyName | ConvertTo-Json" 2>/dev/null');
        const data = JSON.parse(stdout);
        const cameras = Array.isArray(data) ? data : [data];
        for (const cam of cameras) {
          if (cam.FriendlyName) {
            hardware.cameras.push({
              id: cam.FriendlyName.replace(/\s+/g, '_').toLowerCase(),
              name: cam.FriendlyName,
            });
          }
        }
      } catch { /* no cameras */ }
    }
  } catch { /* hardware detection failed */ }

  return hardware;
}

async function detectHostDevice(): Promise<{ device: DetectedDevice; hardware: HostHardware }> {
  const os = await import('os');
  const platform = process.platform;
  const hardware = await detectHostHardware();

  const capabilities: string[] = [];
  if (hardware.cameras.length > 0) capabilities.push('camera');
  if (hardware.microphones.length > 0) capabilities.push('microphone');
  if (hardware.speakers.length > 0) capabilities.push('audio');
  capabilities.push('network', 'filesystem', 'browser');

  return {
    device: {
      id: `host_${os.hostname()}`,
      name: os.hostname(),
      platform: 'host',
      status: 'online',
      type: platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux',
      connection: 'local',
      capabilities,
    },
    hardware,
  };
}

async function detectUSBDevices(): Promise<DetectedDevice[]> {
  const devices: DetectedDevice[] = [];
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS: Parse system_profiler for USB devices
      const { stdout } = await execAsync('system_profiler SPUSBDataType 2>/dev/null');
      const lines = stdout.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for USB devices with camera/audio capabilities
        if (line.includes('Camera') || line.includes('Webcam') ||
            line.includes('Microphone') || line.includes('Audio')) {
          const nameLine = lines[i - 1] || line;
          const name = nameLine.trim().replace(/:$/, '');
          if (name && !name.startsWith('USB') && name.length > 2) {
            // Check if we already have this device
            if (!devices.find(d => d.name === name)) {
              devices.push({
                id: `usb_${name.replace(/\s+/g, '_').toLowerCase()}`,
                name,
                platform: 'usb',
                status: 'online',
                type: line.includes('Camera') || line.includes('Webcam') ? 'camera' : 'audio',
                connection: 'usb',
              });
            }
          }
        }
      }
    } else if (platform === 'linux') {
      // Linux: Use lsusb
      const { stdout } = await execAsync('lsusb 2>/dev/null');
      const lines = stdout.split('\n');

      for (const line of lines) {
        // Look for camera/audio devices
        if (line.toLowerCase().includes('camera') ||
            line.toLowerCase().includes('webcam') ||
            line.toLowerCase().includes('audio') ||
            line.toLowerCase().includes('microphone')) {
          const match = line.match(/ID\s+(\w+:\w+)\s+(.+)/);
          if (match) {
            devices.push({
              id: `usb_${match[1]}`,
              name: match[2],
              platform: 'usb',
              status: 'online',
              type: line.toLowerCase().includes('camera') || line.toLowerCase().includes('webcam') ? 'camera' : 'audio',
              connection: 'usb',
            });
          }
        }
      }
    }
  } catch { /* USB detection failed */ }

  return devices;
}

async function getAllDevices(): Promise<{
  devices: DetectedDevice[];
  host: DetectedDevice;
  hardware: HostHardware
}> {
  const [android, ios, usb, hostResult] = await Promise.all([
    detectAndroidDevices(),
    detectIOSDevices(),
    detectUSBDevices(),
    detectHostDevice(),
  ]);

  return {
    devices: [hostResult.device, ...usb, ...android, ...ios],
    host: hostResult.device,
    hardware: hostResult.hardware,
  };
}

// ============================================================================
// Command: demo
// ============================================================================

async function cmdDemo(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';
  const demoDir = join(PKG_ROOT, 'demo');

  switch (subcommand) {
    case 'serve': {
      const port = parseInt(args[1]) || 8891;
      logHeader('Demo Server');
      logInfo(`Starting server on port ${port}...`);

      const serverPath = join(demoDir, 'server', 'index.ts');
      if (!existsSync(serverPath)) {
        logError(`Server not found at ${serverPath}`);
        logInfo('Run: npx tsx demo/server/index.ts');
        return;
      }

      // Run with tsx
      const child = spawn('npx', ['tsx', serverPath], {
        cwd: PKG_ROOT,
        stdio: 'inherit',
        env: { ...process.env, PORT: String(port) },
      });

      child.on('error', (err) => logError(`Failed to start: ${err.message}`));
      break;
    }

    case 'open': {
      const port = parseInt(args[1]) || 8891;
      const url = `http://localhost:${port}`;

      logHeader('Opening Demo');
      logInfo(`Opening ${url} in browser...`);

      const openCmd =
        process.platform === 'darwin' ? 'open' :
        process.platform === 'win32' ? 'start' : 'xdg-open';

      try {
        await execAsync(`${openCmd} ${url}`);
        logSuccess(`Opened ${url}`);
      } catch {
        logWarn(`Could not open browser. Visit: ${url}`);
      }
      break;
    }

    case 'list': {
      logHeader('Demo Pages');
      const pagesDir = join(demoDir, 'pages');

      if (!existsSync(pagesDir)) {
        logWarn('No demo pages found');
        return;
      }

      function listFiles(dir: string, prefix = ''): void {
        const files = readdirSync(dir);
        for (const file of files) {
          const fullPath = join(dir, file);
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            log(`${prefix}📁 ${file}/`, 'cyan');
            listFiles(fullPath, prefix + '  ');
          } else if (file.endsWith('.html')) {
            log(`${prefix}📄 ${file}`, 'reset');
          }
        }
      }

      listFiles(pagesDir);
      break;
    }

    default:
      log(`
${c.bold}ami demo${c.reset} - Demo server management

${c.cyan}SUBCOMMANDS${c.reset}
  serve [port]   Start the demo server (default: 8891)
  open [port]    Open demo in browser
  list           List available demo pages

${c.cyan}EXAMPLES${c.reset}
  ami demo serve 9000
  ami demo open
  ami demo list
`);
  }
}

// ============================================================================
// Command: devices
// ============================================================================

async function cmdDevices(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list': {
      logHeader('Device Discovery');

      const { devices, host, hardware } = await getAllDevices();
      const usb = devices.filter(d => d.platform === 'usb');
      const android = devices.filter(d => d.platform === 'android');
      const ios = devices.filter(d => d.platform === 'ios');

      // Host Machine
      log(`\n🖥️  Host Machine:`, 'cyan');
      log(`   ${host.name} (${host.type})`, 'bold');
      if (host.capabilities && host.capabilities.length > 0) {
        log(`   Capabilities: ${host.capabilities.join(', ')}`, 'dim');
      }

      // Hardware
      if (hardware.cameras.length > 0 || hardware.microphones.length > 0) {
        log(`\n🎛️  Hardware Detected:`, 'cyan');
        for (const cam of hardware.cameras) {
          log(`   📷 ${cam.name}`, 'green');
        }
        for (const mic of hardware.microphones) {
          log(`   🎤 ${mic.name}`, 'green');
        }
        for (const spk of hardware.speakers) {
          log(`   🔊 ${spk.name}`, 'dim');
        }
      }

      // USB Devices
      if (usb.length > 0) {
        log(`\n🔌 USB Devices (${usb.length}):`, 'magenta');
        for (const d of usb) {
          const icon = d.type === 'camera' ? '📷' : '🎤';
          log(`   ${icon} ${d.name}`, 'magenta');
        }
      }

      // Android
      if (android.length > 0) {
        log(`\n🤖 Android (${android.length}):`, 'green');
        for (const d of android) {
          const icon = d.status === 'online' ? '✓' : d.status === 'unauthorized' ? '⚠' : '✗';
          const conn = d.connection === 'wifi' ? '📡' : '🔌';
          log(`   ${icon} ${conn} ${d.name} [${d.id}]`, d.status === 'online' ? 'green' : 'yellow');
        }
      } else {
        log(`\n🤖 Android: No devices`, 'dim');
      }

      // iOS
      if (ios.length > 0) {
        log(`\n🍎 iOS (${ios.length}):`, 'blue');
        for (const d of ios) {
          const icon = d.type === 'simulator' ? '📱' : '📲';
          const needsTrust = d.capabilities?.includes('needs-trust') ? ' ⚠️ trust?' : '';
          log(`   ${icon} ${d.name} [${d.id.slice(0, 8)}...]${needsTrust}`, 'blue');
        }
      } else {
        log(`\n🍎 iOS: No devices`, 'dim');
        // Show iOS tool status on macOS
        if (process.platform === 'darwin') {
          const iosTools = await checkIOSTools();
          const availableTools = iosTools.filter(t => t.available).map(t => t.tool);
          const missingTools = iosTools.filter(t => !t.available).map(t => t.tool);

          if (availableTools.length > 0) {
            log(`   Tools available: ${availableTools.join(', ')}`, 'dim');
          }
          if (missingTools.length > 0 && missingTools.includes('libimobiledevice')) {
            log(`   💡 Install libimobiledevice: brew install libimobiledevice`, 'yellow');
          }
          log(`   💡 Make sure to "Trust This Computer" on your iPhone`, 'yellow');
        }
      }

      // Summary
      const testableDevices = devices.filter(d => d.status === 'online');
      log(`\n📊 Summary:`, 'bold');
      log(`   Total devices: ${devices.length}`);
      log(`   Ready for testing: ${testableDevices.length}`, 'green');
      if (hardware.cameras.length > 0) {
        log(`   Cameras available: ${hardware.cameras.length}`, 'green');
      }
      break;
    }

    case 'setup': {
      const deviceId = args[1];
      if (!deviceId) {
        logError('Usage: ami devices setup <device-id>');
        return;
      }

      logHeader(`Device Setup: ${deviceId}`);

      // Check if Android
      const android = await detectAndroidDevices();
      const device = android.find(d => d.id === deviceId);

      if (device) {
        log('Setting up Android device...', 'cyan');

        // Enable stay awake
        try {
          await execAsync(`adb -s ${deviceId} shell settings put global stay_on_while_plugged_in 3`);
          logSuccess('Enabled stay awake while charging');
        } catch (e) {
          logWarn('Could not enable stay awake');
        }

        // Set up port forwarding
        try {
          await execAsync(`adb -s ${deviceId} reverse tcp:3000 tcp:3000`);
          logSuccess('Set up port forwarding (3000)');
        } catch (e) {
          logWarn('Could not set up port forwarding');
        }

        // Grant Chrome permissions
        try {
          await execAsync(`adb -s ${deviceId} shell pm grant com.android.chrome android.permission.CAMERA`);
          await execAsync(`adb -s ${deviceId} shell pm grant com.android.chrome android.permission.RECORD_AUDIO`);
          await execAsync(`adb -s ${deviceId} shell pm grant com.android.chrome android.permission.ACCESS_FINE_LOCATION`);
          logSuccess('Granted Chrome sensor permissions');
        } catch (e) {
          logWarn('Could not grant permissions (may require device interaction)');
        }

        logSuccess('Device setup complete!');
      } else {
        logError(`Device ${deviceId} not found or not Android`);
      }
      break;
    }

    case 'caps': {
      const deviceId = args[1];
      if (!deviceId) {
        logError('Usage: ami devices caps <device-id>');
        return;
      }

      logHeader(`Device Capabilities: ${deviceId}`);

      const android = await detectAndroidDevices();
      const device = android.find(d => d.id === deviceId);

      if (device) {
        try {
          // Get device info
          const { stdout: model } = await execAsync(`adb -s ${deviceId} shell getprop ro.product.model`);
          const { stdout: sdk } = await execAsync(`adb -s ${deviceId} shell getprop ro.build.version.sdk`);
          const { stdout: android } = await execAsync(`adb -s ${deviceId} shell getprop ro.build.version.release`);

          log(`\n📱 Device Info:`, 'cyan');
          log(`   Model: ${model.trim()}`);
          log(`   Android: ${android.trim()} (SDK ${sdk.trim()})`);

          // Check cameras
          const { stdout: cameras } = await execAsync(`adb -s ${deviceId} shell ls /dev/video* 2>/dev/null || echo "none"`);
          log(`\n📷 Cameras:`, 'cyan');
          if (cameras.trim() !== 'none') {
            cameras.trim().split('\n').forEach(cam => log(`   ${cam}`));
          } else {
            log('   No /dev/video devices found');
          }

          // Check sensors
          const { stdout: sensors } = await execAsync(`adb -s ${deviceId} shell dumpsys sensorservice | grep -E "^\\s+[0-9]+" | head -10`);
          log(`\n🎯 Sensors:`, 'cyan');
          sensors.trim().split('\n').forEach(s => log(`   ${s.trim()}`));

        } catch (e) {
          logError(`Could not get capabilities: ${e}`);
        }
      } else {
        logError(`Device ${deviceId} not found`);
      }
      break;
    }

    case 'ios': {
      logHeader('iOS Device Diagnostics');

      if (process.platform !== 'darwin') {
        logWarn('iOS device detection requires macOS');
        return;
      }

      log('\n🔧 Checking iOS tools...', 'cyan');
      const tools = await checkIOSTools();

      for (const tool of tools) {
        const icon = tool.available ? '✓' : '✗';
        const color = tool.available ? 'green' : 'yellow';
        log(`   ${icon} ${tool.tool}`, color);
      }

      const hasLibimobiledevice = tools.find(t => t.tool === 'libimobiledevice')?.available;
      const hasCfgutil = tools.find(t => t.tool === 'cfgutil')?.available;
      const hasPymobiledevice3 = tools.find(t => t.tool === 'pymobiledevice3')?.available;

      log('\n📱 Attempting iOS device detection...', 'cyan');

      // Try idevice_id
      if (hasLibimobiledevice) {
        try {
          const { stdout } = await execAsync('idevice_id -l 2>&1');
          if (stdout.trim()) {
            log(`   Found devices via libimobiledevice:`, 'green');
            stdout.trim().split('\n').forEach(id => log(`      ${id}`, 'green'));
          } else {
            log('   No devices via libimobiledevice (check USB/trust)', 'yellow');
          }
        } catch (e) {
          log(`   libimobiledevice error: ${e}`, 'red');
        }
      }

      // Try system_profiler
      log('\n📋 Checking USB for iOS devices...', 'cyan');
      try {
        const { stdout } = await execAsync('system_profiler SPUSBDataType 2>/dev/null | grep -A5 "iPhone\\|iPad"');
        if (stdout.trim()) {
          log('   Found iOS device via USB:', 'green');
          stdout.trim().split('\n').forEach(line => log(`      ${line.trim()}`, 'dim'));
        } else {
          log('   No iPhone/iPad found via USB', 'yellow');
        }
      } catch {
        log('   No iPhone/iPad found via USB', 'yellow');
      }

      log('\n💡 Troubleshooting:', 'cyan');
      if (!hasLibimobiledevice) {
        log('   1. Install libimobiledevice:', 'yellow');
        log('      brew install libimobiledevice', 'dim');
      }
      if (!hasPymobiledevice3) {
        log('   2. Or install pymobiledevice3:', 'yellow');
        log('      pip3 install pymobiledevice3', 'dim');
      }
      log('   3. Connect iPhone via USB cable', 'yellow');
      log('   4. Unlock iPhone and tap "Trust This Computer"', 'yellow');
      log('   5. Enter passcode if prompted', 'yellow');

      break;
    }

    default:
      log(`
${c.bold}ami devices${c.reset} - Device management

${c.cyan}SUBCOMMANDS${c.reset}
  list           List all connected devices
  setup <id>     Configure device for testing
  caps <id>      Show device capabilities
  ios            Diagnose iOS device detection issues

${c.cyan}EXAMPLES${c.reset}
  ami devices list
  ami devices setup emulator-5554
  ami devices caps emulator-5554
  ami devices ios
`);
  }
}

// ============================================================================
// Command: run
// ============================================================================

/**
 * Load generated test scripts from test-results directory
 */
async function loadTestScripts(): Promise<Array<{ name: string; path: string; content: string }>> {
  const testResultsDir = join(PKG_ROOT, 'test-results');
  const scripts: Array<{ name: string; path: string; content: string }> = [];

  if (!existsSync(testResultsDir)) {
    return scripts;
  }

  const files = readdirSync(testResultsDir).filter(f => f.endsWith('-script.js'));

  for (const file of files) {
    const fullPath = join(testResultsDir, file);
    const { readFileSync } = await import('fs');
    const content = readFileSync(fullPath, 'utf-8');
    scripts.push({
      name: file.replace('-script.js', ''),
      path: fullPath,
      content,
    });
  }

  return scripts;
}

async function cmdRun(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';

  switch (subcommand) {
    case 'zepto': {
      logHeader('Zepto Test');
      logInfo('Running minimal connectivity test + test-results check...');

      const { devices } = await getAllDevices();
      const targets = devices.filter(d => d.platform !== 'host' && d.status === 'online');

      // Check connectivity
      if (targets.length === 0) {
        logWarn('No remote devices available');
      } else {
        for (const device of targets) {
          log(`\nTesting ${device.name}...`, 'cyan');

          if (device.platform === 'android') {
            try {
              const start = Date.now();
              await execAsync(`adb -s ${device.id} shell echo "ping"`);
              const latency = Date.now() - start;
              logSuccess(`Response: ${latency}ms`);
            } catch {
              logError('Connection failed');
            }
          }
        }
      }

      // Check for test scripts
      const scripts = await loadTestScripts();
      log(`\n📋 Test Scripts: ${scripts.length} found`, 'cyan');

      if (scripts.length > 0) {
        for (const script of scripts) {
          log(`   • ${script.name}`, 'reset');
        }
        logInfo('\nRun "ami run quick" to execute on a device');
        logInfo('Run "ami run full" to execute all tests');
      } else {
        logInfo('\nNo test scripts found. Generate with:');
        logInfo('  ami test "capture image with each camera"');
      }

      logSuccess('\nZepto check complete');
      break;
    }

    case 'quick': {
      const url = args[1] || 'http://localhost:8891/sensors/camera.html';
      const deviceId = args[2];

      logHeader('Quick Test');

      // Load any available test scripts
      const scripts = await loadTestScripts();
      if (scripts.length > 0) {
        logInfo(`Found ${scripts.length} test script(s) to execute`);
      }

      logInfo(`URL: ${url}`);

      // Find a device to test on
      let targetDevice: DetectedDevice | undefined;

      if (deviceId) {
        const { devices } = await getAllDevices();
        targetDevice = devices.find(d => d.id === deviceId);
      } else {
        const { devices } = await getAllDevices();
        targetDevice = devices.find(d => d.platform === 'android' && d.status === 'online') ||
                       devices.find(d => d.platform === 'host');  // Fallback to host
      }

      if (!targetDevice) {
        logWarn('No suitable device found');
        logInfo('Run: ami devices list');
        return;
      }

      const icon = targetDevice.platform === 'host' ? '🖥️' : '📱';
      logInfo(`Device: ${icon} ${targetDevice.name} (${targetDevice.platform})`);

      // Build autorun URL if we have scripts
      const hasScripts = scripts.length > 0;
      const autorunUrl = hasScripts
        ? `${url}?autorun=true&action=capture&testname=${encodeURIComponent(scripts[0]?.name || 'quick-test')}`
        : url;

      try {
        // Open browser based on platform
        if (targetDevice.platform === 'host') {
          const openCmd = targetDevice.type === 'macos' ? 'open' :
                         targetDevice.type === 'windows' ? 'start' : 'xdg-open';
          await execAsync(`${openCmd} "${autorunUrl}" 2>/dev/null`);
          logSuccess(hasScripts ? 'Opened browser - tests auto-executing...' : 'Opened browser');

        } else if (targetDevice.platform === 'android') {
          // Setup adb reverse first
          try {
            await execAsync(`adb -s ${targetDevice.id} reverse tcp:8891 tcp:8891`);
            log(`   📡 ADB reverse setup`, 'dim');
          } catch { /* ignore */ }

          // Open URL - escape & for shell
          const shellSafeUrl = autorunUrl.replace(/&/g, '\\&');
          log(`   🔗 Opening: ${autorunUrl.substring(0, 60)}...`, 'dim');
          await execAsync(`adb -s ${targetDevice.id} shell am start -a android.intent.action.VIEW -d "${shellSafeUrl}"`);
          logSuccess(hasScripts ? 'Opened browser - tests auto-executing...' : 'Opened browser');

        } else if (targetDevice.platform === 'ios') {
          if (targetDevice.type === 'simulator') {
            await execAsync(`xcrun simctl openurl ${targetDevice.id} "${autorunUrl}"`);
            logSuccess(hasScripts ? 'Opened Safari - tests auto-executing...' : 'Opened Safari on iOS');
          } else {
            logWarn('iOS device - open browser manually');
            logInfo(`URL: ${autorunUrl}`);
          }
        }

        // Show status
        if (hasScripts) {
          log('\n📋 Test scripts auto-executing:', 'cyan');
          for (const script of scripts) {
            log(`   ⚡ ${script.name}`, 'dim');
          }
          logInfo('\nResults will upload to: http://localhost:8891/results.html');
        } else {
          logInfo('\nNo scripts found - open UI for manual testing');
        }

        log('\nPress Ctrl+C to end', 'dim');

        // Keep alive
        await new Promise<void>((resolve) => {
          process.on('SIGINT', () => {
            log('\nTest session ended', 'yellow');
            resolve();
          });
        });
      } catch (e) {
        logError(`Failed: ${e}`);
      }
      break;
    }

    case 'full': {
      logHeader('Full Test Suite');

      // Load all test scripts
      const scripts = await loadTestScripts();

      if (scripts.length === 0) {
        logWarn('No test scripts found in ./test-results/');
        logInfo('Generate tests with: ami test "your test description"');
        return;
      }

      log(`\nFound ${scripts.length} test script(s):`, 'cyan');
      for (const script of scripts) {
        log(`   • ${script.name}`, 'reset');
      }

      // Get devices (include host, android, and ios for testing)
      const { devices, host } = await getAllDevices();
      const targets = devices.filter(d =>
        (d.platform === 'android' || d.platform === 'host' || d.platform === 'ios') && d.status === 'online'
      );

      if (targets.length === 0) {
        logWarn('\nNo devices available');
        logInfo('The test scripts are ready in ./test-results/');
        return;
      }

      log(`\nExecuting on ${targets.length} device(s)...`, 'cyan');

      // Determine test action based on scripts
      const hasCapture = scripts.some(s => s.name.includes('capture'));
      const hasRecord = scripts.some(s => s.name.includes('record'));
      const action = hasCapture && hasRecord ? 'all' : hasRecord ? 'record' : 'capture';

      // Build URL with autorun parameters
      const baseUrl = 'http://localhost:8891/sensors/camera.html';
      const testName = scripts[0]?.name || 'auto-test';
      const autorunUrl = `${baseUrl}?autorun=true&action=${action}&testname=${encodeURIComponent(testName)}`;

      log(`\n🚀 Auto-executing: ${action} tests`, 'cyan');

      for (const device of targets) {
        const icon = device.platform === 'host' ? '🖥️' : '📱';
        log(`\n${icon} ${device.name} (${device.platform})`, 'cyan');

        try {
          if (device.platform === 'host') {
            // Host: Use native browser command
            const openCmd = device.type === 'macos' ? 'open' :
                           device.type === 'windows' ? 'start' : 'xdg-open';
            await execAsync(`${openCmd} "${autorunUrl}" 2>/dev/null`);
            logSuccess('Opened browser - tests auto-executing...');

          } else if (device.platform === 'android') {
            // Android: Setup adb reverse first, then open browser
            try {
              await execAsync(`adb -s ${device.id} reverse tcp:8891 tcp:8891`);
              log(`   📡 ADB reverse setup for port 8891`, 'dim');
            } catch {
              logWarn('   Could not setup adb reverse - device may not reach localhost');
            }

            // Open URL - escape & for shell and use proper quoting
            // The shell needs & escaped otherwise it runs as background command
            const shellSafeUrl = autorunUrl.replace(/&/g, '\\&');
            log(`   🔗 Opening: ${autorunUrl.substring(0, 60)}...`, 'dim');
            await execAsync(`adb -s ${device.id} shell am start -a android.intent.action.VIEW -d "${shellSafeUrl}"`);
            logSuccess('Opened browser - tests auto-executing...');

          } else if (device.platform === 'ios') {
            // iOS: Use Safari or installed browser
            if (device.type === 'simulator') {
              await execAsync(`xcrun simctl openurl ${device.id} "${autorunUrl}"`);
              logSuccess('Opened Safari - tests auto-executing...');
            } else {
              // Real iOS device - show URL for manual navigation
              // Auto-launching Safari requires MDM or jailbreak
              let localIP = '';
              try {
                const { stdout } = await execAsync('ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null');
                localIP = stdout.trim();
              } catch { /* ignore */ }

              if (!localIP) {
                try {
                  const { stdout } = await execAsync('ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk \'{print $2}\'');
                  localIP = stdout.trim();
                } catch { /* ignore */ }
              }

              if (localIP) {
                const networkUrl = autorunUrl.replace('localhost', localIP);
                log(`   📱 Open Safari on iPhone and navigate to:`, 'cyan');
                log(``, 'reset');
                log(`   🔗 ${networkUrl}`, 'green');
                log(``, 'reset');
                log(`   💡 Make sure iPhone is on the same WiFi network`, 'dim');
              } else {
                log(`   📱 Open Safari and go to: ${autorunUrl}`, 'cyan');
                log(`   💡 Replace 'localhost' with your Mac's IP`, 'dim');
              }
            }
          }

          // Wait for tests to start
          await new Promise(r => setTimeout(r, 2000));

          // Log executing scripts
          for (const script of scripts) {
            log(`   ⚡ Executing: ${script.name}`, 'dim');
          }

          logInfo('   Tests auto-running, results uploading to server...');

        } catch (e) {
          logError(`   Failed: ${e}`);
        }
      }

      logSuccess('\nTests launched on all devices!');
      logInfo('Results will appear at: http://localhost:8891/results.html');
      logInfo('Check server logs for upload confirmations');
      break;
    }

    case 'host': {
      logHeader('Host Test');
      logInfo('Running tests on local machine...');

      const { host, hardware } = await getAllDevices();
      log(`\n🖥️  ${host.name} (${host.type})`, 'cyan');

      // Show available hardware
      if (hardware.cameras.length > 0) {
        log(`   📷 Cameras: ${hardware.cameras.map(c => c.name).join(', ')}`, 'green');
      }
      if (hardware.microphones.length > 0) {
        log(`   🎤 Mics: ${hardware.microphones.map(m => m.name).join(', ')}`, 'green');
      }

      // Load test scripts
      const scripts = await loadTestScripts();
      if (scripts.length === 0) {
        logWarn('\nNo test scripts found');
        logInfo('Generate with: ami test "capture image with each camera"');
        return;
      }

      log(`\n📋 Test Scripts (${scripts.length}):`, 'cyan');
      for (const script of scripts) {
        log(`   • ${script.name}`, 'reset');
      }

      // Build autorun URL
      const baseUrl = args[1] || 'http://localhost:8891/sensors/camera.html';
      const hasCapture = scripts.some(s => s.name.includes('capture'));
      const hasRecord = scripts.some(s => s.name.includes('record'));
      const action = hasCapture && hasRecord ? 'all' : hasRecord ? 'record' : 'capture';
      const autorunUrl = `${baseUrl}?autorun=true&action=${action}&testname=${encodeURIComponent(scripts[0]?.name || 'host-test')}`;

      log(`\n🚀 Auto-executing: ${action} tests`, 'cyan');

      try {
        const openCmd = host.type === 'macos' ? 'open' :
                        host.type === 'windows' ? 'start' : 'xdg-open';
        await execAsync(`${openCmd} "${autorunUrl}" 2>/dev/null`);
        logSuccess('Browser opened - tests auto-executing...');
        logInfo('\nResults will upload to: http://localhost:8891/results.html');
      } catch {
        logWarn(`Could not open browser. Navigate to: ${autorunUrl}`);
      }

      break;
    }

    case 'matrix': {
      logHeader('Test Matrix');
      logInfo('Discovering devices and building test matrix...');

      const { devices: matrixDevices, hardware: matrixHw } = await getAllDevices();
      const testableDevices = matrixDevices.filter(d => d.status === 'online');
      const matrixBrowsers = ['chrome', 'firefox', 'safari', 'edge'];

      log(`\n  Device\\Browser  | ${matrixBrowsers.map(b => b.padEnd(10)).join('| ')}`, 'cyan');
      log(`  ${'─'.repeat(15)}─┼${'─'.repeat(11)}┼${'─'.repeat(11)}┼${'─'.repeat(11)}┼${'─'.repeat(11)}`, 'dim');

      for (const device of testableDevices) {
        const row = matrixBrowsers.map(b => {
          const isSupported =
            (device.platform === 'android' && b === 'chrome') ||
            (device.platform === 'ios' && b === 'safari') ||
            (device.platform === 'host' && ['chrome', 'firefox', 'safari', 'edge'].includes(b));
          return (isSupported ? ' ready ' : '   -   ').padEnd(10);
        });
        const name = `${device.name}`.substring(0, 15).padEnd(15);
        log(`  ${name} | ${row.join('| ')}`, 'reset');
      }

      log(`\n  Devices: ${testableDevices.length} online`, 'green');
      if (matrixHw.cameras.length > 0) {
        log(`  Cameras: ${matrixHw.cameras.length} available`, 'green');
      }

      logWarn('\nFull matrix execution not yet implemented.');
      logInfo('Use "ami run full" to execute tests on all devices sequentially.');
      break;
    }

    default:
      log(`
${c.bold}ami run${c.reset} - Test execution

${c.cyan}SUBCOMMANDS${c.reset}
  zepto            Connectivity test + check for test scripts
  quick [url] [id] Quick single-device test with test-results
  full             Execute all test-results on all devices
  host [url]       Run tests on local machine (macOS/Linux/Windows)
  matrix           Full test matrix execution (coming soon)

${c.cyan}WORKFLOW${c.reset}
  1. Generate tests:  ami test "capture image with each camera"
  2. Check status:    ami run zepto
  3. Execute:         ami run quick  (or ami run full)
                      ami run host   (for local testing)

${c.cyan}EXAMPLES${c.reset}
  ami run zepto
  ami run host
  ami run host http://localhost:8891/sensors/camera.html
  ami run quick http://localhost:8891/sensors/camera.html
  ami run quick http://localhost:8891/sensors/camera.html emulator-5554
  ami run full
`);
  }
}

// ============================================================================
// Command: clean
// ============================================================================

async function cmdClean(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';

  const dataDir = join(PKG_ROOT, 'data');
  const logsDir = join(PKG_ROOT, 'logs');
  const distDir = join(PKG_ROOT, 'dist');

  switch (subcommand) {
    case 'all': {
      logHeader('Clean All');

      // Clean data
      if (existsSync(dataDir)) {
        rmSync(dataDir, { recursive: true });
        logSuccess('Removed data/');
      }

      // Clean logs
      if (existsSync(logsDir)) {
        rmSync(logsDir, { recursive: true });
        logSuccess('Removed logs/');
      }

      // Clean dist
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true });
        logSuccess('Removed dist/');
      }

      logSuccess('Cleanup complete');
      break;
    }

    case 'data': {
      logHeader('Clean Data');
      if (existsSync(dataDir)) {
        rmSync(dataDir, { recursive: true });
        logSuccess('Removed data/');
      } else {
        logInfo('No data/ directory');
      }
      break;
    }

    case 'logs': {
      logHeader('Clean Logs');
      if (existsSync(logsDir)) {
        rmSync(logsDir, { recursive: true });
        logSuccess('Removed logs/');
      } else {
        logInfo('No logs/ directory');
      }
      break;
    }

    case 'build': {
      logHeader('Clean Build');
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true });
        logSuccess('Removed dist/');
      } else {
        logInfo('No dist/ directory');
      }
      break;
    }

    default:
      log(`
${c.bold}ami clean${c.reset} - Cleanup operations

${c.cyan}SUBCOMMANDS${c.reset}
  all      Remove data, logs, and build artifacts
  data     Remove collected test data
  logs     Remove log files
  build    Remove compiled output (dist/)

${c.cyan}EXAMPLES${c.reset}
  ami clean all
  ami clean logs
`);
  }
}

// ============================================================================
// Command: analysis
// ============================================================================

async function cmdAnalysis(args: string[]): Promise<void> {
  const subcommand = args[0] || 'help';
  const analysisDir = join(PKG_ROOT, 'analysis');

  switch (subcommand) {
    case 'setup': {
      logHeader('Analysis Setup');

      if (!existsSync(analysisDir)) {
        mkdirSync(analysisDir, { recursive: true });
        logSuccess('Created analysis/');
      }

      logInfo('Installing Python dependencies...');

      const requirementsPath = join(analysisDir, 'requirements.txt');
      if (existsSync(requirementsPath)) {
        try {
          await execAsync(`pip install -r ${requirementsPath} --break-system-packages 2>/dev/null || pip install -r ${requirementsPath}`);
          logSuccess('Dependencies installed');
        } catch (e) {
          logWarn('Some dependencies may not have installed');
          logInfo('Try manually: pip install -r analysis/requirements.txt');
        }
      } else {
        logWarn('No requirements.txt found');
      }
      break;
    }

    case 'jupyter': {
      logHeader('Jupyter Notebook');

      const notebookPath = join(analysisDir, 'sensor_analysis.ipynb');
      if (!existsSync(notebookPath)) {
        logWarn('No notebook found at analysis/sensor_analysis.ipynb');
        return;
      }

      logInfo('Starting Jupyter...');

      const child = spawn('jupyter', ['notebook', notebookPath], {
        cwd: analysisDir,
        stdio: 'inherit',
      });

      child.on('error', () => {
        logError('Jupyter not found');
        logInfo('Install: pip install jupyter');
      });
      break;
    }

    case 'lab': {
      logHeader('JupyterLab');

      logInfo('Starting JupyterLab...');

      const child = spawn('jupyter', ['lab'], {
        cwd: analysisDir,
        stdio: 'inherit',
      });

      child.on('error', () => {
        logError('JupyterLab not found');
        logInfo('Install: pip install jupyterlab');
      });
      break;
    }

    default:
      log(`
${c.bold}ami analysis${c.reset} - Analysis tools

${c.cyan}SUBCOMMANDS${c.reset}
  setup     Install Python dependencies
  jupyter   Open Jupyter Notebook
  lab       Open JupyterLab

${c.cyan}EXAMPLES${c.reset}
  ami analysis setup
  ami analysis jupyter
`);
  }
}

// ============================================================================
// Command: status
// ============================================================================

async function cmdStatus(): Promise<void> {
  logHeader('System Status');

  // Node.js
  logSuccess(`Node.js: ${process.version}`);

  // Platform
  const platform = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
  logSuccess(`Platform: ${platform}`);

  // ADB
  try {
    const { stdout } = await execAsync('adb version 2>/dev/null');
    const version = stdout.split('\n')[0];
    logSuccess(`ADB: ${version}`);
  } catch {
    logWarn('ADB: Not installed');
  }

  // Appium
  try {
    const { stdout } = await execAsync('appium --version 2>/dev/null');
    logSuccess(`Appium: ${stdout.trim()}`);
  } catch {
    log('○ Appium: Not installed (optional)', 'dim');
  }

  // Python
  try {
    const { stdout } = await execAsync('python3 --version 2>/dev/null || python --version');
    logSuccess(`Python: ${stdout.trim()}`);
  } catch {
    logWarn('Python: Not installed');
  }

  // Jupyter
  try {
    const { stdout } = await execAsync('jupyter --version 2>/dev/null | head -1');
    logSuccess(`Jupyter: ${stdout.trim()}`);
  } catch {
    log('○ Jupyter: Not installed (optional)', 'dim');
  }

  // Device count
  const { devices, hardware } = await getAllDevices();
  const remoteDevices = devices.filter(d => d.platform !== 'host');
  log(`\n📱 Devices: ${remoteDevices.length} connected`, remoteDevices.length > 0 ? 'green' : 'yellow');
  if (hardware.cameras.length > 0) {
    log(`   📷 Cameras: ${hardware.cameras.length}`, 'green');
  }
  if (hardware.microphones.length > 0) {
    log(`   🎤 Microphones: ${hardware.microphones.length}`, 'green');
  }
}

// ============================================================================
// Command: chat
// ============================================================================

async function cmdChat(): Promise<void> {
  logHeader('AI Chat Assistant');
  logInfo('Connecting to Ollama...');

  try {
    const { startInteractiveChat } = await import('./llm/ollama-connector.js');
    await startInteractiveChat();
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch')) {
      logError('Ollama is not running');
      logInfo('Start Ollama with: ollama serve');
      logInfo('Install from: https://ollama.ai');
    } else {
      logError(`Failed to start chat: ${error instanceof Error ? error.message : error}`);
    }
  }
}

// ============================================================================
// Command: analyze (TALMM)
// ============================================================================

async function cmdAnalyze(args: string[]): Promise<void> {
  const target = args[0] || 'demo';
  const readerModel = args.find(a => a.startsWith('--reader='))?.split('=')[1];
  const writerModel = args.find(a => a.startsWith('--writer='))?.split('=')[1];
  const deepMode = args.includes('--deep');

  if (target === 'help' || args.includes('--help')) {
    log(`
${c.bold}ami analyze${c.reset} - TALMM Project Analyzer

${c.cyan}USAGE${c.reset}
  ami analyze [target] [options]

${c.cyan}TARGETS${c.reset}
  demo              Analyze the auto-mat-ion demo (default)
  <path>            Analyze a specific project path

${c.cyan}OPTIONS${c.reset}
  --reader=<model>  Ollama model for analysis (default: llama3.2)
  --writer=<model>  Ollama model for test generation (default: same as reader)
  --deep            Enable deep LLM analysis (slower but more detailed)

${c.cyan}EXAMPLES${c.reset}
  ami analyze                                    # Analyze demo
  ami analyze demo --deep                        # Deep analysis of demo
  ami analyze ./projects/my-app                  # Analyze external project
  ami analyze demo --reader=deepseek-coder-v2   # Use specific model

${c.cyan}OUTPUT${c.reset}
  - Scan results (structure, APIs, coverage)
  - LLM analysis (patterns, recommendations)
  - Generated test scripts in ./analyzer-output/

${c.magenta}TALMM${c.reset} - Testing Automatizado Local MultiProyecto MultiDispositivo
`);
    return;
  }

  logHeader('TALMM Project Analyzer');

  try {
    // Import analyzer modules
    const { scanDemo, scanProject } = await import('./analyzer/project-scanner.js');
    const { CodeAnalyzer } = await import('./analyzer/code-analyzer.js');

    // Phase 1: Scan
    logInfo(`Scanning: ${target === 'demo' ? 'auto-mat-ion demo' : target}`);

    const scanResult = target === 'demo'
      ? await scanDemo()
      : await scanProject(target);

    // Display scan results
    log(`\n📁 Project: ${scanResult.projectName}`, 'cyan');
    log(`   Type: ${scanResult.projectType} (${scanResult.framework})`, 'dim');
    log(`   Start: ${scanResult.startCommand || 'N/A'}`, 'dim');

    log(`\n📄 Pages: ${scanResult.structure.htmlPages.length}`, 'cyan');
    for (const page of scanResult.structure.htmlPages.slice(0, 5)) {
      const icon = page.type === 'sensor' ? '🔬' : page.type === 'index' ? '🏠' : '📄';
      log(`   ${icon} ${page.path} [${page.apis.join(', ') || 'no APIs'}]`, 'reset');
    }
    if (scanResult.structure.htmlPages.length > 5) {
      log(`   ... and ${scanResult.structure.htmlPages.length - 5} more`, 'dim');
    }

    log(`\n🔌 Sensor APIs: ${scanResult.sensorApis.length}`, 'cyan');
    for (const api of scanResult.sensorApis) {
      const icon = api.hasTests ? '✓' : '○';
      const color = api.hasTests ? 'green' : 'yellow';
      log(`   ${icon} ${api.api} (${api.category}) - ${api.pages.length} file(s)`, color);
    }

    log(`\n📊 Test Coverage:`, 'cyan');
    log(`   Existing: ${scanResult.coverage.existing.length} test(s)`, 'green');
    log(`   Missing: ${scanResult.coverage.missing.length} API(s)`, 'yellow');
    log(`   Suggestions: ${scanResult.coverage.suggestions.length}`, 'cyan');

    // Phase 2: Deep Analysis (if --deep or Ollama available)
    if (deepMode || scanResult.coverage.suggestions.length > 0) {
      log(`\n${'─'.repeat(60)}`, 'dim');
      logInfo('Starting LLM analysis with Ollama...\n');

      const analyzerConfig = {
        readerModel: readerModel || 'llama3.2',
        writerModel: writerModel || readerModel || 'llama3.2',
        verbose: true,
        outputDir: join(PKG_ROOT, 'analyzer-output'),
      };

      try {
        const analyzer = new CodeAnalyzer(analyzerConfig);
        const modelStatus = await analyzer.checkModels();

        if (!modelStatus.available) {
          logWarn('Ollama not available. Skipping LLM analysis.');
          logInfo('Start Ollama with: ollama serve');
        } else {
          log(`\n🤖 Available models: ${modelStatus.models.slice(0, 5).join(', ')}`, 'dim');

          const result = await analyzer.analyze(scanResult);

          // Display LLM results
          log(`\n${'─'.repeat(60)}`, 'dim');
          log(`\n📝 LLM Analysis Summary:`, 'cyan');
          log(`   ${result.llmAnalysis.summary}`, 'reset');

          if (result.llmAnalysis.patterns.length > 0) {
            log(`\n🔍 Patterns detected:`, 'cyan');
            for (const pattern of result.llmAnalysis.patterns.slice(0, 5)) {
              log(`   • ${pattern}`, 'reset');
            }
          }

          if (result.llmAnalysis.testPlan.length > 0) {
            log(`\n🧪 Generated Tests:`, 'green');
            for (const test of result.llmAnalysis.testPlan) {
              log(`   ✓ ${test.name} (${test.priority})`, 'green');
              log(`     → ${test.description}`, 'dim');
            }
          }

          log(`\n📂 Output saved to: ${analyzerConfig.outputDir}`, 'cyan');
        }
      } catch (error) {
        logWarn(`LLM analysis failed: ${error instanceof Error ? error.message : error}`);
        logInfo('Scan results are still available above.');
      }
    }

    logSuccess('\nAnalysis complete!');

  } catch (error) {
    logError(`Analysis failed: ${error instanceof Error ? error.message : error}`);
  }
}

// ============================================================================
// Command: test (Natural Language Tests)
// ============================================================================

async function cmdTest(args: string[]): Promise<void> {
  const description = args.join(' ');

  if (!description) {
    log(`
${c.bold}ami test${c.reset} - Natural language test execution

${c.cyan}USAGE${c.reset}
  ami test <description>

${c.cyan}DESCRIPTION${c.reset}
  Run tests described in natural language. The system will:
  1. Parse your description into test definitions
  2. Generate appropriate browser scripts
  3. Execute on available devices
  4. Save results to ./test-results/

${c.cyan}EXAMPLES${c.reset}
  ami test capture image with each camera
  ami test record 5 second video with max resolution
  ami test capture and record with back camera
  ami test analyze audio for 10 seconds
  ami test capture from all cameras on all devices

${c.cyan}KEYWORDS${c.reset}
  Camera:   capture, image, foto, photo, record, video, grab
  Audio:    audio, microphone, micrófono, sound, sonido
  Duration: N seconds, N segundos (e.g., "5 seconds")
  Target:   each camera, all cameras, front, back
  Quality:  max resolution, high quality, máxima resolución

${c.cyan}INTEGRATION${c.reset}
  This command is designed to work with Ollama AI assistant.
  Use "ami chat" to describe complex tests in conversation.
`);
    return;
  }

  logHeader('Natural Language Test');
  logInfo(`Description: "${description}"`);

  try {
    const { runTestFromDescription } = await import('./llm/test-orchestrator.js');
    const session = await runTestFromDescription(description);

    log(`\n📊 Session: ${session.id}`, 'cyan');
    log(`   Status: ${session.status}`, session.status === 'completed' ? 'green' : 'yellow');
    log(`   Tests: ${session.tests.length}`, 'reset');
    log(`   Results: ${session.results.length}`, 'reset');

    // Show results
    for (const result of session.results) {
      const icon = result.success ? '✓' : '✗';
      const color = result.success ? 'green' : 'red';
      log(`\n   ${icon} ${result.testId}`, color);
      log(`     Device: ${result.deviceId}`, 'dim');
      log(`     Duration: ${result.duration}ms`, 'dim');

      if (result.artifacts && result.artifacts.length > 0) {
        log(`     Artifacts:`, 'cyan');
        for (const artifact of result.artifacts) {
          log(`       📄 ${artifact}`, 'reset');
        }
      }

      if (result.error) {
        log(`     Error: ${result.error}`, 'red');
      }
    }

    if (session.status === 'completed') {
      logSuccess('\nAll tests completed!');
    } else if (session.status === 'failed') {
      logWarn('\nSome tests failed. Check results above.');
    }

  } catch (error) {
    logError(`Test execution failed: ${error instanceof Error ? error.message : error}`);
  }
}

// ============================================================================
// Main Help
// ============================================================================

function showHelp(): void {
  console.log(`
${c.bold}auto-mat-ion${c.reset} (ami) - Distributed Device Testing Framework

${c.cyan}USAGE${c.reset}
  ami <command> [subcommand] [options]

${c.cyan}COMMANDS${c.reset}
  demo       Demo server and test pages
  devices    Device discovery and management
  run        Basic test execution
  test       Natural language tests (AI-powered)
  analyze    TALMM project analyzer (LLM-powered)
  clean      Cleanup operations
  analysis   Python analysis tools
  chat       AI assistant (requires Ollama)
  status     System status

${c.cyan}QUICK START${c.reset}
  ami devices list          # See connected devices
  ami demo serve            # Start demo server
  ami run quick             # Quick test on first device

${c.cyan}AI-POWERED FEATURES${c.reset}
  ami test capture image    # Natural language test
  ami analyze               # Analyze demo, find missing tests
  ami analyze --deep        # Deep LLM analysis
  ami chat                  # Interactive AI assistant

${c.cyan}EXAMPLES${c.reset}
  ami demo serve 8080       # Start on port 8080
  ami devices setup emu-5554 # Setup emulator
  ami run zepto             # Connectivity test
  ami analyze demo          # Analyze project structure

${c.magenta}TALMM${c.reset} - Testing Automatizado Local MultiProyecto MultiDispositivo
${c.dim}Part of the UTOP.IA ecosystem${c.reset}
`);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'demo':
        await cmdDemo(args.slice(1));
        break;

      case 'devices':
      case 'device':
      case 'd':
        await cmdDevices(args.slice(1));
        break;

      case 'run':
      case 'r':
        await cmdRun(args.slice(1));
        break;

      case 'test':
      case 't':
        await cmdTest(args.slice(1));
        break;

      case 'clean':
      case 'c':
        await cmdClean(args.slice(1));
        break;

      case 'analyze':
        await cmdAnalyze(args.slice(1));
        break;

      case 'analysis':
      case 'a':
        await cmdAnalysis(args.slice(1));
        break;

      case 'status':
      case 's':
        await cmdStatus();
        break;

      case 'chat':
      case 'ai':
        await cmdChat();
        break;

      case 'help':
      case '--help':
      case '-h':
      case undefined:
        showHelp();
        break;

      default:
        logError(`Unknown command: ${command}`);
        log('Run "ami help" for usage.', 'dim');
        process.exit(1);
    }
  } catch (error) {
    logError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
