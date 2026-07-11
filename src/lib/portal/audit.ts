import { createClient } from "@/lib/supabase/server";
import type { PortalAuditEventType } from "@/lib/types/database";

export async function logPortalAuditEvent(params: {
  profileId: string;
  clientId: string;
  eventType: PortalAuditEventType;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createClient();
  await supabase.from("portal_audit_events").insert({
    profile_id: params.profileId,
    client_id: params.clientId,
    event_type: params.eventType,
    metadata: params.metadata ?? null,
  });
}
