# WMS Depósito — Estado del sistema

> Documento de referencia funcional y técnica del estado actual del proyecto.
> Última actualización: 2026-06-07.

---

## 1. Estado general del proyecto

- **Stack**
  - **Frontend/Backend**: Next.js 14 (App Router) + React 18 + TypeScript.
  - **UI**: TailwindCSS + componentes propios estilo shadcn/ui (`src/components/ui`).
  - **Validación**: Zod (`src/lib/validation`).
  - **Backend de datos**: Supabase (Postgres + Auth + Storage).
  - **Clientes Supabase**: `@supabase/ssr` 0.10.x + `@supabase/supabase-js` 2.10x.
  - **OCR**: OpenAI API (Vision).
  - **Deploy objetivo**: Vercel.
- **Supabase conectado**: sí. Esquema completo en `supabase/full_setup.sql` (migraciones 0001–0004 combinadas) + migraciones incrementales `0005`, `0006`, `0007`.
  - Tres clientes: `client.ts` (browser), `server.ts` (server components/actions), `admin.ts` (service role).
- **Auth/roles** (`src/lib/auth.ts`):
  - Roles: `admin`, `supervisor`, `operator`.
  - Helpers: `getCurrentProfile`, `requireProfile`, `requireRole`, `isStaff` (staff = admin o supervisor).
  - Middleware protege las rutas privadas; login redirige.
- **Storage**: bucket `wms-files`. Subida de documentos por orden; acceso con **signed URLs** (10 min). Tabla `uploaded_files` con metadatos.
- **OCR/OpenAI** (`src/lib/ocr/openai.ts`):
  - Modelo configurable por `OPENAI_OCR_MODEL` (default `gpt-4o-mini`).
  - Variable `OPENAI_API_KEY`. Si falta, error claro y controlado.
  - **El OCR nunca crea stock**: solo extrae datos para revisión/confirmación humana.
- **typecheck / build**: ambos en **verde** (`npm run typecheck`, `npm run build`).
  - Nota: hay un workaround para Node < 20 al subir archivos (duck-typing en lugar de `instanceof File`).

---

## 2. Módulos implementados

> "Funcional" = operativo de punta a punta. "Placeholder" = ruta existe pero es pantalla vacía/por construir.

| Módulo | Estado | Qué se puede hacer |
|---|---|---|
| **Login / Auth** | Funcional | Iniciar sesión, sesión persistente, protección de rutas, roles. |
| **Dashboard** | Funcional (básico) | Vista de entrada con tarjetas/resumen. |
| **Clientes** | Funcional | CRUD completo, ficha detallada, activar/inactivar, ver posiciones asignadas. |
| **Posiciones** | Funcional | CRUD, alta individual con nomenclatura controlada, generación masiva, limpieza de zonas inválidas. |
| **Mapa de depósito** | Funcional | Matriz A–K × IZQ/DER × niveles, colores por estado, crear posición rápida o con detalle, zonas operativas. |
| **Órdenes de ingreso** | Funcional | CRUD, ficha con tabs, flujo guiado completo. |
| **Documentos / OCR** | Funcional (con salvedad) | Subir remito, ejecutar OCR, revisar y confirmar datos. (Ver pendientes de OCR.) |
| **Descarga física** | Funcional | Registrar/editar resumen de descarga, generar servicios y unidades. |
| **Unidades recibidas** | Funcional (dentro de la orden) | Crear manual, generar desde descarga, editar procesamiento, eliminar. |
| **Comparativo descarga vs unidades** | Funcional | Declarado vs cargado por tipo, con estados y botón de generar faltantes. |
| **Gestión de estados / próximo paso** | Funcional | Card "Próximo paso" + acciones guiadas por estado + modo avanzado manual. |
| **Ubicación** | Funcional | Dos grupos (requieren clasificación / listas para ubicar), modal de ubicación con split. |
| **Servicios facturables** | Funcional como generación; lista global placeholder | Se generan automáticamente; la pantalla global de listado es placeholder, pero se ven por orden. |
| **Movimientos** | Funcional como generación; lista global placeholder | Se generan automáticamente; se ven por orden, la pantalla global es placeholder. |
| **Clasificación** | Placeholder | Ruta existe; aún no transforma unidades ni baja flags. |
| **Unidades logísticas (global)** | Placeholder | Se crean al ubicar; lista global por construir. |
| **Productos** | Placeholder | Por construir. |
| **Órdenes de retiro (outbound)** | Placeholder | Modelo de datos existe; UI/flujo por construir. |
| **Cierre del día** | Funcional (snapshot) | Genera `daily_position_occupancy` por fecha; resumen por cliente. Facturación mensual pendiente. |

---

## 3. Modelo operativo actual (flujo completo)

### Setup (preparación)
1. **Crear cliente** (Clientes → Nuevo).
2. **Crear o generar posiciones** (Posiciones → Nueva / Generar). Racks con nomenclatura controlada; zonas operativas de piso con código controlado.
3. **Asignar posiciones al cliente**: directamente o automáticamente al ubicar mercadería (posición libre → se asigna al confirmar).

