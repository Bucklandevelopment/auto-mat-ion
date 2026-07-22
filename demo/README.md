# auto-mat-ion Demo

Servidor local y páginas de demo para testing de sensores del navegador en dispositivos reales.

## Inicio Rápido

```bash
# Iniciar servidor con configuración automática
npx tsx demo/server/index.ts

# Con opciones
npx tsx demo/server/index.ts --port 8891 --no-adb-reverse
```

## Estructura

```
demo/
├── server/           # Servidor HTTP local
│   └── index.ts      # Fastify server con post-hooks
│
├── pages/            # Páginas de demo HTML
│   ├── index.html    # Portal principal
│   └── sensors/      # Tests por sensor
│       ├── camera.html
│       ├── microphone.html
│       └── ...
│
├── scripts/          # Utilidades CLI
│   └── enumerate-devices.ts
│
└── configs/          # Configuración de tests
    └── sensor-matrix.ts
```

## Servidor

El servidor proporciona:

### Páginas Estáticas

- `http://localhost:8891/` - Portal principal
- `http://localhost:8891/sensors/camera.html` - Test de cámara
- etc.

### API

- `GET /api/health` - Estado del servidor
- `GET /api/devices` - Dispositivos Android conectados
- `GET /api/network` - IPs locales

### Post-Hooks Automáticos

Al iniciar, el servidor ejecuta automáticamente:

1. **Enumeración de dispositivos** - Lista Android (ADB) e iOS (xcrun)
2. **ADB Reverse** - Configura port forwarding para acceso desde emuladores

## Enumeración de Dispositivos

```bash
# Enumeración básica
npx tsx demo/scripts/enumerate-devices.ts

# Con capacidades de sensores
npx tsx demo/scripts/enumerate-devices.ts --capabilities

# Configurar adb reverse
npx tsx demo/scripts/enumerate-devices.ts --setup-reverse --port 8891

# Output JSON
npx tsx demo/scripts/enumerate-devices.ts --json > devices.json
```

Opciones:

| Flag | Descripción |
|------|-------------|
| `--port N` | Puerto para adb reverse (default: 8891) |
| `--setup-reverse, -r` | Configurar adb reverse en todos los dispositivos |
| `--capabilities, -c` | Obtener capacidades de sensores |
| `--json` | Output en formato JSON |

## Test Matrix

El archivo `configs/sensor-matrix.ts` define presets de configuración para tests:

```typescript
import { generateSensorMatrix, calculateMatrixStats } from './sensor-matrix';

// Generar configuraciones de test para video
const videoTests = generateSensorMatrix('video', 'standard', {
  devices: ['emulator-5554'],
  browsers: ['chrome'],
  repetitions: 3
});

// Estadísticas
const stats = calculateMatrixStats(videoTests);
console.log(`${stats.totalTests} tests, ~${stats.estimatedDurationFormatted}`);
```

### Presets Disponibles

**Video:**
- `quick` - Una configuración básica
- `standard` - HD front/back
- `resolutions` - Sweep de resoluciones
- `frameRates` - 15/24/30/60 fps
- `comprehensive` - Todas las combinaciones

**Audio:**
- `quick` - 48kHz mono
- `standard` - Configuraciones comunes
- `sampleRates` - 8kHz a 96kHz
- `processing` - Echo/Noise/Gain

**Motion:**
- `quick` - Acelerómetro 60Hz
- `standard` - Todos los sensores de movimiento
- `frequencies` - Sweep de frecuencias

## Acceso desde Dispositivos

### Emulador Android

```bash
# El servidor configura automáticamente adb reverse
# Accede a: http://localhost:8891 desde Chrome en el emulador
```

### Dispositivo Físico USB

```bash
# Asegúrate de que USB debugging está habilitado
# El servidor configura adb reverse automáticamente
# Accede a: http://localhost:8891 desde Chrome
```

### Dispositivo Físico WiFi

```bash
# Obtén la IP del host
npx tsx demo/server/index.ts
# → Network: http://192.168.1.100:8891

# Desde el dispositivo, accede a esa URL
```

### Simulador iOS

```bash
# Los simuladores comparten red con el host
# Accede a: http://localhost:8891 desde Safari
```

## Páginas de Demo

### Camera (`/sensors/camera.html`)

- Selección de cámara (front/back)
- Control de resolución y frame rate
- Captura de frames
- Control de torch/flash
- Visualización de capabilities

### Próximamente

- Microphone
- Accelerometer
- Gyroscope
- Geolocation
- Bluetooth
- USB
- etc.

## Requisitos

- Node.js 18+
- ADB instalado (para Android)
- Xcode Command Line Tools (para iOS simulators)
- Dispositivo Android con USB debugging habilitado

## Troubleshooting

### "No devices found"

```bash
# Verifica ADB
adb devices

# Reinicia ADB server
adb kill-server && adb start-server
```

### "ERR_NAME_NOT_RESOLVED"

El emulador no puede resolver DNS externos. Usa el servidor local:

```bash
npx tsx demo/server/index.ts
# Navega a http://localhost:8891 en el emulador
```

### "Permission denied" para cámara/micrófono

Algunos navegadores requieren HTTPS para APIs de medios. Para desarrollo local:

```bash
# Generar certificado autofirmado
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes

# Iniciar con HTTPS
npx tsx demo/server/index.ts --https
```
