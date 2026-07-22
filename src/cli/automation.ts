#!/usr/bin/env npx tsx
/**
 * `npm run automation` — drive the sauron demo's full SDK-equivalent
 * pipeline (Sauron checkCameras + Nazgul + Galadriel + recording upload)
 * across one or more real devices.
 *
 * Replaces the legacy sauron `automation:*` Puppeteer scripts. The demo
 * is now URL-parametric and authoritative: this CLI just navigates,
 * polls window.__sauronTestComplete, and reports.
 *
 * Examples:
 *   npm run automation                                     # auto-detect device, 1 rep
 *   npm run automation -- --devices iphone --reps 50
 *   npm run automation -- --devices iphone,android --reps 50 --label real
 *   npm run automation -- --devices android,desktop        # ALL connected androids + desktop
 *   npm run automation -- --devices android --android-devices S1,S2  # specific serials
 *   npm run automation -- --devices android,desktop --parallel       # opt-in to concurrent runs
 *   npm run automation -- --preset standard --camera back
 *   npm run automation -- --dry-run
 *
 * Devices vs. serials:
 *   `--devices` chooses kinds (iphone / android / desktop). For Android the
 *   default is to enumerate every device returned by `adb devices` and run
 *   on all of them. Use `--android-devices S1,S2` to pin a specific subset.
 *
 * Execution mode:
 *   Sequential by default (one device at a time). Pass `--parallel` to run
 *   all attached devices concurrently — useful for throughput, but two
 *   Android phones competing for the same adb socket may interleave logs.
 */

import { platform as osPlatform } from 'os';
import {
  createIOSController,
  createAndroidController,
  createMacOSController,
  createLinuxController,
  createWindowsController,
  listAndroidDevices,
  startAppiumServer,
  type IOSController,
  type AndroidController,
  type MacOSController,
  type LinuxController,
  type WindowsController,
} from '../execution/index.js';
import {
  runSauronOnDevice,
  enumerateCameras,
  detectLanIp,
  type IBrowserDriver,
  type ISauronRunResult,
  SauronRunError,
} from '../integrations/sauron/runner.js';

// ============================================================================
// CLI args
// ============================================================================

type DeviceKind = 'iphone' | 'android' | 'desktop';

/**
 * A concrete attach target — one (kind, serial) pair. Multiple Android
 * devices expand into multiple targets sharing kind='android' but with
 * distinct serials. Desktop has no serial (always one local host).
 */
interface IDeviceTarget {
  kind: DeviceKind;
  serial?: string;
}

interface IArgs {
  devices: DeviceKind[];
  reps: number;
  label: 'real' | 'sintetico';
  preset: 'minimal' | 'standard';
  camera: 'front' | 'back';
  /** Enumerate cameras on each device and capture one rep per camera (×reps). */
  allCameras: boolean;
  parallel: boolean;
  sauronHost?: string;
  sauronPort: number;
  sauronScheme: 'http' | 'https';
  appiumPort: number;
  iphoneUdid?: string;
  iphoneWrapperPath?: string;
  /**
   * Explicit list of Android serials. When `android` is in `--devices`
   * and this is empty, ALL connected Android devices reported by
   * `adb devices` are used automatically.
   */
  androidSerials: string[];
  dryRun: boolean;
  failFast: boolean;
}

