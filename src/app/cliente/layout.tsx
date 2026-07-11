import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/portal-shell";
import { requireClientViewer } from "@/lib/portal/auth";

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, client } = await requireClientViewer();

  return (
    <PortalShell profile={profile} client={client}>
      {children}
    </PortalShell>
  );
}
