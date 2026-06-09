/**
 * Tipos de la base de datos del WMS.
 *
 * Escritos a mano para el MVP (sin Prisma). Mantener sincronizados con las
 * migraciones SQL en `supabase/migrations`. Pueden regenerarse en el futuro con:
 *   supabase gen types typescript --local > src/lib/types/database.ts
 */

// ---------------------------------------------------------------------------
// Enums (deben coincidir con los CREATE TYPE en SQL)
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "supervisor" | "operator";

export type PickingStrategy = "FIFO" | "LIFO" | "manual";

export type PositionType =
  | "rack"
  | "floor_inbound"
  | "floor_classification"
  | "floor_assembly"
  | "floor_temporary"
  | "floor_outbound"
  | "floor_incident"
  | "floor_return";

export type PositionStatus =
  | "free"
  | "partially_occupied"
  | "occupied"
  | "reserved"
  | "blocked"
  | "incident";

export type InboundOrderStatus =
  | "pending_download"
  | "downloaded"
  | "pending_validation"
  | "pending_classification"
  | "partially_classified"
  | "ready_to_locate"
  | "located"
  | "incident"
  | "closed";

export type ReceivedUnitType =
  | "pallet"
  | "box"
  | "package"
  | "loose_item"
  | "mixed"
  | "unknown";

export type ContentStatus =
  | "unknown"
  | "expected_from_document"
  | "validated"
  | "mixed"
  | "partially_classified"
  | "discrepancy"
  | "incident"
  | "pending_opening"
  | "ready_to_locate"
  | "pending_assembly"
  | "pending_repackaging";

export type LogisticUnitType =
  | "pallet"
  | "box"
  | "package"
  | "assembled"
  | "mixed"
  | "set"
  | "loose_item";

export type LogisticUnitStatus =
  | "pending_classification"
  | "ready_to_locate"
  | "located"
  | "reserved"
  | "in_floor_inbound"
  | "in_floor_outbound"
  | "in_classification"
  | "in_incident"
  | "partially_picked"
  | "exited"
  | "blocked";

export type StockStatus =
  | "available"
  | "reserved"
  | "floor_inbound"
  | "floor_outbound"
  | "in_classification"
  | "incident"
  | "exited"
  | "blocked";

export type SizeClass = "small" | "medium" | "large" | "irregular";
export type WeightClass = "light" | "medium" | "heavy";
export type FragilityLevel = "low" | "medium" | "high";
export type RotationLevel = "low" | "medium" | "high";

export type MovementType =
  | "inbound_created"
  | "download_from_truck"
  | "received_unit_created"
  | "classification"
  | "desconsolidation"
  | "assembly"
  | "repackaging"
  | "location_assignment"
  | "internal_movement"
  | "consolidation"
  | "partial_picking"
  | "rack_down"
  | "outbound_preparation"
  | "outbound_loaded"
  | "stock_adjustment"
  | "incident";

export type OutboundOrderStatus =
  | "pending_validation"
  | "pending_stock_assignment"
  | "picking_assigned"
  | "in_preparation"
  | "ready_to_load"
  | "loaded"
  | "closed"
  | "incident";

export type OutboundOrderItemStatus =
  | "pending"
  | "assigned"
  | "partially_assigned"
  | "prepared"
  | "loaded"
  | "incident";

export type PickingAssignmentStatus =
  | "suggested"
  | "confirmed"
  | "picked"
  | "moved_to_floor_outbound"
  | "loaded"
  | "cancelled";

export type BillableServiceType =
  | "truck_download"
  | "desconsolidation"
  | "classification"
  | "assembly"
  | "repackaging"
  | "location_assignment"
  | "storage"
  | "internal_movement"
  | "consolidation"
  | "partial_picking"
  | "rack_down"
  | "truck_loading"
  | "incident_review"
  | "photos_documentation";

export type BillableServiceStatus =
  | "pending_billing"
  | "billed"
  | "non_billable"
  | "under_review";

export type RelatedEntityType =
  | "inbound_order"
  | "outbound_order"
  | "product"
  | "received_unit"
  | "logistic_unit"
  | "position"
  | "incident"
  | "movement";

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Filas de tablas
// ---------------------------------------------------------------------------

export interface ProfileRow extends Timestamps {
  id: string; // = auth.users.id
  full_name: string | null;
  email: string | null;
  role: UserRole;
}

export interface ClientRow extends Timestamps {
  id: string;
  nombre: string;
  razon_social: string | null;
  tax_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_notes: string | null;
  operational_rules: string | null;
  default_picking_strategy: PickingStrategy;
  allow_mixed_logistic_units: boolean;
  require_photos: boolean;
  notes: string | null;
  is_active: boolean;
}

