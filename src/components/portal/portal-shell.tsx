"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Package, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/actions/auth";
import { formatCuitDisplay } from "@/lib/portal/cuit";
import { Button } from "@/components/ui/button";
import type { ClientRow, ProfileRow } from "@/lib/types/database";

const TABS = [
  { href: "/cliente/stock", label: "Mi stock", icon: Package },
  { href: "/cliente/movimientos", label: "Movimientos", icon: ArrowLeftRight },
] as const;

export function PortalShell({
  profile,
  client,
  children,
}: {
  profile: ProfileRow;
  client: ClientRow;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const clientName = client.razon_social?.trim() || client.nombre;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Portal cliente
            </p>
            <h1 className="text-lg font-semibold">{clientName}</h1>
            <p className="text-sm text-muted-foreground">
              CUIT {formatCuitDisplay(client.tax_id)}
            </p>
            {profile.full_name ? (
              <p className="text-xs text-muted-foreground">{profile.full_name}</p>
            ) : null}
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-3">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
