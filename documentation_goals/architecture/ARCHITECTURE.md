# auto-mat-ion: Arquitectura de Fusión

> Análisis comparativo entre la abstracción de gestión y la implementación de ejecución de solar-lab/automation

---

## Dos Capas Complementarias

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              auto-mat-ion                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     CAPA DE GESTIÓN (nueva)                             │   │
│  │                                                                         │   │
│  │  • API REST (/api/v1/devices, /tests, /contributions)                   │   │
│  │  • Sistema de usuarios y proyectos                                      │   │
│  │  • Gamificación (puntos, leaderboard, badges)                           │   │
│  │  • Persistencia (PostgreSQL via vital-core)                             │   │
│  │  • Integración vital-core (Event Store, Event Bus)                      │   │
│  │  • Dashboard web                                                        │   │
│  │  • Autenticación / EUDI                                                 │   │
│  │                                                                         │   │
│  │  ❌ NO existe en solar-lab/automation                                   │   │
│  │  ✅ Cubierto por mi abstracción                                         │   │
│  └───────────────────────────────────┬─────────────────────────────────────┘   │
│                                      │                                         │
│                                      ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     CAPA DE EJECUCIÓN (existente)                       │   │
│  │                                                                         │   │
│  │  • TestOrchestrator (detección, queue, ejecución)                       │   │
│  │  • Controllers por plataforma (Android, iOS, macOS, Windows, Linux)     │   │
│  │  • ADB, Puppeteer, Appium                                               │   │
│  │  • Descubrimiento de cámaras                                            │   │
│  │  • Captura de screenshots, logs, métricas                               │   │
│  │  • CLI con presets                                                      │   │
│  │                                                                         │   │
│  │  ✅ Existe completo en solar-lab/automation                             │   │
│  │  ⚠️  Acoplado a SolarFlare (necesita desacoplar)                        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Análisis de solar-lab/automation

### Lo que TIENE (1200+ líneas de implementación real)

| Componente | Archivo | Líneas | Funcionalidad |
|------------|---------|--------|---------------|
| **Types** | `core/types.ts` | ~570 | ICameraInfo, IDeviceInfo, ITestConfig, IAutomationTestResult |
| **Orchestrator** | `core/orchestrator.ts` | ~1210 | Detección de dispositivos, queue, ejecución, logging |
| **Android** | `platforms/android.ts` | ~900 | ADB USB/WiFi, Puppeteer, permisos, orientación |
| **iOS** | `platforms/ios.ts` | ~500 | Appium, Safari, UDID |
| **macOS** | `platforms/macos.ts` | ~400 | Chrome/Firefox/Safari nativo |
| **Windows** | `platforms/windows.ts` | ~350 | Chrome/Firefox/Edge |
| **Linux** | `platforms/linux.ts` | ~300 | Chrome/Firefox/Chromium |
| **Config Matrix** | `core/config-matrix.ts` | ~400 | Generación de combinaciones, presets |
| **Logger** | `core/logger.ts` | ~300 | JSON/CSV, screenshots, sesiones |
| **CLI** | `cli.ts` | ~400 | Argumentos, presets, ejecución |

### Funcionalidades Clave Implementadas

```typescript
// android.ts - Conexión WiFi real con ADB
async connectWifi(options: IWifiConnectionOptions): Promise<void> {
  const { ip, port = 5555 } = options;
  const { stdout } = await execAsync(`adb connect ${ip}:${port}`);
  // ... manejo de conexión real
}

// android.ts - Puppeteer en dispositivo Android
private async connectPuppeteer(): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${this.localCdpPort}/json/version`);
  const data = await response.json();
  this.puppeteerBrowser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
  });
}

// orchestrator.ts - Descubrimiento de cámaras vía browser
private async discoverBrowserCameras(): Promise<void> {
  const browserCameras = await controller.executeScript(`
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
  `);
}
```

### Lo que NO TIENE

| Funcionalidad | Necesaria para auto-mat-ion |
|---------------|----------------------------|
| API REST | Acceso remoto a la plataforma |
| Base de datos | Persistencia de dispositivos, tests, resultados |
| Sistema de usuarios | Fundadores, colaboradores, roles |
| Proyectos/campañas | Agrupación lógica de tests |
| Puntos/gamificación | Incentivos para colaboradores |
| Dashboard web | Visualización y gestión |
| Event sourcing | Integración con vital-core |
| Autenticación | EUDI, tokens, permisos |

---

## Análisis de mi Abstracción

### Lo que APORTA (nuevo)

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| **API Server** | `api/server.ts` | Fastify con CORS, WebSocket |
| **Device Routes** | `api/routes/devices.ts` | CRUD de dispositivos remotos |
| **Test Routes** | `api/routes/tests.ts` | Cola y resultados vía API |
| **Contribution Routes** | `api/routes/contributions.ts` | Puntos y leaderboard |
| **DeviceManager** | `core/DeviceManager.ts` | Registro, heartbeat, fingerprint |
| **TestOrchestrator** | `core/TestOrchestrator.ts` | Cola con validación por consenso |
| **ContributionTracker** | `core/ContributionTracker.ts` | Puntos, milestones, badges |
| **Config** | `config/index.ts` | Variables con validación Zod |
| **Types** | `models/types.ts` | Device, Test, Contribution, Project |

### Funcionalidades Clave Propuestas

```typescript
// DeviceManager.ts - Registro con fingerprint antifraude
async registerDevice(input: RegisterDeviceInput): Promise<Device> {
  const fingerprint = await createFingerprint(input.rawFingerprint);
  const existingDevice = this.findByFingerprint(fingerprint);
  if (existingDevice) {
    return this.updateDeviceStatus(existingDevice.id, 'online');
  }
  // ... crear nuevo dispositivo
}