### Ingreso (flujo principal)
1. **Crear orden de ingreso** (cliente, fecha/hora, transporte, chofer, patente, remito, notas). → estado `pending_download`. Movimiento `inbound_created`.
2. **Subir remito/documento** (tab Documentos / OCR) al bucket `wms-files`.
3. **OCR + confirmación humana**: ejecutar OCR (imágenes) → datos extraídos → el humano revisa y confirma. La confirmación **no crea stock**, solo guarda datos.
4. **Registrar descarga** (modal desde "Próximo paso" o Gestión): counts por tipo + flags de facturación + notas.
5. **Generar resumen físico de descarga** (`inbound_order_discharge`, snapshot 1:1).
6. **Generar servicios facturables**: `truck_download` (camión + por tipo) y `desconsolidation` si corresponde (idempotente).
7. **Generar unidades recibidas** automáticamente desde la descarga (una fila por unidad física para pallet/caja/bulto; sueltos agregados; completando solo el faltante).
8. **Comparar declarado vs cargado** (tab Unidades recibidas): tabla por tipo con estado OK / Faltan / Sobran.
9. **Decidir clasificación vs ubicación**: depende **solo de los flags de procesamiento** de cada unidad.
10. **Editar procesamiento por unidad** (botón "Editar procesamiento"): marcar/desmarcar flags + notas.
11. **Ubicar mercadería** (tab Ubicación): las unidades sin flags se asignan a posiciones físicas; se generan unidad logística + movimiento + servicio.

> **Importante**: el flujo de **retiro** todavía no es un egreso real (placeholder).

---

## 4. Definiciones principales (entidades)

- **Cliente**: empresa dueña de la mercadería. Tiene posiciones asignadas y se le facturan servicios.
- **Posición**: ubicación física del depósito. Dos familias: posición de rack y zona operativa de piso.
- **Posición física de rack**: hueco direccionable con código `{columna}-{lado}-{nivel}` (ej. `A-IZQ-1`). Puede asignarse a un cliente.
- **Zona operativa de piso**: área funcional con código controlado `FLOOR-<FUNCION>-NN` (ej. `FLOOR-INBOUND-01`). Sirve como destino lógico de etapas (ingreso, retiro, revisión, etc.).
- **Orden de ingreso (`inbound_orders`)**: la recepción de un camión/remito de un cliente. Tiene estado, documentos, descarga, unidades, movimientos y servicios.
- **Resumen de descarga (`inbound_order_discharge`)**: snapshot 1:1 de **cuánto se bajó del camión** por tipo. Base de facturación de la descarga. **No es stock ubicado**.
- **Unidad recibida (`received_units`)**: la **verdad de inventario físico** que ingresó (pallet/caja/bulto/suelto). Para pallet/caja/bulto hay **una fila por unidad física** (`physical_quantity = 1`, `display_label` ej. "Pallet 1"). Los sueltos pueden ir agregados. Sobre cada fila se carga contenido, procesamiento y ubicación.
- **Unidad logística (`logistic_units`)**: la unidad **ubicada/trazable** dentro del depósito, creada al ubicar una unidad recibida en una posición.
- **Movimiento (`movements`)**: registro trazable de toda operación física/lógica. Regla central: nada pasa sin movimiento.
- **Servicio facturable (`billable_services`)**: trabajo cobrable (descarga, desconsolidación, ubicación, etc.) con cantidad/unidad/estado.
- **OCR / Documento (`uploaded_files` + datos JSON)**: archivo del remito y datos extraídos por IA, sujetos a confirmación humana.
- **Revisión**: estado/etiqueta unificada para casos de daño, diferencia, faltante, sobrante o pendiente de validar (internamente `incident`/`discrepancy`).

---

## 5. Posiciones y nomenclatura

### Nomenclatura de rack
- Formato: **`{columna}-{lado}-{nivel}`**. Ejemplos: `A-IZQ-1`, `A-DER-PISO`, `K-IZQ-4`.
- **Columnas**: `A`–`K` (11 columnas).
- **Lados**: `IZQ` (izquierda), `DER` (derecha).
- **Niveles**: `PISO`, `1`, `2`, `3`, `4`. Orden visual del mapa (arriba → abajo): `4,3,2,1,PISO`.
- Validación de código de rack: `^[A-K]-(IZQ|DER)-(PISO|[1-4])$`.

### Zonas operativas de piso
- Código controlado: **`FLOOR-<FUNCION>-NN`**. Validación: `^FLOOR-(INBOUND|OUTBOUND|INCIDENT)-\d{2}$`.
- Prefijos en UI: `FLOOR-INBOUND` (ingreso), `FLOOR-OUTBOUND` (retiro), `FLOOR-INCIDENT` (revisión). Numeración MVP: `01`–`10`.
- Zonas estándar esperadas: `FLOOR-INBOUND-01`, `FLOOR-OUTBOUND-01`, `FLOOR-INCIDENT-01` (y otras de etapa: classification, assembly, temp, return).

