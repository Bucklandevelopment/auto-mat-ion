# auto-mat-ion: Integración con el Ecosistema UTOP.IA

> Documento de arquitectura para la sincronización de auto-mat-ion con vital-core y los sistemas complementarios del dashboard personal

---

## El Ecosistema UTOP.IA

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              UTOP.IA ECOSYSTEM                                  │
│                         "Inteligencia Aumentada Personal"                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                          ┌─────────────────────┐                                │
│                          │     VITAL-CORE      │                                │
│                          │   Gateway Central   │                                │
│                          │     Puerto 8888     │                                │
│                          └──────────┬──────────┘                                │
│                                     │                                           │
│     ┌───────────────────────────────┼───────────────────────────────┐           │
│     │                               │                               │           │
│     │         ┌─────────────────────┼─────────────────────┐         │           │
│     │         │                     │                     │         │           │
│     ▼         ▼                     ▼                     ▼         ▼           │
│ ┌────────┐ ┌────────┐         ┌──────────┐         ┌────────┐ ┌────────┐       │
│ │biohack │ │canela  │         │ ideacursi│         │codking │ │  auto  │       │
│ │  -app  │ │ molida │         │   tool   │         │        │ │ mat-ion│       │
│ │        │ │        │         │          │         │        │ │        │       │
│ │ SALUD  │ │INVESTIG│         │ EDUCACIÓN│         │   IA   │ │TESTING │       │
│ │:8080   │ │ :3690  │         │  :5050   │         │ :8000  │ │ :9090  │       │
│ └────────┘ └────────┘         └──────────┘         └────────┘ └────────┘       │
│     │           │                   │                   │           │           │
│     └───────────┴───────────────────┴───────────────────┴───────────┘           │
│                                     │                                           │
│                          ┌──────────┴──────────┐                                │
│                          │     Event Store     │                                │
│                          │    (PostgreSQL)     │                                │
│                          └─────────────────────┘                                │
│                                     │                                           │
│                          ┌──────────┴──────────┐                                │
│                          │     Event Bus       │                                │
│                          │      (Redis)        │                                │
│                          └─────────────────────┘                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Mapa de Servicios y Propósitos

| Servicio | Puerto | Categoría | Propósito | Estado |
|----------|--------|-----------|-----------|--------|
| **vital-core** | 8888 | Sistema | Gateway/Orquestador central | ✅ Activo |
| **biohack-app** | 8080 | Salud | Tu salud personal (HealthKit, biomarcadores) | ✅ Activo |
| **canela-molida** | 3690 | Investigación | Tu aprendizaje guiado (RAG científico) | ✅ Activo |
| **ideacursi-tool** | 5050 | Educación | Tu aprendizaje propio (generador de cursos) | ✅ Activo |
| **codking** | 8000 | IA | Modelo especializado (Health/Edu/Security) | ✅ Activo |
| **auto-mat-ion** | 9090 | Testing | Red distribuida de dispositivos | 🚧 Nuevo |

---

## Rol de auto-mat-ion en el Ecosistema

### La Pieza que Faltaba

El ecosistema UTOP.IA tenía:
- ✅ Orquestación (vital-core)
- ✅ Datos de salud (biohack-app)
- ✅ Conocimiento científico (canela-molida)
- ✅ Generación de cursos (ideacursi-tool)
- ✅ IA especializada (codking)
- ❌ **Validación en el mundo real**

**auto-mat-ion** completa el ciclo:

```
INVESTIGACIÓN (canela-molida)
        │
        ▼
HIPÓTESIS / MODELO
        │
        ▼
EDUCACIÓN (ideacursi-tool) ──────► APLICACIÓN (biohack-app)
        │                                   │
        ▼                                   │
GENERACIÓN DE APPS/TESTS                    │
        │                                   │
        ▼                                   │
┌───────────────────────────────────────────┘
│
▼
VALIDACIÓN REAL (auto-mat-ion)
        │
        │  ← Datos de dispositivos reales
        │  ← Testing en hardware diverso
        │  ← Feedback de usuarios reales
        │
        ▼
EVIDENCIAS VALIDADAS
        │
        └──────► Retroalimenta INVESTIGACIÓN
```

