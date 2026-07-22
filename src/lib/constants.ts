/**
 * Etiquetas en español y mapeos de UI para los enums del WMS.
 * Centralizado para no duplicar textos por toda la app.
 */

import type {
  BillableServiceStatus,
  BillableServiceType,
  ContentStatus,
  InboundOrderStatus,
  LogisticUnitStatus,
  LogisticUnitType,
  MovementType,
  OutboundOrderStatus,
  PickingStrategy,
  PositionStatus,
  PositionType,
  ReceivedUnitType,
  StockStatus,
  UserRole,
} from "@/lib/types/database";

// --- Navegación principal (labels en español) ---
export type NavItem = { href: string; label: string };

/** Ítems superiores (sin grupo): dashboard y maestro de clientes. */
export const NAV_TOP_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
];

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operacion",
    label: "Operación",
    items: [
      { href: "/ordenes-ingreso", label: "Órdenes de ingreso" },
      { href: "/clasificacion", label: "Clasificación" },
      { href: "/ordenes-retiro", label: "Órdenes de retiro" },
    ],
  },
  {
    id: "deposito",
    label: "Depósito",
    items: [
      { href: "/posiciones", label: "Posiciones" },
      { href: "/mapa", label: "Mapa" },
      { href: "/productos", label: "Productos" },
    ],
  },
  {
    id: "control",
    label: "Control",
    items: [
      { href: "/movimientos", label: "Movimientos" },
      { href: "/servicios-facturables", label: "Servicios facturables" },
      { href: "/cierre-dia", label: "Cierre del día" },
    ],
  },
];

/** Lista plana de todos los ítems (compatibilidad / breadcrumbs). */
export const NAV_ITEMS: NavItem[] = [
  ...NAV_TOP_ITEMS,
  ...NAV_GROUPS.flatMap((g) => g.items),
];

// --- Roles ---
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operario",
  client_viewer: "Cliente",
};

// --- Estrategia de picking ---
export const PICKING_STRATEGY_LABELS: Record<PickingStrategy, string> = {
  FIFO: "FIFO (primero en entrar, primero en salir)",
  LIFO: "LIFO (último en entrar, primero en salir)",
  manual: "Manual",
};

// --- Tipos de posición ---
export const POSITION_TYPE_LABELS: Record<PositionType, string> = {
  rack: "Rack",
  floor_inbound: "Piso ingreso",
  floor_classification: "Piso clasificación",
  floor_assembly: "Piso armado",
  floor_temporary: "Piso guardado",
  floor_outbound: "Piso retiro",
  floor_incident: "Revisión",
  floor_return: "Piso devoluciones",
};

// --- Estados de posición + color (lógica de color del enunciado) ---
export const POSITION_STATUS_LABELS: Record<PositionStatus, string> = {
  free: "Libre",
  partially_occupied: "Parcialmente ocupada",
  occupied: "Ocupada",
  reserved: "Reservada",
  blocked: "Bloqueada",
  incident: "Revisión",
};

/** Descripciones (ayuda/tooltip) para cada estado de posición. */
export const POSITION_STATUS_DESCRIPTIONS: Record<PositionStatus, string> = {
  free: "Disponible para usar.",
  partially_occupied:
    "Tiene mercadería, pero todavía puede recibir más. Estado manual.",
  occupied: "No debería recibir más mercadería. Estado manual.",
  reserved: "Separada para una operación futura.",
  blocked: "No se puede usar por restricción operativa o física.",
  incident: "Requiere validación por daño, diferencia, duda o problema.",
};

/** Clases Tailwind de fondo por estado de posición (verde/amarillo/rojo/azul/gris/naranja). */
export const POSITION_STATUS_BG: Record<PositionStatus, string> = {
  free: "bg-status-free text-white",
  partially_occupied: "bg-status-partial text-black",
  occupied: "bg-status-occupied text-white",
  reserved: "bg-status-reserved text-white",
  blocked: "bg-status-blocked text-white",
  incident: "bg-status-incident text-white",
};

// --- Estados de orden de ingreso ---
export const INBOUND_ORDER_STATUS_LABELS: Record<InboundOrderStatus, string> = {
  pending_download: "Pendiente de descarga",
  downloaded: "Descargada",
  pending_validation: "Pendiente de revisión documental",
  pending_classification: "Pendiente de clasificación",
  partially_classified: "En clasificación",
  ready_to_locate: "Lista para ubicar",
  located: "Ubicada",
  incident: "Revisión",
  closed: "Cerrada",
};

