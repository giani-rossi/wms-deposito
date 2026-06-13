"use client";

import { useState } from "react";
import Link from "next/link";
import { SplitSquareVertical } from "lucide-react";
import { formatReceivedUnitHeading } from "@/lib/constants";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProcessableUnit } from "@/lib/processing/processable-unit";
import {
  ProcessUnitWizard,
} from "@/app/(app)/clasificacion/_components/process-unit-wizard";

export function ClassificationWorkspace({
  units,
  staff,
}: {
  units: ProcessableUnit[];
  staff: boolean;
}) {
  const [target, setTarget] = useState<ProcessableUnit | null>(null);

  return (
    <>
      {units.length === 0 ? (
        <EmptyState
          icon={SplitSquareVertical}
          title="Sin unidades pendientes de procesamiento"
          description="Cuando marques flags de clasificación, desconsolidación, armado o reembalaje en una unidad recibida — y cargues su contenido — aparecerán acá para procesar."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {units.length} unidad{units.length === 1 ? "" : "es"} pendientes.
            El procesamiento mueve el 100% del contenido a unidades logísticas
            resultantes en piso ingreso.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Procesamiento</TableHead>
                <TableHead>Contenido</TableHead>
                {staff && <TableHead className="text-right">Acción</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {formatReceivedUnitHeading(u)}
                  </TableCell>
                  <TableCell>{u.clientName}</TableCell>
                  <TableCell>
                    <Link
                      href={`/ordenes-ingreso/${u.inbound_order_id}`}
                      className="hover:underline"
                    >
                      {u.orderLabel}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.flagLabels.map((f) => (
                        <Badge key={f} variant="secondary">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.hasContent ? (
                      <span className="text-sm text-muted-foreground">
                        {u.contents.length} producto
                        {u.contents.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="text-sm text-amber-700">
                        Sin contenido
                      </span>
                    )}
                  </TableCell>
                  {staff && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setTarget(u)}
                      >
                        <SplitSquareVertical className="h-4 w-4" />
                        Procesar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <ProcessUnitWizard unit={target} onClose={() => setTarget(null)} />
    </>
  );
}
