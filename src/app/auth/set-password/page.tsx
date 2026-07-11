import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Warehouse } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export const metadata = {
  title: "Crear contraseña | WMS Depósito",
};

export default async function SetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=auth_session_required");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Warehouse className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Crear contraseña</CardTitle>
          <CardDescription>
            Definí tu contraseña para acceder al portal del depósito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <SetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
