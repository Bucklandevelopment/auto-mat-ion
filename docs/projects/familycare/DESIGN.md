# FamilyCare: Diseño Técnico

> App de cuidado familiar para demostrar auto-mat-ion en múltiples dispositivos

---

## 🎯 Propósito

FamilyCare es una PWA diseñada específicamente para:

1. **Demostrar auto-mat-ion** - Caso de uso perfecto para testing multi-dispositivo
2. **Ser útil para tu familia** - No es solo una demo, es una app funcional
3. **Servir como ejemplo** - Código abierto para que otros aprendan

---

## 📱 Pantallas

### 1. Auth Flow

```
┌─────────────────────────────────────┐
│         🏠 FamilyCare               │
│                                     │
│  ┌─────────────────────────────┐   │
│  │      Bienvenido             │   │
│  │                             │   │
│  │  [  Crear Familia  ]        │   │
│  │                             │   │
│  │  [  Unirme a Familia  ]     │   │
│  │                             │   │
│  │  ─────────────────────      │   │
│  │                             │   │
│  │  ¿Ya tienes cuenta?         │   │
│  │  [  Iniciar Sesión  ]       │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

```
┌─────────────────────────────────────┐
│  ← Crear Familia                    │
│                                     │
│  Tu nombre                          │
│  ┌─────────────────────────────┐   │
│  │ Papá                         │   │
│  └─────────────────────────────┘   │
│                                     │
│  Email                              │
│  ┌─────────────────────────────┐   │
│  │ papa@familia.local           │   │
│  └─────────────────────────────┘   │
│                                     │
│  Contraseña                         │
│  ┌─────────────────────────────┐   │
│  │ ••••••••                     │   │
│  └─────────────────────────────┘   │
│                                     │
│  Nombre de tu familia               │
│  ┌─────────────────────────────┐   │
│  │ Los García                   │   │
│  └─────────────────────────────┘   │
│                                     │
│  [      Crear Familia      ]        │
│                                     │
└─────────────────────────────────────┘
```

### 2. Dashboard Principal

```
┌─────────────────────────────────────┐
│  🏠 Los García          👤 Papá    │
├─────────────────────────────────────┤
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 👨‍👩‍👧‍👦 Tu Familia (5)              │ │
│  │                               │ │
│  │  👤 Papá    ✓ Online          │ │
│  │  👤 Mamá    ✓ Online          │ │
│  │  👤 Hijo    ✓ Online          │ │
│  │  👤 Hija    ○ Offline         │ │
│  │  👤 Abuela  ✓ Online          │ │
│  │                               │ │
│  │  [ + Invitar ]                │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────┐ ┌───────┐ ┌───────┐    │
│  │  📋   │ │  🛒   │ │  💧   │    │
│  │Tareas │ │Compras│ │ Salud │    │
│  │  (3)  │ │  (7)  │ │       │    │
│  └───────┘ └───────┘ └───────┘    │
│                                     │
│  ┌───────┐ ┌───────┐               │
│  │  📅   │ │  ⚙️   │               │
│  │Calend.│ │Config │               │
│  └───────┘ └───────┘               │
│                                     │
└─────────────────────────────────────┘
```

### 3. Tareas

```
┌─────────────────────────────────────┐
│  ← Tareas                    [ + ] │
├─────────────────────────────────────┤
│                                     │
│  Hoy (3)                            │
│  ┌───────────────────────────────┐ │
│  │ ☐ Comprar leche               │ │
│  │   👤 Hijo  •  🕐 Antes de 18h │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ ☑ Sacar al perro              │ │
│  │   👤 Papá  •  ✓ Completada    │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │ ☐ Hacer deberes               │ │
│  │   👤 Hija  •  🕐 Antes de 20h │ │
│  └───────────────────────────────┘ │
│                                     │
│  Esta semana (5)                    │
│  ┌───────────────────────────────┐ │
│  │ ☐ Limpiar habitación          │ │
│  │   👤 Todos  •  📅 Sábado      │ │
│  └───────────────────────────────┘ │
│  ...                                │
│                                     │
└─────────────────────────────────────┘
```

### 4. Lista de Compras

```
┌─────────────────────────────────────┐
│  ← Lista de Compras          [ + ] │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🔍 Buscar o añadir...        │   │
│  └─────────────────────────────┘   │
│                                     │
│  Pendiente (7)                      │
│  ┌───────────────────────────────┐ │
│  │ ☐ 🥛 Leche (2L)               │ │
│  │ ☐ 🍞 Pan                      │ │
│  │ ☐ 🍎 Manzanas                 │ │
│  │ ☐ 🧀 Queso                    │ │
│  │ ☐ 🥚 Huevos (docena)          │ │
│  │ ☐ 🧻 Papel higiénico          │ │
│  │ ☐ 🧴 Jabón                    │ │
│  └───────────────────────────────┘ │
│                                     │
│  Comprado hoy (3)                   │
│  ┌───────────────────────────────┐ │
│  │ ☑ 🍌 Plátanos      👤 Mamá   │ │
│  │ ☑ 🍊 Naranjas      👤 Mamá   │ │
│  │ ☑ 🥖 Baguette      👤 Mamá   │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 5. Código de Invitación

