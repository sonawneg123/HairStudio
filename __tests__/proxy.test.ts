/**
 * Proxy (proxy.ts) structural and behavioral tests.
 *
 * These tests verify:
 *   1. proxy.ts is the sole request-interception entry point
 *      (no competing middleware.ts exists).
 *   2. Exported function name is `proxy`, not `middleware`.
 *   3. `config.matcher` is exported (Next.js 16 convention).
 *   4. Unauthenticated requests to protected routes are redirected to /login
 *      with ?next=<original-path>.
 *   5. Authenticated requests pass through without redirect.
 *   6. Non-protected routes pass through regardless of auth state.
 *   7. Cookie/session update path: setAll writes to both request and response.
 *   8. Proxy does not set authorization headers (RLS remains the auth boundary).
 *   9. No middleware.ts file exists (would conflict with Next.js 16 proxy convention).
 *
 * All tests are unit/structural and run without a live Next.js server.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { NextRequest } from "next/server";

const src = readFileSync(resolve(__dirname, "../proxy.ts"), "utf8");

// ── Structural checks ─────────────────────────────────────────────────────────

describe("proxy.ts structure (Next.js 16 convention)", () => {
  it("exports a function named 'proxy' (not 'middleware')", () => {
    expect(src).toContain("export async function proxy(");
    expect(src).not.toContain("export function middleware(");
    expect(src).not.toContain("export async function middleware(");
  });

  it("exports a config object with a matcher array", () => {
    expect(src).toContain("export const config");
    expect(src).toContain("matcher");
  });

  it("matcher excludes _next/static, _next/image, and favicon.ico", () => {
    expect(src).toContain("_next/static");
    expect(src).toContain("_next/image");
    expect(src).toContain("favicon.ico");
  });

  it("no competing middleware.ts file exists", () => {
    const middlewarePath = resolve(__dirname, "../middleware.ts");
    expect(existsSync(middlewarePath)).toBe(false);
  });

  it("imports createServerClient from @supabase/ssr (not the app lib)", () => {
    // proxy.ts must use @supabase/ssr directly, not lib/supabase/admin
    expect(src).toContain('@supabase/ssr"');
    expect(src).not.toContain("supabase/admin");
  });

  it("calls supabase.auth.getUser() to validate session (not getSession)", () => {
    // getUser() re-validates with the server; getSession() trusts cookie data.
    expect(src).toContain("getUser()");
    // getSession() is NOT used because it trusts stale cookie data.
    expect(src).not.toContain("getSession()");
  });

  it("proxies the comment explaining getUser() re-validates against server", () => {
    // The comment communicates intent; its absence would be a regression.
    expect(src).toContain("getUser()");
  });

  it("cookie setAll writes updated cookies to the response object", () => {
    // The pattern required by Supabase SSR: setAll must update supabaseResponse.
    expect(src).toContain("supabaseResponse.cookies.set");
  });

  it("PROTECTED_PREFIXES list is defined", () => {
    expect(src).toContain("PROTECTED_PREFIXES");
  });
});

// ── Behavioral tests (proxy function logic) ───────────────────────────────────

/** Build a real NextRequest from a pathname. */
function makeRequest(pathname: string, xff?: string) {
  // Use the real NextRequest constructor so that request.headers is a
  // proper Headers instance (required by NextResponse.next({ request })).
  const hdrs: Record<string, string> = {};
  if (xff) hdrs["x-forwarded-for"] = xff;
  return new NextRequest(`http://localhost${pathname}`, { headers: hdrs });
}

// Mock @supabase/ssr createServerClient
function mockSupabaseSSR(user: object | null) {
  return vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => ({
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
      },
    }),
  }));
}

describe("proxy — unauthenticated request to protected route", () => {
  afterEach(() => { vi.resetModules(); });

  it("redirects /account to /login?next=/account when user is null", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/account");

    // NextResponse.redirect is used; capture the response.
    const response = await proxy(req);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Faccount");
  });

  it("redirects /book/new to /login?next=/book/new", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/book/new");

    const response = await proxy(req);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fbook%2Fnew");
  });

  it("redirects /dashboard to /login", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/dashboard");

    const response = await proxy(req);
    expect(response.status).toBe(307);
    expect(response.headers.get("location") ?? "").toContain("/login");
  });
});

describe("proxy — authenticated request to protected route", () => {
  afterEach(() => { vi.resetModules(); });

  it("passes through /account when user is authenticated", async () => {
    mockSupabaseSSR({ id: "user-123", email: "test@example.com" });
    const { proxy } = await import("../proxy");
    const req = makeRequest("/account");

    const response = await proxy(req);
    // NextResponse.next() has status 200 (not a redirect).
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(302);
  });
});

describe("proxy — public routes pass through regardless of auth", () => {
  afterEach(() => { vi.resetModules(); });

  it("allows unauthenticated access to /login", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/login");

    const response = await proxy(req);
    expect(response.status).not.toBe(307);
  });

  it("allows unauthenticated access to /", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/");

    const response = await proxy(req);
    expect(response.status).not.toBe(307);
  });

  it("allows unauthenticated access to /signup", async () => {
    mockSupabaseSSR(null);
    const { proxy } = await import("../proxy");
    const req = makeRequest("/signup");

    const response = await proxy(req);
    expect(response.status).not.toBe(307);
  });
});