export interface ClientPositionAssignmentRow extends Timestamps {
  id: string;
  client_id: string;
  position_id: string;
  assigned_at: string;
  released_at: string | null;
  notes: string | null;
  created_by: string | null;
}

export interface PositionRow extends Timestamps {
  id: string;
  code: string;
  rack_number: number | null; // deprecado (nomenclatura vieja R1-A-1)
  column_letter: string | null; // letra principal: A..K
  side: string | null; // IZQ / DER
  level: string | null; // PISO, 1, 2, 3, 4
  type: PositionType;
  assigned_client_id: string | null;
  status: PositionStatus;
  capacity_notes: string | null;
  occupancy_notes: string | null;
}

export interface InboundOrderRow extends Timestamps {
  id: string;
  client_id: string;
  date_time: string;
  truck_company: string | null;
  driver_name: string | null;
  license_plate: string | null;
  remittance_number: string | null;
  ai_extracted_data_json: Json | null;
  human_confirmed_data_json: Json | null;
  status: InboundOrderStatus;
  notes: string | null;
  created_by: string | null;
}

export interface ReceivedUnitRow extends Timestamps {
  id: string;
  code: string;
  inbound_order_id: string;
  client_id: string;
  type: ReceivedUnitType;
  physical_quantity: number;
  content_status: ContentStatus;
  current_position_id: string | null;
  notes: string | null;
  requires_classification: boolean;
  requires_desconsolidation: boolean;
  requires_assembly: boolean;
  requires_repackaging: boolean;
}

export interface InboundOrderDischargeRow extends Timestamps {
  id: string;
  inbound_order_id: string;
  pallets_count: number;
  boxes_count: number;
  packages_count: number;
  loose_items_count: number;
  total_units_count: number | null;
  requires_desconsolidation: boolean;
  requires_classification: boolean;
  requires_assembly: boolean;
  notes: string | null;
  discharged_by: string | null;
  discharged_at: string;
}

export interface ProductRow extends Timestamps {
  id: string;
  client_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  unit_of_measure: string | null;
  size_class: SizeClass | null;
  weight_class: WeightClass | null;
  fragility: FragilityLevel | null;
  rotation: RotationLevel | null;
  stackable: boolean;
  high_value: boolean;
  requires_fifo: boolean;
  notes: string | null;
}

export interface LogisticUnitRow extends Timestamps {
  id: string;
  code: string;
  received_unit_id: string | null;
  inbound_order_id: string | null;
  client_id: string;
  type: LogisticUnitType;
  status: LogisticUnitStatus;
  current_position_id: string | null;
  entry_date: string | null;
  notes: string | null;
  is_mixed: boolean;
  is_available: boolean;
  requires_partial_picking: boolean;
}

export interface LogisticUnitContentRow extends Timestamps {
  id: string;
  logistic_unit_id: string;
  product_id: string;
  quantity: number;
  unit_of_measure: string | null;
  lot: string | null;
  entry_date: string | null;
  status: StockStatus;
}

export interface ReceivedUnitContentRow extends Timestamps {
  id: string;
  received_unit_id: string;
  product_id: string;
  quantity: number;
  unit_of_measure: string | null;
  lot: string | null;
  notes: string | null;
}

export interface MovementRow {
  id: string;
  date_time: string;
  user_id: string | null;
  client_id: string | null;
  movement_type: MovementType;
  received_unit_id: string | null;
  logistic_unit_id: string | null;
  product_id: string | null;
  quantity: number | null;
  from_position_id: string | null;
  to_position_id: string | null;
  inbound_order_id: string | null;
  outbound_order_id: string | null;
  notes: string | null;
  billable_service_id: string | null;
  created_at: string;
}

export interface OutboundOrderRow extends Timestamps {
  id: string;
  client_id: string;
  date_time: string;
  document_number: string | null;
  ai_extracted_data_json: Json | null;
  human_confirmed_data_json: Json | null;
  destination: string | null;
  truck_company: string | null;
  driver_name: string | null;
  license_plate: string | null;
  status: OutboundOrderStatus;
  notes: string | null;
  created_by: string | null;
}

export interface OutboundOrderItemRow extends Timestamps {
  id: string;
  outbound_order_id: string;
  product_id: string;
  requested_quantity: number;
  confirmed_quantity: number | null;
  unit_of_measure: string | null;
  status: OutboundOrderItemStatus;
}

export interface PickingAssignmentRow extends Timestamps {
  id: string;
  outbound_order_id: string;
  outbound_order_item_id: string;
  logistic_unit_id: string;
  product_id: string;
  from_position_id: string | null;
  quantity: number;
  status: PickingAssignmentStatus;
}

