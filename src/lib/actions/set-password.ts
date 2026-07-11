"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPortalAccessDisabled } from "@/lib/portal/access";
import { postSetPasswordRedirectPath } from "@/lib/portal/access-auth";
import { PORTAL_DISABLED_LOGIN_MESSAGE } from "@/lib/portal/access-status";
import type { UserRole } from "@/lib/types/database";

export type SetPasswordState = { error?: string } | undefined;

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirm_password: z.string().min(6, "Confirmá la contraseña"),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Las contraseñas no coinciden",
    path: ["confirm_password"],
  });

export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "Tu sesión expiró. Abrí nuevamente el link del email de invitación o acceso.",
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, portal_access_status, client_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return { error: "No se encontró el perfil de usuario." };
  }

  if (isPortalAccessDisabled(profile.portal_access_status)) {
    await supabase.auth.signOut();
    return { error: PORTAL_DISABLED_LOGIN_MESSAGE };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (updateError) {
    return { error: updateError.message };
  }

  const now = new Date().toISOString();
  await admin
    .from("profiles")
    .update({
      portal_access_status: "active",
      portal_last_login_at: now,
    })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  redirect(postSetPasswordRedirectPath(profile.role as UserRole));
}
