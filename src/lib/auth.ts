import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserRole } from "@/lib/types/database";

/**
 * Helpers de autenticación/autorización para Server Components y Actions.
 * `cache()` evita repetir la consulta en el mismo render.
 */

export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
});

/** Devuelve el perfil o redirige al login. Usar en layouts/páginas privadas. */
export async function requireProfile(): Promise<ProfileRow> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Exige que el usuario tenga alguno de los roles dados, o redirige. */
export async function requireRole(
  roles: UserRole[],
  fallback = "/dashboard"
): Promise<ProfileRow> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect(fallback);
  return profile;
}

export function isStaff(role: UserRole) {
  return role === "admin" || role === "supervisor";
}

export function isAdmin(role: UserRole) {
  return role === "admin";
}