### Capacidad y ocupación (flexible)
- Una posición puede contener **una o varias** unidades logísticas. **No** hay límite numérico automático ni cálculo de capacidad.
- El **estado de ocupación es manual**: Libre, Parcialmente ocupada, Ocupada, Bloqueada, Revisión. El sistema **no infiere** ocupación por cantidad.
- En la **ficha de posición** se ve: unidades logísticas actuales, cliente(s), estado actual, movimientos relacionados, historial de asignaciones y el control para **cambiar manualmente** el estado de ocupación.

### Mapa de depósito
- Muestra la matriz completa **A–K × IZQ/DER × niveles**.
- Las zonas de piso visibles se filtran por tipos operativos (`floor_inbound`, `floor_outbound`, `floor_incident`) **y** por código válido.
- **Colores por estado manual** de la posición (sin inferir por cantidad): Parcialmente ocupada → amarilla, Ocupada → roja, etc. Si una posición tiene una o más unidades, se ve según su estado manual.
- Permite **crear posición rápida** (un click) o **crear con detalle** (form prellenado).

### Creación y asignación de posiciones
- **Alta individual**: para rack, selectores de columna/lado/nivel con preview del código; para piso, selector numérico de zona (1–10) con preview. El código **no se escribe a mano**.
- **Generación masiva**: rangos de columnas × lados × niveles.
- **Asignación a cliente**: directa (campo `assigned_client_id` + historial en `client_position_assignments`) o automática al ubicar mercadería en una posición libre.

### Deprecado
- **`rack_number`** y la nomenclatura anterior tipo `R1-A-1` quedaron **deprecados**. El modelo vigente es `{columna}-{lado}-{nivel}`.

---

## 6. Estados y labels visibles (enum interno → label)

### Estados de posición (`position_status`)
| Enum | Label |
|---|---|
| `free` | Libre |
| `partially_occupied` | Parcialmente ocupada |
| `occupied` | Ocupada |
| `reserved` | Reservada |
| `blocked` | Bloqueada |
| `incident` | **Revisión** |

### Estados de orden de ingreso (`inbound_order_status`)
| Enum | Label |
|---|---|
| `pending_download` | Pendiente de descarga |
| `downloaded` | Descargada |
| `pending_validation` | Pendiente de revisión documental |
| `pending_classification` | Pendiente de clasificación |
| `partially_classified` | En clasificación |
| `ready_to_locate` | Lista para ubicar |
| `located` | Ubicada |
| `incident` | **Revisión** |
| `closed` | Cerrada |

### Estados de contenido de unidad recibida (`content_status`)
- Visibles en selector: Desconocido, Esperado según documento, Validado, Mixto, Pendiente de apertura, Pendiente de clasificación, **Revisión** (`incident`), Listo para ubicar.
- En el enum también existen `discrepancy`, `pending_assembly`, `pending_repackaging` (no todos se ofrecen en el selector diario).
- `discrepancy` e `incident` se muestran ambos como **"Revisión"**.

### Flags de procesamiento de unidad recibida (booleans)
- `requires_classification` — Requiere clasificación
- `requires_desconsolidation` — Requiere desconsolidación
- `requires_assembly` — Requiere armado
- `requires_repackaging` — Requiere reembalaje

### Estados de servicios facturables (`billable_service_status`)
| Enum | Label |
|---|---|
| `pending_billing` | Pendiente de facturación |
| `billed` | Facturado |
| `non_billable` | No facturable |
| `under_review` | En revisión |

### Unificación de "Revisión"
- En toda la UI, los conceptos internos `incident` y `discrepancy` se muestran como **"Revisión"** (posiciones, órdenes, contenido, movimientos, servicios `incident_review`).

---

## 7. Regla de flujo guiado / próximo paso

El "Próximo paso" se calcula a partir del **estado de la orden** y del **avance real de las unidades** (`computeNextStep`):

| Situación | Próximo paso | Acción |
|---|---|---|
| `closed` | Orden cerrada | — |
| `incident` / Revisión | Resolver revisión | (mensaje, sin botón) |
| `pending_download` o sin descarga | Registrar descarga | Abre modal de descarga |
| Descarga registrada, sin unidades | Generar unidades recibidas | Genera desde descarga |
| Hay unidades con algún flag de procesamiento | Clasificar unidades | Ir a clasificación |
| Unidades sin flags y sin ubicar | Ubicar mercadería | Ir a tab Ubicación |
| Todo ubicado | Cerrar orden | Cambia a `located`/`closed` |

**Regla clave de clasificación** (`receivedUnitRequiresProcessing`):
- Una unidad requiere clasificación/procesamiento **si y solo si** alguno de estos flags es `true`:
  - `requires_classification`, `requires_desconsolidation`, `requires_assembly`, `requires_repackaging`.
