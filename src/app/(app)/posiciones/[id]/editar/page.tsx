import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updatePositionAction } from "@/lib/actions/positions";
import { PageHeader } from "@/components/layout/page-header";
import { PositionForm } from "../../_components/position-form";

export const dynamic = "force-dynamic";

export default async function EditarPosicionPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRole(["admin", "supervisor"], "/posiciones");

  const supabase = createClient();
  const { data: position } = await supabase
    .from("positions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!position) notFound();

  const action = updatePositionAction.bind(null, params.id);

  return (
    <>
      <PageHeader
        title={`Editar ${position.code}`}
        description="Modificar datos de la posición"
      />
      <PositionForm
        action={action}
        position={position}
        submitLabel="Guardar cambios"
      />
    </>
  );
}