// --- Mapeos de tipo para ubicación ---
/** Tipo de unidad recibida -> tipo de unidad logística al ubicar. */
export const RECEIVED_TO_LOGISTIC_TYPE: Record<
  ReceivedUnitType,
  LogisticUnitType
> = {
  pallet: "pallet",
  box: "box",
  package: "package",
  loose_item: "loose_item",
  mixed: "mixed",
  unknown: "box",
};

/** Unidad de facturación (texto) según el tipo de unidad recibida. */
export const BILLING_UNIT_BY_TYPE: Record<ReceivedUnitType, string> = {
  pallet: "pallet",
  box: "caja",
  package: "bulto",
  loose_item: "unidad",
  mixed: "unidad",
  unknown: "unidad",
};

/** Unidad de facturación al ubicar una unidad logística ya creada. */
export const BILLING_UNIT_BY_LOGISTIC_TYPE: Record<LogisticUnitType, string> = {
  pallet: "pallet",
  box: "caja",
  package: "bulto",
  assembled: "unidad",
  mixed: "unidad",
  set: "unidad",
  loose_item: "unidad",
};

/**
 * Regla única de gating de clasificación: una unidad recibida requiere
 * procesamiento previo (y por lo tanto NO puede ubicarse) si y solo si tiene
 * alguno de los flags operativos en true. El `content_status` (ej. "unknown")
 * NO influye: una unidad puede estar desconocida a nivel producto y aun así
 * ubicarse si no se marcó ningún flag de procesamiento.
 */
export function receivedUnitRequiresProcessing(u: {
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
}): boolean {
  return (
    u.requires_classification ||
    u.requires_desconsolidation ||
    u.requires_assembly ||
    u.requires_repackaging
  );
}

// --- Tipos de unidad recibida ---
export const RECEIVED_UNIT_TYPE_LABELS: Record<ReceivedUnitType, string> = {
  pallet: "Pallet",
  box: "Caja",
  package: "Bulto",
  loose_item: "Suelto",
  mixed: "Mixto",
  unknown: "Desconocido",
};

/** Base singular para display_label al generar desde descarga (Pallet 1, Caja 2…). */
export const RECEIVED_UNIT_DISPLAY_LABEL_BASE: Partial<
  Record<ReceivedUnitType, string>
> = {
  pallet: "Pallet",
  box: "Caja",
  package: "Bulto",
};

/** Tipos que se generan como una received_unit por unidad física (qty = 1). */
export const RECEIVED_UNIT_INDIVIDUAL_TYPES: ReceivedUnitType[] = [
  "pallet",
  "box",
  "package",
];

export function buildReceivedUnitDisplayLabel(
  type: ReceivedUnitType,
  index: number
): string | null {
  const base = RECEIVED_UNIT_DISPLAY_LABEL_BASE[type];
  if (base) return `${base} ${index}`;
  if (type === "loose_item") return "Unidades sueltas";
  return null;
}

/** Texto principal para mostrar una unidad (code · label). */
export function formatReceivedUnitHeading(unit: {
  code: string;
  display_label?: string | null;
  type?: ReceivedUnitType;
}): string {
  const label =
    unit.display_label?.trim() ||
    (unit.type ? RECEIVED_UNIT_TYPE_LABELS[unit.type] : null);
  return label ? `${unit.code} · ${label}` : unit.code;
}

// --- Estados de contenido de unidad recibida ---
export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  unknown: "Desconocido",
  expected_from_document: "Esperado según documento",
  validated: "Validado",
  mixed: "Mixto",
  partially_classified: "Pendiente de clasificación",
  discrepancy: "Revisión",
  incident: "Revisión",
  pending_opening: "Pendiente de apertura",
  ready_to_locate: "Listo para ubicar",
  pending_assembly: "Pendiente de armado",
  pending_repackaging: "Pendiente de reembalaje",
};

/**
 * Subconjunto de estados de contenido visibles en el selector de Unidades
 * recibidas (operación diaria). El resto del enum sigue existiendo en la base
 * pero no se ofrece para elegir. "Revisión" canónico = `incident`.
 */
