import { createClient } from "@/lib/supabase/server";
import type {
  PortalAuditEventType,
  PortalAuditResource,
} from "@/lib/types/database";

export type PortalAuditInsert = {
  user_id: string;
  client_id: string;
  event_type: PortalAuditEventType;
  resource: PortalAuditResource | null;
  metadata: Record<string, unknown> | null;
};

export function buildPortalAuditInsert(params: {
  userId: string;
  clientId: string;
  eventType: PortalAuditEventType;
  resource?: PortalAuditResource | null;
  metadata?: Record<string, unknown>;
}): PortalAuditInsert {
  return {
    user_id: params.userId,
    client_id: params.clientId,
    event_type: params.eventType,
    resource: params.resource ?? null,
    metadata: params.metadata ?? null,
  };
}

/** Registra evento de auditoría del portal. No lanza: falla silenciosa con log. */
export async function logPortalAuditEvent(params: {
  userId: string;
  clientId: string;
  eventType: PortalAuditEventType;
  resource?: PortalAuditResource | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("portal_audit_events")
      .insert(buildPortalAuditInsert(params));

    if (error) {
      console.error("Portal audit insert failed", error);
    }
  } catch (error) {
    console.error("Portal audit insert failed", error);
  }
}
