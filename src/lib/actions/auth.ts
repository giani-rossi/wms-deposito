"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homePathForRole, isClientViewer } from "@/lib/portal/roles";
import { logPortalAuditEvent } from "@/lib/portal/audit";
import type { UserRole } from "@/lib/types/database";

export type AuthState = { error?: string } | undefined;

const credentialsSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const signupSchema = credentialsSchema.extend({
  full_name: z.string().min(2, "Ingresá tu nombre completo"),
});

async function resolvePostLoginPath(
  userId: string,
  requestedRedirect: string | null
): Promise<string> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, client_id")
    .eq("id", userId)
    .single();

  if (!profile) return "/dashboard";

  if (isClientViewer(profile.role as UserRole) && profile.client_id) {
    await logPortalAuditEvent({
      profileId: profile.id,
      clientId: profile.client_id,
      eventType: "login",
    });
    return "/cliente/stock";
  }

  if (
    requestedRedirect &&
    requestedRedirect.startsWith("/") &&
    !requestedRedirect.startsWith("/login") &&
    !requestedRedirect.startsWith("/cliente")
  ) {
    return requestedRedirect;
  }

  return homePathForRole(profile.role as UserRole);
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

  const redirectTo = await resolvePostLoginPath(
    data.user.id,
    (formData.get("redirect") as string) || null
  );
  revalidatePath("/", "layout");
  redirect(redirectTo);
}

export async function signup(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    full_name: formData.get("full_name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Datos inválidos" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
