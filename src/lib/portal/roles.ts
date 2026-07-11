import type { UserRole } from "@/lib/types/database";

export function isClientViewer(role: UserRole): boolean {
  return role === "client_viewer";
}

export function homePathForRole(role: UserRole): string {
  return isClientViewer(role) ? "/cliente/stock" : "/dashboard";
}
