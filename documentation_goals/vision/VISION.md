# auto-mat-ion

> Framework opensource para granjas de pruebas distribuidas con dispositivos reales y gamificación científica

---

## Origen

Este proyecto nace de la experiencia exitosa del sistema de automatización de tests de **solar-lab**, donde la conexión con dispositivos reales mediante USB y ADB (Android Debug Bridge) demostró ser una vía extremadamente potente para testing de calidad.

La pregunta que surge: **¿Y si pudiéramos escalar esto a miles de dispositivos reales donados por la comunidad?**

---

## La Visión

### El Problema

- Los desarrolladores necesitan probar en dispositivos reales, no solo emuladores
- Comprar granjas de dispositivos físicos es prohibitivamente caro
- Los usuarios tienen dispositivos infrautilizados que podrían contribuir a la ciencia
- Los proyectos opensource carecen de financiación para testing a escala

### La Solución

**auto-mat-ion** propone un ecosistema donde:

1. **Fundadores** crean proyectos de investigación/testing con 0 financiación inicial
2. **Colaboradores** donan tiempo de sus dispositivos (móviles, tablets, IoT)
3. **Puntos científicos antifraude** recompensan la participación verificada
4. **Datos reales validados** demuestran la viabilidad de cada proyecto

---

## Arquitectura Conceptual

```
┌─────────────────────────────────────────────────────────────────┐
│                    auto-mat-ion Platform                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Fundador   │    │  Fundador   │    │  Fundador   │         │
│  │  Proyecto A │    │  Proyecto B │    │  Proyecto C │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ▼                                    │
│              ┌─────────────────────────┐                        │
│              │   Test Orchestrator     │                        │
│              │   (Librería Node.js)    │                        │
│              └────────────┬────────────┘                        │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         ▼                 ▼                 ▼                   │
│    ┌─────────┐       ┌─────────┐       ┌─────────┐             │
│    │ Device  │       │ Device  │       │ Device  │             │
│    │ Pool 1  │       │ Pool 2  │       │ Pool N  │             │
│    │ (ADB)   │       │ (WiFi)  │       │ (USB)   │             │
│    └─────────┘       └─────────┘       └─────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Gamificación

### Puntos Científicos Antifraude

| Acción | Puntos | Validación |
|--------|--------|------------|
| Ejecutar test básico | 1 | Hash de resultado |
| Completar suite completa | 10 | Firma del dispositivo |
| Dispositivo verificado 24h activo | 50 | Heartbeat continuo |
| Detectar bug real | 100 | Confirmación del fundador |
| Contribuir dispositivo único (modelo raro) | 200 | Verificación de hardware |

### Sistema Antifraude

- Verificación criptográfica de ejecuciones reales
- Fingerprint único por dispositivo físico
- Detección de emuladores y máquinas virtuales
- Consenso distribuido para validar resultados anómalos

---

## Roles del Ecosistema

### Fundador

- Crea un proyecto con requisitos específicos
- Define permisos necesarios (cámara, sensores, red, etc.)
- Empieza con **0 financiación**
- Acumula evidencias y demuestra rentabilidad digital
- Publica resultados y atrae más colaboradores

### Colaborador/Suscriptor

- Dona tiempo de sus dispositivos
- Selecciona proyectos según sus intereses
- Configura permisos granulares por proyecto
- Acumula puntos científicos
- Puede canjear puntos por beneficios en la plataforma

### Verificador

- Valida la integridad de los tests
- Audita proyectos sospechosos
- Mantiene el sistema antifraude
- Recibe puntos bonus por detección de anomalías

---

## Stack Técnico Propuesto

### Core (Librería Node.js)

```javascript
// auto-mat-ion core
export interface DeviceFarm {
  // Conexión con dispositivos
  connectADB(deviceId: string): Promise<Device>
  connectWiFi(ip: string, port: number): Promise<Device>
  connectUSB(path: string): Promise<Device>

  // Gestión de tests
  runTest(test: TestSuite, device: Device): Promise<TestResult>
  validateResult(result: TestResult): ValidationReport

  // Gamificación
  calculatePoints(contribution: Contribution): number
  verifyIntegrity(execution: Execution): boolean
}
```

### Tecnologías Clave

- **Node.js** - Runtime principal
- **ADB** - Comunicación con Android
- **WebSocket** - Conexión en tiempo real
- **libp2p** - Red P2P para distribución
- **IPFS** - Almacenamiento de resultados
- **Blockchain ligera** - Registro inmutable de contribuciones

---

## Fases de Desarrollo

### Fase 1: Extracción (Actual)

- [ ] Separar módulo de testing de solar-lab
- [ ] Crear librería Node.js independiente
- [ ] Documentar API básica
- [ ] Tests unitarios del core

### Fase 2: Expansión

- [ ] Soporte multi-dispositivo simultáneo
- [ ] Panel web de administración
- [ ] Sistema de colas de tests
- [ ] Métricas básicas

### Fase 3: Comunidad

- [ ] Registro de usuarios/dispositivos
- [ ] Sistema de puntos
- [ ] Marketplace de proyectos
- [ ] API pública

### Fase 4: Escala

- [ ] Red P2P de dispositivos
- [ ] Sistema antifraude completo
- [ ] Incentivos tokenizados (opcional)
- [ ] Federación de granjas

---

## Modelo de Sostenibilidad

```
         Gratuito                          Premium
    ┌──────────────────┐            ┌──────────────────┐
    │ - Tests básicos  │            │ - Tests ilimitados│
    │ - 100 ejecuciones│     →      │ - Prioridad alta │
    │ - Cola estándar  │            │ - Soporte dedicado│
    │ - Puntos básicos │            │ - API avanzada   │
    └──────────────────┘            └──────────────────┘
           │                               │
           └───────────┬───────────────────┘
                       ▼
              Proyectos Científicos
              (Acceso gratuito total
               con verificación académica)
```

---

## Filosofía

> "Tu móvil puede ser un recurso de investigación opensource. Cada test que ejecutas contribuye al conocimiento colectivo."

**auto-mat-ion** democratiza el acceso a testing en dispositivos reales, convirtiendo a cada usuario en un colaborador científico recompensado por su contribución genuina.

---

## Próximos Pasos

1. Validar viabilidad técnica de extracción desde solar-lab
2. Definir MVP mínimo de la librería
3. Crear prototipo de conexión ADB remota segura
4. Diseñar sistema de permisos granulares
5. Buscar early adopters para fase de pruebas

---

## Contacto

**Proyecto**: auto-mat-ion
**Estado**: Conceptual / Documento de visión
**Origen**: Sistema de testing de solar-lab

---

*Este documento representa la visión inicial del proyecto. Está abierto a evolución y contribuciones de la comunidad.*