// TestOrchestrator.ts - Validación por consenso
private calculateConsensus(result: TestResult, otherResults: TestResult[]) {
  // Comparar resultados de múltiples dispositivos
  const zScore = Math.abs((result.output - mean) / stdDev);
  return { isValid: zScore < 2, confidence: 1 - zScore/4 };
}

// ContributionTracker.ts - Sistema de puntos
recordContribution(deviceId: string, type: ContributionType) {
  const points = this.calculatePoints(type);
  this.devicePoints.set(deviceId, currentPoints + points);
  this.checkMilestones(deviceId, previousPoints, newPoints);
}
```

### Lo que FALTA (necesita solar-lab)

| Funcionalidad | Existe en solar-lab |
|---------------|---------------------|
| Conexión real ADB | ✅ `platforms/android.ts` |
| Puppeteer en dispositivos | ✅ `AndroidController.connectPuppeteer()` |
| Detección de cámaras | ✅ `orchestrator.discoverBrowserCameras()` |
| Ejecución de JS en browser | ✅ `controller.executeScript()` |
| Screenshots | ✅ `controller.takeScreenshot()` |
| Multi-plataforma | ✅ Controllers por OS |

---

## Arquitectura de Fusión Propuesta

```
auto-mat-ion/
├── src/
│   │
│   │  ╔═══════════════════════════════════════════════════════════╗
│   │  ║              CAPA DE GESTIÓN (mi abstracción)             ║
│   │  ╚═══════════════════════════════════════════════════════════╝
│   │
│   ├── api/                          # API REST pública
│   │   ├── server.ts                 # Fastify + WebSocket
│   │   └── routes/
│   │       ├── devices.ts            # Registro, heartbeat, estado
│   │       ├── tests.ts              # Cola, resultados, validación
│   │       ├── contributions.ts      # Puntos, leaderboard
│   │       └── projects.ts           # Gestión de proyectos [NUEVO]
│   │
│   ├── services/                     # Lógica de negocio
│   │   ├── DeviceRegistry.ts         # Gestión de dispositivos remotos
│   │   ├── ProjectManager.ts         # Gestión de proyectos [NUEVO]
│   │   ├── ContributionTracker.ts    # Gamificación
│   │   ├── VitalCoreSync.ts          # Eventos a vital-core [NUEVO]
│   │   └── EUDIService.ts            # Credenciales EUDI [NUEVO]
│   │
│   ├── models/                       # Tipos de gestión
│   │   └── types.ts                  # Device, Project, Contribution
│   │
│   │  ╔═══════════════════════════════════════════════════════════╗
│   │  ║           CAPA DE EJECUCIÓN (extraída de solar-lab)       ║
│   │  ╚═══════════════════════════════════════════════════════════╝
│   │
│   ├── execution/                    # Extraído de solar-lab/automation
│   │   ├── core/
│   │   │   ├── types.ts              # Tipos de ejecución (IDeviceInfo, etc.)
│   │   │   ├── orchestrator.ts       # TestOrchestrator (desacoplado)
│   │   │   ├── config-matrix.ts      # Generación de configs
│   │   │   └── logger.ts             # Logging de ejecución
│   │   │
│   │   ├── platforms/                # Controllers por plataforma
│   │   │   ├── android.ts            # ADB + Puppeteer
│   │   │   ├── ios.ts                # Appium
│   │   │   ├── macos.ts              # Nativo
│   │   │   ├── windows.ts            # Nativo
│   │   │   └── linux.ts              # Nativo
│   │   │
│   │   └── controllers/
│   │       └── base-controller.ts    # Interfaz común
│   │
│   │  ╔═══════════════════════════════════════════════════════════╗
│   │  ║                    CAPA DE ADAPTACIÓN                     ║
│   │  ╚═══════════════════════════════════════════════════════════╝
│   │
│   ├── adapters/                     # Puente entre capas [NUEVO]
│   │   ├── ExecutionAdapter.ts       # Traduce API → Orchestrator
│   │   └── ResultAdapter.ts          # Traduce Results → Contributions
│   │
│   ├── config/
│   │   └── index.ts
│   │
│   └── index.ts                      # Exports públicos
│
├── cli/                              # CLI para uso local
│   └── index.ts                      # Basada en solar-lab/cli.ts
│
└── tests/
```

---

## Flujo de Ejecución Integrado

```
                    USUARIO (fundador o colaborador)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CAPA DE GESTIÓN                                       │