function parseArgs(argv: string[]): IArgs {
  const args = argv.slice(2);
  // lastIndexOf so user-supplied args override defaults injected by callers
  // (e.g. sauron's `npm run automation` script which prepends `--devices desktop`).
  const get = (flag: string): string | undefined => {
    const i = args.lastIndexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const devicesArg = get('--devices');
  const devices = (devicesArg ? devicesArg.split(',') : ['iphone'])
    .map((d) => d.trim().toLowerCase())
    .filter((d): d is DeviceKind => d === 'iphone' || d === 'android' || d === 'desktop');

  // `--android-devices S1,S2` is the new plural form. Falls back to the
  // legacy `--android-serial` (singular) for back-compat with existing
  // env / scripts. When neither is provided, resolveTargets() will
  // auto-discover every connected Android via adb.
  const androidArg =
    get('--android-devices') ?? get('--android-serial') ?? process.env.ANDROID_SERIAL ?? '';
  const androidSerials = androidArg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Default execution mode is SERIAL — one device runs at a time. Pass
  // `--parallel` to run all attached devices concurrently. The legacy
  // `--sequential` flag is accepted as a no-op for back-compat.
  const parallel = has('--parallel') && !has('--sequential');

  return {
    devices,
    reps: Number(get('--reps') ?? 1),
    label: ((get('--label') ?? 'real') as 'real' | 'sintetico'),
    preset: ((get('--preset') ?? 'minimal') as 'minimal' | 'standard'),
    camera: ((get('--camera') ?? 'front') as 'front' | 'back'),
    allCameras: has('--all-cameras'),
    parallel,
    sauronHost: get('--sauron-host') ?? process.env.SAURON_HOST,
    sauronPort: Number(get('--sauron-port') ?? process.env.SAURON_PORT ?? 3000),
    sauronScheme: ((get('--sauron-scheme') ?? process.env.SAURON_SCHEME ?? 'https') as 'http' | 'https'),
    appiumPort: Number(get('--appium-port') ?? process.env.APPIUM_PORT ?? 4723),
    iphoneUdid: get('--iphone-udid') ?? process.env.DEVICE_UDID,
    iphoneWrapperPath: get('--iphone-wrapper-path') ?? process.env.WRAPPER_APP_PATH,
    androidSerials,
    dryRun: has('--dry-run'),
    failFast: has('--fail-fast'),
  };
}

/**
 * Expand the list of device kinds into concrete (kind, serial) targets.
 *
 * - `android` with `--android-devices S1,S2` → one target per listed serial.
 * - `android` with no serials → auto-discover EVERY connected Android via
 *   `adb devices` and create one target per device. This is the new default
 *   so a user with two phones plugged in gets both exercised without
 *   passing any extra flag.
 * - `iphone` → single target (the singular --iphone-udid model is preserved).
 * - `desktop` → single target (always the local host).
 */
async function resolveTargets(args: IArgs): Promise<IDeviceTarget[]> {
  const targets: IDeviceTarget[] = [];
  for (const kind of args.devices) {
    if (kind === 'android') {
      if (args.androidSerials.length > 0) {
        for (const s of args.androidSerials) targets.push({ kind: 'android', serial: s });
      } else {
        const discovered = await listAndroidDevices();
        const usable = discovered.filter((d) => d.status === 'device');
        if (usable.length === 0) {
          throw new Error(
            'No Android devices reported by `adb devices` (status=device). ' +
              'Connect a phone with USB debugging authorised, or pass ' +
              '--android-devices S1[,S2,...] explicitly.',
          );
        }
        for (const d of usable) targets.push({ kind: 'android', serial: d.serial });
      }
    } else if (kind === 'iphone') {
      targets.push({ kind: 'iphone', serial: args.iphoneUdid });
    } else {
      targets.push({ kind: 'desktop' });
    }
  }
  return targets;
}

// ============================================================================
// Device handles
// ============================================================================

interface IDeviceHandle {
  kind: DeviceKind;
  /** Browser tag for reporting (e.g. 'wkwebview', 'chrome-android', 'chrome-macos'). */
  browserTag: string;
  id: string;
  driver: IBrowserDriver;
  /** Per-device cleanup. */
  disconnect: () => Promise<void>;
}

const IPHONE_DEFAULT_WRAPPER =
  '/Users/unknown1/Library/Developer/Xcode/DerivedData/AutomationWebView-cbhraxxkvicecrgimyaqpjewmcfo/Build/Products/Debug-iphoneos/AutomationWebView.app';

async function attachIPhone(target: IDeviceTarget, args: IArgs): Promise<IDeviceHandle> {
  const udid = target.serial ?? args.iphoneUdid;
  const ctrl: IOSController = createIOSController(udid, {
    appiumUrl: `http://127.0.0.1:${args.appiumPort}`,
    useWrapperApp: true,
    wrapperAppPath: args.iphoneWrapperPath ?? IPHONE_DEFAULT_WRAPPER,
  });
  await ctrl.initialize();
  await ctrl.connect();
  return {
    kind: 'iphone',
    browserTag: 'wkwebview',
    id: udid ?? '<auto>',
    driver: ctrl,
    disconnect: () => ctrl.disconnect(),
  };
}

async function attachAndroid(target: IDeviceTarget, _args: IArgs): Promise<IDeviceHandle> {
  // AndroidController.launchBrowser hardcodes --ignore-certificate-errors,
  // --use-fake-ui-for-media-stream, and CDP remote debugging. No options needed.
  // The serial is bound per-target so two parallel attaches operate on
  // different physical devices via `adb -s <serial>`.
  const ctrl: AndroidController = createAndroidController(target.serial);
  await ctrl.initialize();
  await ctrl.launchBrowser('chrome');
  return {
    kind: 'android',
    browserTag: 'chrome-android',
    id: target.serial ?? '<auto>',
    driver: ctrl,
    disconnect: () => ctrl.disconnect(),
  };
}

/**
 * Local desktop host (whatever the CLI is running on). Picks the right
 * controller per OS and launches Chrome with camera permission pre-granted.
 */
async function attachDesktop(_target: IDeviceTarget, _args: IArgs): Promise<IDeviceHandle> {
  const p = osPlatform();
  let ctrl: MacOSController | LinuxController | WindowsController;
  let browserTag: string;
  let id: string;
  if (p === 'darwin') {
    ctrl = createMacOSController();
    browserTag = 'chrome-macos';
    id = 'desktop-macos';
  } else if (p === 'linux') {
    ctrl = createLinuxController();
    browserTag = 'chrome-linux';
    id = 'desktop-linux';
  } else if (p === 'win32') {
    ctrl = createWindowsController();
    browserTag = 'chrome-windows';
    id = 'desktop-windows';
  } else {
    throw new Error(`Unsupported desktop platform: ${p}`);
  }

  await ctrl.initialize();
  await ctrl.launchBrowser('chrome', {
    grantCameraPermission: true,
    args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream'],
  });
  return {
    kind: 'desktop',
    browserTag,
    id,
    driver: ctrl,
    disconnect: async () => {
      await ctrl.closeBrowser().catch(() => {});
      await ctrl.cleanup().catch(() => {});
    },
  };
}

async function attachDevice(target: IDeviceTarget, args: IArgs): Promise<IDeviceHandle> {
  if (target.kind === 'iphone') return attachIPhone(target, args);
  if (target.kind === 'android') return attachAndroid(target, args);
  return attachDesktop(target, args);
}

// ============================================================================
// Run loop
// ============================================================================

interface IRunRecord {
  device: string;
  rep: number;
  testId: string;
  ok: boolean;
  elapsedMs: number;
  error?: string;
  result?: ISauronRunResult;
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

/** Build the per-handle log/record tag — kind plus serial when available
 *  so that two parallel Android runs are distinguishable in the output. */
function tagOf(handle: IDeviceHandle): string {
  return handle.id && handle.id !== '<auto>' ? `${handle.kind}:${handle.id}` : handle.kind;
}

async function resolveCameraIndices(
  handle: IDeviceHandle,
  args: IArgs,
): Promise<number[]> {
  if (!args.allCameras) {
    return [args.camera === 'back' ? 1 : 0];
  }
  const tag = tagOf(handle);
  log(`[${tag}] Enumerating cameras...`);
  const { count, list } = await enumerateCameras(handle.driver, {
    host: args.sauronHost,
    port: args.sauronPort,
    scheme: args.sauronScheme,
  });
  log(
    `[${tag}] Found ${count} camera(s)${
      list.length ? ': ' + list.map((c, i) => `${i}=${c.label || '?'}`).join(', ') : ''
    }`,
  );
  if (count === 0) throw new Error(`No cameras enumerated on ${tag}.`);
  return Array.from({ length: count }, (_, i) => i);
}

async function runOnDevice(
  handle: IDeviceHandle,
  args: IArgs,
): Promise<IRunRecord[]> {
  const records: IRunRecord[] = [];
  const tag = tagOf(handle);
  const cameraIndices = await resolveCameraIndices(handle, args);

  for (const camIdx of cameraIndices) {
    for (let rep = 1; rep <= args.reps; rep++) {
      // testId carries the serial (when present) so two phones running in
      // parallel produce non-colliding identifiers downstream.
      const testId = `${tag.replace(':', '_')}-${args.preset}-${args.label}-cam${camIdx}-r${rep}-${Date.now()}`;
      log(`[${tag}] cam${camIdx} rep ${rep}/${args.reps} — testId=${testId}`);
      try {
        const result = await runSauronOnDevice(handle.driver, {
          host: args.sauronHost,
          port: args.sauronPort,
          scheme: args.sauronScheme,
          galadrielPreset: args.preset,
          cameraIndex: camIdx,
          testId,
          browser: handle.browserTag,
        });
        const d = result.diagnostics;
        const diagStr = d
          ? ` [uploadsLeft=${d.uploadsInProgress} verdict=${d.firstResult ? d.firstResult.verdict : '?'}]`
          : '';
        log(`[${tag}] cam${camIdx} rep ${rep} ✓ ${result.elapsedMs}ms${diagStr}`);
        if (d && Array.isArray(d.galadrielTrail) && d.galadrielTrail.length) {
          const last = d.galadrielTrail[d.galadrielTrail.length - 1];
          log(
            `[${tag}]   ↳ galadriel: ok=${last.ok} mode=${last.mode} ` +
              `streamPresent=${last.streamPresent} sauronResult=${last.sauronResultPresent} ` +
              (last.error
                ? `error="${last.error}"`
                : `changes=${last.constraintChanges} jitter=${last.hasJitter} ` +
                  `boost=${last.hasBoost} blob=${last.videoBlobSize}B`),
          );
        } else if (d) {
          log(`[${tag}]   ↳ galadriel: NEVER RAN (window.__sauronDiag is empty/null)`);
        }
        if (result.consoleSnippet && result.consoleSnippet.length) {
          for (const line of result.consoleSnippet) {
            log(`[${tag}]   │ ${line}`);
          }
        }
        records.push({ device: tag, rep, testId, ok: true, elapsedMs: result.elapsedMs, result });
      } catch (err) {
        const msg = err instanceof SauronRunError ? `[${err.stage}] ${err.message}` : String(err);
        log(`[${tag}] cam${camIdx} rep ${rep} ✗ ${msg}`);
        records.push({ device: tag, rep, testId, ok: false, elapsedMs: 0, error: msg });
        if (args.failFast) throw err;
      }
    }
  }
  return records;
}

// ============================================================================
// Main
// ============================================================================

async function appiumReachable(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const host = args.sauronHost ?? detectLanIp();

  if (args.devices.length === 0) {
    console.error('No valid devices specified. Use --devices iphone,android,desktop');
    process.exit(2);
  }

  // Resolve kinds → concrete (kind, serial) targets BEFORE printing the
  // banner so the user sees exactly how many devices will be exercised
  // (auto-discovered androids included).
  let targets: IDeviceTarget[];
  try {
    targets = await resolveTargets(args);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }

  const targetSummary = targets
    .map((t) => (t.serial ? `${t.kind}:${t.serial}` : t.kind))
    .join(', ');
  log(`Devices:    ${targetSummary}`);
  log(`Reps:       ${args.reps} per device`);
  log(`Preset:     ${args.preset}`);
  log(`Label (GT): ${args.label}`);
  log(`Camera:     ${args.allCameras ? 'ALL (enumerated per device)' : args.camera}`);
  log(`Sauron:     ${args.sauronScheme}://${host}:${args.sauronPort}`);
  log(`Mode:       ${args.parallel ? 'parallel' : 'sequential'}${args.dryRun ? ' (dry-run)' : ''}`);

  if (args.dryRun) {
    for (const t of targets) {
      const tag = t.serial ? `${t.kind}:${t.serial}` : t.kind;
      for (let rep = 1; rep <= args.reps; rep++) {
        const testId = `${t.kind}-${args.preset}-${args.label}-${args.camera}-r${rep}-<ts>`;
        const url = `${args.sauronScheme}://${host}:${args.sauronPort}/?autoStart=true&testId=${testId}&cameraIndex=${args.camera === 'back' ? 1 : 0}&galadrielPreset=${args.preset}`;
        console.log(`  [dry] ${tag}: ${url}`);
      }
    }
    return;
  }

  if (targets.some((t) => t.kind === 'iphone') && !(await appiumReachable(args.appiumPort))) {
    log(`Appium not running on :${args.appiumPort} — starting...`);
    await startAppiumServer(args.appiumPort);
  }

  log('Attaching devices...');
  const handles: IDeviceHandle[] = [];
  for (const t of targets) {
    const tag = t.serial ? `${t.kind}:${t.serial}` : t.kind;
    try {
      handles.push(await attachDevice(t, args));
      log(`  ${tag} attached.`);
    } catch (err) {
      log(`  ${tag} FAILED: ${(err as Error).message}`);
      if (args.failFast) {
        for (const h of handles) await h.disconnect().catch(() => {});
        process.exit(3);
      }
    }
  }

  if (handles.length === 0) {
    console.error('No devices attached successfully.');
    process.exit(3);
  }

  log(`Running ${args.reps} rep(s) × ${handles.length} device(s) = ${args.reps * handles.length} captures total.`);
  const startedAt = Date.now();

  const allRecords: IRunRecord[] = [];
  if (args.parallel) {
    const perDevice = await Promise.allSettled(handles.map((h) => runOnDevice(h, args)));
    for (const r of perDevice) {
      if (r.status === 'fulfilled') allRecords.push(...r.value);
    }
  } else {
    for (const h of handles) {
      allRecords.push(...(await runOnDevice(h, args)));
    }
  }

  log('Disconnecting devices...');
  for (const h of handles) await h.disconnect().catch(() => {});

  // ── Summary ──
  const total = allRecords.length;
  const ok = allRecords.filter((r) => r.ok).length;
  const fail = total - ok;
  const totalMs = Date.now() - startedAt;
  log(`Done in ${(totalMs / 1000).toFixed(1)}s. ${ok}/${total} succeeded${fail > 0 ? `, ${fail} failed` : ''}.`);

  const byDevice: Record<string, { ok: number; fail: number; avgMs: number }> = {};
  for (const r of allRecords) {
    const d = (byDevice[r.device] ??= { ok: 0, fail: 0, avgMs: 0 });
    if (r.ok) {
      d.ok++;
      d.avgMs = (d.avgMs * (d.ok - 1) + r.elapsedMs) / d.ok;
    } else {
      d.fail++;
    }
  }
  for (const [device, stats] of Object.entries(byDevice)) {
    log(`  ${device}: ${stats.ok} ok, ${stats.fail} fail, avg ${Math.round(stats.avgMs)}ms`);
  }

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