- **`content_status = unknown` NO fuerza clasificación.** Una unidad puede estar "Desconocida" a nivel producto y aun así ubicarse si no tiene flags.

Las **acciones guiadas** de la card "Gestión de la orden" se muestran según el estado (registrar/editar descarga, generar unidades, ir a clasificación, ir a ubicación, cerrar/reabrir, marcar/quitar revisión). El cambio de estado manual queda en un panel **avanzado solo para staff**.

---

## 8. Descarga física

- **Tabla**: `inbound_order_discharge` (1:1 con la orden, `inbound_order_id` único).
- **Counts**: `pallets_count`, `boxes_count`, `packages_count`, `loose_items_count`, `total_units_count` (opcional; si vacío se calcula como suma).
- **Flags de descarga**: `requires_desconsolidation`, `requires_classification`, `requires_assembly`. Se **heredan** a cada `received_unit` generada desde el resumen de descarga (incluye `loose_item`). `requires_repackaging` solo aplica en la unidad recibida (no está en el snapshot de descarga).
- **Servicios generados** (`registerDownloadAction`):
  - `truck_download` cantidad 1 unidad "camión".
  - `truck_download` por tipo con count > 0 (unidad: pallet/caja/bulto/unidad suelta).
  - `desconsolidation` si la descarga lo marca.
- **Movimiento**: `download_from_truck` (uno por orden), destino `FLOOR-INBOUND-01`, cantidad = total.
- **Idempotente**: re-registrar/editar la descarga **no duplica**. Hace upsert del snapshot, mantiene un único movimiento `download_from_truck`, y regenera solo los servicios pendientes (`pending_billing`) de los tipos que crea (sin tocar lo ya facturado ni otros tipos).

---

## 9. Unidades recibidas

- **Generación automática desde descarga** (`generateMissingReceivedUnits`):
  - **pallet / box / package**: una `received_unit` **por cada unidad física**, con `physical_quantity = 1` y `display_label` ("Pallet 1", "Caja 2", "Bulto 1", etc.).
  - **loose_item**: una fila agregada con `physical_quantity` = cantidad faltante de sueltos (ej. 50 unidades en una sola fila).
  - **Completa solo el faltante por tipo**: compara declarado vs lo ya cargado (suma de `physical_quantity` por tipo) y crea solo la diferencia. Nunca duplica ni elimina.
  - Posición inicial `FLOOR-INBOUND-01`, `content_status = unknown`.
  - **Los 4 flags de procesamiento nacen en `false`** (desacoplados de la descarga).
  - Cada unidad generada crea su movimiento `received_unit_created`.
  - **Órdenes viejas** con filas agregadas (`physical_quantity > 1`) siguen funcionando; no se migran automáticamente.
- **Edición manual**: formulario "Agregar unidad recibida" (tipo, cantidad, etiqueta opcional, contenido, posición, flags, notas).
- **`display_label`**: etiqueta visible para distinguir unidades (ej. "Pallet 2"). Opcional en altas manuales; se asigna automáticamente desde descarga.
- **`physical_quantity`**: cantidad física de esa fila. En pallet/caja/bulto generados desde descarga es **1** por fila. El comparativo descarga vs cargado suma `physical_quantity` por tipo.
- **Facturación de descarga**: sigue leyendo el resumen `inbound_order_discharge` (ej. `pallets_count = 2` → `truck_download` quantity 2 unit pallet), independiente de cuántas filas `received_units` existan.
- **Edición de flags de procesamiento** (`updateReceivedUnitRequirementsAction`): botón "Editar procesamiento" → modal con 4 checkboxes + notas. Al guardar, la unidad se reubica sola entre "requieren clasificación" y "listas para ubicar".
- **Si la unidad ya fue procesada** (ya generó unidades logísticas): la edición sigue **permitida** pero el modal muestra un **warning** de trazabilidad. No se bloquea (decisión de negocio para correcciones legítimas).

---

## 10. Ubicación

- **Dos grupos** (separados **solo por flags**, nunca por `content_status`):
  - **Requieren clasificación antes de ubicar**: unidades con algún flag en `true`. Acción: "Ir a clasificación".
  - **Listas para ubicar**: unidades con todos los flags en `false`. Acción: "Ubicar mercadería".
- **Capacidad flexible (definición funcional)**:
  - Una posición puede contener **una o varias** unidades logísticas. **No** se limita automáticamente cuántas entran (depende de tipo de mercadería, tamaño, forma, apilabilidad y criterio operativo).
  - La capacidad **no se calcula** automáticamente y **no se bloquea** por capacidad numérica.
  - El **estado de ocupación es manual** (Libre, Parcialmente ocupada, Ocupada, Bloqueada, Revisión). El sistema **no infiere** "Ocupada" solo por cantidad.
  - Si una posición tiene unidades, se muestra según su **estado manual** (en ficha y mapa).
