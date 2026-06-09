import { cn } from "@/lib/utils";
import {
  BILLABLE_SERVICE_STATUS_LABELS,
  CONTENT_STATUS_LABELS,
  INBOUND_ORDER_STATUS_LABELS,
  LOGISTIC_UNIT_STATUS_LABELS,
  OUTBOUND_ORDER_STATUS_LABELS,
  POSITION_STATUS_LABELS,
  STOCK_STATUS_LABELS,
} from "@/lib/constants";
import type {
  BillableServiceStatus,
  ContentStatus,
  InboundOrderStatus,
  LogisticUnitStatus,
  OutboundOrderStatus,
  PositionStatus,
  StockStatus,
} from "@/lib/types/database";

function Dot({ className }: { className: string }) {
  return <span className={cn("h-2 w-2 rounded-full", className)} />;
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

// --- Posición (con la lógica de color del enunciado) ---
const POSITION_DOT: Record<PositionStatus, string> = {
  free: "bg-status-free",
  partially_occupied: "bg-status-partial",
  occupied: "bg-status-occupied",
  reserved: "bg-status-reserved",
  blocked: "bg-status-blocked",
  incident: "bg-status-incident",
};

export function PositionStatusBadge({ status }: { status: PositionStatus }) {
  return (
    <Pill>
      <Dot className={POSITION_DOT[status]} />
      {POSITION_STATUS_LABELS[status]}
    </Pill>
  );
}

export function InboundStatusBadge({ status }: { status: InboundOrderStatus }) {
  return <Pill className="bg-muted">{INBOUND_ORDER_STATUS_LABELS[status]}</Pill>;
}

export function OutboundStatusBadge({
  status,
}: {
  status: OutboundOrderStatus;
}) {
  return (
    <Pill className="bg-muted">{OUTBOUND_ORDER_STATUS_LABELS[status]}</Pill>
  );
}

export function LogisticUnitStatusBadge({
  status,
}: {
  status: LogisticUnitStatus;
}) {
  return (
    <Pill className="bg-muted">{LOGISTIC_UNIT_STATUS_LABELS[status]}</Pill>
  );
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <Pill className="bg-muted">{CONTENT_STATUS_LABELS[status]}</Pill>;
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const tone =
    status === "available"
      ? "bg-green-100 text-green-800 border-green-200"
      : status === "reserved"
        ? "bg-blue-100 text-blue-800 border-blue-200"
        : status === "incident"
          ? "bg-orange-100 text-orange-800 border-orange-200"
          : "bg-muted";
  return <Pill className={tone}>{STOCK_STATUS_LABELS[status]}</Pill>;
}

export function BillableStatusBadge({
  status,
}: {
  status: BillableServiceStatus;
}) {
  const tone =
    status === "pending_billing"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : status === "billed"
        ? "bg-green-100 text-green-800 border-green-200"
        : status === "under_review"
          ? "bg-blue-100 text-blue-800 border-blue-200"
          : "bg-muted";
  return <Pill className={tone}>{BILLABLE_SERVICE_STATUS_LABELS[status]}</Pill>;
}