export const VISIBLE_CONTENT_STATUSES: { value: ContentStatus; label: string }[] =
  [
    { value: "unknown", label: "Desconocido" },
    { value: "expected_from_document", label: "Esperado según documento" },
    { value: "validated", label: "Validado" },
    { value: "mixed", label: "Mixto" },
    { value: "pending_opening", label: "Pendiente de apertura" },
    { value: "partially_classified", label: "Pendiente de clasificación" },
    { value: "incident", label: "Revisión" },
    { value: "ready_to_locate", label: "Listo para ubicar" },
  ];

/** Descripción de ayuda para el estado "Revisión". */
export const CONTENT_STATUS_REVIEW_HELP =
  "Usar cuando hay daño, diferencia contra remito, faltante, sobrante o material pendiente de validar.";

// --- Tipos de unidad logística ---
export const LOGISTIC_UNIT_TYPE_LABELS: Record<LogisticUnitType, string> = {
  pallet: "Pallet",
  box: "Caja",
  package: "Bulto",
  assembled: "Armado",
  mixed: "Mixto",
  set: "Set",
  loose_item: "Suelto",
};

// --- Estados de unidad logística ---
export const LOGISTIC_UNIT_STATUS_LABELS: Record<LogisticUnitStatus, string> = {
  pending_classification: "Pendiente de clasificación",
  ready_to_locate: "Lista para ubicar",
  located: "Ubicada",
  reserved: "Reservada",
  in_floor_inbound: "En piso ingreso",
  in_floor_outbound: "En piso retiro",
  in_classification: "En clasificación",
  in_incident: "En revisión",
  partially_picked: "Parcialmente pickeada",
  exited: "Egresada",
  blocked: "Bloqueada",
};

// --- Estados de stock ---
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  available: "Disponible",
  reserved: "Reservado",
  floor_inbound: "Piso ingreso",
  floor_outbound: "Piso retiro",
  in_classification: "En clasificación",
  incident: "Revisión",
  exited: "Egresado",
  blocked: "Bloqueado",
};

// --- Tipos de movimiento ---
export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  inbound_created: "Orden de ingreso creada",
  download_from_truck: "Descarga de camión",
  received_unit_created: "Unidad recibida creada",
  classification: "Clasificación",
  desconsolidation: "Desconsolidación",
  assembly: "Armado",
  repackaging: "Reembalaje",
  location_assignment: "Asignación de ubicación",
  internal_movement: "Movimiento interno",
  consolidation: "Consolidación",
  logistic_unit_split: "Fraccionamiento de UL",
  partial_picking: "Picking parcial",
  rack_down: "Bajada de rack",
  outbound_preparation: "Preparación de retiro",
  outbound_loaded: "Carga de camión",
  stock_adjustment: "Ajuste de stock",
  incident: "Revisión",
};

// --- Estados de orden de retiro ---
export const OUTBOUND_ORDER_STATUS_LABELS: Record<OutboundOrderStatus, string> =
  {
    pending_validation: "Pendiente de validación",
    pending_stock_assignment: "Pendiente de asignación de stock",
    picking_assigned: "Picking asignado",
    in_preparation: "En preparación",
    ready_to_load: "Lista para cargar",
    loaded: "Cargada",
    closed: "Cerrada",
    incident: "Revisión",
  };

// --- Servicios facturables ---
export const BILLABLE_SERVICE_TYPE_LABELS: Record<BillableServiceType, string> =
  {
    truck_download: "Descarga de camión",
    desconsolidation: "Desconsolidación",
    classification: "Clasificación",
    assembly: "Armado",
    repackaging: "Reembalaje",
    location_assignment: "Asignación de ubicación",
    storage: "Almacenamiento",
    internal_movement: "Movimiento interno",
    consolidation: "Consolidación",
    partial_picking: "Picking parcial",
    rack_down: "Bajada de rack",
    truck_loading: "Carga de camión",
    incident_review: "Revisión",
    photos_documentation: "Fotos / documentación",
  };

export const BILLABLE_SERVICE_STATUS_LABELS: Record<
  BillableServiceStatus,
  string
> = {
  pending_billing: "Pendiente de facturación",
  billed: "Facturado",
  non_billable: "No facturable",
  under_review: "En revisión",
};

// --- Posiciones de piso requeridas (etapas operativas) ---
export const FLOOR_POSITION_CODES = [
  "FLOOR-INBOUND-01",
  "FLOOR-CLASSIFICATION-01",
  "FLOOR-ASSEMBLY-01",
  "FLOOR-STORAGE-01",
  "FLOOR-OUTBOUND-01",
  "FLOOR-INCIDENT-01",
  "FLOOR-RETURN-01",
] as const;

