<p align="center">
  <img src="https://raw.githubusercontent.com/auto-mat-ion/auto-mat-ion/main/assets/logo.svg" width="120" alt="auto-mat-ion logo">
</p>

<h1 align="center">auto-mat-ion</h1>

<p align="center">
  <strong>TTu propia granja de dispositivos para testing open source que puede correr en local</strong>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-qué-puedes-hacer">Qué puedes hacer</a> •
  <a href="#-api">API</a> •
  <a href="#-ejemplos">Ejemplos</a> •
  <a href="#-dispositivos">Dispositivos</a>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/auto-mat-ion?style=flat-square&color=blue" alt="npm version">
  <img src="https://img.shields.io/badge/platforms-Android%20|%20iOS%20|%20macOS%20|%20Windows%20|%20Linux-green?style=flat-square" alt="platforms">
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=flat-square" alt="license">
</p>

---

```
📱 Samsung Galaxy    ✅ Login funcionando
📱 Pixel 7           ✅ Login funcionando
📱 iPhone 14         ✅ Login funcionando
💻 MacBook           ✅ Login funcionando
📱 Xiaomi Redmi      ✅ Login funcionando

⏱️  5 dispositivos testeados en 47 segundos
📸 15 screenshots guardados en ./results/
```

---

## ⚡ Quick Start

### 1. Instalar

```bash
npm install auto-mat-ion
```

### 2. Conectar tus dispositivos

```bash
# Ver qué dispositivos tienes
npx ami devices

# Output:
# ✅ MacBook-Pro (macOS) - Chrome, Safari, Firefox
# ✅ 192.168.1.100:5555 (Android) - Chrome [WiFi]
# ✅ RF8M33XXXXX (Android) - Chrome [USB]
```

### 3. Ejecutar tu primer test

```bash
# Abre Google en todos los dispositivos y busca "hello world"
npx ami test "open google.com and search for hello world"
```

**Eso es todo.** Todos tus dispositivos abrirán Google y buscarán "hello world" simultáneamente.

---

## 🎯 Qué puedes hacer

### Testear en múltiples dispositivos a la vez

```typescript
import { quickExecute, listAndroidDevices } from 'auto-mat-ion';

// Obtener todos los dispositivos Android conectados
const devices = await listAndroidDevices();

// Ejecutar test en TODOS simultáneamente
const results = await quickExecute({
  testUrl: 'https://mi-app.com',
  devices: devices.map(d => d.serial),
  executor: {
    name: 'LoginTest',
    async execute(controller) {
      await controller.navigateTo('https://mi-app.com/login');
      await controller.executeScript(`
        document.querySelector('#email').value = 'test@test.com';
        document.querySelector('#password').value = '123456';
        document.querySelector('#submit').click();
      `);

      const success = await controller.waitForElement('#dashboard', 5000);
      return {
        verdict: success ? 'pass' : 'fail',
        data: { loggedIn: success }
      };
    }
  }
});

console.log(results);
// { passed: 5, failed: 0, devices: [...] }
```

### Conectar Android por WiFi (sin cables)

```typescript
import { connectAndroidWifi } from 'auto-mat-ion';

// Conectar a un dispositivo Android via WiFi
const controller = await connectAndroidWifi('192.168.1.100', 5555);

// Ahora puedes controlarlo desde el sofá
await controller.launchBrowser('chrome');
await controller.navigateTo('https://mi-app.com');
await controller.takeScreenshot('./screenshot.png');
```

### Usar lenguaje natural (con Ollama)

```bash
# Describe lo que quieres testear en español
npx ami test "abre mi-app.com, haz login con test@test.com, \
              y verifica que el dashboard muestra el nombre del usuario"
```

---

## 📖 API

### Controllers

auto-mat-ion tiene un controller para cada plataforma:

| Plataforma | Controller | Conexión |
|------------|------------|----------|
| Android | `AndroidController` | USB / WiFi (ADB) |
| iOS | `IOSController` | USB (Appium) |
| macOS | `MacOSController` | Local |
| Windows | `WindowsController` | Local |
| Linux | `LinuxController` | Local |

```typescript
import {
  createAndroidController,
  createMacOSController,
  createWindowsController,
} from 'auto-mat-ion';

// Crear controller para Android
const android = createAndroidController('192.168.1.100:5555');
await android.initialize();

// Crear controller para macOS
const mac = createMacOSController();
await mac.initialize();
```

### IBrowserController

Todos los controllers implementan esta interfaz:

```typescript
interface IBrowserController {
  // Inicialización
  initialize(): Promise<void>;
  cleanup(): Promise<void>;

  // Control del navegador
  launchBrowser(browser: 'chrome' | 'firefox' | 'safari'): Promise<void>;
  closeBrowser(): Promise<void>;

  // Navegación
  navigateTo(url: string): Promise<void>;

  // Interacción con la página
  executeScript<T>(script: string): Promise<T>;
  waitForElement(selector: string, timeout?: number): Promise<boolean>;
  clickElement(selector: string): Promise<void>;

  // Debugging
  takeScreenshot(path: string): Promise<void>;
  getConsoleLogs(): Promise<string[]>;
}
```

