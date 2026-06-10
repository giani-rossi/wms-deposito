"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Boxes, Package, AlertTriangle } from "lucide-react";
import {
  addReceivedUnitContentAction,
  deleteReceivedUnitContentAction,
} from "@/lib/actions/stock";
import { formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  unit_of_measure: string | null;
};

type ContentRow = {
  id: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unit_of_measure: string | null;
  lot: string | null;
  notes: string | null;
};

type UnitItem = {
  id: string;
  code: string;
  displayLabel: string | null;
  typeLabel: string;
  located: boolean;
};

type StockRow = {
  position_code: string | null;
  logistic_unit_code: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_of_measure: string | null;
  entry_date: string | null;
};

type ActionState = { ok: boolean; error?: string } | undefined;

export function ContentSection({
  orderId,
  units,
  products,
  contentsByUnit,
  locatedStock,
  staff,
}: {
  orderId: string;
  units: UnitItem[];
  products: ProductOption[];
  contentsByUnit: Record<string, ContentRow[]>;
  locatedStock: StockRow[];
  staff: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-foreground">
            <Boxes className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Contenido / stock</h3>
          </div>
          <p>
            Acá cargás qué productos/SKU contiene cada pallet, caja, bulto o
            unidad suelta. Esta información permite luego encontrar mercadería
            para órdenes de retiro.
          </p>
          <p>
            Al ubicar la unidad, el contenido se copia a la unidad logística y
            queda como stock consultable. Si todavía no sabés el contenido,
            podés dejar la unidad sin cargar y completarlo después.
          </p>
        </CardContent>
      </Card>

      {units.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin unidades recibidas"
          description="Primero registrá la descarga o creá las unidades recibidas para poder cargar su contenido."
        />
      ) : (
        units.map((u) => (
          <UnitContentCard
            key={u.id}
            orderId={orderId}
            unit={u}
            products={products}
            contents={contentsByUnit[u.id] ?? []}
            staff={staff}
          />
        ))
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="text-sm font-semibold">Stock ubicado (consultable)</h3>
          {locatedStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay stock ubicado. Aparece acá cuando las unidades con
              contenido se ubican en una posición.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Posición</TableHead>
                  <TableHead>Unidad logística</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Ingreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locatedStock.map((s, i) => (
                  <TableRow key={`${s.logistic_unit_code}-${i}`}>
                    <TableCell className="font-medium">{s.product_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.sku ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.position_code ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.logistic_unit_code}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(s.quantity)} {s.unit_of_measure ?? ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.entry_date ? formatDate(s.entry_date) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UnitContentCard({
  orderId,
  unit,
  products,
  contents,
  staff,
}: {
  orderId: string;
  unit: UnitItem;
  products: ProductOption[];
  contents: ContentRow[];
  staff: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">{unit.code}</span>
          {unit.displayLabel && (
            <span className="font-medium">{unit.displayLabel}</span>
          )}
          <Badge variant="secondary">{unit.typeLabel}</Badge>
          {unit.located && (
            <Badge variant="outline" className="gap-1 text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Ya ubicada
            </Badge>
          )}
        </div>

        {contents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Contenido desconocido. Cargá los productos que hay dentro.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Notas</TableHead>
                {staff && <TableHead className="text-right">Acción</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.sku ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{Number(c.quantity)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.unit_of_measure ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.lot ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.notes ?? "—"}
                  </TableCell>
                  {staff && (
                    <TableCell className="text-right">
                      <DeleteContentButton contentId={c.id} orderId={orderId} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {staff && (
          <AddContentForm
            orderId={orderId}
            unitId={unit.id}
            located={unit.located}
            products={products}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AddContentForm({
  orderId,
  unitId,
  located,
  products,
}: {
  orderId: string;
  unitId: string;
  located: boolean;
  products: ProductOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addReceivedUnitContentAction.bind(null, orderId);
  const [state, formAction] = useFormState<ActionState, FormData>(
    action,
    undefined
  );
  const [productId, setProductId] = useState("");

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setProductId("");
      router.refresh();
    }
  }, [state, router]);

  const isNew = productId === "__new__";

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Cargar contenido
      </summary>
      {located && (
        <p className="mb-2 mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Esta unidad ya fue ubicada. El contenido nuevo no se copiará
          automáticamente al stock ubicado. Para actualizar stock en posición,
          se necesitará edición de unidad logística.
        </p>
      )}
      <form ref={formRef} action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="received_unit_id" value={unitId} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`prod-${unitId}`}>Producto</Label>
            <Select
              id={`prod-${unitId}`}
              name="product_id"
              value={isNew ? "" : productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Seleccionar producto…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.sku ? ` (${p.sku})` : ""}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => setProductId(isNew ? "" : "__new__")}
            >
              {isNew ? "Elegir producto existente" : "+ Producto nuevo"}
            </button>
          </div>

          {isNew && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:col-span-1">
              <div className="space-y-2">
                <Label htmlFor={`newname-${unitId}`}>Nombre producto</Label>
                <Input
                  id={`newname-${unitId}`}
                  name="new_product_name"
                  placeholder="iPhone 15"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`newsku-${unitId}`}>SKU</Label>
                <Input id={`newsku-${unitId}`} name="new_product_sku" />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor={`qty-${unitId}`}>Cantidad *</Label>
            <Input
              id={`qty-${unitId}`}
              name="quantity"
              type="number"
              min={1}
              step="any"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`uom-${unitId}`}>Unidad de medida</Label>
            <Input
              id={`uom-${unitId}`}
              name="unit_of_measure"
              placeholder="unidad, caja, kg…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`lot-${unitId}`}>Lote</Label>
            <Input id={`lot-${unitId}`} name="lot" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`cnotes-${unitId}`}>Notas</Label>
            <Textarea id={`cnotes-${unitId}`} name="notes" rows={1} />
          </div>
        </div>

        {state?.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="flex justify-end">
          <SubmitButton>
            <Plus className="h-4 w-4" />
            Agregar contenido
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

function DeleteContentButton({
  contentId,
  orderId,
}: {
  contentId: string;
  orderId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("¿Eliminar esta línea de contenido?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteReceivedUnitContentAction(contentId, orderId);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={isPending}
        aria-label="Eliminar contenido"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
      {error && (
        <p className="max-w-xs text-right text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
