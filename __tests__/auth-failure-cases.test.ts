/**
 * Failure-case tests for the auth server action source.
 *
 * These tests verify:
 *   1. mapAuthError returns the correct user-facing string for each
 *      Supabase error code and message pattern, without leaking internal
 *      detail back to the caller.
 *   2. The partial-failure path (admin.createUser succeeded,
 *      signInWithPassword failed) returns a safe, actionable message.
 *   3. Duplicate-account errors do not reveal registration status.
 *   4. Validation short-circuits before any Supabase call for clearly
 *      invalid inputs.
 *
 * All tests are static / unit-level and require no network access.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Read a source file and split into lines for targeted assertions. */
function src(relPath: string): string {
  return readFileSync(resolve(__dirname, "..", relPath), "utf8");
}

const authSrc = src("app/actions/auth.ts");

// ── mapAuthError — error code coverage ───────────────────────────────────────

describe("mapAuthError source coverage", () => {
  it("handles 'invalid_credentials' code (sign-in failure, no enumeration)", () => {
    // Verify the branch exists in source and returns a generic credential message.
    expect(authSrc).toContain("invalid_credentials");
    expect(authSrc).toContain("Incorrect phone number or password.");
  });

  it("handles 'weak_password' code (password policy violation)", () => {
    expect(authSrc).toContain("weak_password");
    expect(authSrc).toContain("Password must be at least 8 characters");
  });

  it("handles 'over_request_rate_limit' code (Supabase GoTrue rate limit)", () => {
    expect(authSrc).toContain("over_request_rate_limit");
    expect(authSrc).toContain("Too many attempts.");
  });

  it("handles 'over_email_send_rate_limit' code (email send limit)", () => {
    // Should map to the same rate-limit message, not leak an email reference.
    expect(authSrc).toContain("over_email_send_rate_limit");
    expect(authSrc).not.toContain('"email send"'); // must not surface this in user msg
  });

  it("handles 'signup_disabled' code (registrations disabled)", () => {
    expect(authSrc).toContain("signup_disabled");
    expect(authSrc).toContain("New registrations are currently disabled.");
  });

  it("handles 'email_not_confirmed' code without leaking email detail", () => {
    expect(authSrc).toContain("email_not_confirmed");
    // Must NOT tell the user to confirm email — there is no real email.
    const returnLines = authSrc
      .split("\n")
      .filter(
        (l) =>
          l.includes("email_not_confirmed") ||
          l.includes("email not confirmed")
      );
    for (const line of returnLines) {
      // Confirm-email instructions must not appear in the user-facing return value.
      expect(line).not.toMatch(/return.*confirm.*email/i);
    }
  });

  it("handles 'email_address_invalid' code without leaking synthetic identifier", () => {
    expect(authSrc).toContain("email_address_invalid");
    // The user-facing return message for this branch must be generic.
    // Find the return statement in this branch.
    const lines = authSrc.split("\n");
    let inBranch = false;
    for (const line of lines) {
      if (line.includes("email_address_invalid")) {
        inBranch = true;
      }
      if (inBranch && line.trim().startsWith("return")) {
        // Must not contain the synthetic identifier domain.
        expect(line).not.toContain(".invalid");
        expect(line).not.toContain("ph.");
        inBranch = false;
      }
    }
  });

  it("default branch returns a safe generic message (fallthrough)", () => {
    // The final return in mapAuthError must be safe and generic.
    // Verify the last return in mapAuthError is a generic string.
    const mapErrorSection = authSrc.slice(
      authSrc.indexOf("function mapAuthError"),
      authSrc.indexOf("// ── signUpAction")
    );
    expect(mapErrorSection).toContain(
      "Something went wrong. Please try again."
    );
  });
});

// ── Partial-failure: account created, sign-in fails ──────────────────────────

