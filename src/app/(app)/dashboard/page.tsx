import {
  Truck,
  PackageMinus,
  PackageSearch,
  SplitSquareVertical,
  PackageCheck,
  AlertTriangle,
  Grid3x3,
  Receipt,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Metric = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

async function getMetrics() {
  const supabase = createClient();

  const [
    { data: positions },
    { data: logisticUnits },
    inbound,
    outbound,
    services,
  ] = await Promise.all([
    supabase.from("positions").select("id, code, type, status"),
    supabase
      .from("logistic_units")
      .select("id, status, current_position_id")
      .neq("status", "exited"),
    supabase
      .from("inbound_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "closed"),
    supabase
      .from("outbound_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "closed"),
    supabase
      .from("billable_services")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_billing"),
  ]);

  const floorIdByType = new Map<string, string>();
  let occupied = 0;
  let incidentPositions = 0;
  for (const p of positions ?? []) {
    if (p.status === "occupied") occupied++;
    if (p.status === "incident") incidentPositions++;
    if (p.type !== "rack") floorIdByType.set(p.type, p.id);
  }

  const countInFloor = (type: string) =>
    (logisticUnits ?? []).filter(
      (u) => u.current_position_id === floorIdByType.get(type)
    ).length;

  const incidents =
    incidentPositions +
    (logisticUnits ?? []).filter((u) => u.status === "in_incident").length;

  return {
    inboundPending: inbound.count ?? 0,
    outboundPending: outbound.count ?? 0,
    floorInbound: countInFloor("floor_inbound"),
    inClassification: countInFloor("floor_classification"),
    floorOutbound: countInFloor("floor_outbound"),
    incidents,
    occupied,
    servicesPending: services.count ?? 0,
  };
}

export default async function DashboardPage() {
  const m = await getMetrics();

  const metrics: Metric[] = [
    {
      label: "Órdenes de ingreso pendientes",
      value: m.inboundPending,
      icon: Truck,
      accent: "text-blue-600",
    },
    {
      label: "Órdenes de retiro pendientes",
      value: m.outboundPending,
      icon: PackageMinus,
      accent: "text-purple-600",
    },
    {
      label: "Material en piso ingreso",
      value: m.floorInbound,
      icon: PackageSearch,
      accent: "text-amber-600",
    },
    {
      label: "Material en clasificación",
      value: m.inClassification,
      icon: SplitSquareVertical,
      accent: "text-amber-600",
    },
    {
      label: "Material en piso retiro",
      value: m.floorOutbound,
      icon: PackageCheck,
      accent: "text-green-600",
    },
    {
      label: "Revisión",
      value: m.incidents,
      icon: AlertTriangle,
      accent: "text-orange-600",
    },
    {
      label: "Posiciones ocupadas",
      value: m.occupied,
      icon: Grid3x3,
      accent: "text-red-600",
    },
    {
      label: "Servicios pendientes de facturación",
      value: m.servicesPending,
      icon: Receipt,
      accent: "text-slate-600",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen operativo del depósito"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <Icon className={`h-5 w-5 ${metric.accent}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{metric.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
