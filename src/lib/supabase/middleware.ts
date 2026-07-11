import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, PortalAccessStatus, UserRole } from "@/lib/types/database";
import { homePathForRole, isClientViewer } from "@/lib/portal/roles";
import { isPortalAccessDisabled } from "@/lib/portal/access";

/**
 * Refresca la sesión de Supabase en cada request y mantiene las cookies
 * sincronizadas entre el browser y el servidor. Debe llamarse desde el
 * middleware de Next.js.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: no insertar lógica entre createServerClient y getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login");
  const isClienteRoute = pathname === "/cliente" || pathname.startsWith("/cliente/");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    pathname === "/favicon.ico";

  let role: UserRole | null = null;
  let portalAccessStatus: PortalAccessStatus | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, portal_access_status")
      .eq("id", user.id)
      .single();
    role = profile?.role ?? null;
    portalAccessStatus = profile?.portal_access_status ?? null;
  }

  const portalDisabled =
    !!user &&
    !!role &&
    isClientViewer(role) &&
    isPortalAccessDisabled(portalAccessStatus);

  // Sin sesión y en ruta privada -> al login
  if (!user && !isAuthRoute && !isPublicAsset && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // client_viewer deshabilitado -> login con mensaje (no entra al portal)
  if (portalDisabled && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "portal_disabled");
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  // Con sesión y entrando al login -> home según rol
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = role ? homePathForRole(role) : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // client_viewer solo en portal cliente
  if (user && role && isClientViewer(role) && !isClienteRoute && !isPublicAsset && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/cliente/stock";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Staff no accede al portal cliente
  if (user && role && !isClientViewer(role) && isClienteRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
