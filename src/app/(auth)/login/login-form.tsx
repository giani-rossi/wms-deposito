"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { useSearchParams } from "next/navigation";
import { login, signup, type AuthState } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/auth/submit-button";

type Mode = "login" | "signup";

export function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const action = mode === "login" ? login : signup;
  const [state, formAction] = useFormState<AuthState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirect} />

      {mode === "signup" && (
        <div className="space-y-2">
          <Label htmlFor="full_name">Nombre completo</Label>
          <Input
            id="full_name"
            name="full_name"
            placeholder="Juan Pérez"
            autoComplete="name"
            required
          />
        </div>
      )}

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
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <SubmitButton className="w-full" size="lg">
        {mode === "login" ? "Ingresar" : "Crear cuenta"}
      </SubmitButton>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {mode === "login" ? "Crear una" : "Ingresar"}
        </button>
      </p>
    </form>
  );
}
