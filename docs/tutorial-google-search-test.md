# Tutorial: Creando un ITestExecutor para Google Search

> Aprende a crear un test automatizado que busca artículos de ciencia en Google usando auto-mat-ion

---

## Tabla de Contenidos

1. [Introducción](#1-introducción)
2. [Requisitos Previos](#2-requisitos-previos)
3. [Estructura del Proyecto](#3-estructura-del-proyecto)
4. [Paso 1: Configuración Inicial](#4-paso-1-configuración-inicial)
5. [Paso 2: Crear el Test Executor](#5-paso-2-crear-el-test-executor)
6. [Paso 3: Ejecutar en Desktop](#6-paso-3-ejecutar-en-desktop)
7. [Paso 4: Ejecutar en Android (ADB WiFi)](#7-paso-4-ejecutar-en-android-adb-wifi)
8. [Paso 5: Análisis de Resultados](#8-paso-5-análisis-de-resultados)
9. [Código Completo](#9-código-completo)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Introducción

En este tutorial aprenderás a:

- Crear un `ITestExecutor` personalizado
- Automatizar una búsqueda en Google
- Extraer resultados de la página
- Ejecutar el test en desktop y dispositivos Android
- Manejar timeouts y errores

**¿Qué vamos a construir?**

Un test que:
1. Abre Google.com
2. Busca "artículos científicos sobre cambio climático"
3. Espera los resultados
4. Extrae los títulos y URLs de los primeros 5 resultados
5. Valida que se encontraron resultados relevantes

---

## 2. Requisitos Previos

### Software necesario

```bash
# Node.js 18+
node --version  # v18.0.0 o superior

# Para Android: ADB instalado
adb version

# TypeScript runner
npm install -g tsx
```

### Dependencias del proyecto

```bash
npm install auto-mat-ion
npm install -D typescript tsx @types/node
```

### Para dispositivos Android

1. **USB Debugging habilitado** en el dispositivo
2. **Chrome instalado** en el dispositivo
3. **Conexión WiFi** (mismo network que tu PC) para ADB WiFi

---

## 3. Estructura del Proyecto

```
google-search-test/
├── package.json
├── tsconfig.json
├── src/
│   ├── executors/
│   │   └── google-search-executor.ts    # Nuestro test executor
│   ├── utils/
│   │   └── result-parser.ts             # Helpers para parsear resultados
│   ├── run-desktop.ts                   # Entry point para desktop
│   └── run-android.ts                   # Entry point para Android
├── results/                             # Screenshots y logs
└── README.md
```

---

## 4. Paso 1: Configuración Inicial

### package.json

```json
{
  "name": "google-search-test",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test:desktop": "tsx src/run-desktop.ts",
    "test:android": "tsx src/run-android.ts",
    "test:all": "tsx src/run-desktop.ts && tsx src/run-android.ts"
  },
  "dependencies": {
    "auto-mat-ion": "^0.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

## 5. Paso 2: Crear el Test Executor

### src/executors/google-search-executor.ts

Este es el corazón del test. Implementa la interfaz `ITestExecutor`:

```typescript
/**
 * Google Search Test Executor
 *
 * Busca artículos científicos en Google y extrae los resultados.
 */

import type {
  ITestExecutor,
  IBrowserController,
  ITestConfig,
  ITestOutput,
} from 'auto-mat-ion/execution';

// ============================================================================
// Tipos para nuestro test
// ============================================================================

export interface GoogleSearchConfig {
  /** Término de búsqueda */
  searchQuery: string;
  /** Número máximo de resultados a extraer */
  maxResults: number;
  /** Timeout para esperar resultados (ms) */
  resultsTimeout: number;
  /** Tomar screenshot después de buscar */
  takeScreenshot: boolean;
}

export interface SearchResult {
  /** Posición en los resultados (1-based) */
  position: number;
  /** Título del resultado */
  title: string;
  /** URL del resultado */
  url: string;
  /** Snippet/descripción */
  snippet: string;
}

export interface GoogleSearchOutput {
  /** Query que se buscó */
  query: string;
  /** Número de resultados encontrados */
  resultsCount: number;
  /** Resultados extraídos */
  results: SearchResult[];
  /** Tiempo total de búsqueda (ms) */
  searchDurationMs: number;
  /** ¿Se encontraron resultados relevantes? */
  hasRelevantResults: boolean;
}

// ============================================================================
// Configuración por defecto
// ============================================================================

const DEFAULT_CONFIG: GoogleSearchConfig = {
  searchQuery: 'artículos científicos sobre cambio climático',
  maxResults: 5,
  resultsTimeout: 10000,
  takeScreenshot: true,
};

// ============================================================================
// Scripts de browser (se ejecutan en el contexto de la página)
// ============================================================================

/**
 * Script para realizar la búsqueda en Google
 */
const SEARCH_SCRIPT = (query: string) => `
(async function performSearch() {
  // 1. Encontrar el campo de búsqueda
  const searchInput = document.querySelector('input[name="q"], textarea[name="q"]');
  if (!searchInput) {
    throw new Error('No se encontró el campo de búsqueda');
  }

  // 2. Limpiar y escribir la query
  searchInput.value = '';
  searchInput.focus();

  // Simular escritura caracter por caracter (más realista)
  const query = ${JSON.stringify(query)};
  for (const char of query) {
    searchInput.value += char;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 50)); // 50ms entre caracteres
  }

  // 3. Esperar un momento y enviar
  await new Promise(r => setTimeout(r, 500));

  // 4. Buscar el botón de búsqueda y hacer click, o presionar Enter
  const searchButton = document.querySelector('input[name="btnK"], button[type="submit"]');
  if (searchButton && searchButton.offsetParent !== null) {
    searchButton.click();
  } else {
    // Fallback: enviar formulario
    const form = searchInput.closest('form');
    if (form) {
      form.submit();
    } else {
      // Último recurso: simular Enter
      searchInput.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
    }
  }

  return { submitted: true, query: query };
})();
`;

/**
 * Script para verificar si los resultados han cargado
 */
const CHECK_RESULTS_LOADED_SCRIPT = `
(function checkResultsLoaded() {
  // Verificar si estamos en la página de resultados
  const isResultsPage = window.location.href.includes('/search') ||
                        window.location.href.includes('q=');

  // Verificar si hay resultados visibles
  const hasResults = document.querySelectorAll('#search .g, #rso .g, .yuRUbf').length > 0;

  // Verificar si hay mensaje de "no results"
  const noResults = document.body.innerText.includes('No se encontraron resultados') ||
                    document.body.innerText.includes('did not match any documents');

  return {
    isResultsPage,
    hasResults,
    noResults,
    ready: isResultsPage && (hasResults || noResults)
  };
})();
`;

/**
 * Script para extraer los resultados de búsqueda
 */
const EXTRACT_RESULTS_SCRIPT = (maxResults: number) => `
(function extractResults() {
  const results = [];

  // Selectores para diferentes layouts de Google
  const resultSelectors = [
    '#search .g',           // Layout clásico
    '#rso .g',              // Layout alternativo
    '[data-hveid] .g',      // Layout con data attributes
    '.yuRUbf'               // Nuevo layout
  ];

  let elements = [];
  for (const selector of resultSelectors) {
    elements = document.querySelectorAll(selector);
    if (elements.length > 0) break;
  }

  let position = 0;
  for (const el of elements) {
    if (position >= ${maxResults}) break;

    // Buscar el título y enlace
    const linkEl = el.querySelector('a[href^="http"]') ||
                   el.querySelector('a[data-ved]') ||
                   el.querySelector('.yuRUbf a');

    if (!linkEl) continue;

    const titleEl = linkEl.querySelector('h3') ||
                    el.querySelector('h3') ||
                    linkEl;

    const snippetEl = el.querySelector('.VwiC3b') ||
                      el.querySelector('[data-sncf]') ||
                      el.querySelector('.st') ||
                      el.querySelector('span:not([class])');

    const url = linkEl.href;
    const title = titleEl?.innerText?.trim() || '';
    const snippet = snippetEl?.innerText?.trim() || '';

    // Filtrar resultados que no son orgánicos
    if (!url || url.includes('google.com') || !title) continue;

    position++;
    results.push({
      position,
      title,
      url,
      snippet: snippet.substring(0, 200) // Limitar snippet
    });
  }

  return {
    results,
    totalFound: elements.length,
    extracted: results.length
  };
})();
`;

// ============================================================================
// El Test Executor
// ============================================================================

export const googleSearchExecutor: ITestExecutor = {
  name: 'GoogleSearchTest',

  /**
   * Setup: Preparar el navegador antes del test
   */
  async setup(controller: IBrowserController, config: ITestConfig): Promise<void> {
    console.log(`\n🔧 [Setup] Preparando test en ${config.device.name}...`);

    // Obtener configuración custom o usar defaults
    const testConfig = {
      ...DEFAULT_CONFIG,
      ...(config.parameters as Partial<GoogleSearchConfig>),
    };

    console.log(`   Query: "${testConfig.searchQuery}"`);
    console.log(`   Max results: ${testConfig.maxResults}`);
  },

  /**
   * Execute: Ejecutar el test principal
   */
  async execute(controller: IBrowserController, config: ITestConfig): Promise<ITestOutput> {
    const startTime = Date.now();

    // Configuración
    const testConfig: GoogleSearchConfig = {
      ...DEFAULT_CONFIG,
      ...(config.parameters as Partial<GoogleSearchConfig>),
    };

    console.log(`\n🚀 [Execute] Iniciando búsqueda en Google...`);

    try {
      // ========================================
      // Paso 1: Navegar a Google
      // ========================================
      console.log('   📍 Navegando a google.com...');
      await controller.navigateTo('https://www.google.com');

      // Esperar a que cargue el campo de búsqueda
      const searchFieldLoaded = await controller.waitForElement(
        'input[name="q"], textarea[name="q"]',
        5000
      );

      if (!searchFieldLoaded) {
        throw new Error('Google no cargó correctamente - campo de búsqueda no encontrado');
      }

      console.log('   ✅ Google cargado correctamente');

      // ========================================
      // Paso 2: Realizar la búsqueda
      // ========================================
      console.log(`   🔍 Buscando: "${testConfig.searchQuery}"...`);

      const searchResult = await controller.executeScript<{ submitted: boolean; query: string }>(
        SEARCH_SCRIPT(testConfig.searchQuery)
      );

      if (!searchResult.submitted) {
        throw new Error('No se pudo enviar la búsqueda');
      }

      // ========================================
      // Paso 3: Esperar resultados
      // ========================================
      console.log('   ⏳ Esperando resultados...');

      const resultsLoaded = await waitForCondition(
        async () => {
          const status = await controller.executeScript<{
            ready: boolean;
            hasResults: boolean;
            noResults: boolean;
          }>(CHECK_RESULTS_LOADED_SCRIPT);
          return status.ready;
        },
        testConfig.resultsTimeout,
        500 // Intervalo de verificación
      );

      if (!resultsLoaded) {
        throw new Error(`Timeout esperando resultados (${testConfig.resultsTimeout}ms)`);
      }

      console.log('   ✅ Resultados cargados');

      // ========================================
      // Paso 4: Extraer resultados
      // ========================================
      console.log('   📊 Extrayendo resultados...');

      const extractionResult = await controller.executeScript<{
        results: SearchResult[];
        totalFound: number;
        extracted: number;
      }>(EXTRACT_RESULTS_SCRIPT(testConfig.maxResults));

      console.log(`   ✅ Extraídos ${extractionResult.extracted} de ${extractionResult.totalFound} resultados`);

      // ========================================
      // Paso 5: Screenshot (opcional)
      // ========================================
      if (testConfig.takeScreenshot) {
        const screenshotPath = `./results/google-search-${Date.now()}.png`;
        try {
          await controller.takeScreenshot(screenshotPath);
          console.log(`   📸 Screenshot guardado: ${screenshotPath}`);
        } catch (err) {
          console.log(`   ⚠️ No se pudo tomar screenshot: ${err}`);
        }
      }

      // ========================================
      // Paso 6: Analizar resultados
      // ========================================
      const searchDurationMs = Date.now() - startTime;
      const hasRelevantResults = extractionResult.results.some(
        (r) =>
          r.title.toLowerCase().includes('científic') ||
          r.title.toLowerCase().includes('ciencia') ||
          r.title.toLowerCase().includes('climate') ||
          r.snippet.toLowerCase().includes('investigación')
      );

      const output: GoogleSearchOutput = {
        query: testConfig.searchQuery,
        resultsCount: extractionResult.extracted,
        results: extractionResult.results,
        searchDurationMs,
        hasRelevantResults,
      };

      // Mostrar resultados en consola
      console.log('\n   📋 Resultados encontrados:');
      for (const result of output.results) {
        console.log(`      ${result.position}. ${result.title}`);
        console.log(`         ${result.url}`);
      }

      // ========================================
      // Paso 7: Determinar veredicto
      // ========================================
      const verdict = output.resultsCount > 0 && output.hasRelevantResults ? 'pass' : 'fail';
      const confidence = output.resultsCount > 0 ? Math.min(output.resultsCount / testConfig.maxResults, 1) : 0;

      console.log(`\n   🏁 Veredicto: ${verdict.toUpperCase()} (confianza: ${(confidence * 100).toFixed(0)}%)`);

      return {
        success: verdict === 'pass',
        verdict,
        confidence,
        data: output,
        metrics: {
          searchDurationMs,
          resultsCount: output.resultsCount,
          relevanceScore: hasRelevantResults ? 1 : 0,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n   ❌ Error: ${errorMessage}`);

      return {
        success: false,
        verdict: 'error',
        confidence: 0,
        data: {
          query: testConfig.searchQuery,
          resultsCount: 0,
          results: [],
          searchDurationMs: Date.now() - startTime,
          hasRelevantResults: false,
          error: errorMessage,
        },
      };
    }
  },

  /**
   * Teardown: Limpieza después del test
   */
  async teardown(controller: IBrowserController, config: ITestConfig): Promise<void> {
    console.log(`\n🧹 [Teardown] Limpiando...`);

    try {
      // Obtener logs de consola del navegador
      const logs = await controller.getConsoleLogs();
      if (logs.length > 0) {
        console.log(`   📝 ${logs.length} mensajes de consola capturados`);
      }
    } catch {
      // Ignorar errores de cleanup
    }

    console.log('   ✅ Limpieza completada\n');
  },
};

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Espera hasta que una condición sea verdadera o timeout
 */
async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout: number,
  interval: number = 100
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      if (await condition()) {
        return true;
      }
    } catch {
      // Ignorar errores y seguir intentando
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  return false;
}

// ============================================================================
// Export para uso directo
// ============================================================================

export default googleSearchExecutor;
```

---

## 6. Paso 3: Ejecutar en Desktop

### src/run-desktop.ts

```typescript
/**
 * Ejecutar el test de Google Search en desktop (macOS/Windows/Linux)
 */

import {
  createMacOSController,
  createWindowsController,
  createLinuxController,
  detectPlatform,
  createLocalDeviceInfo,
  type IBrowserController,
  type ITestConfig,
} from 'auto-mat-ion/execution';

import { googleSearchExecutor, type GoogleSearchConfig } from './executors/google-search-executor.js';

async function runDesktopTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     auto-mat-ion: Google Search Test (Desktop)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Detectar plataforma y crear controller
  const platform = detectPlatform();
  console.log(`🖥️  Plataforma detectada: ${platform}`);

  let controller: IBrowserController;

  switch (platform) {
    case 'macos':
      controller = createMacOSController();
      break;
    case 'windows':
      controller = createWindowsController();
      break;
    case 'linux':
      controller = createLinuxController();
      break;
    default:
      throw new Error(`Plataforma no soportada: ${platform}`);
  }

  try {
    // 2. Inicializar
    console.log('🔌 Inicializando controller...');
    await controller.initialize();

    // 3. Obtener info del dispositivo
    const deviceInfo = await createLocalDeviceInfo();
    console.log(`✅ Dispositivo: ${deviceInfo.name}`);
    console.log(`   Navegadores: ${deviceInfo.browsers.join(', ')}`);

    // 4. Lanzar navegador
    const browser = deviceInfo.browsers.includes('chrome') ? 'chrome' : deviceInfo.browsers[0];
    console.log(`\n🌐 Lanzando ${browser}...`);

    await controller.launchBrowser(browser, {
      headless: false, // Ver el navegador en acción
      width: 1280,
      height: 800,
    });

    // 5. Crear configuración del test
    const testConfig: ITestConfig = {
      id: `desktop-test-${Date.now()}`,
      device: deviceInfo,
      browser,
      parameters: {
        searchQuery: 'artículos científicos sobre inteligencia artificial 2024',
        maxResults: 5,
        resultsTimeout: 15000,
        takeScreenshot: true,
      } as GoogleSearchConfig,
      repetition: 1,
      testUrl: 'https://www.google.com',
    };

    // 6. Ejecutar el test
    console.log('\n' + '─'.repeat(60));

    if (googleSearchExecutor.setup) {
      await googleSearchExecutor.setup(controller, testConfig);
    }

    const result = await googleSearchExecutor.execute(controller, testConfig);

    if (googleSearchExecutor.teardown) {
      await googleSearchExecutor.teardown(controller, testConfig);
    }

    // 7. Mostrar resultado final
    console.log('─'.repeat(60));
    console.log('\n📊 RESULTADO FINAL:');
    console.log(`   Veredicto: ${result.verdict?.toUpperCase()}`);
    console.log(`   Confianza: ${((result.confidence || 0) * 100).toFixed(0)}%`);

    if (result.data) {
      const data = result.data as { resultsCount: number; searchDurationMs: number };
      console.log(`   Resultados: ${data.resultsCount}`);
      console.log(`   Duración: ${data.searchDurationMs}ms`);
    }

    // Esperar un momento para ver el resultado
    console.log('\n⏳ Esperando 5 segundos antes de cerrar...');
    await new Promise((r) => setTimeout(r, 5000));

    return result;

  } finally {
    // 8. Cleanup
    console.log('\n🧹 Cerrando navegador...');
    await controller.cleanup();
    console.log('✅ Test completado\n');
  }
}

// Ejecutar
runDesktopTest()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
```

---

## 7. Paso 4: Ejecutar en Android (ADB WiFi)

### src/run-android.ts

```typescript
/**
 * Ejecutar el test de Google Search en Android vía ADB WiFi
 */

import {
  createAndroidController,
  listAndroidDevices,
  connectAndroidWifi,
  type ITestConfig,
} from 'auto-mat-ion/execution';

import { googleSearchExecutor, type GoogleSearchConfig } from './executors/google-search-executor.js';

// Configuración WiFi (ajusta a tu red)
const WIFI_CONFIG = {
  ip: '192.168.1.100',  // IP de tu dispositivo Android
  port: 5555,           // Puerto ADB (default)
};

async function runAndroidTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('     auto-mat-ion: Google Search Test (Android)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Listar dispositivos disponibles
  console.log('🔍 Buscando dispositivos Android...');
  const devices = await listAndroidDevices();

  if (devices.length === 0) {
    console.log('⚠️  No hay dispositivos USB conectados.');
    console.log('   Intentando conexión WiFi...\n');

    // Intentar conexión WiFi
    try {
      console.log(`📶 Conectando a ${WIFI_CONFIG.ip}:${WIFI_CONFIG.port}...`);
      const controller = await connectAndroidWifi(WIFI_CONFIG.ip, WIFI_CONFIG.port);

      return await executeTestOnController(controller);
    } catch (err) {
      console.error('❌ No se pudo conectar vía WiFi:', err);
      console.log('\n💡 Pasos para habilitar ADB WiFi:');
      console.log('   1. Conecta el dispositivo por USB');
      console.log('   2. Ejecuta: adb tcpip 5555');
      console.log('   3. Desconecta el USB');
      console.log('   4. Ejecuta: adb connect <IP_DISPOSITIVO>:5555');
      console.log('\n   Para Android 11+:');
      console.log('   1. Ve a Ajustes > Opciones de desarrollador > Depuración inalámbrica');
      console.log('   2. Actívala y usa el código de emparejamiento');
      process.exit(1);
    }
  }

  // Mostrar dispositivos encontrados
  console.log(`✅ ${devices.length} dispositivo(s) encontrado(s):`);
  for (const device of devices) {
    console.log(`   - ${device.serial} (${device.status})`);
  }

  // 2. Usar el primer dispositivo disponible
  const targetDevice = devices[0];
  console.log(`\n📱 Usando dispositivo: ${targetDevice.serial}`);

  const controller = createAndroidController(targetDevice.serial);

  return await executeTestOnController(controller);
}

async function executeTestOnController(controller: ReturnType<typeof createAndroidController>) {
  try {
    // 1. Inicializar
    console.log('🔌 Inicializando controller...');
    await controller.initialize();

    // 2. Obtener info del dispositivo
    const deviceInfo = await controller.getDeviceInfo();
    console.log(`✅ Conectado a: ${deviceInfo.name}`);
    console.log(`   OS: ${deviceInfo.osVersion}`);
    console.log(`   Cámaras: ${deviceInfo.cameras.map((c) => c.label).join(', ')}`);

    // 3. Verificar conexión WiFi (si aplica)
    if (controller.connectionType === 'wifi') {
      const health = await controller.checkWifiHealth();
      console.log(`   WiFi Latencia: ${health.latencyMs}ms`);
      if (health.signalStrength) {
        console.log(`   WiFi Señal: ${health.signalStrength}dBm`);
      }
    }

    // 4. Verificar batería
    const battery = await controller.getBatteryLevel();
    console.log(`   Batería: ${battery}%`);

    if (battery < 20) {
      console.log('⚠️  Batería baja, considera cargar el dispositivo');
    }

    // 5. Despertar pantalla si está apagada
    if (!(await controller.isScreenOn())) {
      console.log('📱 Despertando pantalla...');
      await controller.wakeUp();
    }

    // 6. Lanzar Chrome
    console.log('\n🌐 Lanzando Chrome en Android...');
    await controller.launchBrowser('chrome', {
      grantCameraPermission: true, // Por si acaso
    });

    // 7. Crear configuración del test
    const testConfig: ITestConfig = {
      id: `android-test-${Date.now()}`,
      device: deviceInfo,
      browser: 'chrome',
      parameters: {
        searchQuery: 'últimas noticias ciencia y tecnología',
        maxResults: 5,
        resultsTimeout: 20000, // Más tiempo para móvil
        takeScreenshot: true,
      } as GoogleSearchConfig,
      repetition: 1,
      testUrl: 'https://www.google.com',
    };

    // 8. Ejecutar el test
    console.log('\n' + '─'.repeat(60));

    if (googleSearchExecutor.setup) {
      await googleSearchExecutor.setup(controller, testConfig);
    }

    const result = await googleSearchExecutor.execute(controller, testConfig);

    if (googleSearchExecutor.teardown) {
      await googleSearchExecutor.teardown(controller, testConfig);
    }

    // 9. Mostrar resultado final
    console.log('─'.repeat(60));
    console.log('\n📊 RESULTADO FINAL:');
    console.log(`   Veredicto: ${result.verdict?.toUpperCase()}`);
    console.log(`   Confianza: ${((result.confidence || 0) * 100).toFixed(0)}%`);

    if (result.data) {
      const data = result.data as { resultsCount: number; searchDurationMs: number };
      console.log(`   Resultados: ${data.resultsCount}`);
      console.log(`   Duración: ${data.searchDurationMs}ms`);
    }

    return result;

  } finally {
    // 10. Cleanup
    console.log('\n🧹 Limpiando...');
    await controller.cleanup();
    console.log('✅ Test completado\n');
  }
}

// Ejecutar
runAndroidTest()
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
```

---

## 8. Paso 5: Análisis de Resultados

### Estructura del resultado

El `ITestOutput` devuelto contiene:

```typescript
{
  success: true,                    // ¿Pasó el test?
  verdict: 'pass',                  // 'pass' | 'fail' | 'error'
  confidence: 0.8,                  // 0.0 - 1.0
  data: {                           // GoogleSearchOutput
    query: 'artículos científicos...',
    resultsCount: 5,
    results: [
      {
        position: 1,
        title: 'Revista de Ciencia...',
        url: 'https://...',
        snippet: 'Artículos sobre...'
      },
      // ...
    ],
    searchDurationMs: 3500,
    hasRelevantResults: true
  },
  metrics: {
    searchDurationMs: 3500,
    resultsCount: 5,
    relevanceScore: 1
  }
}
```

### Guardar resultados en JSON

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'fs';

function saveResults(result: ITestOutput, filename: string) {
  if (!existsSync('./results')) {
    mkdirSync('./results', { recursive: true });
  }

  const output = {
    timestamp: new Date().toISOString(),
    ...result,
  };

  writeFileSync(
    `./results/${filename}.json`,
    JSON.stringify(output, null, 2)
  );

  console.log(`💾 Resultados guardados en ./results/${filename}.json`);
}
```

---

## 9. Código Completo

### Ejecutar todo

```bash
# Instalar dependencias
npm install

# Ejecutar en desktop
npm run test:desktop

# Ejecutar en Android (ajusta WIFI_CONFIG primero)
npm run test:android

# Ejecutar en ambos
npm run test:all
```

### Output esperado

```
═══════════════════════════════════════════════════════════
     auto-mat-ion: Google Search Test (Desktop)
═══════════════════════════════════════════════════════════

🖥️  Plataforma detectada: macos
🔌 Inicializando controller...
✅ Dispositivo: MacBook-Pro
   Navegadores: chrome, firefox, safari

🌐 Lanzando chrome...

────────────────────────────────────────────────────────────

🔧 [Setup] Preparando test en MacBook-Pro...
   Query: "artículos científicos sobre inteligencia artificial 2024"
   Max results: 5

🚀 [Execute] Iniciando búsqueda en Google...
   📍 Navegando a google.com...
   ✅ Google cargado correctamente
   🔍 Buscando: "artículos científicos sobre inteligencia artificial 2024"...
   ⏳ Esperando resultados...
   ✅ Resultados cargados
   📊 Extrayendo resultados...
   ✅ Extraídos 5 de 10 resultados
   📸 Screenshot guardado: ./results/google-search-1706123456789.png

   📋 Resultados encontrados:
      1. Nature - International Journal of Science
         https://www.nature.com/...
      2. Science | AAAS
         https://www.science.org/...
      3. Revista Científica de IA
         https://...
      4. ...
      5. ...

   🏁 Veredicto: PASS (confianza: 100%)

🧹 [Teardown] Limpiando...
   📝 3 mensajes de consola capturados
   ✅ Limpieza completada

────────────────────────────────────────────────────────────

📊 RESULTADO FINAL:
   Veredicto: PASS
   Confianza: 100%
   Resultados: 5
   Duración: 3542ms

⏳ Esperando 5 segundos antes de cerrar...

🧹 Cerrando navegador...
✅ Test completado
```

---

## 10. Troubleshooting

### Error: "No se encontró el campo de búsqueda"

**Causa**: Google puede mostrar diferentes layouts según región/idioma.

**Solución**: Actualizar los selectores en `SEARCH_SCRIPT`:

```typescript
const searchInput = document.querySelector(
  'input[name="q"], textarea[name="q"], input[title="Buscar"], input[aria-label="Buscar"]'
);
```

### Error: "Timeout esperando resultados"

**Causa**: Conexión lenta o Google bloqueando por bot detection.

**Solución**:
1. Aumentar `resultsTimeout`
2. Añadir delays más largos entre acciones
3. Usar un user-data-dir persistente para mantener cookies

### Error: "ADB not found"

**Solución**:

```bash
# macOS
brew install android-platform-tools

# Ubuntu/Debian
sudo apt install adb

# Windows
# Descargar de: https://developer.android.com/studio/releases/platform-tools
```

### Error: "Device unauthorized"

**Solución**:
1. Revisa la pantalla del dispositivo Android
2. Acepta el diálogo de "Permitir depuración USB"
3. Marca "Recordar siempre para este equipo"

### WiFi: "Connection refused"

**Solución**:
1. Verifica que el dispositivo y PC están en la misma red
2. Ejecuta `adb tcpip 5555` mientras está conectado por USB
3. Para Android 11+: Usa el método de pairing

---

## Recursos Adicionales

- [Documentación de auto-mat-ion](../README.md)
- [API Reference](../src/execution/index.ts)
- [Ejemplos adicionales](../examples/)

---

*Tutorial creado con auto-mat-ion v0.2.0*
*Parte del ecosistema UTOP.IA*
