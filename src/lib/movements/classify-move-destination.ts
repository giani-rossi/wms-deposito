import { POSITION_STATUS_LABELS, positionSelectLabel } from "@/lib/constants";
import type { PositionStatus } from "@/lib/types/database";

export type MoveDestinationKind =
  | "assigned_same_client"
  | "unassigned_free"
  | "same_client_occupied"
  | "occupied_other_client"
  | "assigned_other_client"
  | "blocked_or_incident";

export type ClassifyMoveDestinationInput = {
  position: {
    code: string;
    status: PositionStatus;
    assigned_client_id: string | null;
  };
  unitClientId: string;
  occupantClientIds: string[];
  /** Resuelve nombre de cliente para labels (ej. dropdown). */
  getClientName?: (clientId: string) => string | null;
};

export type ClassifyMoveDestinationResult = {
  kind: MoveDestinationKind;
  requiresOverride: boolean;
  /** Si el usuario confirma override, la nota es obligatoria. */
  requiresNote: boolean;
  warningMessage: string | null;
  optionLabel: string;
  overrideNoteFragments: string[];
};

function isBlockedStatus(status: PositionStatus): boolean {
  return status === "blocked" || status === "incident";
}

/**
 * Clasifica una posición destino para movimiento interno de UL.
 * Usado en server action y en UI del modal Mover.
 */
export function classifyMoveDestination(
  input: ClassifyMoveDestinationInput
): ClassifyMoveDestinationResult {
  const { position, unitClientId, occupantClientIds, getClientName } = input;
  const statusLabel = POSITION_STATUS_LABELS[position.status];
  const isBlocked = isBlockedStatus(position.status);
  const assignedToOther =
    position.assigned_client_id != null &&
    position.assigned_client_id !== unitClientId;
  const assignedToSame = position.assigned_client_id === unitClientId;
  const occupantsOther = occupantClientIds.some((id) => id !== unitClientId);
  const occupantsSame = occupantClientIds.some((id) => id === unitClientId);
  const hasOccupants = occupantClientIds.length > 0;

  let kind: MoveDestinationKind;
  if (isBlocked) {
    kind = "blocked_or_incident";
  } else if (assignedToOther) {
    kind = "assigned_other_client";
  } else if (occupantsOther) {
    kind = "occupied_other_client";
  } else if (occupantsSame && hasOccupants) {
    kind = "same_client_occupied";
  } else if (assignedToSame) {
    kind = "assigned_same_client";
  } else {
    kind = "unassigned_free";
  }

  const requiresOverride =
    kind === "blocked_or_incident" ||
    kind === "assigned_other_client" ||
    kind === "occupied_other_client";

  const overrideNoteFragments: string[] = [];
  if (isBlocked) {
    overrideNoteFragments.push("Override: destino bloqueado/en revisión");
  }
  if (assignedToOther) {
    overrideNoteFragments.push("Override: posición asignada a otro cliente");
  }
  if (occupantsOther) {
    overrideNoteFragments.push(
      "Override: mercadería de otro cliente en destino"
    );
  }

  let warningMessage: string | null = null;
  switch (kind) {
    case "unassigned_free":
      warningMessage = "Esta posición no está asignada al cliente.";
      break;
    case "same_client_occupied":
      warningMessage =
        "La posición ya contiene mercadería de este cliente.";
      break;
    case "occupied_other_client":
      warningMessage =
        "La posición destino contiene mercadería de otro cliente.";
      break;
    case "assigned_other_client":
      warningMessage = "La posición destino está asignada a otro cliente.";
      break;
    case "blocked_or_incident":
      warningMessage =
        "La posición destino está bloqueada o en revisión.";
      break;
    default:
      warningMessage = null;
  }

  const displayCode = positionSelectLabel(position.code);

  let optionLabel: string;
  switch (kind) {
    case "assigned_same_client":
      optionLabel = `${displayCode} · ${statusLabel} · Asignada a ${
        getClientName?.(unitClientId) ?? "este cliente"
      }`;
      break;
    case "unassigned_free":
      optionLabel = `${displayCode} · ${statusLabel} · Sin asignar`;
      break;
    case "same_client_occupied":
      optionLabel = `${displayCode} · ${statusLabel} · Mismo cliente`;
      break;
    case "assigned_other_client":
      optionLabel = `${displayCode} · ${statusLabel} · Asignada a otro cliente`;
      break;
    case "occupied_other_client":
      optionLabel = `${displayCode} · ${statusLabel} · Otro cliente`;
      break;
    case "blocked_or_incident":
      optionLabel = `${displayCode} · ${statusLabel}`;
      break;
  }

  return {
    kind,
    requiresOverride,
    requiresNote: requiresOverride,
    warningMessage,
    optionLabel,
    overrideNoteFragments,
  };
}

/** Mensaje de error cuando falta override (server). */
export function moveDestinationOverrideRequiredMessage(
  result: ClassifyMoveDestinationResult
): string {
  return (
    result.warningMessage ??
    "Esta posición requiere confirmación de staff (override) para mover."
  );
}