export interface BillableServiceRow extends Timestamps {
  id: string;
  client_id: string;
  date: string;
  service_type: BillableServiceType;
  quantity: number;
  unit: string | null;
  inbound_order_id: string | null;
  outbound_order_id: string | null;
  movement_id: string | null;
  status: BillableServiceStatus;
  notes: string | null;
}

export interface UploadedFileRow {
  id: string;
  bucket: string;
  path: string;
  file_type: string | null;
  related_entity_type: RelatedEntityType | null;
  related_entity_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** Snapshot diario de ocupación por posición (base para facturación de estadía). */
export interface DailyPositionOccupancyRow {
  id: string;
  date: string;
  client_id: string;
  position_id: string;
  position_code: string;
  occupied_units_count: number;
  position_status: PositionStatus;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

export interface StockByPositionView {
  position_id: string | null;
  position_code: string | null;
  client_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  logistic_unit_id: string;
  logistic_unit_code: string;
  inbound_order_id: string | null;
  quantity: number;
  unit_of_measure: string | null;
  lot: string | null;
  entry_date: string | null;
  stock_status: StockStatus;
}

// ---------------------------------------------------------------------------
// Helper genérico para construir Insert/Update a partir de una Row
// ---------------------------------------------------------------------------

type InsertOf<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

type AutoCols = "id" | "created_at" | "updated_at";

/**
 * supabase-js exige que cada `Row` sea asignable a `Record<string, unknown>`.
 * Las `interface` de TS no lo son (por declaration merging), pero un mapped
 * type identidad sí (es un tipo de objeto "cerrado", como Omit/Pick) y además
 * conserva las claves exactas para que funcione el parser de `select`.
 */
type Indexed<T> = { [K in keyof T]: T[K] };

// ---------------------------------------------------------------------------
// Tipo Database compatible con @supabase/supabase-js
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Indexed<ProfileRow>;
        Insert: InsertOf<ProfileRow, "created_at" | "updated_at" | "role">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      clients: {
        Row: Indexed<ClientRow>;
        Insert: InsertOf<
          ClientRow,
          | AutoCols
          | "default_picking_strategy"
          | "allow_mixed_logistic_units"
          | "require_photos"
          | "is_active"
        >;
        Update: Partial<ClientRow>;
        Relationships: [];
      };
      client_position_assignments: {
        Row: Indexed<ClientPositionAssignmentRow>;
        Insert: InsertOf<
          ClientPositionAssignmentRow,
          AutoCols | "assigned_at" | "released_at" | "notes" | "created_by"
        >;
        Update: Partial<ClientPositionAssignmentRow>;
        Relationships: [];
      };
      positions: {
        Row: Indexed<PositionRow>;
        Insert: InsertOf<
          PositionRow,
          | AutoCols
          | "status"
          | "assigned_client_id"
          | "rack_number"
          | "column_letter"
          | "side"
          | "level"
          | "capacity_notes"
          | "occupancy_notes"
        >;
        Update: Partial<PositionRow>;
        Relationships: [];
      };
      inbound_orders: {
        Row: Indexed<InboundOrderRow>;
        Insert: InsertOf<
          InboundOrderRow,
          | AutoCols
          | "date_time"
          | "status"
          | "truck_company"
          | "driver_name"
          | "license_plate"
          | "remittance_number"
          | "ai_extracted_data_json"
          | "human_confirmed_data_json"
          | "notes"
          | "created_by"
        >;
        Update: Partial<InboundOrderRow>;
        Relationships: [];
      };
      received_units: {
        Row: Indexed<ReceivedUnitRow>;
        Insert: InsertOf<ReceivedUnitRow, AutoCols>;
        Update: Partial<ReceivedUnitRow>;
        Relationships: [];
      };
      inbound_order_discharge: {
        Row: Indexed<InboundOrderDischargeRow>;
        Insert: InsertOf<
          InboundOrderDischargeRow,
          | AutoCols
          | "pallets_count"
          | "boxes_count"
          | "packages_count"
          | "loose_items_count"
          | "total_units_count"
          | "requires_desconsolidation"
          | "requires_classification"
          | "requires_assembly"
          | "notes"
          | "discharged_by"
          | "discharged_at"
        >;
        Update: Partial<InboundOrderDischargeRow>;
        Relationships: [];
      };
      products: {
        Row: Indexed<ProductRow>;
        Insert: InsertOf<
          ProductRow,
          | AutoCols
          | "stackable"
          | "high_value"
          | "requires_fifo"
          | "sku"
          | "category"
          | "description"
          | "unit_of_measure"
          | "size_class"
          | "weight_class"
          | "fragility"
          | "rotation"
          | "notes"
        >;
        Update: Partial<ProductRow>;
        Relationships: [];
      };
      logistic_units: {
        Row: Indexed<LogisticUnitRow>;
        Insert: InsertOf<
          LogisticUnitRow,
          | AutoCols
          | "is_mixed"
          | "is_available"
          | "requires_partial_picking"
          | "status"
          | "type"
          | "received_unit_id"
          | "inbound_order_id"
          | "current_position_id"
          | "entry_date"
          | "notes"
        >;
        Update: Partial<LogisticUnitRow>;
        Relationships: [];
      };
      logistic_unit_contents: {
        Row: Indexed<LogisticUnitContentRow>;
        Insert: InsertOf<
          LogisticUnitContentRow,
          AutoCols | "status" | "unit_of_measure" | "lot" | "entry_date"
        >;
        Update: Partial<LogisticUnitContentRow>;
        Relationships: [];
      };
      received_unit_contents: {
        Row: Indexed<ReceivedUnitContentRow>;
        Insert: InsertOf<
          ReceivedUnitContentRow,
          AutoCols | "unit_of_measure" | "lot" | "notes"
        >;
        Update: Partial<ReceivedUnitContentRow>;
        Relationships: [];
      };
      movements: {
        Row: Indexed<MovementRow>;
        Insert: InsertOf<
          MovementRow,
          | "id"
          | "created_at"
          | "date_time"
          | "user_id"
          | "client_id"
          | "received_unit_id"
          | "logistic_unit_id"
          | "product_id"
          | "quantity"
          | "from_position_id"
          | "to_position_id"
          | "inbound_order_id"
          | "outbound_order_id"
          | "notes"
          | "billable_service_id"
        >;
        Update: Partial<MovementRow>;
        Relationships: [];
      };
      outbound_orders: {
        Row: Indexed<OutboundOrderRow>;
        Insert: InsertOf<OutboundOrderRow, AutoCols | "date_time" | "status">;
        Update: Partial<OutboundOrderRow>;
        Relationships: [];
      };
      outbound_order_items: {
        Row: Indexed<OutboundOrderItemRow>;
        Insert: InsertOf<OutboundOrderItemRow, AutoCols | "status">;
        Update: Partial<OutboundOrderItemRow>;
        Relationships: [];
      };
      picking_assignments: {
        Row: Indexed<PickingAssignmentRow>;
        Insert: InsertOf<PickingAssignmentRow, AutoCols | "status">;
        Update: Partial<PickingAssignmentRow>;
        Relationships: [];
      };
      billable_services: {
        Row: Indexed<BillableServiceRow>;
        Insert: InsertOf<
          BillableServiceRow,
          | AutoCols
          | "status"
          | "date"
          | "quantity"
          | "unit"
          | "inbound_order_id"
          | "outbound_order_id"
          | "movement_id"
          | "notes"
        >;
        Update: Partial<BillableServiceRow>;
        Relationships: [];
      };
      uploaded_files: {
        Row: Indexed<UploadedFileRow>;
        Insert: InsertOf<UploadedFileRow, "id" | "created_at">;
        Update: Partial<UploadedFileRow>;
        Relationships: [];
      };
      daily_position_occupancy: {
        Row: Indexed<DailyPositionOccupancyRow>;
        Insert: InsertOf<DailyPositionOccupancyRow, "id" | "created_at">;
        Update: Partial<DailyPositionOccupancyRow>;
        Relationships: [];
      };
    };
    Views: {
      stock_by_position: {
        Row: Indexed<StockByPositionView>;
        Relationships: [];
      };
    };
    Functions: {
      next_received_unit_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_logistic_unit_code: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      picking_strategy: PickingStrategy;
      position_type: PositionType;
      position_status: PositionStatus;
      inbound_order_status: InboundOrderStatus;
      received_unit_type: ReceivedUnitType;
      content_status: ContentStatus;
      logistic_unit_type: LogisticUnitType;
      logistic_unit_status: LogisticUnitStatus;
      stock_status: StockStatus;
      size_class: SizeClass;
      weight_class: WeightClass;
      fragility_level: FragilityLevel;
      rotation_level: RotationLevel;
      movement_type: MovementType;
      outbound_order_status: OutboundOrderStatus;
      outbound_order_item_status: OutboundOrderItemStatus;
      picking_assignment_status: PickingAssignmentStatus;
      billable_service_type: BillableServiceType;
      billable_service_status: BillableServiceStatus;
      related_entity_type: RelatedEntityType;
    };
  };
}
