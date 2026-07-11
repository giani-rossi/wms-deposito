"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import {
  canManagePortalAccess,
  clientHasInvitableCuit,
  normalizePortalEmail,
  validatePortalInviteEmail,
} from "@/lib/portal/access";
import { portalInviteSchema } from "@/lib/validation/portal-access";
import { getPortalInviteRedirectUrl } from "@/lib/portal/site-url";
import type { ProfileRow, UserRole } from "@/lib/types/database";

export type PortalAccessActionState = { error?: string; success?: string } | undefined;

async function requirePortalManager() {
  const profile = await requireProfile();
  if (!canManagePortalAccess(profile.role)) {
    throw new Error("FORBIDDEN");
  }
  return profile;
}

function forbiddenState(): PortalAccessActionState {
  return { error: "No tenés permisos para gestionar accesos al portal." };
}

async function loadClientForInvite(admin: ReturnType<typeof createAdminClient>, clientId: string) {
  const { data: client, error } = await admin
    .from("clients")
    .select("id, nombre, tax_id, is_active")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    return { error: "Cliente no encontrado." as const, client: null };
  }

  if (client.is_active === false) {
    return { error: "El cliente está inactivo." as const, client: null };
  }

  if (!clientHasInvitableCuit(client.tax_id)) {
    return {
      error:
        "El cliente debe tener CUIT registrado (tax_id con solo dígitos) antes de invitar usuarios al portal.",
      client: null,
    };
  }

  return { error: null, client };
}

async function findProfileByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<Pick<ProfileRow, "id" | "email" | "role" | "client_id" | "portal_access_status"> | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, email, role, client_id, portal_access_status")
    .ilike("email", email)
    .maybeSingle();

  if (!data?.email) return data;

  if (normalizePortalEmail(data.email) === email) {
    return data;
  }

  const { data: rows } = await admin
    .from("profiles")
    .select("id, email, role, client_id, portal_access_status")
    .not("email", "is", null);

  return (
    rows?.find((row) => row.email && normalizePortalEmail(row.email) === email) ??
    null
  );
}

function mapEmailConflict(reason: "staff_user" | "other_client"): string {
  if (reason === "staff_user") {
    return "Este email pertenece a un usuario interno del WMS. Usá otro email para el portal.";
  }
  return "Este email ya tiene acceso al portal de otro cliente.";
}

async function upsertPortalProfile(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    userId: string;
    email: string;
    fullName?: string;
    clientId: string;
    invitedBy: string;
    portalAccessStatus: "invited" | "active";
  }
) {
  const now = new Date().toISOString();
  const { error } = await admin.from("profiles").upsert(
    {
      id: params.userId,
      email: params.email,
      full_name: params.fullName ?? params.email,
      role: "client_viewer" as UserRole,
      client_id: params.clientId,
      portal_access_status: params.portalAccessStatus,
      portal_invited_at: now,
      portal_invited_by: params.invitedBy,
      portal_disabled_at: null,
      portal_disabled_by: null,
    },
    { onConflict: "id" }
  );

  if (error) {
    throw error;
  }
}

async function sendAuthInvite(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  fullName?: string
) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: getPortalInviteRedirectUrl(),
    data: fullName ? { full_name: fullName } : undefined,
  });

  if (error) {
    throw error;
  }

  if (!data.user?.id) {
    throw new Error("No se pudo crear el usuario invitado en Auth.");
  }

  return data.user.id;
}