- **Selección de posiciones destino** (modal): se ofrecen **todas** las posiciones reales (rack + zonas operativas), priorizando primero las **asignadas al cliente**, luego **libres**, luego el resto. Al seleccionar una posición, el modal muestra su **situación actual**: código, estado, cliente asignado, unidades logísticas actuales, cantidad total y último ingreso.
- **Validación según situación de la posición destino**:
  - **Vacía** → ubicar normalmente.
  - **Mismo cliente con mercadería** → permitido, con warning informativo: "Esta posición ya tiene mercadería ubicada. Revisá físicamente si hay espacio disponible antes de confirmar.".
  - **Otro cliente** → bloqueado por defecto; **override** solo staff (admin/supervisor) con warning de mezcla de clientes. El override queda registrado en `notes` del movimiento.
  - **Bloqueada / en revisión** → bloqueado por defecto; **override** solo staff con warning. El override queda registrado en `notes` del movimiento.
- **División de cantidad**: se puede repartir una unidad recibida en **varias posiciones**, validando que la suma **no supere la cantidad disponible**.
- **Asignación al cliente**: si se elige una posición libre, se puede marcar "asignar al cliente" y se asigna al confirmar (historial en `client_position_assignments`).
- **Al confirmar** (`locateReceivedUnitAction`), por cada destino:
  - Crea **unidad logística** (`logistic_units`, estado `located`, código `UL-xxxx`).
  - Crea **movimiento** `location_assignment` (from = posición actual o `FLOOR-INBOUND-01`, to = destino, cantidad, cliente, orden, received_unit_id, logistic_unit_id) + nota de override si aplica.
  - Crea **servicio facturable** `location_assignment` (`pending_billing`).
  - Actualiza el **estado de ocupación de la posición** según lo elegido por el usuario (Parcialmente ocupada / Ocupada). Si no se eligió, por defecto pasa de **Libre → Parcialmente ocupada**; en otros estados se respeta el actual (no se infiere por cantidad).
- **Estado de la orden**: `refreshInboundLocationStatus` recalcula: si todo lo ubicable quedó ubicado → `located`; si falta, al menos `ready_to_locate` (sin retroceder).

### Movimientos internos entre racks (MVP)

- **Acción** `moveLogisticUnitAction` (solo staff): mueve una `logistic_unit` en estado `located` de un rack a otro rack.
- **UI**: botón **Mover** en la ficha de posición (`/posiciones/[id]`, tab Unidades logísticas).
- **Destino permitido**: solo `positions.type = rack`. Zonas de piso (ingreso, retiro, revisión) quedan fuera.
- **Validaciones**: misma posición prohibida; destino bloqueado/en revisión u otro cliente requiere override staff; mezcla de clientes exige nota obligatoria.
- **Al confirmar**: `movement` `internal_movement` + actualización de `logistic_units.current_position_id`. **No** se genera `billable_service` en MVP (el enum `internal_movement` existe para facturación futura).
- **Estados de posición**: no se recalculan automáticamente (permanecen manuales).

---

## 11. Servicios facturables (hoy)

Se generan automáticamente en el flujo de ingreso:

| Servicio (`service_type`) | Cuándo | quantity / unit / notes |
|---|---|---|
| `truck_download` | Al registrar descarga | Por tipo si hay counts > 0 (pallet/caja/bulto/suelto). Solo "1 camión" si todos los counts son 0. |
| `desconsolidation` | Si la descarga marca desconsolidación | 1 "servicio". |
| `location_assignment` | Al ubicar cada destino | quantity = cantidad ubicada, unit según tipo (pallet/caja/bulto/unidad). |

El enum soporta más tipos (`storage`, classification, assembly, repackaging, truck_loading, internal_movement, consolidation, partial_picking, rack_down, incident_review, photos_documentation), pero hoy **solo se generan** los tres de arriba. Estado inicial siempre `pending_billing`.

### Estadía (`storage`) — regla confirmada por el cliente (MVP: documentado, sin facturación mensual)

La estadía **no** se cobra por pallet, caja, bulto ni por cantidad de unidades logísticas. Se cobra **por posición usada por cliente por día**.

| Regla | Detalle |
|---|---|
| Unidad de cobro | **1 posición-día** por cliente (posición física de rack con mercadería del cliente ese día). |
| Qué cuenta como usada | La posición tiene **una o más** unidades logísticas (`logistic_units` en estado `located`) del cliente durante ese día. |
| Varias UL, mismo cliente | Sigue siendo **1 posición usada** (no se multiplica por cantidad de pallets/cajas). |
| Ocupación parcial | Igual cuenta como **1 posición usada** (el estado manual puede ser Parcialmente ocupada u Ocupada). |
| Solo asignada, sin mercadería | **No** se cobra: asignar una posición al cliente sin ubicar mercadería no genera estadía. |
| Mezcla de clientes (override) | Idealmente **evitar**. Si ocurre, la posición debe contar para **cada cliente** con mercadería (una fila por cliente en el snapshot) o marcarse para revisión. |
| Zonas operativas de piso | **No** entran en estadía (solo posiciones físicas `type=rack`). |

