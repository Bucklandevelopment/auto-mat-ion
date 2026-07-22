# auto-mat-ion Documentation

> Framework opensource para granjas de pruebas distribuidas con dispositivos reales

---

## 🚀 Quick Start

```bash
# Instalar
npm install auto-mat-ion

# Ver dispositivos conectados
ami devices

# Ejecutar tu primer test
ami test "open google and search for 'hello world'"
```

---

## 📚 Documentación

### Para Empezar

| Documento | Descripción |
|-----------|-------------|
| [Installation](./getting-started/INSTALLATION.md) | Instalación paso a paso |
| [Quick Start](./getting-started/QUICK-START.md) | Tu primer test en 5 minutos |
| [Device Setup](./getting-started/DEVICE-SETUP.md) | Configurar Android/iOS |

### Tutoriales

| Tutorial | Descripción | Nivel |
|----------|-------------|-------|
| [Google Search Test](./tutorials/tutorial-google-search-test.md) | Crear un ITestExecutor completo | Intermedio |
| [FamilyCare Demo](./tutorials/tutorial-familycare-demo.md) | Testing multi-dispositivo | Avanzado |
| [ADB WiFi](./tutorials/tutorial-adb-wifi.md) | Conectar Android sin cables | Básico |

### API Reference

| Módulo | Descripción |
|--------|-------------|
| [Controllers](./api-reference/CONTROLLERS.md) | IBrowserController, AndroidController, etc. |
| [Executors](./api-reference/EXECUTORS.md) | ITestExecutor interface |
| [CLI](./api-reference/CLI.md) | Comandos `ami` |

### Visión y Roadmap

| Documento | Descripción |
|-----------|-------------|
| [Vision](../documentation_goals/vision/VISION.md) | Filosofía del proyecto |
| [Vision Expanded](../documentation_goals/vision/VISION-EXPANDED.md) | Estaciones Semilla, EUDI, educación |
| [Roadmap](../documentation_goals/roadmap/CALENDAR.md) | Calendario de desarrollo |

### Proyectos Demo

| Proyecto | Descripción | Estado |
|----------|-------------|--------|
| [FamilyCare](./projects/familycare/) | App de cuidado familiar | 🚧 En desarrollo |

---

## 🎯 Casos de Uso

### 1. Testing Multi-Dispositivo

Ejecuta el mismo test en 5+ dispositivos simultáneamente:

```typescript
import { quickExecute, listAndroidDevices } from 'auto-mat-ion';

const devices = await listAndroidDevices();
const results = await quickExecute({
  testUrl: 'https://mi-app.com',
  devices: devices.map(d => d.serial),
  executor: myTestExecutor
});
```

### 2. Integración con CI/CD

```yaml
# .github/workflows/e2e.yml
- name: Run E2E Tests
  run: |
    ami devices --json > devices.json
    ami run --suite ./tests/e2e.ts --output results/
```

### 3. Testing con Claude Cowork

Describe tus tests en lenguaje natural:

```
"Abre la app en todos los dispositivos conectados,
registra un usuario diferente en cada uno,
y verifica que el dashboard muestra a todos los usuarios"
```

---

## 🤝 Contribuir

Ver [CONTRIBUTING.md](./contributing/CONTRIBUTING.md)

---

## 📖 Recursos Adicionales

- [GitHub Repository](https://github.com/auto-mat-ion/auto-mat-ion)
- [npm Package](https://www.npmjs.com/package/auto-mat-ion)
- [Discord Community](#) (próximamente)

---

*auto-mat-ion es parte del ecosistema [UTOP.IA](../documentation_goals/architecture/ECOSYSTEM-INTEGRATION.md)*