### Flujos de Integración

#### 1. Investigación → Testing → Validación

```
canela-molida: "Paper sobre nuevo algoritmo de detección de arritmias"
        │
        ▼
ideacursi-tool: "Genera curso sobre implementación del algoritmo"
        │
        ▼
codking: "Implementa prototipo del algoritmo"
        │
        ▼
auto-mat-ion: "Despliega tests en 500 dispositivos con sensores cardíacos"
        │
        ▼
biohack-app: "Integra resultados validados en tracking de salud"
```

#### 2. Salud → Sensores → Datos Agregados

```
biohack-app: "Usuario quiere medir variabilidad cardíaca en diferentes contextos"
        │
        ▼
auto-mat-ion: "Distribuye medición a Estaciones Semilla con sensor de pulso"
        │
        ▼
vital-core: "Agrega datos anónimos de múltiples dispositivos"
        │
        ▼
canela-molida: "Analiza correlaciones con papers existentes"
        │
        ▼
biohack-app: "Muestra insights personalizados basados en datos poblacionales"
```

---

## Categorías de Eventos en vital-core

### Eventos Existentes

```python
VITAL_EVENT_CATEGORIES = [
    "health",      # biohack-app
    "education",   # ideacursi-tool
    "research",    # canela-molida
    "security",    # cybertools
    "system",      # vital-core
]
```

### Nueva Categoría: testing

```python
# Propuesta de extensión
VITAL_EVENT_CATEGORIES.extend([
    "testing",     # auto-mat-ion
])

# Tipos de eventos de testing
TESTING_EVENT_TYPES = [
    "device.connected",
    "device.disconnected",
    "test.queued",
    "test.started",
    "test.completed",
    "test.failed",
    "result.validated",
    "contribution.recorded",    # Puntos científicos
    "project.created",
    "project.milestone",
]
```

---

## Schema de Eventos auto-mat-ion

### Registro en Event Store

```python
# Ejemplo de evento auto-mat-ion
{
    "event_id": "uuid",
    "correlation_id": "uuid",
    "timestamp": "2026-01-30T15:30:00Z",
    "category": "testing",
    "source": "auto-mat-ion",
    "action": "create",
    "event_type": "result.validated",
    "payload": {
        "test_id": "test-123",
        "project_id": "proyecto-aire-limpio",
        "device_type": "estacion-semilla-v1",
        "device_region": "ES-AN",           # Andalucía
        "sensor_type": "pm25",
        "measurement": {
            "value": 15.3,
            "unit": "μg/m³",
            "calibration_status": "verified"
        },
        "validation": {
            "consensus_devices": 5,
            "confidence": 0.97,
            "anomaly_detected": false
        },
        "contribution": {
            "points_earned": 10,
            "eudi_credential_issued": true
        }
    },
    "metadata": {
        "firmware_version": "1.2.3",
        "battery_level": 85,
        "connectivity": "wifi"
    },
    "compute_provider": "local",    # Validación local
    "compute_latency_ms": 45.2
}
```

---

## Integración con Compute Router

### Extensión del Router de vital-core

```
                     ┌─────────────────┐
                     │  Compute Router │
                     │   (vital-core)  │
                     └────────┬────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
     ▼                        ▼                        ▼
┌─────────┐            ┌─────────────┐           ┌─────────┐
│ LOCAL   │            │   HYBRID    │           │  EDGE   │  ← NUEVO
│ Ollama  │            │   CodKing   │           │auto-mat │
│ ONNX    │            │             │           │  -ion   │
└─────────┘            └─────────────┘           └─────────┘
                            │
                    ┌───────┴───────┐
                    │   3 Cores     │
                    ├───────────────┤
                    │ Health        │ ← Conecta con biohack-app
                    │ Education     │ ← Conecta con ideacursi-tool
                    │ Security      │ ← Conecta con cybertools
                    └───────────────┘

NUEVO: Edge Computing (auto-mat-ion)
┌─────────────────────────────────────────────┐
│ Testing       │ Validación en dispositivos  │
│ Sensing       │ Recolección de datos IoT    │
│ Verification  │ Consenso distribuido        │
└─────────────────────────────────────────────┘
```

