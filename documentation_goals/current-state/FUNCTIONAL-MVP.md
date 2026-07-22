# auto-mat-ion Functional MVP

> Document Version: January 31, 2026
> Status: **OPERATIONAL** ✅

## Executive Summary

The core test automation loop is now functional. Tests can be automatically executed across multiple platforms (macOS, Android) with results uploaded to a central server.

---

## Working Components

### 1. CLI (`ami`)

**Location:** `src/cli.ts`

| Command | Status | Description |
|---------|--------|-------------|
| `ami devices` | ✅ Working | Lists all detected devices (host, Android, USB cameras) |
| `ami run full` | ✅ Working | Auto-executes tests on all detected devices |
| `ami run host` | ✅ Working | Runs tests only on host machine |
| `ami run quick` | ✅ Working | Quick camera capture test |
| `ami server` | ✅ Working | Starts the demo server |
| `ami help` | ✅ Working | Shows available commands |

**Device Detection Flow:**
```
detectHostDevice()     → Host OS info (macOS/Windows/Linux)
detectHostHardware()   → Available cameras/microphones
detectAndroidDevices() → Connected Android devices via ADB
getAllDevices()        → Combined list of all devices
```

### 2. Demo Server

**Location:** `demo/server/index.ts`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/devices` | GET | List ADB devices |
| `/api/results/upload` | POST | Upload test results (images/videos/JSON) |
| `/api/results` | GET | List all uploaded results |
| `/api/results/latest` | GET | Get last 10 results |
| `/api/results/file/:id` | GET | Download specific result |
| `/sensors/camera.html` | GET | Camera test page with autorun |

**Key Features:**
- Static file serving from `demo/pages/` and `demo/lib/`
- ADB reverse setup for Android devices
- Results stored in `data/results/` with index.json

### 3. TestRunner (Browser)

**Location:** `demo/lib/test-runner.js`

The TestRunner handles automatic test execution when a page loads with `?autorun=true`:

```javascript
// URL parameters supported:
?autorun=true          // Enable auto-execution
&action=capture|record|all  // Test type
&testname=my-test      // Name for results
```

**Execution Flow:**
1. Page loads with autorun parameters
2. TestRunner parses URL parameters
3. Requests camera permissions
4. Executes capture/record tests
5. Uploads results via ResultsClient
6. Shows success/error banner

### 4. ResultsClient (Browser)

**Location:** `demo/lib/results-client.js`

```javascript
// API
ResultsClient.uploadImage(dataUrl, testName)
ResultsClient.uploadVideo(blob, testName)
ResultsClient.uploadJSON(data, testName)
ResultsClient.configure({ serverUrl, deviceId, deviceName })
```

---

## Data Flow

```
┌──────────────┐
│  ami run     │
│  full        │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  For each detected device:                            │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   macOS     │  │   Android   │  │   Windows   │  │
│  │  open URL   │  │  adb shell  │  │  start URL  │  │
│  │  in Chrome  │  │  am start   │  │  in browser │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
│         └────────────────┼────────────────┘          │
│                          ▼                           │
│         ┌────────────────────────────┐               │
│         │  camera.html?autorun=true  │               │
│         │  &action=all               │               │
│         │  &testname=auto-test       │               │
│         └──────────────┬─────────────┘               │
│                        ▼                             │
│         ┌────────────────────────────┐               │
│         │     TestRunner.js          │               │
│         │  1. Parse URL params       │               │
│         │  2. Request camera         │               │
│         │  3. Capture/Record         │               │
│         │  4. Upload results         │               │
│         └──────────────┬─────────────┘               │
│                        ▼                             │
│         ┌────────────────────────────┐               │
│         │  POST /api/results/upload  │               │
│         │  Headers:                  │               │
│         │   X-Device-Id              │               │
│         │   X-Device-Name            │               │
│         │   X-Test-Name              │               │
│         └────────────────────────────┘               │
└──────────────────────────────────────────────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │  Demo Server       │
              │  data/results/     │
              │  ├── index.json    │
              │  ├── capture_*.png │
              │  └── record_*.webm │
              └────────────────────┘
