import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createInboundOrderAction } from "@/lib/actions/inbound";
import { PageHeader } from "@/components/layout/page-header";
import { InboundForm } from "../_components/inbound-form";

export const dynamic = "force-dynamic";

export default async function NuevaOrdenIngresoPage() {
  await requireProfile();

  const supabase = createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre")
    .eq("is_active", true)
    .order("nombre");

  return (
    <>
      <PageHeader
        title="Nueva orden de ingreso"
        description="Registrar la llegada de mercadería de un cliente"
      />
      <InboundForm
        action={createInboundOrderAction}
        clients={clients ?? []}
        submitLabel="Crear orden"
      />
    </>
  );
}