### Decisiones del Router

```python
def route_compute(task: Task) -> ComputeProvider:
    """
    Extensión del compute router para incluir auto-mat-ion
    """

    # Tareas que requieren validación en hardware real
    if task.requires_real_device:
        return "auto-mat-ion"

    # Tareas de sensado ambiental/biométrico
    if task.type in ["sensor_reading", "environmental_monitoring"]:
        return "auto-mat-ion"

    # Tareas de testing de apps
    if task.type == "app_testing" and task.requires_diverse_devices:
        return "auto-mat-ion"

    # Resto de lógica existente...
    if task.requires_privacy:
        return "ollama"
    elif task.domain in ["health", "education", "security"]:
        return "codking"
    else:
        return "claude"  # Cloud fallback
```

---

## APIs de Integración

### Endpoints de auto-mat-ion para vital-core

```
# Registro de dispositivos
POST /api/v1/devices/register
GET  /api/v1/devices/{device_id}/status
PUT  /api/v1/devices/{device_id}/heartbeat

# Gestión de proyectos
POST /api/v1/projects
GET  /api/v1/projects/{project_id}
GET  /api/v1/projects/{project_id}/stats

# Ejecución de tests
POST /api/v1/tests/queue
GET  /api/v1/tests/{test_id}/status
GET  /api/v1/tests/{test_id}/results

# Puntos y contribuciones
GET  /api/v1/contributions/{device_id}
GET  /api/v1/leaderboard
POST /api/v1/contributions/verify

# Integración EUDI
POST /api/v1/eudi/link-device
GET  /api/v1/eudi/credentials/{pseudonym}
POST /api/v1/eudi/issue-credential
```

### Proxy via vital-core Gateway

```bash
# Todas las llamadas pasan por vital-core para trazabilidad

# Registrar dispositivo
curl -X POST http://localhost:8888/api/v1/gateway/testing/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "device_type": "estacion-semilla-v1",
    "sensors": ["temperature", "humidity", "pm25"],
    "eudi_pseudonym": "pequeño-cientifico-42"
  }'

# Consultar proyecto
curl http://localhost:8888/api/v1/gateway/testing/projects/aire-limpio-bcn

# Ver contribuciones
curl http://localhost:8888/api/v1/gateway/testing/contributions/device-abc123
```

---

## Flujos Inter-Servicio