```
┌─────────────────────────────────────┐
│  ← Invitar a la Familia             │
├─────────────────────────────────────┤
│                                     │
│  Comparte este código con tu        │
│  familiar para que se una:          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │     🔑  GARCIA-2024-XK7       │ │
│  │                               │ │
│  │        [ 📋 Copiar ]          │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  O escanea este QR:                 │
│                                     │
│  ┌───────────────────────────────┐ │
│  │                               │ │
│  │        ▄▄▄▄▄▄▄▄▄▄▄           │ │
│  │        █ ▄▄▄▄▄ █ ▄           │ │
│  │        █ █   █ █ █           │ │
│  │        █ █▄▄▄█ █ █           │ │
│  │        █▄▄▄▄▄▄▄█▄█           │ │
│  │                               │ │
│  └───────────────────────────────┘ │
│                                     │
│  El código expira en 24 horas       │
│                                     │
└─────────────────────────────────────┘
```

---

## 🗄️ Modelo de Datos

### Schema (Drizzle ORM + SQLite)

```typescript
// server/db/schema.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Familias
export const families = sqliteTable('families', {
  id: text('id').primaryKey(), // UUID
  name: text('name').notNull(),
  inviteCode: text('invite_code').unique(),
  inviteExpiresAt: integer('invite_expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Usuarios
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  familyId: text('family_id').references(() => families.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  avatarEmoji: text('avatar_emoji').default('👤'),
  role: text('role', { enum: ['admin', 'member'] }).default('member'),
  isOnline: integer('is_online', { mode: 'boolean' }).default(false),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Tareas
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  familyId: text('family_id').references(() => families.id),
  title: text('title').notNull(),
  description: text('description'),
  assigneeId: text('assignee_id').references(() => users.id),
  createdById: text('created_by_id').references(() => users.id),
  dueDate: integer('due_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  completedById: text('completed_by_id').references(() => users.id),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).default('medium'),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Lista de compras
export const shoppingItems = sqliteTable('shopping_items', {
  id: text('id').primaryKey(),
  familyId: text('family_id').references(() => families.id),
  name: text('name').notNull(),
  emoji: text('emoji').default('📦'),
  quantity: text('quantity'),
  addedById: text('added_by_id').references(() => users.id),
  checkedAt: integer('checked_at', { mode: 'timestamp' }),
  checkedById: text('checked_by_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Notificaciones
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  type: text('type', { enum: ['task_assigned', 'task_completed', 'item_added', 'member_joined'] }),
  title: text('title').notNull(),
  body: text('body'),
  data: text('data', { mode: 'json' }),
  readAt: integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});

// Sesiones (para auth)
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).defaultNow(),
});
```

---

## 🔌 API Endpoints

### Auth

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Crear familia + usuario admin |
| POST | `/api/auth/join` | Unirse a familia con código |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Usuario actual |

### Family

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/family` | Info de la familia |
| GET | `/api/family/members` | Lista de miembros |
| POST | `/api/family/invite` | Generar código de invitación |
| DELETE | `/api/family/members/:id` | Eliminar miembro (solo admin) |

### Tasks

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tasks` | Lista de tareas |
| POST | `/api/tasks` | Crear tarea |
| PATCH | `/api/tasks/:id` | Actualizar tarea |
| POST | `/api/tasks/:id/complete` | Marcar como completada |
| DELETE | `/api/tasks/:id` | Eliminar tarea |

