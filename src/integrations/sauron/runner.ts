/**
 * Sauron full-pipeline runner. Drives the sauron demo's auto-start flow,
 * which executes the SDK-equivalent battery: checkCameras() (Sauron core +
 * Nazgul + library Galadriel preset), uploads the recording, persists the
 * sidecar to sauron's recordings/ directory.
 *
 * The runner is platform-agnostic: it accepts any controller exposing
 * navigateTo + executeScript (IOSController, AndroidController, …).
 */

import { networkInterfaces } from 'os';

export interface IBrowserDriver {
  navigateTo(url: string): Promise<void>;
  executeScript<T>(script: string, timeout?: number): Promise<T>;
  /** Optional — when present, runner can dump the browser console for diagnostics. */
  getConsoleLogs?(): Promise<string[]>;
}

export interface ISauronRunOptions {
  /** sauron demo server host. Defaults to first non-loopback IPv4. */
  host?: string;
  port?: number;
  scheme?: 'http' | 'https';

  /** Galadriel library preset (overrides the demo's default stress preset). */
  galadrielPreset?: 'minimal' | 'standard';
  /** Camera index in the device's enumerateDevices() list. */
  cameraIndex?: number;
  /** Free-form ID — encoded in the upload sidecar for traceability. */
  testId: string;
  /** Browser tag for reporting. */
  browser?: string;

  /** Polling cadence for window.__sauronTestComplete. */
  pollIntervalMs?: number;
  /** Hard timeout for the whole flow (Galadriel iOS ~3.5s + recording + upload). */
  timeoutMs?: number;
}

export interface ISauronRunResult {
  testId: string;
  browser?: string;
  cameraIndex: number;
  cameraLabel?: string;
  results?: Array<{ camera: string; verdict: string; confidence: number }>;
  /** Wall-clock ms from URL navigation to result. */
  elapsedMs: number;
  /** Raw `window.__sauronTestComplete` payload. */
  raw: unknown;
  /** Snapshot of demo internals via exposed window globals. */
  diagnostics?: {
    uploadsInProgress: number | null;
    cameraCount: number | null;
    camerasDone: number | null;
    testCompleteKeys: string[] | null;
    firstResult: any;
    galadrielTrail: any[] | null;
  } | null;
  /** Last 15 console lines matching galadriel/upload/error filters. */
  consoleSnippet?: string[];
}

export class SauronRunError extends Error {
  constructor(
    message: string,
    public readonly testId: string,
    public readonly stage: 'navigate' | 'poll' | 'timeout' | 'demo',
  ) {
    super(message);
    this.name = 'SauronRunError';
  }
}

export function detectLanIp(): string {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const addr of ifaces[name] || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  throw new Error('Could not detect LAN IPv4 — set host explicitly.');
}

export function buildSauronUrl(opts: ISauronRunOptions): string {
  const host = opts.host ?? detectLanIp();
  const port = opts.port ?? 3000;
  const scheme = opts.scheme ?? 'https';
  const params = new URLSearchParams({
    autoStart: 'true',
    testId: opts.testId,
    cameraIndex: String(opts.cameraIndex ?? 0),
  });
  if (opts.galadrielPreset) params.set('galadrielPreset', opts.galadrielPreset);
  if (opts.browser) params.set('browser', opts.browser);
  return `${scheme}://${host}:${port}/?${params.toString()}`;
}

/**
 * Enumeration-only navigation: open the demo without autoStart and wait
 * for `window.__sauronCameraCount` to be populated. Returns the count and
 * (when available) the camera list. Used by `--all-cameras` to know how
 * many captures to schedule per device.
 */
