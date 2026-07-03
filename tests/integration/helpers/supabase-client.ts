import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type ServiceClient = SupabaseClient<Database>;
export type AuthClient = SupabaseClient<Database>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function createServiceClient(): ServiceClient {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function createAnonClient(): AuthClient {
  return createClient<Database>(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function ensureStaffAuthClient(): Promise<{
  client: AuthClient;
  userId: string;
}> {
  const service = createServiceClient();
  const email = requireEnv("TEST_STAFF_EMAIL");
  const password = requireEnv("TEST_STAFF_PASSWORD");
  const client = createAnonClient();

  let signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.data.user) {
    const { error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr && !createErr.message.toLowerCase().includes("already")) {
      throw createErr;
    }
    signIn = await client.auth.signInWithPassword({ email, password });
  }

  const userId = signIn.data.user?.id;
  if (!userId) {
    throw new Error("No se pudo autenticar usuario staff de integración.");
  }

  await service
    .from("profiles")
    .update({ role: "supervisor", full_name: "Integration Staff" })
    .eq("id", userId);

  return { client, userId };
}