### ITestExecutor

Para tests más complejos, crea un executor:

```typescript
interface ITestExecutor {
  name: string;

  // Opcional: preparación antes del test
  setup?(controller: IBrowserController, config: ITestConfig): Promise<void>;

  // Obligatorio: lógica del test
  execute(controller: IBrowserController, config: ITestConfig): Promise<ITestOutput>;

  // Opcional: limpieza después del test
  teardown?(controller: IBrowserController, config: ITestConfig): Promise<void>;
}
```

**Ejemplo completo:**

```typescript
const myExecutor: ITestExecutor = {
  name: 'CheckoutTest',

  async setup(controller) {
    console.log('Preparando test...');
  },

  async execute(controller, config) {
    // 1. Ir a la página
    await controller.navigateTo('https://shop.example.com');

    // 2. Añadir producto al carrito
    await controller.clickElement('[data-testid="add-to-cart"]');

    // 3. Ir al checkout
    await controller.clickElement('[data-testid="checkout"]');

    // 4. Verificar que llegamos
    const success = await controller.waitForElement('#payment-form', 5000);

    // 5. Screenshot para evidencia
    await controller.takeScreenshot(`./results/${config.device.id}-checkout.png`);

    return {
      verdict: success ? 'pass' : 'fail',
      confidence: 1.0,
      data: { reachedCheckout: success }
    };
  },

  async teardown(controller) {
    await controller.closeBrowser();
  }
};
```

---

## 📱 Dispositivos

### Conectar Android por USB

```bash
# 1. Habilita "USB debugging" en tu Android
# 2. Conecta el cable USB
# 3. Verifica conexión
adb devices

# 4. auto-mat-ion lo detecta automáticamente
npx ami devices
```

### Conectar Android por WiFi

```bash
# Método 1: Desde USB a WiFi
# (dispositivo conectado por USB)
adb tcpip 5555
adb connect 192.168.1.100:5555
# Ya puedes desconectar el USB

# Método 2: Android 11+ (Wireless Debugging)
# 1. Ve a Ajustes > Opciones de desarrollador > Depuración inalámbrica
# 2. Actívala y toca "Vincular dispositivo con código"
# 3. Usa el código y puerto mostrados:
adb pair 192.168.1.100:37015 123456
adb connect 192.168.1.100:41234
```

```typescript
// En tu código
import { connectAndroidWifi, pairAndConnectAndroid11 } from 'auto-mat-ion';

// Android < 11
const controller = await connectAndroidWifi('192.168.1.100', 5555);

// Android 11+
const controller = await pairAndConnectAndroid11(
  '192.168.1.100',
  37015,      // Puerto de pairing
  '123456',   // Código de pairing
  41234       // Puerto de conexión
);
```

### Verificar salud de conexión WiFi

```typescript
const health = await controller.checkWifiHealth();
console.log(`Latencia: ${health.latencyMs}ms`);
console.log(`Señal: ${health.signalStrength}dBm`);

// Reconectar si se pierde
if (!await controller.isConnected()) {
  await controller.reconnectWifi();
}
```

---

## 🔧 CLI

```bash
# Ver dispositivos conectados
npx ami devices
npx ami devices --json              # Output JSON
npx ami devices --capabilities      # Con info de sensores

# Ejecutar tests
npx ami test "descripción del test"
npx ami test --suite ./tests/e2e.ts
npx ami run --all                   # Todos los tests

# Servidor de demo
npx ami serve                       # Inicia en :8891

# Utilidades
npx ami screenshot                  # Screenshot de todos los dispositivos
npx ami info <device-id>            # Info detallada de un dispositivo
```

---

## 💡 Ejemplos

### Test de Login Multi-dispositivo

```typescript
// tests/login.ts
import { quickExecute, listAllDevices } from 'auto-mat-ion';

const devices = await listAllDevices();

const results = await quickExecute({
  testUrl: 'https://mi-app.com/login',
  devices,
  executor: {
    name: 'MultiDeviceLogin',
    async execute(controller, config) {
      // Cada dispositivo usa un email diferente
      const email = `user-${config.device.id}@test.com`;

      await controller.executeScript(`
        document.querySelector('#email').value = '${email}';
        document.querySelector('#password').value = 'test123';
        document.querySelector('form').submit();
      `);

      const loggedIn = await controller.waitForElement('#dashboard', 10000);

      return {
        verdict: loggedIn ? 'pass' : 'fail',
        data: { email, loggedIn }
      };
    }
  }
});

console.log(`✅ ${results.passed}/${results.total} dispositivos pasaron`);
```

### Test de Responsive Design

