import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ClassificationWorkspace } from "./_components/classification-workspace";
import { loadProcessableUnitsForOrders } from "@/lib/processing/load-processable-units";

export const dynamic = "force-dynamic";

export default async function ClasificacionPage() {
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const { data: openOrders } = await supabase
    .from("inbound_orders")
    .select("id")
    .neq("status", "closed");

  const orderIds = (openOrders ?? []).map((o) => o.id);
  const processableUnits = await loadProcessableUnitsForOrders(orderIds);

  return (
    <>
      <PageHeader
        title="Clasificación"
        description="Procesar unidades recibidas y generar unidades logísticas listas para ubicar"
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <ClassificationWorkspace units={processableUnits} staff={staff} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
