# auto-mat-ion Documentation Hub

> Distributed Device Testing Framework - Documentation Goals & Resources

## Quick Navigation

| Category | Description | Key Documents |
|----------|-------------|---------------|
| [Vision](./vision/) | Project goals, philosophy, and long-term direction | VISION.md, VISION-EXPANDED.md |
| [Architecture](./architecture/) | Technical design and system blueprints | ARCHITECTURE.md, ECOSYSTEM-INTEGRATION.md |
| [Roadmap](./roadmap/) | Development timeline and milestones | CALENDAR.md |
| [Guides](./guides/) | Implementation guides and tools | TALMM.md |
| [Current State](./current-state/) | Live documentation of implemented features | FUNCTIONAL-MVP.md |

---

## Project Overview

**auto-mat-ion** is a distributed device testing framework extracted from solar-lab, designed to:

1. **Orchestrate tests** across multiple platforms (Android, iOS, macOS, Windows, Linux)
2. **Collect results** automatically from all devices
3. **Support community contribution** through a gamified device-sharing model
4. **Integrate with educational ecosystems** (Seed Stations, EUDI)

## Current Status: MVP Functional ✅

As of January 2026, the core testing loop is **operational**:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ami run    │────▶│  Browsers   │────▶│   Server    │
│  (CLI)      │     │  open with  │     │  receives   │
│             │     │  autorun    │     │  results    │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Working features:**
- `ami devices` - Detect host + Android devices + USB cameras
- `ami run full` - Auto-execute camera tests on all devices
- Results collection via HTTP upload
- Cross-platform support (macOS, Android tested)

---

## Documentation Structure

```
documentation_goals/
├── README.md                 # This file - main index
├── vision/
│   ├── VISION.md             # Core concept: crowdsourced device farm
│   └── VISION-EXPANDED.md    # Extended: Seed Stations, EUDI, education
├── architecture/
│   ├── ARCHITECTURE.md       # Technical blueprint: layers & components
│   └── ECOSYSTEM-INTEGRATION.md  # vital-core & UTOP.IA integration
├── roadmap/
│   ├── CALENDAR.md           # Development timeline
│   └── calendario.md         # Spanish version
├── guides/
│   └── TALMM.md              # Intelligent test generation system
└── current-state/
    └── FUNCTIONAL-MVP.md     # Current implementation status
```

---

## Key Concepts

### The Three Layers

1. **Management Layer** (auto-mat-ion core)
   - Device detection and registration
   - Test orchestration and scheduling
   - Results aggregation

2. **Execution Layer** (extracted from solar-lab)
   - Platform-specific drivers (ADB, XCTest, etc.)
   - Browser automation
   - Sensor access (camera, microphone, GPS)

3. **Community Layer** (future)
   - Gamification and Science Points
   - Device contribution network
   - Verification and anti-fraud

### Platform Support Matrix

| Platform | Detection | Browser Launch | Test Execution | Results Upload |
|----------|-----------|----------------|----------------|----------------|
| macOS    | ✅        | ✅             | ✅             | ✅             |
| Android  | ✅        | ✅             | ✅             | ✅             |
| Windows  | ✅        | ✅             | 🔄 Testing     | 🔄 Testing     |
| Linux    | ✅        | ✅             | 🔄 Testing     | 🔄 Testing     |
| iOS      | ⚠️ Manual  | ⚠️ Manual      | 🔄 Planned     | 🔄 Planned     |

---

## Getting Started

```bash
# Install dependencies
npm install

# Build CLI
npm run build

# Run device detection
ami devices

# Start demo server
npx tsx demo/server/index.ts

# Execute tests on all devices
ami run full

# View results
open http://localhost:8891/results.html
```

---

## Contributing

See [VISION.md](./vision/VISION.md) for the full project philosophy and contribution model.

---

## Related Projects

- **solar-lab**: Original camera testing project (source of execution layer)
- **vital-core**: Gateway integration for UTOP.IA ecosystem
- **Seed Stations**: Educational IoT hardware kits
