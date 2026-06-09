import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { BulkGenerateForm } from "../_components/bulk-generate-form";

export const dynamic = "force-dynamic";

export default async function GenerarPosicionesPage() {
  await requireRole(["admin", "supervisor"], "/posiciones");

  return (
    <>
      <PageHeader
        title="Generar posiciones"
        description="Crear posiciones en lote combinando columnas, lados y niveles"
      />
      <BulkGenerateForm />
    </>
  );
}
