import { requireRole } from "@/lib/auth";
import { createPositionAction } from "@/lib/actions/positions";
import {
  RACK_COLUMNS,
  POSITION_SIDES,
  POSITION_LEVELS,
  VISIBLE_POSITION_TYPES,
} from "@/lib/constants";
import type { PositionType } from "@/lib/types/database";
import { PageHeader } from "@/components/layout/page-header";
import {
  PositionForm,
  type PositionFormDefaults,
} from "../_components/position-form";

export const dynamic = "force-dynamic";

export default async function NuevaPosicionPage({
  searchParams,
}: {
  searchParams: {
    column?: string;
    side?: string;
    level?: string;
    type?: string;
  };
}) {
  await requireRole(["admin", "supervisor"], "/posiciones");

  // Sanitizar query params para prellenar el formulario (alta desde el mapa)
  const validTypes = VISIBLE_POSITION_TYPES.map((t) => t.value);
  const column = (searchParams.column ?? "").toUpperCase();
  const side = (searchParams.side ?? "").toUpperCase();
  const level = (searchParams.level ?? "").toUpperCase();
  const type = (searchParams.type ?? "") as PositionType;

  const defaults: PositionFormDefaults = {
    type: validTypes.includes(type) ? type : undefined,
    column: (RACK_COLUMNS as readonly string[]).includes(column)
      ? column
      : undefined,
    side: (POSITION_SIDES as readonly string[]).includes(side)
      ? side
      : undefined,
    level: (POSITION_LEVELS as readonly string[]).includes(level)
      ? level
      : undefined,
  };

  return (
    <>
      <PageHeader
        title="Nueva posición"
        description="Crear una posición de rack o de piso"
      />
      <PositionForm
        action={createPositionAction}
        defaults={defaults}
        submitLabel="Crear posición"
      />
    </>
  );
}