**Facturación mensual (fuera del MVP):** a fin de mes se suman las posiciones-día del cliente y se factura:

`storage` / **N** / **posición-día**

donde **N** = cantidad de posiciones distintas usadas ese día por ese cliente (cada fila del snapshot diario = 1).

**Cierre del día (próximo paso de implementación):** el módulo **Cierre del día** debe generar un **snapshot diario auditable** en la tabla `daily_position_occupancy`. No es una foto literal del depósito, sino un **corte del sistema** a una fecha para auditar y facturar.

Campos del snapshot:

| Campo | Descripción |
|---|---|
| `date` | Fecha del corte (día calendario). |
| `client_id` | Cliente al que se atribuye la ocupación. |
| `position_id` | Posición física usada. |
| `position_code` | Código denormalizado (exporte/auditoría). |
| `occupied_units_count` | Cantidad de unidades logísticas del cliente en esa posición al momento del corte (informativo; **no** multiplica el cobro). |
| `position_status` | Estado manual de la posición al corte (Libre, Parcialmente ocupada, Ocupada, etc.). |
| `created_at` | Cuándo se generó el registro del cierre. |

Restricción: una fila por `(date, client_id, position_id)`. El cierre debe ser **idempotente** por fecha (re-ejecutar el mismo día reemplaza o hace upsert).

**Algoritmo previsto del cierre (referencia):**

1. Para cada posición `type=rack` con al menos una `logistic_unit` `located` y no `exited`:
2. Agrupar por `(position_id, client_id)` → contar unidades.
3. Insertar/actualizar fila en `daily_position_occupancy` con `occupied_units_count` y `position_status` actual.
4. (Futuro) Opcionalmente generar `billable_services` tipo `storage` con `quantity` = posiciones-día del mes al cerrar período.

Hoy **no** se generan servicios `storage` automáticamente ni facturación mensual.

---

## 12. Movimientos (hoy)

Regla central: **nada pasa sin movimiento**. Cada movimiento guarda: tipo, orden, cliente, usuario, cantidad, posiciones origen/destino, referencias (received_unit_id / logistic_unit_id / billable_service_id), fecha/hora y notas.

| Movimiento (`movement_type`) | Cuándo | Datos clave |
|---|---|---|
| `inbound_created` | Al crear la orden | cliente, usuario, orden. |
| `download_from_truck` | Al registrar descarga | cantidad total, destino `FLOOR-INBOUND-01`. Único por orden. |
| `received_unit_created` | Al crear/generar una unidad recibida | received_unit_id, cantidad, destino. |
| `location_assignment` | Al ubicar | received_unit_id, logistic_unit_id, from/to position, cantidad, servicio asociado. |
| `internal_movement` | Al mover unidad logística entre racks (staff) | logistic_unit_id, from/to position (solo rack), cantidad, notas. **Sin servicio facturable en MVP.** |

El enum incluye muchos más (classification, desconsolidation, assembly, repackaging, consolidation, partial_picking, rack_down, outbound_preparation, outbound_loaded, stock_adjustment, incident) para etapas futuras.

---

## 13. Tablas principales de Supabase

| Tabla | Para qué sirve |
|---|---|
| `profiles` | Perfil del usuario (rol admin/supervisor/operator), ligado a `auth.users`. |
| `clients` | Clientes del depósito (incluye `is_active`). |
| `positions` | Posiciones físicas: racks y zonas de piso (código, tipo, estado, `assigned_client_id`, columna/lado/nivel). |
| `client_position_assignments` | Historial de asignación de posiciones a clientes (con `released_at`). |
| `inbound_orders` | Órdenes de ingreso (estado, transporte, remito, datos OCR extraídos y confirmados). |
| `inbound_order_discharge` | Resumen físico de descarga (snapshot 1:1, counts y flags de facturación). |
| `received_units` | Unidades físicas recibidas (verdad de inventario; flags de procesamiento). |
| `logistic_units` | Unidades logísticas trazables creadas al ubicar. |
| `logistic_unit_contents` | Contenido/detalle de productos de una unidad logística. |
| `movements` | Registro trazable de todas las operaciones. |
| `billable_services` | Servicios cobrables generados por el flujo. |
| `daily_position_occupancy` | Snapshot diario de posiciones usadas por cliente (base para estadía y cierre del día). |
| `received_unit_contents` | Contenido/SKU declarado en unidades recibidas (antes de ubicar). |
| `uploaded_files` | Archivos en Storage (remitos, fotos) con su metadata. |
| `products` | Catálogo de productos (uso futuro). |
| `outbound_orders` | Órdenes de retiro (modelo listo, flujo pendiente). |
| `outbound_order_items` | Ítems de orden de retiro (pendiente). |
| `picking_assignments` | Asignaciones de picking (pendiente). |

