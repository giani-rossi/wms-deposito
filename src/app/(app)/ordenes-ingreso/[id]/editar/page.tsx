import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateInboundOrderAction } from "@/lib/actions/inbound";
import { PageHeader } from "@/components/layout/page-header";
import { InboundForm } from "../../_components/inbound-form";

export const dynamic = "force-dynamic";

export default async function EditarOrdenIngresoPage({
  params,
}: {
  params: { id: string };
}) {
  await requireProfile();

  const supabase = createClient();
  const [{ data: order }, { data: clients }] = await Promise.all([
    supabase.from("inbound_orders").select("*").eq("id", params.id).single(),
    supabase
      .from("clients")
      .select("id, nombre")
      .eq("is_active", true)
      .order("nombre"),
  ]);

  if (!order) notFound();

  const action = updateInboundOrderAction.bind(null, params.id);

  return (
    <>
      <PageHeader
        title="Editar orden de ingreso"
        description="Modificar datos de la orden"
      />
      <InboundForm
        action={action}
        clients={clients ?? []}
        order={order}
        submitLabel="Guardar cambios"
      />
    </>
  );
}