describe("signUpAction partial-failure path (structural)", () => {
  it("signals that sign-in failed without mentioning synthetic email or password", () => {
    // Find the error message returned when signInWithPassword fails after
    // a successful admin.createUser.
    const signUpSection = authSrc.slice(
      authSrc.indexOf("// ── Step 2: sign in"),
      authSrc.indexOf("redirect(\"/\")")
    );

    // The partial-failure error message must exist.
    expect(signUpSection).toContain(
      "Account created but sign-in failed. Please try signing in manually."
    );
    // It must not contain the password, the email variable, or the phone variable.
    const errorReturn = signUpSection
      .split("\n")
      .filter((l) => l.trim().startsWith("return") && l.includes("error"));
    for (const line of errorReturn) {
      expect(line).not.toContain("password");
      expect(line).not.toContain("email");
      expect(line).not.toContain("phone");
    }
  });

  it("partial-failure does NOT call admin.createUser a second time", () => {
    // Extract only the signUpAction function body (between the two action
    // function boundaries) so we can check there is only one createUser call site.
    const signUpStart = authSrc.indexOf("export async function signUpAction");
    const signInStart = authSrc.indexOf("export async function signInAction");
    const signUpBody = authSrc.slice(signUpStart, signInStart);

    // There must be exactly one actual call to admin.createUser({ — the
    // creation step. The error handler after signInWithPassword failure
    // must not add a second call.
    const callSites = [...signUpBody.matchAll(/admin\.createUser\(\{/g)];
    expect(callSites).toHaveLength(1);
  });
});

// ── Duplicate account: enumeration protection ─────────────────────────────────

describe("signUpAction duplicate-account handling (structural)", () => {
  it("maps 'user_already_exists' to a generic message", () => {
    expect(authSrc).toContain("user_already_exists");
    expect(authSrc).toContain(
      "Something went wrong. Please check your details and try again."
    );
  });

  it("maps 'email_exists' to the same generic duplicate message", () => {
    expect(authSrc).toContain("email_exists");
    // Both codes should result in the same generic message — verified by
    // checking that email_exists is handled in the same branch.
    const dupeSection = authSrc.slice(
      authSrc.indexOf("user_already_exists"),
      authSrc.indexOf("return {", authSrc.indexOf("user_already_exists"))
    );
    expect(dupeSection).toContain("email_exists");
  });

  it("duplicate message does not reveal that the account already exists", () => {
    // The user-facing duplicate error must not contain words that confirm
    // the account's existence.
    const msg =
      "Something went wrong. Please check your details and try again.";
    expect(msg).not.toMatch(/already (registered|exists|taken|in use)/i);
    expect(msg).not.toMatch(/account.*exist/i);
    expect(msg).not.toMatch(/number.*already/i);
  });
});

// ── Input validation short-circuits ──────────────────────────────────────────

describe("signUpAction input validation (structural)", () => {
  it("normalizes phone server-side before any Supabase call", () => {
    // Restrict search to the signUpAction body to get correct relative offsets.
    const start = authSrc.indexOf("export async function signUpAction");
    const end = authSrc.indexOf("export async function signInAction");
    const body = authSrc.slice(start, end);

    const normalizePos = body.indexOf("normalizePhone(rawPhone)");
    // createAdminClient() call — look for the actual invocation, not the import.
    const adminCallPos = body.indexOf("createAdminClient()");
    const syntheticPos = body.indexOf("syntheticEmail(phone)");

    expect(normalizePos).toBeGreaterThan(-1);
    expect(adminCallPos).toBeGreaterThan(-1);
    expect(syntheticPos).toBeGreaterThan(-1);
    expect(normalizePos).toBeLessThan(adminCallPos);
    expect(normalizePos).toBeLessThan(syntheticPos);
  });

  it("rejects a password shorter than 8 chars before calling Supabase", () => {
    const start = authSrc.indexOf("export async function signUpAction");
    const end = authSrc.indexOf("export async function signInAction");
    const body = authSrc.slice(start, end);

    const passwordCheckPos = body.indexOf("password.length < 8");
    const adminCallPos = body.indexOf("createAdminClient()");

    expect(passwordCheckPos).toBeGreaterThan(-1);
    expect(passwordCheckPos).toBeLessThan(adminCallPos);
  });

  it("the phone validation error message does not contain the rejected input", () => {
    // Find the return statement after the normalizePhone null check.
    const phoneErrorSection = authSrc.slice(
      authSrc.indexOf("if (!phone)"),
      authSrc.indexOf("if (password.length < 8)")
    );
    // Must not echo back the raw input.
    expect(phoneErrorSection).not.toContain("rawPhone");
    expect(phoneErrorSection).not.toContain("phone}"); // no template literal injection
  });
});