Todas con RLS habilitada y políticas por rol.

---

## 14. Reglas de negocio actuales

- **Nada se mueve sin `movement`**: toda operación física/lógica genera un registro trazable.
- **El OCR no impacta stock sin confirmación humana**: extrae datos; el stock se crea aparte (unidades recibidas).
- **Descarga ≠ stock ubicado**: `inbound_order_discharge` es para facturación/resumen; las unidades recibidas son inventario; recién al ubicar hay unidad logística en posición.
- **Piso de retiro todavía no es egreso**: el outbound es placeholder.
- **Revisión bloquea el flujo normal**: una orden en "Revisión" no avanza por el camino guiado hasta resolverse.
- **Las posiciones de rack no aceptan código libre**: se arman con columna/lado/nivel.
- **Las zonas operativas no aceptan código libre**: se generan como `FLOOR-<FUNCION>-NN`.
- **Capacidad de posición flexible**: una posición puede tener varias unidades logísticas; **no** se bloquea por capacidad numérica ni se infiere ocupación por cantidad. El estado de ocupación es **manual**.
- **Nada se ubica sin `movement` `location_assignment`**: cada ubicación genera su movimiento trazable.
- **Ubicar en posición de otro cliente o bloqueada/en revisión requiere override** (solo staff) y queda registrado en `notes` del movimiento.
- **No se borran unidades automáticamente ante diferencias**: si hay sobrante (cargado > declarado), solo se muestra warning; nunca se eliminan.
- **Flags de descarga ≠ flags de unidad**: la descarga no propaga flags a las unidades; el procesamiento se decide por unidad.
- **Edición de procesamiento permitida con warning** si la unidad ya fue procesada (no se bloquea).
- **Generación de unidades idempotente**: completa solo el faltante por tipo.
- **No se borra nada con trazabilidad**: una orden no se puede borrar si tiene unidades recibidas, movimientos reales, unidades logísticas, servicios facturables, documentos o descarga (el movimiento `inbound_created` de nacimiento no cuenta). Una unidad recibida no se puede borrar si ya generó unidades logísticas o tiene movimientos reales (el `received_unit_created` no cuenta). El delete se bloquea con mensaje claro ("…rompería la trazabilidad. Usá anulación/reversión."). La **anulación/reversión** con movimientos de reversa queda **pendiente**. La limpieza de datos de prueba se hace por **SQL manual** (sin UI).

---

## 15. Qué está pendiente (por prioridad)

### Alta
- **Clasificación / desconsolidación / armado / reembalaje**: pantalla real que transforme unidades recibidas en logísticas y **baje los flags** al terminar (hoy es placeholder; los botones enlazan a `/clasificacion`).
- **OCR**: validar end-to-end con remitos reales; hoy solo imágenes (PDF requiere carga manual). Revisar precisión del modelo y manejo de errores/casos sin `OPENAI_API_KEY`.

### Media
- **Outbound / Órdenes de retiro**: flujo completo de egreso (picking, preparación, carga, movimientos `outbound_*`, servicio `truck_loading`).
- **Servicios facturables (pantalla global)** y **Movimientos (pantalla global)**: hoy placeholders; falta listado/filtros transversales.
- **Unidades logísticas (pantalla global)** y **Productos**.
- **Cierre del día**: export CSV y consolidación de servicios/movimientos del día. Snapshot diario ya implementado (`generateDailyPositionOccupancyAction`). Facturación mensual de estadía queda para después del MVP.

### Mejoras de ubicación
- **Rol fino para override**: hoy ubicar es solo staff y el override lo confirma el mismo staff. Cuando los operadores puedan ubicar, restringir el override a admin/supervisor.
- **Cantidad de unidades por posición en tiempo real**: hoy el modal muestra el agregado de unidades logísticas ubicadas; revisar performance si crece el volumen (query warehouse-wide).
- **Sugerencia de estado final**: ofrecer recomendación (parcial/ocupada) según criterio operativo, manteniendo la decisión manual.
- **Liberación automática de posición al vaciarse**: al retirar todas las unidades, sugerir volver a "Libre" (manual).

### Baja / soporte
- **Reportes / facturación**: exportes y totales por cliente/período.
- **Manual de usuario final**.
- **Limpieza de Storage**: política para archivos huérfanos.
- **Mejoras de permisos**: granularidad operator vs staff donde aplique.

---

## 16. Cómo probar el flujo actual (checklist end-to-end)

### A. Caso simple sin clasificación
1. Crear cliente y al menos 1 posición de rack libre (o asignada al cliente).
2. Crear orden de ingreso para ese cliente.
3. (Opcional) Subir remito y correr OCR; confirmar datos.
4. Registrar descarga con counts (ej. 3 pallets, 12 cajas) **sin marcar flags**.
5. Verificar que se generan unidades recibidas con **todos los flags en false**.
6. "Próximo paso" debe decir **Ubicar mercadería**.
7. En tab Ubicación, las unidades aparecen en **Listas para ubicar**.
8. Ubicar y verificar paso a `located` → "Cerrar orden".