// --- Estructura de posiciones (nomenclatura {columna}-{lado}-{nivel}) ---
// Letra principal: A..K
export const RACK_COLUMNS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
] as const;

// Lado del pasillo
export const POSITION_SIDES = ["IZQ", "DER"] as const;
export const SIDE_LABELS: Record<string, string> = {
  IZQ: "Izquierda",
  DER: "Derecha",
};

// Niveles (orden lógico) y orden visual del mapa (arriba -> abajo)
export const POSITION_LEVELS = ["PISO", "1", "2", "3", "4"] as const;
export const POSITION_LEVELS_TOP_DOWN = ["4", "3", "2", "1", "PISO"] as const;
export const LEVEL_LABELS: Record<string, string> = {
  PISO: "Piso",
  "1": "Nivel 1",
  "2": "Nivel 2",
  "3": "Nivel 3",
  "4": "Nivel 4",
};

// Tipos de posición visibles en la UI (subconjunto simplificado)
export const VISIBLE_POSITION_TYPES: {
  value: PositionType;
  label: string;
}[] = [
  { value: "rack", label: "Rack" },
  { value: "floor_temporary", label: "Piso guardado" },
  { value: "floor_inbound", label: "Piso ingreso" },
  { value: "floor_outbound", label: "Piso retiro" },
  { value: "floor_incident", label: "Revisión" },
];

/** Destinos finales de stock: rack o piso guardado (floor_temporary / FLOOR-STORAGE). */
export const FINAL_STORAGE_POSITION_TYPES: PositionType[] = [
  "rack",
  "floor_temporary",
];

export function isFinalStoragePosition(
  type: PositionType | string | null | undefined
): boolean {
  return type === "rack" || type === "floor_temporary";
}

/** Zonas de piso en mapa/listado (incluye piso guardado y tránsito). */
export const OPERATIONAL_FLOOR_TYPES: PositionType[] = [
  "floor_inbound",
  "floor_outbound",
  "floor_incident",
  "floor_temporary",
];

/** Zonas de tránsito operativo (no almacenamiento final). */
export const OPERATIONAL_TRANSIT_FLOOR_TYPES: PositionType[] = [
  "floor_inbound",
  "floor_outbound",
  "floor_incident",
];

export function isOperationalTransitFloorType(
  type: PositionType | string | null | undefined
): boolean {
  return (
    type === "floor_inbound" ||
    type === "floor_outbound" ||
    type === "floor_incident"
  );
}

export function isFloorStorageCode(code: string | null | undefined): boolean {
  return !!code && /^FLOOR-STORAGE-\d{2}$/i.test(code.trim());
}

