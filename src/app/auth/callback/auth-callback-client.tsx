"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  getAuthCallbackLoginError,
  hasAuthCallbackCredentials,
  isSupabaseAuthErrorExpired,
  parseAuthCallbackUrl,
  resolveAuthCallbackNextPath,
} from "@/lib/portal/auth-callback";

export function AuthCallbackClient() {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function completeAuthCallback() {
      const params = parseAuthCallbackUrl(window.location.href);
      const next = resolveAuthCallbackNextPath(params);

      const loginError = getAuthCallbackLoginError(params);
      if (loginError) {
        router.replace(`/login?error=${loginError}`);
        return;
      }

      const supabase = createClient();

      try {
        if (params.tokenHash && params.type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: params.tokenHash,
            type: params.type as EmailOtpType,
          });
          if (error) throw error;
        } else if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
        } else if (params.hashAccessToken && params.hashRefreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: params.hashAccessToken,
            refresh_token: params.hashRefreshToken,
          });
          if (error) throw error;
        } else if (!hasAuthCallbackCredentials(params)) {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
            router.replace("/login?error=auth_link_expired");
            return;
          }
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.replace("/login?error=auth_link_expired");
          return;
        }

        router.replace(next);
      } catch (error) {
        if (isSupabaseAuthErrorExpired(error)) {
          router.replace("/login?error=auth_link_expired");
          return;
        }

        router.replace("/login?error=auth_callback_error");
      }
    }

    void completeAuthCallback();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">Validando acceso…</p>
    </div>
  );
}