### Shopping

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/shopping` | Lista de compras |
| POST | `/api/shopping` | Añadir item |
| PATCH | `/api/shopping/:id/check` | Marcar como comprado |
| DELETE | `/api/shopping/:id` | Eliminar item |

### Notifications

| Method | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/notifications` | Lista de notificaciones |
| POST | `/api/notifications/:id/read` | Marcar como leída |

---

## 🔄 WebSocket Events

### Server → Client

```typescript
// Eventos que el servidor envía a los clientes

interface WSEvents {
  // Un miembro se conecta/desconecta
  'member:online': { userId: string; isOnline: boolean };

  // Nueva tarea creada
  'task:created': { task: Task };

  // Tarea completada
  'task:completed': { taskId: string; completedBy: string };

  // Item añadido a lista de compras
  'shopping:added': { item: ShoppingItem };

  // Item marcado como comprado
  'shopping:checked': { itemId: string; checkedBy: string };

  // Nuevo miembro se unió
  'family:member_joined': { member: User };

  // Notificación push
  'notification': { notification: Notification };
}
```

### Client → Server

```typescript
// Eventos que el cliente envía

interface ClientEvents {
  // Heartbeat (mantener online)
  'ping': {};

  // Suscribirse a familia
  'subscribe': { familyId: string; token: string };
}
```

---

## 🧪 Test Selectors (Para auto-mat-ion)

Todos los elementos interactivos tienen `data-testid`:

```html
<!-- Auth -->
<input data-testid="auth-name" />
<input data-testid="auth-email" />
<input data-testid="auth-password" />
<input data-testid="auth-family-name" />
<button data-testid="auth-submit" />
<button data-testid="auth-join" />
<input data-testid="auth-invite-code" />

<!-- Dashboard -->
<div data-testid="member-card-{userId}" />
<span data-testid="member-count" />
<span data-testid="member-status-{userId}" />
<button data-testid="invite-button" />

<!-- Tasks -->
<button data-testid="new-task" />
<input data-testid="task-title" />
<select data-testid="task-assignee" />
<button data-testid="task-save" />
<div data-testid="task-card-{taskId}" />
<button data-testid="task-complete-{taskId}" />

<!-- Shopping -->
<button data-testid="new-item" />
<input data-testid="item-name" />
<button data-testid="item-save" />
<div data-testid="item-card-{itemId}" />
<button data-testid="item-check-{itemId}" />

<!-- Notifications -->
<div data-testid="notification-toast" />
<span data-testid="notification-text" />
```

---

## 📱 PWA Configuration

### manifest.json

```json
{
  "name": "FamilyCare",
  "short_name": "FamilyCare",
  "description": "Cuida de tu familia, juntos",
  "theme_color": "#4F46E5",
  "background_color": "#ffffff",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 🚀 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo (frontend + backend)
npm run dev

# Solo frontend
npm run dev:client

# Solo backend
npm run dev:server

# Build producción
npm run build

# Ejecutar tests unitarios
npm run test

# Ejecutar tests con auto-mat-ion
npm run test:e2e

# Limpiar base de datos
npm run db:reset
```

---

## 📋 Checklist de Implementación

### Fase 1: Core (Semana 1)

- [ ] Setup proyecto (Vite + React + Tailwind)
- [ ] Setup servidor (Fastify + Drizzle)
- [ ] Auth: Register
- [ ] Auth: Login/Logout
- [ ] Auth: Join family
- [ ] Dashboard: Vista familia
- [ ] Dashboard: Lista miembros

### Fase 2: Features (Semana 1)

- [ ] Tasks: CRUD
- [ ] Tasks: Asignar
- [ ] Tasks: Completar
- [ ] Shopping: CRUD
- [ ] Shopping: Marcar comprado
- [ ] WebSocket: Conexión
- [ ] WebSocket: Eventos real-time

### Fase 3: Polish (Semana 2)

- [ ] PWA: Manifest
- [ ] PWA: Service Worker
- [ ] Notificaciones: Toast
- [ ] Responsive: Mobile-first
- [ ] Data-testid: Todos los elementos
- [ ] Error handling
- [ ] Loading states

### Fase 4: Testing (Semana 2)

- [ ] Test suite para auto-mat-ion
- [ ] Ejecutar en multi-dispositivo
- [ ] Grabar video demo
- [ ] Documentar proceso

---

*FamilyCare v1.0 - Diseño Técnico*
*Parte del ecosistema auto-mat-ion*