export async function enumerateCameras(
  driver: IBrowserDriver,
  opts: { host?: string; port?: number; scheme?: 'http' | 'https'; timeoutMs?: number },
): Promise<{ count: number; list: Array<{ deviceId?: string; label?: string }> }> {
  const host = opts.host ?? detectLanIp();
  const port = opts.port ?? 3000;
  const scheme = opts.scheme ?? 'https';
  const url = `${scheme}://${host}:${port}/?enumerateOnly=true`;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  await driver.navigateTo(url);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const count = await driver.executeScript<number | null>(
        'typeof window.__sauronCameraCount === "number" ? window.__sauronCameraCount : null',
      );
      if (typeof count === 'number' && count >= 0) {
        const list = await driver.executeScript<Array<{ deviceId?: string; label?: string }>>(
          'window.__sauronCameraList || []',
        );
        return { count, list: Array.isArray(list) ? list : [] };
      }
    } catch {
      /* page still loading */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Camera enumeration timed out after ${timeoutMs}ms.`);
}

/**
 * Drive the demo to completion. Returns when window.__sauronTestComplete
 * is populated AND has no `error` field. Throws SauronRunError otherwise.
 */
export async function runSauronOnDevice(
  driver: IBrowserDriver,
  opts: ISauronRunOptions,
): Promise<ISauronRunResult> {
  const url = buildSauronUrl(opts);
  const pollMs = opts.pollIntervalMs ?? 1000;
  const timeoutMs = opts.timeoutMs ?? 90_000;

  const startedAt = Date.now();
  try {
    await driver.navigateTo(url);
  } catch (err) {
    throw new SauronRunError(
      `Failed to navigate to ${url}: ${(err as Error).message}`,
      opts.testId,
      'navigate',
    );
  }

  while (Date.now() - startedAt < timeoutMs) {
    let payload: any = null;
    try {
      payload = await driver.executeScript<unknown>(
        'window.__sauronTestComplete',
      );
    } catch {
      // transient — page might still be loading
    }
    if (payload && typeof payload === 'object') {
      if (payload.error) {
        throw new SauronRunError(
          `Demo reported error: ${payload.error}`,
          opts.testId,
          'demo',
        );
      }
      // Pull what's actually exposed on window. The demo's `state` is module-
      // scoped (not window-attached) so we can only read what it explicitly
      // publishes: __sauronUploadsInProgress + __sauronTestComplete + camera
      // counts. That's enough to see whether a capture reached the upload
      // phase and whether uploads are stuck.
      let diag: any = null;
      try {
        diag = await driver.executeScript<any>(
          `(() => ({
            uploadsInProgress: typeof window.__sauronUploadsInProgress === 'number' ? window.__sauronUploadsInProgress : null,
            cameraCount: typeof window.__sauronCameraCount === 'number' ? window.__sauronCameraCount : null,
            camerasDone: typeof window.__sauronCamerasDone === 'number' ? window.__sauronCamerasDone : null,
            testCompleteKeys: window.__sauronTestComplete ? Object.keys(window.__sauronTestComplete) : null,
            firstResult: window.__sauronTestComplete && window.__sauronTestComplete.results && window.__sauronTestComplete.results[0] || null,
            galadrielTrail: Array.isArray(window.__sauronDiag) ? window.__sauronDiag : null,
          }))()`,
        );
      } catch { /* best-effort */ }

      // Pull recent browser console lines if the controller captured them.
      // Filter to galadriel/upload/error chatter so the user can see the
      // actual cause of any silent failure without DevTools.
      let consoleSnippet: string[] = [];
      if (typeof driver.getConsoleLogs === 'function') {
        try {
          const all = await driver.getConsoleLogs();
          consoleSnippet = all
            .filter((line) =>
              /galadriel|sauron|automation|error|upload|recording|analyze/i.test(line),
            )
            .slice(-15);
        } catch { /* best-effort */ }
      }

      return {
        testId: payload.testId ?? opts.testId,
        browser: payload.browser ?? opts.browser,
        cameraIndex: payload.cameraIndex ?? opts.cameraIndex ?? 0,
        cameraLabel: payload.cameraLabel,
        results: payload.results,
        elapsedMs: Date.now() - startedAt,
        raw: payload,
        diagnostics: diag,
        consoleSnippet,
      };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new SauronRunError(
    `Timed out after ${timeoutMs}ms waiting for window.__sauronTestComplete`,
    opts.testId,
    'timeout',
  );
}
