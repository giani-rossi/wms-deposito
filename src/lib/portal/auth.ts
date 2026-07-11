import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClientRow, ProfileRow } from "@/lib/types/database";
import { isClientViewer } from "@/lib/portal/roles";
import { isPortalAccessDisabled } from "@/lib/portal/access";

export { homePathForRole, isClientViewer } from "@/lib/portal/roles";

export type ClientViewerContext = {
  profile: ProfileRow;
  client: ClientRow;
};

export async function requireClientViewer(): Promise<ClientViewerContext> {
  const profile = await requireProfile();
  if (!isClientViewer(profile.role)) {
    redirect("/dashboard");
  }
  if (isPortalAccessDisabled(profile.portal_access_status)) {
    redirect("/login?error=portal_disabled");
  }
  if (!profile.client_id) {
    redirect("/login");
  }

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", profile.client_id)
    .single();

  if (!client) {
    redirect("/login");
  }

  return { profile, client };
}
