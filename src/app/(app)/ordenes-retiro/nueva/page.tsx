import { requireProfile, isStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createOutboundOrderAction } from "@/lib/actions/outbound";
import { PageHeader } from "@/components/layout/page-header";
import { OutboundForm } from "../_components/outbound-form";

export const dynamic = "force-dynamic";

export default async function NuevaOrdenRetiroPage() {
  const profile = await requireProfile();
  if (!isStaff(profile.role)) {
    return (
      <p className="text-sm text-muted-foreground">
        No tenés permisos para crear órdenes de retiro.
      </p>
    );
  }

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .eq("is_active", true)
    .order("nombre");

  return (
    <>
      <PageHeader
        title="Nueva orden de retiro"
        description="Registrar salida de mercadería por unidades logísticas completas"
      />
      <OutboundForm
        action={createOutboundOrderAction}
        clients={clients ?? []}
        submitLabel="Crear orden"
      />
    </>
  );
}
