import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isClientViewer } from "@/lib/portal/roles";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (isClientViewer(profile.role)) {
    redirect("/cliente/stock");
  }
  return <AppShell profile={profile}>{children}</AppShell>;
}