```typescript
// tests/responsive.ts
const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 },
];

for (const viewport of viewports) {
  await controller.launchBrowser('chrome', {
    width: viewport.width,
    height: viewport.height,
  });

  await controller.navigateTo('https://mi-app.com');
  await controller.takeScreenshot(`./results/responsive-${viewport.name}.png`);
}
```

### Test de Formulario con Validación

```typescript
// tests/form-validation.ts
const executor: ITestExecutor = {
  name: 'FormValidation',

  async execute(controller) {
    await controller.navigateTo('https://mi-app.com/register');

    // Test 1: Email inválido
    await controller.executeScript(`
      document.querySelector('#email').value = 'not-an-email';
      document.querySelector('form').submit();
    `);

    const hasError = await controller.waitForElement('.error-message', 2000);

    // Test 2: Email válido
    await controller.executeScript(`
      document.querySelector('#email').value = 'valid@email.com';
      document.querySelector('#password').value = 'SecurePass123!';
      document.querySelector('form').submit();
    `);

    const success = await controller.waitForElement('.success-message', 5000);

    return {
      verdict: hasError && success ? 'pass' : 'fail',
      data: {
        invalidEmailShowsError: hasError,
        validEmailSucceeds: success
      }
    };
  }
};
```

---

## 📊 Resultados

Los resultados se guardan automáticamente:

```
./results/
├── session-1707123456/
│   ├── summary.json           # Resumen de todos los tests
│   ├── device-pixel7/
│   │   ├── test-login.json    # Resultado del test
│   │   ├── screenshot-1.png   # Screenshots
│   │   └── console.log        # Logs del navegador
│   ├── device-samsung/
│   │   └── ...
│   └── device-macbook/
│       └── ...
```

**summary.json:**

```json
{
  "sessionId": "session-1707123456",
  "startTime": "2026-02-10T10:30:00Z",
  "duration": 47000,
  "devices": 5,
  "tests": {
    "total": 5,
    "passed": 5,
    "failed": 0
  },
  "results": [
    {
      "device": "pixel7",
      "verdict": "pass",
      "duration": 8500
    }
  ]
}
```

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                         TU CÓDIGO                                 │
│                                                                  │
│   ami test "..."     import { quickExecute } from 'auto-mat-ion' │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      AUTO-MAT-ION                                │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ CLI (ami)   │  │ Test Orchestrator│  │  LLM Connector     │  │
│  │             │  │                 │  │  (Ollama - opcional)│  │
│  └──────┬──────┘  └────────┬────────┘  └──────────┬──────────┘  │
│         │                  │                      │              │
│         └──────────────────┼──────────────────────┘              │
│                            │                                     │
│                            ▼                                     │
│         ┌──────────────────────────────────────────┐            │
│         │          PLATFORM CONTROLLERS             │            │
│         │                                          │            │
│         │  Android   iOS    macOS   Windows  Linux │            │
│         │   (ADB)   (WDA)   (CDP)    (CDP)   (CDP) │            │
│         └─────────────────────┬────────────────────┘            │
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                      TUS DISPOSITIVOS                            │
│                                                                  │
│   📱 Android (USB)    📱 Android (WiFi)    💻 Desktop           │
│   📱 iPhone           📱 Tablet            🖥️  Otro PC          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🤝 Contribuir

```bash
# Clonar
git clone https://github.com/auto-mat-ion/auto-mat-ion
cd auto-mat-ion

# Instalar
npm install

# Desarrollo
npm run dev

# Tests
npm test

# Build
npm run build
```

Ver [CONTRIBUTING.md](./CONTRIBUTING.md) para más detalles.

---

## 📚 Documentación

| Recurso | Descripción |
|---------|-------------|
| [Tutorial: Google Search](./docs/tutorials/tutorial-google-search-test.md) | Crear tu primer ITestExecutor |
| [API Reference](./docs/api-reference/) | Documentación completa de la API |
| [Device Setup](./docs/getting-started/DEVICE-SETUP.md) | Configurar Android/iOS |
| [Vision](./documentation_goals/vision/VISION.md) | Filosofía y visión del proyecto |

---

## 🙋 FAQ

**¿Necesito Ollama para usar auto-mat-ion?**

No. Ollama es opcional y solo se usa para el modo de lenguaje natural (`ami test "descripción"`). Puedes usar la API programática sin ninguna IA.

**¿Funciona con iOS?**

Sí, pero requiere Appium y un Mac. La configuración es más compleja que Android.

**¿Puedo usar esto en CI/CD?**

Sí. Mira el ejemplo en [docs/tutorials/tutorial-ci-integration.md](./docs/tutorials/).

**¿Es gratis?**

Sí, MIT License. Úsalo como quieras.

---

## 📄 Licencia

MIT License - Usa auto-mat-ion como quieras.

---

<p align="center">
  <sub>Hecho con ❤️ para developers que odian el testing manual</sub>
</p>
