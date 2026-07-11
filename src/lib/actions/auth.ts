"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { homePathForRole, isClientViewer } from "@/lib/portal/roles";
import { logPortalAuditEvent } from "@/lib/portal/audit";
import {
  isPortalAccessDisabled,
  portalAccessStatusAfterLogin,
} from "@/lib/portal/access";
import { PORTAL_DISABLED_LOGIN_MESSAGE } from "@/lib/portal/access-status";
import type { UserRole } from "@/lib/types/database";

export type AuthState = { error?: string } | undefined;

const credentialsSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

async function resolvePostLoginPath(
  userId: string,
  requestedRedirect: string | null
): Promise<{ path: string; error?: string }> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, client_id, portal_access_status")
    .eq("id", userId)
    .single();

  if (!profile) return { path: "/dashboard" };

  if (isClientViewer(profile.role as UserRole)) {
    if (isPortalAccessDisabled(profile.portal_access_status)) {
      const supabase = createClient();
      await supabase.auth.signOut();
      return { path: "/login", error: PORTAL_DISABLED_LOGIN_MESSAGE };
    }

    if (!profile.client_id) {
      return { path: "/login", error: "Tu cuenta no está asociada a un cliente." };
    }

    const now = new Date().toISOString();
    const nextStatus = portalAccessStatusAfterLogin(profile.portal_access_status);

    await admin
      .from("profiles")
      .update({
        portal_access_status: nextStatus,
        portal_last_login_at: now,
      })
      .eq("id", profile.id);

    await logPortalAuditEvent({
      userId: profile.id,
      clientId: profile.client_id,
      eventType: "login",
    });

    return { path: "/cliente/stock" };
  }

  if (
    requestedRedirect &&
    requestedRedirect.startsWith("/") &&
    !requestedRedirect.startsWith("/login") &&
    !requestedRedirect.startsWith("/cliente")
  ) {
    return { path: requestedRedirect };
  }

  return { path: homePathForRole(profile.role as UserRole) };
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Email o contraseña incorrectos" };
  }

  const result = await resolvePostLoginPath(
    data.user.id,
    (formData.get("redirect") as string) || null
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath("/", "layout");
  redirect(result.path);
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