export async function invitePortalUserAction(
  clientId: string,
  _prev: PortalAccessActionState,
  formData: FormData
): Promise<PortalAccessActionState> {
  let actor;
  try {
    actor = await requirePortalManager();
  } catch {
    return forbiddenState();
  }

  const parsed = portalInviteSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const admin = createAdminClient();
  const { error: clientError, client } = await loadClientForInvite(admin, clientId);
  if (clientError || !client) {
    return { error: clientError ?? "Cliente no encontrado." };
  }

  const email = parsed.data.email;
  const existing = await findProfileByEmail(admin, email);
  const conflict = validatePortalInviteEmail({
    email,
    clientId,
    existingRole: existing?.role ?? null,
    existingClientId: existing?.client_id ?? null,
  });

  if (!conflict.ok) {
    return { error: mapEmailConflict(conflict.reason) };
  }

  try {
    if (existing?.client_id === clientId && existing.role === "client_viewer") {
      await sendAuthInvite(admin, email, parsed.data.full_name);
      await upsertPortalProfile(admin, {
        userId: existing.id,
        email,
        fullName: parsed.data.full_name ?? existing.email ?? email,
        clientId,
        invitedBy: actor.id,
        portalAccessStatus: "invited",
      });
      revalidatePath(`/clientes/${clientId}`);
      return { success: "Invitación reenviada al usuario existente." };
    }

    const userId = await sendAuthInvite(admin, email, parsed.data.full_name);
    await upsertPortalProfile(admin, {
      userId,
      email,
      fullName: parsed.data.full_name,
      clientId,
      invitedBy: actor.id,
      portalAccessStatus: "invited",
    });

    revalidatePath(`/clientes/${clientId}`);
    return { success: "Invitación enviada. El usuario recibirá un email para definir su contraseña." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar la invitación.";
    return { error: message };
  }
}

export async function resendPortalInviteAction(
  clientId: string,
  profileId: string
): Promise<PortalAccessActionState> {
  let actor;
  try {
    actor = await requirePortalManager();
  } catch {
    return forbiddenState();
  }

  const admin = createAdminClient();
  const { data: portalUser, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, client_id, portal_access_status")
    .eq("id", profileId)
    .eq("client_id", clientId)
    .eq("role", "client_viewer")
    .single();

  if (error || !portalUser?.email) {
    return { error: "Usuario del portal no encontrado." };
  }

  try {
    await sendAuthInvite(admin, normalizePortalEmail(portalUser.email), portalUser.full_name ?? undefined);
    await upsertPortalProfile(admin, {
      userId: portalUser.id,
      email: normalizePortalEmail(portalUser.email),
      fullName: portalUser.full_name ?? undefined,
      clientId,
      invitedBy: actor.id,
      portalAccessStatus: "invited",
    });
    revalidatePath(`/clientes/${clientId}`);
    return { success: "Invitación reenviada." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo reenviar la invitación.";
    return { error: message };
  }
}

export async function disablePortalAccessAction(
  clientId: string,
  profileId: string
): Promise<PortalAccessActionState> {
  let actor;
  try {
    actor = await requirePortalManager();
  } catch {
    return forbiddenState();
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .update({
      portal_access_status: "disabled",
      portal_disabled_at: now,
      portal_disabled_by: actor.id,
    })
    .eq("id", profileId)
    .eq("client_id", clientId)
    .eq("role", "client_viewer")
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No se pudo deshabilitar el acceso." };
  }

  // TODO: opcional ban en Supabase Auth (auth.admin.updateUserById ban_duration)

  revalidatePath(`/clientes/${clientId}`);
  return { success: "Acceso al portal deshabilitado." };
}

export async function enablePortalAccessAction(
  clientId: string,
  profileId: string
): Promise<PortalAccessActionState> {
  try {
    await requirePortalManager();
  } catch {
    return forbiddenState();
  }

  const admin = createAdminClient();
  const { data: portalUser } = await admin
    .from("profiles")
    .select("portal_last_login_at")
    .eq("id", profileId)
    .eq("client_id", clientId)
    .eq("role", "client_viewer")
    .single();

  const nextStatus = portalUser?.portal_last_login_at ? "active" : "invited";

  const { data, error } = await admin
    .from("profiles")
    .update({
      portal_access_status: nextStatus,
      portal_disabled_at: null,
      portal_disabled_by: null,
    })
    .eq("id", profileId)
    .eq("client_id", clientId)
    .eq("role", "client_viewer")
    .select("id")
    .single();

  if (error || !data) {
    return { error: "No se pudo habilitar el acceso." };
  }

  revalidatePath(`/clientes/${clientId}`);
  return { success: "Acceso al portal habilitado." };
}

/** Lista accesos portal de un cliente (server component). */
export async function listPortalAccessUsers(clientId: string) {
  const profile = await requireProfile();
  if (!canManagePortalAccess(profile.role)) {
    return [];
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("client_portal_access_users")
    .select("*")
    .eq("client_id", clientId)
    .order("portal_invited_at", { ascending: false });

  return data ?? [];
}