│                                                                                 │
│   POST /api/v1/tests                                                            │
│        │                                                                        │
│        ▼                                                                        │
│   DeviceRegistry.findAvailable()  ─────►  Dispositivos online                   │
│        │                                        │                               │
│        ▼                                        │                               │
│   ProjectManager.validateRequirements()         │                               │
│        │                                        │                               │
│        └────────────────────────────────────────┘                               │
│                              │                                                  │
│                              ▼                                                  │
│                     ExecutionAdapter                                            │
│                              │                                                  │
└──────────────────────────────┼──────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          CAPA DE EJECUCIÓN                                      │
│                                                                                 │
│   TestOrchestrator.executeTest()                                                │
│        │                                                                        │
│        ▼                                                                        │
│   PlatformController (Android/iOS/Desktop)                                      │
│        │                                                                        │
│        ├──► launchBrowser()                                                     │
│        ├──► navigateTo(testUrl)                                                 │
│        ├──► executeScript(testCode)                                             │
│        ├──► takeScreenshot()                                                    │
│        └──► collectResult()                                                     │
│                              │                                                  │
└──────────────────────────────┼──────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CAPA DE ADAPTACIÓN                                      │
│                                                                                 │
│   ResultAdapter.process()                                                       │
│        │                                                                        │
│        ├──► Validación por consenso                                             │
│        ├──► Cálculo de puntos                                                   │
│        ├──► Actualización de estadísticas                                       │
│        └──► Emisión de eventos a vital-core                                     │
│                              │                                                  │
└──────────────────────────────┼──────────────────────────────────────────────────┘
                               │
                               ▼
                    EVENTO → vital-core Event Store
                    PUNTOS → ContributionTracker
                    BADGE → EUDIService (si aplica)
