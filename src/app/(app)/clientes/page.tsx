import Link from "next/link";
import { Plus, Search, Pencil, Users, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, isStaff } from "@/lib/auth";
import { PICKING_STRATEGY_LABELS } from "@/lib/constants";
import { orDash } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteClientButton } from "./_components/delete-client-button";
import { ToggleActiveButton } from "./_components/toggle-active-button";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const profile = await getCurrentProfile();
  const staff = profile ? isStaff(profile.role) : false;

  const supabase = createClient();
  let query = supabase
    .from("clients")
    .select("*")
    .order("nombre", { ascending: true });

  if (q) {
    query = query.or(
      `nombre.ilike.%${q}%,razon_social.ilike.%${q}%,contact_name.ilike.%${q}%`
    );
  }

  const { data: clients } = await query;

  return (
    <>
      <PageHeader title="Clientes" description="Empresas que operan en el depósito">
        {staff && (
          <Link href="/clientes/nuevo" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Link>
        )}
      </PageHeader>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <form className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, razón social o contacto"
              className="pl-9"
            />
          </form>

          {!clients || clients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "Sin resultados" : "Todavía no hay clientes"}
              description={
                q
                  ? "Probá con otro término de búsqueda."
                  : "Creá tu primer cliente para empezar a operar."
              }
              action={
                staff && !q ? (
                  <Link href="/clientes/nuevo" className={buttonVariants()}>
                    <Plus className="h-4 w-4" />
                    Nuevo cliente
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Picking</TableHead>
                  <TableHead>Reglas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/clientes/${c.id}`}
                          className="hover:underline"
                        >
                          {c.nombre}
                        </Link>
                        {c.is_active === false && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {orDash(c.razon_social)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="text-sm">{orDash(c.contact_name)}</div>
                      <div className="text-xs">{orDash(c.contact_email)}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {c.default_picking_strategy}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.allow_mixed_logistic_units && (
                          <Badge variant="outline">Mixto</Badge>
                        )}
                        {c.require_photos && (
                          <Badge variant="outline">Fotos</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/clientes/${c.id}`}
                          className={buttonVariants({ variant: "outline" })}
                          aria-label="Ver ficha"
                          title="Ver ficha"
                        >
                          <Eye className="h-4 w-4" />
                          <span>Ver ficha</span>
                        </Link>
                        {staff && (
                          <>
                            <Link
                              href={`/clientes/${c.id}/editar`}
                              className={buttonVariants({
                                variant: "ghost",
                                size: "icon",
                              })}
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <ToggleActiveButton
                              clientId={c.id}
                              isActive={c.is_active !== false}
                            />
                            <DeleteClientButton clientId={c.id} />
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
