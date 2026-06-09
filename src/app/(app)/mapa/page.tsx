import Link from "next/link";
import { Grid3x3 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { WarehouseMap } from "./_components/warehouse-map";

export const dynamic = "force-dynamic";

export default async function MapaPage() {
  const profile = await getCurrentProfile();
  const canCreate = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  const [{ data: positions }, { data: clients }] = await Promise.all([
    supabase.from("positions").select("*").order("code"),
    supabase.from("clients").select("id, nombre").order("nombre"),
  ]);

  return (
    <>
      <PageHeader
        title="Mapa de depósito"
        description="Matriz de posiciones por columna (A-K), lado (IZQ/DER) y nivel"
      >
        <Link
          href="/posiciones"
          className={buttonVariants({ variant: "outline" })}
        >
          <Grid3x3 className="h-4 w-4" />
          Ver listado
        </Link>
      </PageHeader>

      <WarehouseMap
        positions={positions ?? []}
        clients={clients ?? []}
        canCreate={canCreate}
      />
    </>
  );
}
