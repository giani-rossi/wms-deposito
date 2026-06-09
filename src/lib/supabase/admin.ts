import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Cliente de Supabase con service role key. SOLO para uso en servidor
 * (Server Actions / Route Handlers). Ignora RLS: usar con cuidado y nunca
 * exponer al browser. Útil para operaciones administrativas y para escribir
 * registros de auditoría/movimientos garantizando consistencia.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