export function floorZoneNumberFromCode(code?: string | null): number | null {
  const match = (code ?? "").trim().toUpperCase().match(/-(\d{2})$/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Label amigable según tipo/código de zona de piso (sin depender de códigos fijos). */
export function floorZonePrimaryLabel(
  type: PositionType,
  code?: string | null
): string {
  if (type === "floor_temporary" || isFloorStorageCode(code)) {
    return "Piso guardado";
  }
  if (type === "floor_inbound") return "Piso ingreso";
  if (type === "floor_outbound") return "Piso retiro";
  if (type === "floor_incident") return "Revisión";
  return POSITION_TYPE_LABELS[type] ?? code ?? "—";
}

/** True si la posición pertenece a una zona de piso controlada del mapa. */
export function isMapFloorZonePosition(position: {
  type: PositionType;
  code: string | null;
}): boolean {
  if (!position.code) return false;
  const code = position.code.toUpperCase();
  if (!FLOOR_ZONE_CODE_REGEX.test(code)) return false;
  const prefix = FLOOR_ZONE_PREFIXES[position.type];
  if (!prefix) return false;
  return code.startsWith(`${prefix}-`);
}

/** Piso guardado en mapa: floor_temporary o código FLOOR-STORAGE-XX. */
export function isMapFloorStoragePosition(position: {
  type: PositionType;
  code: string | null;
}): boolean {
  if (isFloorStorageCode(position.code)) return true;
  return position.type === "floor_temporary" && isMapFloorZonePosition(position);
}

/** Zonas operativas de tránsito en mapa (ingreso/retiro/revisión), sin piso guardado. */
export function isMapOperationalTransitFloorPosition(position: {
  type: PositionType;
  code: string | null;
}): boolean {
  if (isMapFloorStoragePosition(position)) return false;
  return isMapFloorZonePosition(position);
}

/** Texto para celdas del mapa de zonas operativas. */
export function mapFloorZoneDisplay(
  type: PositionType,
  code: string | null
): { primary: string; secondary: string } {
  const primary = floorZonePrimaryLabel(type, code);
  if (isFloorStorageCode(code)) {
    const zone = floorZoneNumberFromCode(code);
    return {
      primary,
      secondary: zone ? String(zone).padStart(2, "0") : "—",
    };
  }
  return { primary, secondary: code ?? "—" };
}

/** True si el código corresponde a una zona operativa de piso controlada. */
export function isOperationalZoneCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return FLOOR_ZONE_CODE_REGEX.test(code.toUpperCase());
}

/** En portal/UI cliente no mostrar códigos internos de piso guardado. */
export function shouldHideInternalPositionCode(
  code: string | null | undefined
): boolean {
  return isFloorStorageCode(code);
}

/** Label principal para una posición por código (amigable si es zona operativa). */
export function positionPrimaryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (isFloorStorageCode(code)) return "Piso guardado";
  const upper = code.toUpperCase();
  if (upper.startsWith("FLOOR-INBOUND-")) return "Piso ingreso";
  if (upper.startsWith("FLOOR-OUTBOUND-")) return "Piso retiro";
  if (upper.startsWith("FLOOR-INCIDENT-")) return "Revisión";
  return code;
}

/** Label para selects: amigable + identificador cuando aplica. */
export function positionSelectLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (isFloorStorageCode(code)) {
    const zone = floorZoneNumberFromCode(code);
    return zone
      ? `Piso guardado (${String(zone).padStart(2, "0")})`
      : "Piso guardado";
  }
  const friendly = positionPrimaryLabel(code);
  return friendly !== code ? `${friendly} (${code})` : code;
}

/**
 * Prefijos controlados para las zonas operativas de piso.
 * El código se genera SIEMPRE como {PREFIJO}-{NN}, nunca a mano.
 */
export const FLOOR_ZONE_PREFIXES: Record<string, string> = {
  floor_inbound: "FLOOR-INBOUND",
  floor_outbound: "FLOOR-OUTBOUND",
  floor_incident: "FLOOR-INCIDENT",
  floor_temporary: "FLOOR-STORAGE",
};

/** Números disponibles para zonas operativas (MVP: 01..10). */
export const FLOOR_ZONE_NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

/** True si el tipo es una zona operativa de piso controlada. */
export function isFloorZoneType(type: PositionType): boolean {
  return Object.prototype.hasOwnProperty.call(FLOOR_ZONE_PREFIXES, type);
}

/** Genera el código de una zona operativa: FLOOR-INBOUND-01, FLOOR-STORAGE-01, etc. */
export function buildFloorZoneCode(type: PositionType, n: number): string {
  const prefix = FLOOR_ZONE_PREFIXES[type];
  if (!prefix) return "";
  return `${prefix}-${String(n).padStart(2, "0")}`;
}

/** Regex que valida un código de zona operativa controlada. */
export const FLOOR_ZONE_CODE_REGEX =
  /^FLOOR-(INBOUND|OUTBOUND|INCIDENT|STORAGE)-\d{2}$/;

/** Regex que valida un código de rack: {A-K}-{IZQ|DER}-{PISO|1|2|3|4}. */
export const RACK_CODE_REGEX = /^[A-K]-(IZQ|DER)-(PISO|[1-4])$/;

/** Código de posición de rack: {columna}-{lado}-{nivel} en mayúsculas. */
export function buildRackCode(
  column: string,
  side: string,
  level: string
): string {
  return `${column}-${side}-${level}`.toUpperCase();
}

/** Descripción legible: "A izquierda piso", "A derecha nivel 1". */
export function describeRackPosition(
  column?: string | null,
  side?: string | null,
  level?: string | null
): string {
  if (!column || !side || !level) return "—";
  const sideText = side === "IZQ" ? "izquierda" : "derecha";
  const levelText = level === "PISO" ? "piso" : `nivel ${level}`;
  return `${column} ${sideText} ${levelText}`;
}
