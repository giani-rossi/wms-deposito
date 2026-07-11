"use client";

import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "@/lib/actions/auth";
import { PORTAL_DISABLED_LOGIN_MESSAGE } from "@/lib/portal/access-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/auth/submit-button";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const queryError = searchParams.get("error");

  const queryErrorMessage =
    queryError === "portal_disabled" ? PORTAL_DISABLED_LOGIN_MESSAGE : null;

  const [state, formAction] = useFormState<AuthState, FormData>(
    login,
    undefined
  );

  const errorMessage = state?.error ?? queryErrorMessage;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirect} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="operador@deposito.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      {errorMessage && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <SubmitButton className="w-full" size="lg">
        Ingresar
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        Si necesitás acceso, solicitáselo a la administración del depósito.
      </p>
    </form>
  );
}