### B. Caso con clasificación
1. Igual que A hasta generar unidades.
2. En una unidad: "Editar procesamiento" → marcar (ej.) "Requiere desconsolidación".
3. "Próximo paso" debe pasar a **Clasificar unidades**.
4. Esa unidad aparece en **Requieren clasificación antes de ubicar**; las demás siguen en **Listas para ubicar**.

### C. Ubicación en una posición
1. Unidad lista → "Ubicar mercadería" → elegir 1 posición, cantidad = total → Confirmar.
2. Verificar unidad logística creada, movimiento `location_assignment` y servicio `location_assignment`.

### D. Ubicación dividida en varias posiciones
1. Unidad lista con cantidad ≥ 2 → "Ubicar mercadería".
2. Agregar 2+ destinos repartiendo la cantidad (ej. 1 + 2).
3. Validar que la suma no supere la disponible; confirmar.
4. Verificar 2 unidades logísticas / 2 movimientos / 2 servicios.

### E. Edición de descarga
1. Editar la descarga (cambiar counts/flags).
2. Verificar **idempotencia**: no se duplican servicios ni movimientos; las unidades completan solo faltante.

### F. Diferencia declarado vs cargado
1. Borrar/editar una unidad para que lo cargado quede por debajo de lo declarado.
2. En el comparativo, ver estado **Faltan N** y el botón **Generar faltantes desde descarga**.
3. Cargar de más y ver warning **Sobran / revisar** (sin borrado automático).

### G. Verificación en Supabase
- Revisar `movements`, `billable_services`, `received_units`, `logistic_units` de la orden (ver queries abajo).

---

## 17. Queries útiles de validación

> Reemplazar `:order_id` por el UUID de la orden.

```sql
-- Últimas órdenes de ingreso
select id, remittance_number, status, client_id, date_time
from inbound_orders
order by date_time desc
limit 20;

-- Descarga registrada de una orden
select *
from inbound_order_discharge
where inbound_order_id = ':order_id';

-- Unidades recibidas de una orden (con flags de procesamiento)
select code, type, physical_quantity, content_status,
       requires_classification, requires_desconsolidation,
       requires_assembly, requires_repackaging, current_position_id
from received_units
where inbound_order_id = ':order_id'
order by code;

-- Movimientos de una orden
select date_time, movement_type, quantity,
       from_position_id, to_position_id, received_unit_id, logistic_unit_id, notes
from movements
where inbound_order_id = ':order_id'
order by date_time desc;

-- Servicios facturables de una orden
select date, service_type, quantity, unit, status, notes
from billable_services
where inbound_order_id = ':order_id'
order by date desc;

-- Posiciones usadas por una orden (vía unidades logísticas)
select lu.code as logistic_unit, p.code as position, lu.status
from logistic_units lu
left join positions p on p.id = lu.current_position_id
where lu.inbound_order_id = ':order_id'
order by p.code;

-- Comparativo declarado (descarga) vs cargado (unidades recibidas)
select
  d.pallets_count      as declarado_pallets,
  d.boxes_count        as declarado_cajas,
  d.packages_count     as declarado_bultos,
  d.loose_items_count  as declarado_sueltos,
  coalesce(sum(ru.physical_quantity) filter (where ru.type = 'pallet'), 0)     as cargado_pallets,
  coalesce(sum(ru.physical_quantity) filter (where ru.type = 'box'), 0)        as cargado_cajas,
  coalesce(sum(ru.physical_quantity) filter (where ru.type = 'package'), 0)    as cargado_bultos,
  coalesce(sum(ru.physical_quantity) filter (where ru.type = 'loose_item'), 0) as cargado_sueltos
from inbound_order_discharge d
left join received_units ru on ru.inbound_order_id = d.inbound_order_id
where d.inbound_order_id = ':order_id'
group by d.pallets_count, d.boxes_count, d.packages_count, d.loose_items_count;
```

---

## Apéndice — Archivos clave

- `src/lib/actions/inbound.ts` — acciones del flujo de ingreso (descarga, generación, ubicación, requisitos).
- `src/lib/constants.ts` — labels y reglas (incl. `receivedUnitRequiresProcessing`).
- `src/lib/validation/inbound.ts` — schemas Zod (orden, unidad, descarga, ubicación, OCR).
- `src/app/(app)/ordenes-ingreso/[id]/page.tsx` — ficha de orden y cómputo del flujo.
- `src/app/(app)/ordenes-ingreso/_components/` — `inbound-status-control`, `received-units-section`, `location-section`, etc.
- `supabase/full_setup.sql` + `supabase/migrations/000X_*.sql` — esquema y migraciones.