```

---

## Desacoplamiento de SolarFlare

El código de solar-lab/automation está actualmente acoplado a SolarFlare (test específico de cámaras). Para auto-mat-ion necesitamos **generalizar**:

### Antes (solar-lab específico)

```typescript
// orchestrator.ts - Acoplado a SolarFlare
await this.configureSolarFlare(controller, config);
await this.selectCameraDevice(controller, config.camera.label);
await this.startStream(controller);
const result = await this.runSolarFlareTest(controller, config);
```

### Después (auto-mat-ion genérico)

```typescript
// execution/orchestrator.ts - Genérico
async executeTest(config: IGenericTestConfig): Promise<ITestResult> {
  await controller.launchBrowser(config.browser);
  await controller.navigateTo(config.testUrl);

  // El test específico viene en config.script
  if (config.setupScript) {
    await controller.executeScript(config.setupScript);
  }

  // Ejecutar el test (puede ser cualquier cosa)
  const result = await controller.executeScript(config.testScript);

  // Capturar métricas
  return {
    output: result,
    metrics: await this.collectMetrics(controller),
    environment: await this.collectEnvironment(controller),
  };
}
```

---

## Mapeo de Tipos

| solar-lab/automation | auto-mat-ion (gestión) | Relación |
|---------------------|------------------------|----------|
| `IDeviceInfo` | `Device` | Extender con `totalPoints`, `eudiPseudonym` |
| `ITestConfig` | `Test` | Generalizar, quitar refs a SolarFlare |
| `IAutomationTestResult` | `TestResult` | Añadir `validation`, `pointsAwarded` |
| `TestStatus` | `TestStatus` | Mismo |
| `Platform` | `DeviceType` | Renombrar/mapear |
| N/A | `Project` | Nuevo |
| N/A | `Contribution` | Nuevo |
| N/A | `VitalEvent` | Nuevo (integración vital-core) |

---

## Plan de Extracción

### Fase 1: Copiar sin modificar

```bash
# Copiar código de solar-lab a auto-mat-ion/src/execution/
cp -r solar-lab/automation/core/* auto-mat-ion/src/execution/core/
cp -r solar-lab/automation/platforms/* auto-mat-ion/src/execution/platforms/
cp -r solar-lab/automation/controllers/* auto-mat-ion/src/execution/controllers/
```

### Fase 2: Desacoplar de SolarFlare

- Extraer lógica específica de SolarFlare a callbacks/hooks
- Generalizar `ITestConfig` para cualquier tipo de test
- Crear `ITestExecutor` interface para tests pluggables

### Fase 3: Integrar capas

- Crear `ExecutionAdapter` que conecte API con Orchestrator
- Implementar `ResultAdapter` para procesar resultados
- Conectar con `ContributionTracker` para puntos

### Fase 4: Añadir persistencia

- Migrar de Maps en memoria a PostgreSQL
- Sincronizar con vital-core Event Store
- Implementar cache con Redis

---

## Conclusión

| Aspecto | Mi Abstracción | solar-lab/automation |
|---------|---------------|---------------------|
| **API REST** | ✅ Implementado | ❌ No existe |
| **Gestión de usuarios** | ✅ Diseñado | ❌ No existe |
| **Gamificación** | ✅ Implementado | ❌ No existe |
| **Integración vital-core** | ✅ Diseñado | ❌ No existe |
| **Conexión ADB real** | ❌ No implementado | ✅ Completo |
| **Multi-plataforma** | ❌ No implementado | ✅ 5 plataformas |
| **Puppeteer** | ❌ No implementado | ✅ Completo |
| **Descubrimiento cámaras** | ❌ No implementado | ✅ Completo |

**Ninguna capa es "mentira". Son complementarias.**

La fusión correcta toma lo mejor de ambas:
- **De mi abstracción**: API, gestión, gamificación, integración
- **De solar-lab**: Ejecución real, controllers, ADB, Puppeteer

---

---

## Fase 5: Extensión a Sensores Web (NUEVO)

### Motivación

El sistema original estaba enfocado en testing de cámaras (solar-lab). La evolución natural es extender la capacidad de testing a **todos los sensores accesibles desde el navegador**.

### Sensores Web Soportados

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER SENSOR CAPABILITIES                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  📹 MEDIA SENSORS                    🧭 MOTION SENSORS                          │
│  ├── Camera (getUserMedia)           ├── Accelerometer                          │
│  ├── Microphone (getUserMedia)       ├── Gyroscope                              │
│  ├── Screen Capture (getDisplayMedia)├── DeviceOrientation                      │
│  └── MediaDevices Enumeration        ├── DeviceMotion                           │
│                                      └── Magnetometer                           │
│                                                                                 │
│  🌐 ENVIRONMENT SENSORS              🔗 CONNECTIVITY                            │
│  ├── Geolocation (GPS)               ├── Web Bluetooth                          │
│  ├── AmbientLightSensor              ├── WebUSB                                 │
│  ├── ProximitySensor                 ├── Web NFC                                │
│  └── Network Information             └── Web Serial                             │
│                                                                                 │
│  ⚡ HARDWARE FEATURES                                                           │
│  ├── Battery Status                                                             │
│  ├── Vibration                                                                  │
│  ├── Gamepad                                                                    │
│  └── Screen Wake Lock                                                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Jerarquía de Controladores de Sensores

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CONTROLLER HIERARCHY                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                           IBrowserController                                    │
│                                  │                                              │
│                                  │ extends                                      │
│           ┌──────────┬──────────┼──────────┬──────────┬──────────┐              │
│           │          │          │          │          │          │              │
│           ▼          ▼          ▼          ▼          ▼          ▼              │
│     IVideoCtrl  IAudioCtrl  IMotionCtrl  IEnvCtrl  IConnCtrl  IHwCtrl          │
│           │          │          │          │          │          │              │
│           │          │          │          │          │          │              │
│     ┌─────┴─────┐    │     ┌────┴────┐    │     ┌────┴────┐    │              │
│     │           │    │     │         │    │     │         │    │              │
│  Camera    Screen  Mic   Accel    Gyro  GPS   BT      USB  Battery           │
│  Capture   Capture       Sensor   Scope       NFC    Serial Vibration        │
│                                                               Gamepad         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

Archivos:
  src/execution/controllers/
    ├── base-controller.ts        # IBrowserController (existente)
    └── sensor-controllers.ts     # IVideoController, IAudioController, etc.
```

### Test Matrix Extendido

Basado en el concepto de `config-matrix.ts` de solar-lab, extendido para todos los sensores:

```typescript
// demo/configs/sensor-matrix.ts

// Presets por categoría de sensor
VIDEO_PRESETS: {
  quick:         [{ width: 640, height: 480 }],
  standard:      [HD front, HD back, VGA front, VGA back],
  resolutions:   [QVGA → 4K sweep],
  frameRates:    [15, 24, 30, 60 fps],
  comprehensive: [all combinations]
}

AUDIO_PRESETS: {
  quick:         [48kHz mono],
  standard:      [44.1k, 48k, stereo, processing],
  sampleRates:   [8k → 96k sweep],
  processing:    [echo, noise, gain combinations]
}

MOTION_PRESETS: {
  quick:         [accelerometer @ 60Hz],
  standard:      [accel, gyro, orientation],
  frequencies:   [10, 30, 60, 120 Hz],
  allSensors:    [combined reading]
}

// Generación de matriz
generateSensorMatrix('video', 'standard', {
  devices: ['emulator-5554', 'pixel-6'],
  browsers: ['chrome', 'firefox'],
  repetitions: 3
});
// → Genera 48 configuraciones de test
```

### Demo Server

Servidor local para testing de sensores en dispositivos reales:

```
demo/
├── server/
│   └── index.ts              # Servidor HTTP con post-hooks
│
├── pages/
│   ├── index.html            # Página principal con lista de sensores
│   └── sensors/
│       ├── camera.html       # Test interactivo de cámara
│       ├── microphone.html   # Test de micrófono
│       ├── accelerometer.html
│       ├── bluetooth.html
│       └── ...
│
├── scripts/
│   └── enumerate-devices.ts  # Enumeración y adb reverse
│
└── configs/
    └── sensor-matrix.ts      # Configuración de matrices de test
```

**Funcionalidades del servidor:**

1. **Servir páginas de demo** accesibles desde dispositivos
2. **Post-hooks automáticos** tras iniciar:
   - Enumeración de dispositivos ADB/xcrun
   - Configuración de `adb reverse tcp:port tcp:port`
   - Generación de informe de capacidades
3. **API REST** para configuración dinámica:
   - `GET /api/devices` - Lista dispositivos conectados
   - `GET /api/health` - Estado del servidor
   - `GET /api/network` - IPs locales para conexión

**Uso:**

```bash
# Iniciar servidor con enumeración automática
npx tsx demo/server/index.ts --port 8891 --setup-reverse

# Solo enumerar dispositivos
npx tsx demo/scripts/enumerate-devices.ts --capabilities --json
```

---

## Roadmap de Consolidación

### ✅ Completado

- [x] Fusión de capas (gestión + ejecución)
- [x] Tipos base (`ITestConfig`, `IDeviceInfo`, `IBrowserController`)
- [x] Controllers de plataforma (Android, iOS, Desktop)
- [x] Integración vital-core (Event Bus, Event Store)
- [x] Build sin errores TypeScript
- [x] Tests pasando (37/37)
- [x] Ejemplo Android funcionando

### 🔨 En Progreso

- [x] Demo folder con servidor local
- [x] Enumeración de dispositivos con adb reverse
- [x] Extended sensor test matrix
- [x] Controller hierarchy para sensores
- [ ] Implementación de sensor controllers
- [ ] Páginas de demo para cada sensor
- [ ] CLI unificado

### 📋 Pendiente

- [ ] Dashboard web (React/Vue)
- [ ] Persistencia PostgreSQL
- [ ] Sistema de usuarios y proyectos
- [ ] Gamificación activa (puntos en tiempo real)
- [ ] Integración EUDI para badges
- [ ] Documentación API
- [ ] Tests E2E con dispositivos reales
- [ ] CI/CD pipeline

---

## Fase 6: CLI-Centric Architecture

### Principio de Diseño

**El CLI (`ami`) es el único punto de entrada para toda la automatización.**

El `package.json` mantiene solo scripts esenciales de NPM lifecycle (`build`, `test`, `lint`, `prepare`). Toda la lógica de orquestación, limpieza, ejecución de tests y análisis se concentra en el CLI.

### Estructura de Comandos

```
ami [command] [subcommand] [--flags]

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLI COMMAND TREE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ami                                                                            │
│  ├── run [preset] [--flags]         # Ejecutar tests                            │
│  │   ├── zepto                      # 1 iteración mínima                        │
│  │   ├── quick                      # Preset rápido                             │
│  │   ├── standard                   # Preset estándar                           │
│  │   └── comprehensive              # Preset completo                           │
│  │       └── --reset                # Limpiar antes de ejecutar                 │
│  │       └── --new                  # Añadir a sesión existente                 │
│  │                                                                              │
│  ├── demo                           # Servidor de demo                          │
│  │   ├── serve [--port]             # Iniciar servidor                          │
│  │   └── open                       # Abrir en navegador                        │
│  │                                                                              │
│  ├── devices                        # Gestión de dispositivos                   │
│  │   ├── list                       # Listar dispositivos                       │
│  │   ├── setup                      # Configurar adb reverse                    │
│  │   └── caps                       # Mostrar capacidades                       │
│  │                                                                              │
│  ├── analysis                       # Análisis de datos                         │
│  │   ├── setup                      # Configurar entorno Python                 │
│  │   ├── jupyter                    # Abrir Jupyter Notebook                    │
│  │   └── lab                        # Abrir JupyterLab                          │
│  │                                                                              │
│  ├── clean                          # Limpieza                                  │
│  │   ├── all                        # Todo (node_modules + data)                │
│  │   ├── data                       # Solo datos generados                      │
│  │   ├── logs                       # Solo logs                                 │
│  │   └── dist                       # Solo build                                │
│  │                                                                              │
│  └── status                         # Estado del sistema                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Semántica de Comandos de Ejecución

```
ami run [preset]:[scope]:[mode]

Ejemplos:
  ami run zepto --reset      # = ami run zepto:complete:reset
  ami run zepto --new        # = ami run zepto:complete:new
  ami run quick              # = ami run quick:complete:new (default)
```

| Componente | Valores | Descripción |
|------------|---------|-------------|
| **preset** | `zepto`, `quick`, `standard`, `comprehensive` | Número de iteraciones |
| **scope** | `complete`, `test-only`, `collect-only` | Qué partes ejecutar |
| **mode** | `reset`, `new` | Limpiar o añadir a existente |

### Ciclo `complete:reset`

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CICLO COMPLETO (reset)                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   1. CLEAN                                                                      │
│      ├── rm -rf node_modules (opcional, --full-reset)                           │
│      ├── rm -rf data/                                                           │
│      ├── rm -rf logs/                                                           │
│      └── rm -rf analysis/output/                                                │
│                        │                                                        │
│   2. SETUP             ▼                                                        │
│      ├── npm install (si --full-reset)                                          │
│      ├── npm run build                                                          │
│      └── analysis:setup (verificar Python)                                      │
│                        │                                                        │
│   3. DEVICES           ▼                                                        │
│      ├── Enumerar dispositivos                                                  │
│      ├── Configurar adb reverse                                                 │
│      └── Verificar conectividad                                                 │
│                        │                                                        │
│   4. SERVER            ▼                                                        │
│      └── Iniciar demo server (background)                                       │
│                        │                                                        │
│   5. EXECUTE           ▼                                                        │
│      ├── Crear session_id                                                       │
│      ├── Ejecutar test matrix                                                   │
│      ├── Capturar resultados → data/sessions/{id}/                              │
│      └── Generar resumen                                                        │
│                        │                                                        │
│   6. VALIDATE          ▼                                                        │
│      ├── Verificar output                                                       │
│      ├── Detectar errores                                                       │
│      └── Generar informe                                                        │
│                        │                                                        │
│   7. ANALYZE           ▼                                                        │
│      └── Lanzar Jupyter con notebook precargado                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Estructura de Datos de Sesión

```
data/
├── sessions/
│   ├── session_2026-01-31_143022/
│   │   ├── metadata.json           # Info de la sesión
│   │   ├── multimedia/
│   │   │   ├── video/              # Capturas de video
│   │   │   ├── image/              # Screenshots, frames
│   │   │   └── audio/              # Grabaciones de audio
│   │   ├── text/
│   │   │   ├── logs/               # Logs de ejecución
│   │   │   ├── results.json        # Resultados de tests
│   │   │   └── results.csv         # Formato tabular
│   │   └── other/                  # Otros archivos
│   │
│   └── session_2026-01-31_150045/
│       └── ...
│
├── latest -> sessions/session_2026-01-31_150045  # Symlink
│
└── aggregated/                     # Datos agregados de múltiples sesiones
    ├── all_results.csv
    └── summary.json
```

### Ventajas del Enfoque CLI-Céntrico

| Aspecto | package.json scripts | CLI orquestador |
|---------|---------------------|-----------------|
| **Help system** | ❌ Ninguno | ✅ `ami --help`, `ami run --help` |
| **Validación** | ❌ Manual | ✅ Automática con mensajes claros |
| **Flags/args** | ❌ Limitado | ✅ Flexible y documentado |
| **Interactividad** | ❌ No | ✅ Prompts, spinners, progress |
| **Composición** | ❌ `&&` chains | ✅ Orquestación interna |
| **Estado** | ❌ Sin persistencia | ✅ Puede mantener estado |
| **Colores/UX** | ❌ Básico | ✅ Terminal UI rica |

### package.json Mínimo

```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src --ext .ts",
    "prepare": "npm run build",
    "ami": "tsx src/cli.ts"
  },
  "bin": {
    "ami": "./dist/cli.js",
    "auto-mat-ion": "./dist/cli.js"
  }
}
```

---

## Fase 7: From Blink to Think - Inteligencia Distribuida

### Visión

**auto-mat-ion evoluciona de framework de testing a sistema de control robótico inteligente.**

El concepto "From Blink to Think" permite que un humano "hable" con dispositivos como un titiritero, usando lenguaje natural que se traduce en acciones coordinadas a través de múltiples plataformas hardware.

### Arquitectura Titiritero

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FROM BLINK TO THINK                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   👤 HUMANO                                                                     │
│      │                                                                          │
│      │  "robot brazo coger telefono abrir cámara grabar video"                  │
│      ▼                                                                          │
│   ┌──────────────────┐                                                          │
│   │  💬 CHAT INPUT   │  Input box en página demo                                │
│   │  (Lenguaje       │  Formato sugerido:                                       │
│   │   Natural)       │  [sistema] [acción] [params] [condiciones]               │
│   └────────┬─────────┘                                                          │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                          │
│   │  🧠 OLLAMA LLM   │  Modelo local restrictivo                                │
│   │  (Razonador)     │  - Input estructurado predefinido                        │
│   │                  │  - Output siempre mismo formato                          │
│   │                  │  - Genera comandos ami temporales                        │
│   └────────┬─────────┘                                                          │
│            │                                                                    │
│            ▼                                                                    │
│   ┌──────────────────┐                                                          │
│   │  🤖 ami CLI      │  Orquestador central                                     │
│   │  (Cerebro)       │  - Parsea scripts generados                              │
│   │                  │  - Ejecuta línea a línea                                 │
│   │                  │  - Controla backend + frontend                           │
│   └────────┬─────────┘                                                          │
│            │                                                                    │
│   ┌────────┴────────────────────┬──────────────────────┐                        │
│   │                             │                      │                        │
│   ▼                             ▼                      ▼                        │
│ ┌─────────────────┐      ┌───────────────┐      ┌───────────────┐               │
│ │  📱 MÓVIL       │      │  🦾 BRAZO      │      │  🔌 ARDUINO   │               │
│ │  Android/iOS    │      │  ROBÓTICO     │      │    Q UNO      │               │
│ │                 │      │               │      │               │               │
│ │  - Sensores     │      │  - Servos     │      │  - sensAIciones│              │
│ │  - Cámara       │      │  - Posición   │      │  - Frecuencial │              │
│ │  - Audio        │      │  - Gripper    │      │  - IA embebida │              │
│ │  - Motion       │      │               │      │               │               │
│ └────────┬────────┘      └───────┬───────┘      └───────┬───────┘               │
│          │                       │                      │                        │
│          └───────────────────────┴──────────────────────┘                        │
│                                  │                                               │
│                                  ▼                                               │
│                         ┌───────────────┐                                        │
│                         │  🍓 RASPBERRY │                                        │
│                         │    PI 5       │                                        │
│                         │               │                                        │
│                         │  - Percepción │                                        │
│                         │  - Correlación│                                        │
│                         │  - Storage    │                                        │
│                         │  - Learning   │                                        │
│                         └───────────────┘                                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Concepto "sensAIciones"

División inteligente del procesamiento sensorial:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              sensAIciones                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   CAPA 1: ARDUINO Q UNO                                                         │
│   ════════════════════                                                          │
│   Especialización: Procesamiento frecuencial de señales crudas                  │
│                                                                                 │
│   ┌─────────┐     ┌─────────────────┐     ┌─────────────────┐                   │
│   │ Sensores│────▶│ IA Embebida     │────▶│ Métricas        │                   │
│   │ Crudos  │     │ (Frecuencial)   │     │ Inteligentes    │                   │
│   └─────────┘     └─────────────────┘     └────────┬────────┘                   │
│                                                     │                           │
│   • Acelerómetro del brazo                          │                           │
│   • Sensores de presión gripper                     │                           │
│   • Feedback de servos                              │                           │
│                                                     │                           │
│   ══════════════════════════════════════════════════╪═══════════════════════    │
│                                                     │                           │
│   CAPA 2: RASPBERRY PI 5                            ▼                           │
│   ══════════════════════                                                        │
│   Especialización: Correlación y percepción consciente                          │
│                                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐           │
│   │ Datos Arduino   │────▶│ Módulo          │────▶│ Logs            │           │
│   │ + Datos Móvil   │     │ Percepción      │     │ Correlacionados │           │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘           │
│                                                                                 │
│   Ejemplo de log correlacionado:                                                │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │ timestamp: 2026-01-31T14:30:22.456Z                                     │   │
│   │ robot:                                                                  │   │
│   │   brazo_posicion: { x: 45, y: 120, z: 80 }                              │   │
│   │   gripper_presion: 0.3                                                  │   │
│   │   movimiento: "rotacion_izquierda"                                      │   │
│   │ android:                                                                │   │
│   │   acelerometro: { x: 0.2, y: 9.7, z: 0.5 }                              │   │
│   │   camara: "grabando_1080p_30fps"                                        │   │
│   │   orientacion: "landscape"                                              │   │
│   │ correlacion:                                                            │   │
│   │   evento: "telefono_cogido_exitosamente"                                │   │
│   │   confianza: 0.94                                                       │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Gramática de Comandos Naturales

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ESTRUCTURA DE ENTRADA                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   [SISTEMA] [ACCIÓN] [OBJETO] [PARÁMETROS] [CONDICIONES] [RESTRICCIONES]        │
│                                                                                 │
│   Ejemplos:                                                                     │
│                                                                                 │
│   Básico (solo móvil):                                                          │
│   ─────────────────────                                                         │
│   "android cámara grabar video FHD 10s"                                         │
│   "android micrófono capturar audio 48khz 5s"                                   │
│   "android sensores leer acelerómetro 60hz 100samples"                          │
│                                                                                 │
│   Intermedio (móvil + brazo):                                                   │
│   ────────────────────────────                                                  │
│   "brazo coger teléfono → android cámara grabar video"                          │
│   "brazo rotar 90deg → android sensores leer giroscopio"                        │
│                                                                                 │
│   Avanzado (sistema completo):                                                  │
│   ─────────────────────────────                                                 │
│   "brazo coger teléfono mantener patrón-circular                                │
│    repeticiones:5 condición:estable                                             │
│    → android cámara grabación video captura:5img                                │
│    → arduino monitorear presión-gripper frecuencia:100hz"                       │
│                                                                                 │
│   Vocabulario:                                                                  │
│   ────────────                                                                  │
│   SISTEMA:      android | brazo | arduino | raspberry                           │
│   ACCIÓN:       coger | soltar | rotar | mover | grabar | capturar | leer      │
│   OBJETO:       teléfono | cámara | micrófono | sensor | gripper               │
│   MOVIMIENTO:   patrón-circular | lineal | rotación | mantener                 │
│   CONDICIÓN:    estable | movimiento | luz>X | presión<Y                       │
│   RESTRICCIÓN:  repeticiones:N | duración:Xs | frecuencia:Nhz                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Conectores Requeridos

```
demo/connectors/
├── ollama/                    # LLM local para parsing
│   ├── client.ts              # Cliente API Ollama
│   ├── prompts.ts             # System prompts restrictivos
│   └── parser.ts              # Input/Output estructurado
│
├── arduino/                   # Arduino Q UNO
│   ├── serial.ts              # Comunicación serial
│   ├── sensors.ts             # Lectura de sensores
│   └── commands.ts            # Comandos de control
│
├── raspberry/                 # Raspberry Pi 5
│   ├── ssh.ts                 # Conexión SSH/WebSocket
│   ├── perception.ts          # Módulo de percepción
│   └── storage.ts             # Almacenamiento de datos
│
└── robotics/                  # Brazo robótico
    ├── servo.ts               # Control de servos
    ├── gripper.ts             # Control de pinza
    └── patterns.ts            # Patrones de movimiento
```

### Hardware de Referencia

| Componente | Modelo | Rol |
|------------|--------|-----|
| **Computador Central** | Raspberry Pi 5 | Percepción, correlación, storage |
| **Procesador Sensorial** | Arduino UNO Q | sensAIciones, análisis frecuencial |
| **Brazo Robótico** | Servo Gripper Kit | Manipulación física |
| **Dispositivo Móvil** | Android/iOS | Sensores web, cámara, audio |

### Casos de Uso: Juguetes Ecológicos Inteligentes

El sistema "From Blink to Think" habilita una nueva generación de juguetes educativos:

1. **Robot Explorador**: Brazo + móvil + comandos de voz
2. **Laboratorio Sensorial**: Arduino Q + múltiples sensores + visualización
3. **Asistente de Fotografía**: Brazo + móvil + detección de escenas
4. **Sistema de Vigilancia**: Raspberry + cámara + detección de movimiento

### Fases de Implementación

| Fase | Componente | Descripción |
|------|------------|-------------|
| **7.1** | Ollama Connector | Cliente API + prompts restrictivos |
| **7.2** | Chat UI | Input box en demo page |
| **7.3** | Command Parser | Natural language → ami commands |
| **7.4** | Arduino Connector | Serial + WebSocket streaming |
| **7.5** | Raspberry Connector | SSH + perception module |
| **7.6** | Robotics Connector | Servo control via Arduino |
| **7.7** | sensAIciones | Correlación multi-sensor |
| **7.8** | Learning Module | Aprendizaje de patrones |

---

## Estado de Implementación

### ✅ Completado

| Fase | Componente | Descripción | Estado |
|------|------------|-------------|--------|
| **5.1** | Demo Pages | 5 páginas (camera, microphone, accelerometer, geolocation, battery) | ✅ |
| **5.2** | Sensor Controllers | VideoController, AudioController, MotionController | ✅ |
| **6** | CLI Unificado | ami demo/devices/run/clean/analysis/status | ✅ |
| **7.1** | Ollama Connector | Cliente API + Chat UI + Command Parser | ✅ |

### 🔄 En Progreso / Futuro

| Fase | Componente | Descripción | Estado |
|------|------------|-------------|--------|
| **7.2-7.8** | Robotics Integration | Arduino, Raspberry Pi, Servo Control | ⏳ |
| **8** | vital-core Integration | Event Store, Event Bus | ⏳ |

### Archivos Implementados

```
src/
├── cli.ts                              # CLI unificado con todos los comandos
├── llm/
│   ├── index.ts                        # Exports del módulo LLM
│   └── ollama-connector.ts             # Conector Ollama + NaturalLanguageInterface
└── execution/
    └── controllers/
        ├── sensor-controllers.ts       # Interfaces completas
        ├── video-controller.ts         # Implementación VideoController
        ├── audio-controller.ts         # Implementación AudioController
        └── motion-controller.ts        # Implementación MotionController

demo/
├── pages/
│   ├── index.html                      # Hub de tests
│   ├── chat.html                       # Chat UI para AI assistant
│   └── sensors/
│       ├── camera.html                 # Test de cámara
│       ├── microphone.html             # Test de micrófono
│       ├── accelerometer.html          # Test de acelerómetro
│       ├── geolocation.html            # Test de geolocalización
│       └── battery.html                # Test de batería
└── server/
    └── index.ts                        # Servidor HTTP con post-hooks

analysis/
├── requirements.txt                    # Dependencias Python
└── sensor_analysis.ipynb               # Notebook de análisis
```

---

## Próximos Pasos

1. **Robotics Integration (Fase 7.2-7.8)** - Arduino serial, Raspberry Pi SSH, servo control
2. **vital-core Integration** - Event Store, Event Bus para persistencia
3. **Más demo pages** - Completar las 19 páginas de sensores restantes
4. **Tests automatizados** - Unit tests para controllers

---

*Este documento define la arquitectura de fusión para auto-mat-ion.*
*Última actualización: 31 Enero 2026*