```

---

## File Structure

```
auto-mat-ion/
├── src/
│   └── cli.ts              # Main CLI with device detection
├── demo/
│   ├── server/
│   │   └── index.ts        # Demo server with results API
│   ├── lib/
│   │   ├── test-runner.js  # Browser autorun logic
│   │   └── results-client.js # Upload client
│   └── pages/
│       ├── index.html      # Demo landing page
│       └── sensors/
│           └── camera.html # Camera test page
├── data/
│   └── results/            # Uploaded test results
│       └── index.json      # Results metadata
└── dist/                   # Compiled CLI
```

---

## Platform-Specific Notes

### macOS
- Uses `open` command to launch default browser
- Camera permissions via browser prompt
- Works with Chrome, Safari, Firefox

### Android
- Requires ADB connection (USB or WiFi)
- Uses `adb reverse tcp:8891 tcp:8891` for localhost access
- Opens URL via `am start -a android.intent.action.VIEW`
- Camera permissions pre-granted or prompted
- **Important:** URL ampersands must be escaped (`\&`)

### Windows (untested but implemented)
- Uses `start` command to launch browser
- Should work similarly to macOS

### Linux (untested but implemented)
- Uses `xdg-open` command to launch browser
- Requires video group permissions for cameras

### iOS
- **Simulators:** Uses `xcrun simctl openurl`
- **Real devices:** Requires manual URL navigation (no programmatic browser launch)
- Safari Shortcuts app could enable automation (future work)

---

## Known Issues & Limitations

1. **iOS Real Devices:** Cannot programmatically open Safari. User must manually navigate.

2. **Camera Permissions:** Some browsers require HTTPS for `getUserMedia`. Current workaround: localhost is treated as secure context.

3. **Android Browser Selection:** Uses default browser. If Chrome is not default, behavior may vary.

4. **Results Persistence:** Results stored in local filesystem. No cloud sync yet.

5. **Multiple Cameras:** "All cameras" mode captures sequentially, not in parallel.

---

## Debug Logging

Extensive logging has been added for troubleshooting:

**Server logs (visible in terminal):**
```
╔══════════════════════════════════════════════════════════╗
║  📡 TESTRUNNER PING RECEIVED                             ║
╠══════════════════════════════════════════════════════════╣
║  autorun: true                                           ║
║  action:  all                                            ║
║  from:    192.168.1.100                                  ║
╚══════════════════════════════════════════════════════════╝
```

**Browser console logs:**
```
[TestRunner] 🟢 Script starting execution...
[TestRunner] URL: http://localhost:8891/sensors/camera.html?autorun=true&action=all
[TestRunner] 🔶 handleAutoRun called
[TestRunner] 🔶 autorun value: true type: boolean
[TestRunner] ====== AUTO-RUN MODE ======
```

---

## Next Steps

1. **Test on more platforms:** Validate Windows and Linux execution
2. **Add more sensor tests:** Microphone, GPS, accelerometer
3. **Implement results viewer:** Web UI for browsing test results
4. **Add parallel execution:** Run tests on multiple devices simultaneously
5. **Cloud sync:** Upload results to remote server for team access
6. **CI/CD integration:** Run as part of build pipeline

---

## Changelog

### 2026-01-31
- ✅ Fixed autorun URL parameter passing
- ✅ Fixed ADB shell URL escaping (ampersands)
- ✅ Changed script paths from relative to absolute
- ✅ Added extensive debug logging
- ✅ Verified end-to-end test execution on macOS and Android

### 2026-01-30
- ✅ Added host device detection
- ✅ Added USB camera detection
- ✅ Created ResultsClient for browser uploads
- ✅ Created demo server with results API
- ✅ Implemented TestRunner autorun mode