### Pipeline: Research → Test → Validate → Learn

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE: INVESTIGACIÓN → VALIDACIÓN                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 1: Descubrimiento (canela-molida)                                      │
│  ────────────────────────────────────────                                    │
│  Usuario: "Buscar papers sobre contaminación urbana y salud respiratoria"    │
│                                                                              │
│  canela-molida → OpenAlex → 50 papers relevantes                             │
│  canela-molida → RAG synthesis → Resumen de hallazgos                        │
│                                                                              │
│  EVENT: {category: "research", action: "query", event_type: "papers.found"}  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 2: Hipótesis (codking + canela-molida)                                 │
│  ───────────────────────────────────────────                                 │
│  "¿Existe correlación entre PM2.5 >25 y síntomas respiratorios en niños?"    │
│                                                                              │
│  codking (Health Core) → Genera modelo predictivo                            │
│  codking (Education Core) → Genera test para validación                      │
│                                                                              │
│  EVENT: {category: "research", action: "analyze", event_type: "hypothesis"}  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 3: Diseño de Experimento (auto-mat-ion)                                │
│  ────────────────────────────────────────────                                │
│  Crear proyecto: "Respirar Limpio Barcelona"                                 │
│  Requisitos:                                                                 │
│    - 100 Estaciones Semilla con sensor PM2.5                                 │
│    - Distribución: 5 distritos de BCN                                        │
│    - Duración: 3 meses                                                       │
│    - Correlación: datos de biohack-app (síntomas)                            │
│                                                                              │
│  EVENT: {category: "testing", action: "create", event_type: "project"}       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 4: Recolección de Datos (auto-mat-ion + biohack-app)                   │
│  ────────────────────────────────────────────────────────                    │
│                                                                              │
│  auto-mat-ion:                                                               │
│    - Estaciones envían lecturas cada 15 min                                  │
│    - Validación por consenso (mín 3 dispositivos cercanos)                   │
│    - Puntos científicos a colaboradores                                      │
│                                                                              │
│  biohack-app (opcional, con consentimiento):                                 │
│    - Usuarios reportan síntomas respiratorios                                │
│    - Correlación temporal con lecturas de aire                               │
│                                                                              │
│  EVENT: {category: "testing", action: "collect", event_type: "data.batch"}   │
│  EVENT: {category: "health", action: "report", event_type: "symptoms"}       │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 5: Análisis (vital-core → codking → canela-molida)                     │
│  ─────────────────────────────────────────────────────                       │
│                                                                              │
│  vital-core: Agrega todos los eventos del pipeline                           │
│  codking (Health): Analiza correlaciones                                     │
│  canela-molida: Compara con literatura científica existente                  │
│                                                                              │
│  RESULTADO:                                                                  │
│    "Correlación significativa (p<0.05) entre PM2.5 >25 y aumento             │
│     de síntomas respiratorios en las 48h siguientes"                         │
│                                                                              │
│  EVENT: {category: "research", action: "complete", event_type: "finding"}    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 6: Difusión (ideacursi-tool)                                           │
│  ─────────────────────────────────                                           │
│                                                                              │
│  ideacursi-tool genera:                                                      │
│    - Curso: "Entendiendo la calidad del aire en tu barrio"                   │
│    - Dirigido a: Colaboradores del proyecto + público general                │
│    - Incluye: Datos reales del proyecto como ejemplos                        │
│                                                                              │
│  EVENT: {category: "education", action: "create", event_type: "course"}      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PASO 7: Credenciales (auto-mat-ion + EUDI)                                  │
│  ──────────────────────────────────────────                                  │
│                                                                              │
│  Colaboradores reciben:                                                      │
│    - Credencial EUDI: "Contribuidor Proyecto Respirar Limpio BCN 2026"       │
│    - Puntos científicos: 500 (por 3 meses de colaboración)                   │
│    - Badge: "Científico Ciudadano - Calidad del Aire"                        │
│                                                                              │
│  EVENT: {category: "testing", action: "reward", event_type: "credential"}    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuración en vital-core

### docker-compose.yml (extensión)

```yaml
services:
  # ... servicios existentes ...

  auto-mat-ion:
    build: ../auto-mat-ion
    container_name: auto-mat-ion
    ports:
      - "9090:9090"
    environment:
      - DATABASE_URL=postgresql+asyncpg://vital:vital_password@postgres:5432/vital_core
      - REDIS_URL=redis://redis:6379/0
      - VITAL_CORE_URL=http://vital-core:8888
      - EUDI_SANDBOX_URL=${EUDI_SANDBOX_URL}
    depends_on:
      - postgres
      - redis
      - vital-core
    profiles:
      - testing
      - full
    networks:
      - vital-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### .env (variables adicionales)

```bash
# auto-mat-ion
TESTING_SERVICE_URL=http://localhost:9090
AUTO_MAT_ION_ENABLED=true

# EUDI Integration
EUDI_SANDBOX_URL=https://eudi-sandbox.europa.eu
EUDI_CLIENT_ID=auto-mat-ion-dev
EUDI_ISSUER_DID=did:web:auto-mat-ion.utopia.local

# Antifraude
CONSENSUS_MIN_DEVICES=3
ANOMALY_DETECTION_THRESHOLD=0.85
DEVICE_FINGERPRINT_SALT=your-secret-salt
```

### Service Registry

```python
# app/core/config.py (extensión)

