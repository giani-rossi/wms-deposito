"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  FileText,
  ScanLine,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  uploadDocumentAction,
  runOcrAction,
  deleteDocumentAction,
} from "@/lib/actions/inbound";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/empty-state";

type DocFile = {
  id: string;
  path: string;
  file_type: string | null;
  created_at: string;
  url: string | null;
};

export function DocumentSection({
  orderId,
  files,
}: {
  orderId: string;
  files: DocFile[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Seleccioná un archivo.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadDocumentAction(orderId, fd);
      if (!res.ok) {
        setError(res.error ?? "No se pudo subir el archivo.");
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  function onOcr(fileId: string) {
    setError(null);
    setBusyId(fileId);
    startTransition(async () => {
      const res = await runOcrAction(orderId, fileId);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "No se pudo ejecutar el OCR.");
        return;
      }
      router.refresh();
    });
  }

  function onDelete(fileId: string) {
    if (!window.confirm("¿Eliminar este documento?")) return;
    setError(null);
    setBusyId(fileId);
    startTransition(async () => {
      const res = await deleteDocumentAction(fileId, orderId);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error ?? "No se pudo eliminar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-secondary/80"
        />
        <Button type="button" onClick={onUpload} disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Subir documento
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Se guarda en el bucket <span className="font-medium">wms-files</span> y
        se registra en <span className="font-medium">uploaded_files</span>. El
        OCR automático funciona con imágenes (JPG/PNG).
      </p>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="Subí la foto o el archivo del remito para poder ejecutar el OCR."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {files.map((f) => {
            const isImage = f.file_type?.startsWith("image/");
            const name = f.path.split("/").pop() ?? f.path;
            return (
              <li
                key={f.id}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(f.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {f.url && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isPending || !isImage}
                    title={
                      isImage
                        ? "Ejecutar OCR"
                        : "OCR automático solo para imágenes"
                    }
                    onClick={() => onOcr(f.id)}
                  >
                    {busyId === f.id && isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ScanLine className="h-4 w-4" />
                    )}
                    OCR
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => onDelete(f.id)}
                    aria-label="Eliminar documento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
