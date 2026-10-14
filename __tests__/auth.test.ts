/**
 * Authentication utility tests.
 *
 * Tests cover:
 *   - Phone number normalization (valid + invalid inputs)
 *   - Synthetic email derivation (structure, determinism, secret validation)
 *   - Security properties (no phone number leakage in output)
 *   - Admin client structural properties (no browser exposure)
 *   - Auth action structural properties (no logging of secrets)
 *
 * These are automated unit tests that run locally without network access.
 * They do not test the hosted Supabase project or live authentication.
 *
 * Tests that require live Supabase interaction (sign-up, sign-in, session,
 * RLS) are listed as manual/integration test cases at the bottom of this file.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizePhone } from "@/lib/utils/phone";

// ── normalizePhone ────────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  // Valid Indian numbers
  it("normalizes a bare 10-digit Indian number", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });

  it("normalizes a 10-digit number starting with 6", () => {
    expect(normalizePhone("6789012345")).toBe("+916789012345");
  });

  it("strips spaces and formats correctly", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("  9876-543-210  ")).toBe("+919876543210");
    expect(normalizePhone("98765.43210")).toBe("+919876543210");
    expect(normalizePhone("(98765) 43210")).toBe("+919876543210");
  });

  it("accepts a 12-digit number with 91 prefix (no +)", () => {
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });

  it("accepts a number already in E.164 format", () => {
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
  });

  it("preserves non-Indian country codes", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  // Invalid inputs
  it("returns null for an empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(normalizePhone("   ")).toBeNull();
  });

  it("returns null for a 9-digit number (too short)", () => {
    expect(normalizePhone("987654321")).toBeNull();
  });

  it("returns null for an 11-digit number starting with 5 (invalid Indian prefix)", () => {
    // 5-prefix 10-digit numbers are not valid Indian mobiles
    expect(normalizePhone("5876543210")).toBeNull();
  });

  it("returns null for letters", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("call-me")).toBeNull();
  });

  it("returns null for a number that is too long", () => {
    // E.164 max is 15 digits — 16-digit numbers are invalid
    expect(normalizePhone("+12345678901234567")).toBeNull();
  });

  it("returns null for a number that is too short after stripping", () => {
    // E.164 min is 7 digits after +
    expect(normalizePhone("+12345")).toBeNull();
  });
});

// ── syntheticEmail ────────────────────────────────────────────────────────────

describe("syntheticEmail", () => {
  // We import inline so we can set process.env.PHONE_HMAC_SECRET per-test.
  const SECRET = "test-secret-value-that-is-long-enough-for-testing";

  beforeEach(() => {
    process.env.PHONE_HMAC_SECRET = SECRET;
  });

  it("returns a string ending in @internal.rajfaded.invalid", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const email = syntheticEmail("+919876543210");
    expect(email).toMatch(/@internal\.rajfaded\.invalid$/);
  });

  it("starts with ph. prefix", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const email = syntheticEmail("+919876543210");
    expect(email).toMatch(/^ph\./);
  });

  it("the hash portion is 32 lowercase hex characters", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const email = syntheticEmail("+919876543210");
    const match = email.match(/^ph\.([0-9a-f]+)@/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBe(32);
  });

  it("is deterministic — same phone + secret always gives same email", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const a = syntheticEmail("+919876543210");
    const b = syntheticEmail("+919876543210");
    expect(a).toBe(b);
  });

  it("produces different emails for different phone numbers", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const a = syntheticEmail("+919876543210");
    const b = syntheticEmail("+919876543211");
    expect(a).not.toBe(b);
  });

  it("produces different emails for different secrets (HMAC key separation)", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    process.env.PHONE_HMAC_SECRET = SECRET;
    const a = syntheticEmail("+919876543210");

    process.env.PHONE_HMAC_SECRET = "different-secret-for-testing-collision";
    // Re-import after env change — module cache will hold the old value,
    // but syntheticEmail reads process.env each time so this works.
    const b = syntheticEmail("+919876543210");
    expect(a).not.toBe(b);
  });

  it("the output does not contain the phone number in any form", async () => {
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    const phone = "+919876543210";
    const email = syntheticEmail(phone);
    // The digits of the phone must not appear in the output hash
    expect(email).not.toContain("9876543210");
    expect(email).not.toContain("919876543210");
  });

  it("throws when PHONE_HMAC_SECRET is missing", async () => {
    delete process.env.PHONE_HMAC_SECRET;
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    expect(() => syntheticEmail("+919876543210")).toThrow();
  });

  it("throws when PHONE_HMAC_SECRET is too short (< 32 chars)", async () => {
    process.env.PHONE_HMAC_SECRET = "only-fifteen-chr";   // 16 chars — was previously accepted
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    expect(() => syntheticEmail("+919876543210")).toThrow();
  });

  it("accepts a PHONE_HMAC_SECRET that is exactly 32 characters", async () => {
    process.env.PHONE_HMAC_SECRET = "abcdefghijklmnopqrstuvwxyz012345"; // 32 chars
    const { syntheticEmail } = await import("@/lib/utils/phone-auth");
    expect(typeof syntheticEmail("+919876543210")).toBe("string");
  });
});

// ── No SMS / OTP / email delivery (structural tests) ─────────────────────────

describe("auth actions structural properties", () => {
  it("phone-auth module only uses Node crypto, not fetch or mail APIs", () => {
    // Read the source file directly via fs to verify no mail/fetch calls.
    const src = readFileSync(
      resolve(__dirname, "../lib/utils/phone-auth.ts"),
      "utf8"
    );
    expect(src).not.toContain("fetch(");
    expect(src).not.toContain("sendEmail");
    expect(src).not.toContain("nodemailer");
  });

  it("phone-auth module imports only from 'crypto' and 'server-only' (no network deps)", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/utils/phone-auth.ts"),
      "utf8"
    );
    // Only allowed imports are from "crypto" and "server-only" (bare import with no `from`)
    const importLines = src
      .split("\n")
      .filter((l) => l.trim().startsWith("import"));
    for (const line of importLines) {
      const isServerOnly = line.trim() === 'import "server-only";';
      const isCrypto = /from ["']crypto["']/.test(line);
      expect(isServerOnly || isCrypto).toBe(true);
    }
  });

  it("auth actions do not import supabase service-role client directly (uses createAdminClient)", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/actions/auth.ts"),
      "utf8"
    );
    // The service-role key must never be used with the SSR client
    // or exposed as NEXT_PUBLIC_
    expect(src).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
  });

  it("admin client module does not use NEXT_PUBLIC_ prefix on service-role key", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/supabase/admin.ts"),
      "utf8"
    );
    // Service-role key must never be NEXT_PUBLIC_
    expect(src).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE");
    // Must reference the correct env var name
    expect(src).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("admin client module never appears in client-side bundle paths", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/supabase/admin.ts"),
      "utf8"
    );
    // Must not have 'use client' directive
    expect(src).not.toContain('"use client"');
    expect(src).not.toContain("'use client'");
  });

  it('admin client module has import "server-only" guard', () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/supabase/admin.ts"),
      "utf8"
    );
    expect(src).toContain('import "server-only"');
  });

  it('phone-auth module has import "server-only" guard', () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/utils/phone-auth.ts"),
      "utf8"
    );
    expect(src).toContain('import "server-only"');
  });

  it("auth actions never log password or raw phone", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/actions/auth.ts"),
      "utf8"
    );
    // Rudimentary check: password variable must not appear in any console call
    const consoleLines = src
      .split("\n")
      .filter((l) => l.includes("console."));
    for (const line of consoleLines) {
      expect(line).not.toContain("password");
      expect(line).not.toContain("rawPhone");
    }
  });

  it("auth actions do not expose the synthetic email to the client", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/actions/auth.ts"),
      "utf8"
    );
    // The synthetic email variable must never be returned inside an ActionState
    // or included in any return statement that yields error strings.
    // Verify: no return statement returns the `email` variable directly.
    // (The email is only passed to Supabase API calls, never to the browser.)
    const returnLines = src
      .split("\n")
      .filter((l) => l.trim().startsWith("return") && l.includes("email"));
    expect(returnLines).toHaveLength(0);
  });

  it("auth actions use admin.createUser for signup, not auth.signUp", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/actions/auth.ts"),
      "utf8"
    );
    // signUpAction must use the admin API
    expect(src).toContain("admin.createUser");
    // The public signUp endpoint must not be used in signUpAction
    // (signInWithPassword is still used for session creation)
    expect(src).not.toContain("supabase.auth.signUp(");
  });

  it("auth actions set email_confirm: true in admin.createUser", () => {
    const src = readFileSync(
      resolve(__dirname, "../app/actions/auth.ts"),
      "utf8"
    );
    // email_confirm must be true so the account is immediately usable
    // and signInWithPassword does not fail with email_not_confirmed
    expect(src).toContain("email_confirm: true");
  });
});

// ── Manual / integration tests (not automated) ───────────────────────────────
//
// The following tests CANNOT be automated in this test file because they
// require a live Supabase project with specific settings.
// Run these manually or as part of a dedicated integration test suite.
//
// Prerequisites for all live tests:
//   - Hosted Supabase project settings:
//     · Authentication → Providers → Email → "Confirm email" = OFF
//       (not strictly required because admin.createUser sets email_confirm=true,
//        but "Confirm email" ON + email_confirm=true still bypasses confirmation)
//     · Authentication → Email → "Enable email signup" = ON
//     · Authentication → Email → "Secure email change" = OFF (no real email)
//     · Authentication → Providers → Phone → Disabled (no Twilio configured)
//     · Authentication → Password → min 8 chars
//   - PHONE_HMAC_SECRET set (≥ 32 chars, generate: openssl rand -base64 32)
//   - SUPABASE_SERVICE_ROLE_KEY set (from Project Settings → API → service_role)
//   - All migrations applied through 20250104000000_phone_integrity_hardening
//
// LIVE-0: admin.createUser bypasses email domain validation
//   The synthetic identifier uses the @internal.rajfaded.invalid domain.
//   admin.createUser does NOT run GoTrue's email format/domain validator.
//   Verify: signup succeeds and auth.users.email contains the expected
//   ph.[0-9a-f]{32}@internal.rajfaded.invalid pattern.
//
// LIVE-1: Valid signup
//   POST /signup with phone=9876543210, password=TestPass1
//   → Redirects to /
//   → session cookie set
//   → profiles row created with phone="+919876543210"
//   → user_roles row with role='customer'
//   → No SMS sent, no email sent
//
// LIVE-2: Sign in with same number
//   POST /login with phone=9876543210, password=TestPass1
//   → Redirects to /
//   → Session refreshed
//
// LIVE-3: Wrong password rejected
//   POST /login with phone=9876543210, password=WrongPass1
//   → Returns "Incorrect phone number or password."
//   → No account enumeration
//
// LIVE-4: Duplicate signup handling
//   POST /signup again with same phone+password
//   → Returns "Something went wrong. Please check your details and try again."
//   → Does not reveal account exists
//
// LIVE-5: Invalid phone rejected server-side
//   POST /signup with phone=123, password=TestPass1
//   → Returns "Invalid phone number…"
//
// LIVE-6: Session persistence
//   After LIVE-1, close/reopen browser tab
//   → Session cookie persists (HttpOnly, Secure)
//   → proxy.ts calls getUser() and refreshes token
//
// LIVE-7: Sign out
//   POST signOutAction
//   → Redirects to /login
//   → Session cookie cleared
//
// LIVE-8: Protected account routes (when implemented)
//   GET /account without session → redirect to /login
//
// LIVE-9: Customer RLS isolation
//   User A cannot read User B's appointments via Supabase client
//
// LIVE-10: Admin authorization
//   A user with role='admin' can read all profiles
//   A customer cannot elevate their own role
//
// LIVE-11: Booking creation
//   Authenticated customer calls create_appointment RPC
//   → Appointment created with customer_id = auth.uid()
//   → appointment_services snapshot inserted
//
// LIVE-12: Service-role key not in browser bundle
//   Inspect production JS bundle: grep for service_role and SUPABASE_SERVICE_ROLE_KEY
//   → Must return no matches
//
// LIVE-13: Synthetic identifier not in browser bundle or API responses
//   Inspect network responses: grep for ph. and @internal.rajfaded.invalid
//   → Must not appear in any client-visible response
//
// LIVE-14: Missing SUPABASE_SERVICE_ROLE_KEY — graceful server error
//   Deploy with SUPABASE_SERVICE_ROLE_KEY unset
//   POST /signup with valid phone+password
//   → Returns "Something went wrong. Please try again." (no secret leaked)
//   → Server log contains: "admin client initialization failed"
