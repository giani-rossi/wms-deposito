import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateClientAction } from "@/lib/actions/clients";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "../../_components/client-form";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole(["admin", "supervisor"], `/clientes/${params.id}`);

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!client) notFound();

  const action = updateClientAction.bind(null, params.id);

  return (
    <>
      <PageHeader
        title={`Editar: ${client.nombre}`}
        description="Modificá los datos del cliente"
      />
      <ClientForm
        action={action}
        client={client}
        submitLabel="Guardar cambios"
      />
    </>
  );
}
