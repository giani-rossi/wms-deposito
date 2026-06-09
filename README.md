# WMS Depósito (MVP)

Sistema de gestión de depósito (Warehouse Management System) para una operación
logística chica. Construido con un stack simple y confiable, **sin Prisma, sin
backend separado y sin microservicios**: Next.js habla directo con Supabase
usando Server Actions / Route Handlers para la lógica de negocio.

## Stack

- **Next.js (App Router)** + **TypeScript**
- **TailwindCSS** + **shadcn/ui**
- **Supabase**: Postgres + Auth + Storage
- **OpenAI API** para OCR / extracción de documentos
- **Vercel** para deploy

## Regla central del negocio

> Nada entra, se mueve, cambia de posición o sale del depósito sin crear un
> **registro de movimiento** (`movements`).

- Cada **posición** tiene su historia completa.
- Cada **unidad logística** tiene su historia completa.
- El **OCR/IA nunca actualiza stock** automáticamente: siempre requiere
  confirmación humana.

## Flujo operativo

```
Orden de ingreso → unidades recibidas → clasificación/desconsolidación →
unidades logísticas → asignación de ubicación → movimientos →
orden de retiro → facturación
```

---

## Estructura del proyecto

```
wms-deposito/
├── src/
│   ├── app/                 # Rutas (App Router). UI en español.
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── constants.ts     # Etiquetas en español + lógica de color de estados
│       ├── utils.ts         # cn() (clsx + tailwind-merge)
│       ├── supabase/
│       │   ├── client.ts    # Cliente browser (anon)
│       │   ├── server.ts    # Cliente server (cookies, RLS)
│       │   └── admin.ts     # Cliente service-role (solo server)
│       └── types/
│           └── database.ts  # Tipos TS de todas las entidades + enums
├── supabase/
│   ├── config.toml          # Config del CLI de Supabase
│   ├── migrations/
│   │   ├── 0001_enums_and_tables.sql
│   │   ├── 0002_views_and_sequences.sql
│   │   ├── 0003_rls_policies.sql
│   │   └── 0004_storage.sql
│   └── seed.sql             # Datos de ejemplo (3 clientes, racks, flujo demo)
├── components.json          # Config de shadcn/ui
├── tailwind.config.ts
├── package.json
└── .env.example
```

---

## Setup de Supabase

Tenés dos caminos. **Local con CLI** (recomendado para desarrollar) o
**Supabase Cloud**.

### Opción A — Supabase local (CLI)

Requiere Docker corriendo.

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar Supabase local (Postgres, Auth, Storage, Studio)
npx supabase start

# 3. Aplicar migraciones + seed (resetea la base local)
npx supabase db reset
```

`supabase start` imprime las URLs y keys locales. Copialas a `.env.local`:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key que imprime supabase start>
SUPABASE_SERVICE_ROLE_KEY=<service_role key que imprime supabase start>
OPENAI_API_KEY=<tu key de OpenAI>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- Supabase Studio local: http://localhost:54323
- Mailbox de prueba (Inbucket): http://localhost:54324

### Opción B — Supabase Cloud

1. Crear un proyecto en https://supabase.com.
2. En **Project Settings → API** copiar:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
3. Linkear y pushear el esquema:

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push          # aplica las migraciones
```

4. Cargar el seed (opcional, datos de ejemplo). Pegá el contenido de
   `supabase/seed.sql` en el **SQL Editor** del dashboard y ejecutalo, o:

```bash
psql "<connection string del proyecto>" -f supabase/seed.sql
```

### Storage

La migración `0004_storage.sql` crea el bucket privado `wms-files` y sus
políticas. Si usás Cloud y el bucket no se crea por permisos de la migración,
podés crearlo manualmente en **Storage → New bucket** con nombre `wms-files`
(privado).

### Usuarios y roles

- Los roles viven en la tabla `profiles` (`admin`, `supervisor`, `operator`).
- Al registrarse un usuario en Auth, un trigger crea su `profile` con rol
  `operator` por defecto.
- Para crear el primer **admin**, registrate en la app y luego en Studio /
  SQL Editor:

```sql
update profiles set role = 'admin' where email = 'tu-email@ejemplo.com';
```

---

## Correr la app

```bash
npm run dev      # http://localhost:3000
npm run build    # build de producción
npm run typecheck
```

---

## Deploy en Vercel

1. Importar el repo en Vercel.
2. Cargar las variables de entorno (las 5 del `.env.example`).
3. Deploy. El esquema se gestiona aparte con `supabase db push` contra tu
   proyecto Cloud.

---

## Modelo de datos (14 tablas)

`profiles`, `clients`, `positions`, `products`, `inbound_orders`,
`received_units`, `logistic_units`, `logistic_unit_contents`,
`outbound_orders`, `outbound_order_items`, `picking_assignments`,
`movements`, `billable_services`, `uploaded_files`.

**Vistas:** `stock_by_position`, `stock_summary_by_product`,
`position_occupancy`. El stock se **deriva** de `logistic_unit_contents` +
`logistic_units` (no hay tabla de stock separada).

---

## Estado del MVP

- [x] **Fundación**: estructura, esquema SQL, setup Supabase, seed data
- [x] **Conexión Supabase + Auth + layout principal** (login/registro, roles, middleware de sesión, sidebar responsive en español, dashboard con métricas)
- [x] **Clientes (CRUD + ficha)** (listado con búsqueda, alta/edición, baja solo sin datos asociados, ficha con tabs: Resumen, Posiciones, Stock, Ingresos, Retiros, Movimientos, Servicios, Incidencias)
- [ ] Posiciones (CRUD) + Mapa de depósito
- [ ] Productos (CRUD)
- [ ] Storage (subida de archivos) + OCR con OpenAI
- [ ] Órdenes de ingreso (con extracción IA + confirmación humana)
- [ ] Unidades recibidas + Clasificación/desconsolidación
- [ ] Unidades logísticas + capa de servicios de movimientos
- [ ] Órdenes de retiro + picking FIFO + carga de camión
- [ ] Servicios facturables + Cierre del día + exports CSV

> Se construye **módulo por módulo**. Esta entrega cubre la fundación.