SERVICES = {
    "health": {
        "name": "biohack-app",
        "url": settings.HEALTH_SERVICE_URL,
        "category": "health",
    },
    "research": {
        "name": "canela-molida",
        "url": settings.RESEARCH_SERVICE_URL,
        "category": "research",
    },
    "education": {
        "name": "ideacursi-tool",
        "url": settings.EDUCATION_SERVICE_URL,
        "category": "education",
    },
    "security": {
        "name": "cybertools",
        "url": settings.SECURITY_SERVICE_URL,
        "category": "security",
    },
    # NUEVO
    "testing": {
        "name": "auto-mat-ion",
        "url": settings.TESTING_SERVICE_URL,
        "category": "testing",
    },
}
```

---

## CLI de vital-core (extensiones)

```bash
# Ver estado de auto-mat-ion
vital services --filter testing

# Ver dispositivos conectados
vital testing devices

# Ver proyectos activos
vital testing projects

# Ver contribuciones recientes
vital testing contributions --limit 20

# Crear proyecto de testing
vital testing create-project "mi-proyecto" \
  --sensors "temperature,humidity" \
  --min-devices 50 \
  --duration "30d"

# Ver estadísticas de la red
vital testing stats

# Exportar datos de proyecto
vital testing export "proyecto-id" --format csv
```

---

## Dashboard Frontend

### Nuevas Secciones en vital-core Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VITAL-CORE DASHBOARD                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Health  │ │Research │ │Education│ │Security │ │ Testing │ ← NUEVO      │
│  │         │ │         │ │         │ │         │ │         │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TESTING TAB                                                                │
│  ───────────                                                                │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  🌐 RED DE DISPOSITIVOS                                               │ │
│  │                                                                       │ │
│  │  Dispositivos activos: 1,247                                          │ │
│  │  Estaciones Semilla: 834                                              │ │
│  │  Móviles colaboradores: 413                                           │ │
│  │                                                                       │ │
│  │  [Mapa de calor con ubicaciones aproximadas]                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐          │
│  │  📊 PROYECTOS ACTIVOS       │ │  🏆 TOP CONTRIBUIDORES      │          │
│  │                             │ │                             │          │
│  │  • Respirar Limpio BCN      │ │  1. pequeño-cientifico-42   │          │
│  │    Progress: ████████░░ 80% │ │     12,450 puntos           │          │
│  │                             │ │                             │          │
│  │  • Huertos Conectados CAT   │ │  2. eco-warrior-madrid      │          │
│  │    Progress: █████░░░░░ 50% │ │     11,230 puntos           │          │
│  │                             │ │                             │          │
│  │  • Test App Mates v2.1      │ │  3. sensor-kid-sevilla      │          │
│  │    Progress: ██████████ 100%│ │     10,890 puntos           │          │
│  └─────────────────────────────┘ └─────────────────────────────┘          │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  📈 MÉTRICAS DE LA RED (últimas 24h)                                  │ │
│  │                                                                       │ │
│  │  Tests ejecutados: 45,230    Datos validados: 44,891 (99.2%)          │ │
│  │  Anomalías detectadas: 23    Puntos distribuidos: 125,400             │ │
│  │                                                                       │ │
│  │  [Gráfico de línea temporal]                                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sinergias Específicas con Cada Servicio

### 🏥 biohack-app + auto-mat-ion

```
SINERGIA: Validación de biomarcadores a escala

biohack-app (individual):
  - Usuario mide su HRV con Apple Watch
  - Dato único, contexto personal

auto-mat-ion (poblacional):
  - 1000 usuarios comparten datos anónimos de HRV
  - Mismo momento, diferentes ubicaciones
  - Correlación con factores ambientales (Estaciones Semilla)

RESULTADO:
  - biohack-app muestra: "Tu HRV está 15% más bajo que usuarios
    en zonas con similar contaminación"
  - Insight personalizado basado en datos poblacionales validados
```

### 📚 canela-molida + auto-mat-ion

```
SINERGIA: De papers a evidencia experimental

canela-molida:
  - Paper: "El ruido urbano afecta la concentración"
  - RAG: Extrae metodología del estudio original

