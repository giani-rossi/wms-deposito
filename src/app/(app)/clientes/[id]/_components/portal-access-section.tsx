"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "react-dom";
import {
  Mail,
  UserPlus,
  Loader2,
  RefreshCw,
  Ban,
  CheckCircle2,
} from "lucide-react";
import {
  invitePortalUserAction,
  resendPortalInviteAction,
  disablePortalAccessAction,
  enablePortalAccessAction,
  type PortalAccessActionState,
} from "@/lib/actions/portal-access";
import { formatCuitDisplay } from "@/lib/portal/cuit";
import { PORTAL_ACCESS_STATUS_LABELS } from "@/lib/portal/access-status";
import { formatDateTime, orDash } from "@/lib/format";
import type { ClientPortalAccessUserView } from "@/lib/types/database";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusVariant(status: ClientPortalAccessUserView["portal_access_status"]) {
  switch (status) {
    case "active":
      return "default" as const;
    case "invited":
      return "secondary" as const;
    case "disabled":
      return "destructive" as const;
  }
}

function InviteForm({
  clientId,
  canInvite,
}: {
  clientId: string;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = invitePortalUserAction.bind(null, clientId);
  const [state, formAction] = useFormState<PortalAccessActionState, FormData>(
    action,
    undefined
  );

  useEffect(() => {
    if (state?.success) {
      router.refresh();
      setOpen(false);
    }
  }, [state?.success, router]);

  if (!canInvite) {
    return (
      <p className="text-sm text-muted-foreground">
        Registrá el CUIT del cliente antes de invitar usuarios al portal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <Button type="button" onClick={() => setOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invitar usuario
        </Button>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="portal-email">Email</Label>
                <Input
                  id="portal-email"
                  name="email"
                  type="email"
                  placeholder="contacto@cliente.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-full_name">Nombre (opcional)</Label>
                <Input
                  id="portal-full_name"
                  name="full_name"
                  placeholder="Nombre del contacto"
                />
              </div>
              {state?.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              {state?.success && (
                <p className="text-sm text-green-700">{state.success}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit">Enviar invitación</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PortalUserActions({
  clientId,
  user,
}: {
  clientId: string;
  user: ClientPortalAccessUserView;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<PortalAccessActionState>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
      if (result?.success) setMessage(result.success);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {user.portal_access_status === "invited" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => resendPortalInviteAction(clientId, user.profile_id))}
        >
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Reenviar
        </Button>
      )}
      {user.portal_access_status !== "disabled" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => disablePortalAccessAction(clientId, user.profile_id))}
        >
          <Ban className="mr-2 h-4 w-4" />
          Deshabilitar
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => run(() => enablePortalAccessAction(clientId, user.profile_id))}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Habilitar
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {message && <p className="text-xs text-green-700">{message}</p>}
    </div>
  );
}

export function PortalAccessSection({
  clientId,
  clientName,
  clientLegalName,
  clientTaxId,
  users,
  canInvite,
}: {
  clientId: string;
  clientName: string;
  clientLegalName: string | null;
  clientTaxId: string | null;
  users: ClientPortalAccessUserView[];
  canInvite: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cliente
            </p>
            <p className="font-medium">{clientName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Razón social
            </p>
            <p>{orDash(clientLegalName)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              CUIT
            </p>
            <p className="font-mono">{formatCuitDisplay(clientTaxId)}</p>
          </div>
        </CardContent>
      </Card>

      <InviteForm clientId={clientId} canInvite={canInvite} />

      {users.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Sin accesos al portal"
          description="Invitá usuarios para que consulten stock y movimientos de este cliente."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Invitación</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.profile_id}>
                  <TableCell>{orDash(user.email)}</TableCell>
                  <TableCell>{orDash(user.full_name)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(user.portal_access_status)}>
                      {PORTAL_ACCESS_STATUS_LABELS[user.portal_access_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(user.portal_invited_at)}</TableCell>
                  <TableCell>{formatDateTime(user.portal_last_login_at)}</TableCell>
                  <TableCell>
                    <PortalUserActions clientId={clientId} user={user} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
