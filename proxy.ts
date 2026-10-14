import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Routes that require an authenticated session.
 * Unauthenticated requests to these prefixes are redirected to /login.
 *
 * RLS and server-side authorization remain the authoritative security
 * boundary; this redirect is a UX guard only.
 */
const PROTECTED_PREFIXES = ["/account", "/book", "/dashboard"];

/**
 * Proxy: refresh the Supabase Auth session on every request and enforce
 * authentication redirects for protected route prefixes.
 *
 * Supabase SSR requires the proxy to call supabase.auth.getUser()
 * so that expired access tokens are refreshed and the updated session
 * cookies are written back to the response before the route handler runs.
 *
 * Without this, Server Components that call createServerClient() will
 * see a stale or missing session after token expiry.
 *
 * Security: getUser() re-validates the session against the Supabase Auth
 * server on every request rather than trusting cookie data alone.
 */
export async function proxy(request: NextRequest) {
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

  // IMPORTANT: do not add logic between createServerClient and getUser().
  // A simple mistake could make session refresh unreliable.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated visitors away from protected routes.
  // This is a UX convenience; all data operations are still gated by
  // server-side auth checks and PostgreSQL RLS.
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the intended destination so the login page can redirect back.
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimisation)
     *   - favicon.ico   (favicon)
     *   - public assets (svg, png, jpg, jpeg, gif, webp)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