auto-mat-ion:
  - Replica el estudio con sensores de ruido
  - Correlaciona con datos de ideacursi-tool (rendimiento en quizzes)
  - Valida o refuta hallazgos del paper original

RESULTADO:
  - canela-molida enriquece el paper con:
    "Replicación ciudadana (n=500): Confirmado con p<0.01"
```

### 🎓 ideacursi-tool + auto-mat-ion

```
SINERGIA: Cursos que se validan solos

ideacursi-tool:
  - Genera curso: "Programación de sensores IoT"
  - Ejercicio final: "Programa tu Estación Semilla para medir temperatura"

auto-mat-ion:
  - Recibe el código del estudiante
  - Lo despliega en Estación Semilla real
  - Valida que funciona correctamente
  - Compara con implementaciones de otros estudiantes

RESULTADO:
  - Estudiante obtiene feedback real, no simulado
  - Datos del ejercicio contribuyen a proyecto científico real
  - Puntos científicos + badge de curso completado
```

### 🤖 codking + auto-mat-ion

```
SINERGIA: Entrenamiento con datos del mundo real

codking (modelo):
  - Health Core necesita datos diversos para mejorar
  - Education Core necesita validar efectividad de cursos
  - Security Core necesita detectar patrones anómalos

auto-mat-ion (datos):
  - Proporciona dataset diverso de dispositivos reales
  - Feedback loop: modelo predice → dispositivos validan → modelo mejora

RESULTADO:
  - CodKing mejora continuamente con datos reales
  - No depende solo de datasets estáticos
  - Detección de anomalías basada en comportamiento real de red
```

---

## Proyectos Futuros y Extensiones

### Próximos Servicios del Ecosistema

| Proyecto | Descripción | Integración con auto-mat-ion |
|----------|-------------|------------------------------|
| **black-gandalf** | IA conversacional avanzada | Asistente para configurar proyectos de testing |
| **sauron** | Monitoreo y observabilidad | Dashboards en tiempo real de la red |
| **finwe** | Gestión financiera | Tracking de costes de hardware distribuido |
| **handtruelight** | Verificación de autenticidad | Validación de identidad EUDI |
| **imperio-lab** | Automatización de tareas | Orquestación de despliegues de tests |
| **cam-snap-lab** | Procesamiento de imágenes | Validación visual de instalaciones de sensores |

### Roadmap de Integración

```
2026 Q1-Q2 (ACTUAL)
├── ✅ Definir arquitectura de integración
├── ⬜ Implementar API de auto-mat-ion
├── ⬜ Conectar con Event Store de vital-core
└── ⬜ Primera versión de Estación Semilla

2026 Q3-Q4
├── ⬜ Dashboard de testing en vital-core frontend
├── ⬜ Integración bidireccional con biohack-app
├── ⬜ Pipeline research-to-test con canela-molida
└── ⬜ Sandbox EUDI Junior

2027+
├── ⬜ Federación con otras redes de testing
├── ⬜ codking training con datos de auto-mat-ion
├── ⬜ Expansión europea (traducción, compliance)
└── ⬜ auto-mat-ion como servicio público de testing
```

---

## Conclusión

**auto-mat-ion** no es un servicio aislado. Es la pieza que conecta el conocimiento teórico (canela-molida) con la aplicación práctica (biohack-app, ideacursi-tool), validando hipótesis con datos reales de una red distribuida de dispositivos.

Dentro del ecosistema **UTOP.IA**, auto-mat-ion cumple el rol de:

1. **Validador**: Confirma que lo que funciona en teoría funciona en la práctica
2. **Recolector**: Proporciona datos diversos de dispositivos y contextos reales
3. **Democratizador**: Permite que cualquiera contribuya a la ciencia desde su dispositivo
4. **Educador**: Convierte la participación en una experiencia de aprendizaje gamificada

---

*Este documento define la integración de auto-mat-ion con vital-core y el ecosistema UTOP.IA.*

*Versión: 1.0*
*Fecha: Enero 2026*
*Autor: Asistido por Claude (Anthropic)*
