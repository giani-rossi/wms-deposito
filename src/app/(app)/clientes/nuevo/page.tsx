import { requireRole } from "@/lib/auth";
import { createClientAction } from "@/lib/actions/clients";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "../_components/client-form";

export const dynamic = "force-dynamic";

export default async function NuevoClientePage() {
  await requireRole(["admin", "supervisor"], "/clientes");

  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        description="Cargá los datos del cliente y sus reglas operativas"
      />
      <ClientForm action={createClientAction} submitLabel="Crear cliente" />
    </>
  );
}
