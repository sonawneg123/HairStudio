/**
 * Server Actions for authentication.
 *
 * These run on the server. They use the server-side Supabase client so
 * that session cookies are set correctly.
 *
 * Authentication model:
 *   The browser submits mobile number + password only.
 *   On the server we normalize the number to E.164, derive a
 *   server-side synthetic email identifier (HMAC-SHA256), and call
 *   Supabase Auth APIs. The identifier is never returned to the browser
 *   or stored in user-facing fields.
 *
 * Why signUp → admin.createUser for registration:
 *   Hosted Supabase GoTrue (≥ v2.143) validates email domain TLDs against
 *   an allowlist and rejects RFC 2606 reserved domains (.invalid, .test,
 *   .example, .localhost) with code=email_address_invalid status=400.
 *   The admin.createUser endpoint bypasses this validation because it is
 *   an authenticated server-to-server call. We set email_confirm=true so
 *   the account is immediately usable without an email confirmation step.
 *   After creating the user we call signInWithPassword() to obtain a session
 *   cookie, exactly as before.
 *
 *   Sign-in is unaffected: signInWithPassword() does not re-validate the
 *   email format — it only looks up the stored identifier.
 *
 * Required environment variables (server-side only):
 *   PHONE_HMAC_SECRET         — random 32+ byte secret (never NEXT_PUBLIC_)
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (never NEXT_PUBLIC_)
 */
"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils/phone";
import { syntheticEmail } from "@/lib/utils/phone-auth";
import {
  checkSignupRateLimit,
  RateLimitError,
} from "@/lib/utils/signup-rate-limit";
import type { AuthError } from "@supabase/supabase-js";

// ── Shared result type ───────────────────────────────────────

export interface ActionState {
  error: string | null;
}

// ── Safe diagnostic logging ──────────────────────────────────

/**
 * Logs Supabase Auth error details for server-side diagnostics.
 *
 * Only the error code, HTTP status, and a sanitized message are logged.
 * Passwords, full phone numbers, tokens, synthetic identifiers, and
 * secret keys are never logged.
 */
function logAuthError(context: string, error: AuthError): void {
  // Mask all but last 4 digits of any phone-like sequence in the message.
  // Also mask anything that looks like the synthetic identifier prefix.
  const sanitizedMessage = error.message
    .replace(/\+?\d{7,15}/g, "***")
    .replace(/ph\.[0-9a-f]{32}@[^\s"]+/gi, "***@internal.***");
  console.error(
    `[auth] ${context} | code=${error.code ?? "none"} status=${error.status ?? "none"} message="${sanitizedMessage}"`
  );
}

// ── Error mapping ────────────────────────────────────────────

/**
 * Maps Supabase Auth errors to user-facing messages.
 *
 * Generic messages are used where specificity would reveal whether
 * an account exists (enumeration protection).
 */
function mapAuthError(error: AuthError): string {
  const code = error.code ?? "";
  const message = error.message ?? "";
  const lower = message.toLowerCase();

  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_credentials")
  ) {
    // Deliberate generic wording: does not confirm whether the account exists.
    return "Incorrect phone number or password.";
  }
  if (
    code === "weak_password" ||
    lower.includes("password should be") ||
    lower.includes("password is too short") ||
    lower.includes("weak_password")
  ) {
    return "Password must be at least 8 characters and contain letters and digits.";
  }
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    code === "signup_disabled" ||
    lower.includes("signup is disabled") ||
    lower.includes("signups not allowed")
  ) {
    return "New registrations are currently disabled.";
  }
  if (
    code === "email_not_confirmed" ||
    lower.includes("email not confirmed") ||
    lower.includes("confirm your email")
  ) {
    // This should never happen because admin.createUser sets email_confirm=true.
    // If it does, it signals a misconfiguration.
    return "Something went wrong. Please contact support.";
  }
  if (
    code === "email_address_invalid" ||
    lower.includes("email address") ||
    lower.includes("is invalid")
  ) {
    // This should never happen when using admin.createUser (which bypasses
    // email format validation). If it does, it signals a configuration error
    // that must be fixed server-side — surface a non-revealing message.
    console.error("[auth] email_address_invalid reached mapAuthError — check SUPABASE_SERVICE_ROLE_KEY and admin client setup");
    return "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

// ── signUpAction ─────────────────────────────────────────────

/**
 * Server Action: register a new customer account.
 *
 * Accepts mobile number + password. Derives a synthetic email
 * identifier server-side and calls the Supabase admin API to create
 * the user, bypassing GoTrue's email domain TLD validator which
 * rejects .invalid addresses on the public signUp endpoint.
 *
 * After creating the user, signs in immediately to obtain a session
 * cookie so the UX is identical to before.
 *
 * Duplicate registrations: admin.createUser returns a
 * user_already_exists / email_exists error for duplicate identifiers.
 * We return a generic message to avoid confirming registration status.
 *
 * Role assignment ('customer') is handled by the on_auth_user_created
 * trigger. The caller cannot choose their own role.
 */
export async function signUpAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  //
  // Must run before any privileged operation (admin.createUser).
  // IP is extracted from the Vercel-injected x-forwarded-for header.
  // We trust only the first value (platform-injected, not client-controlled).
  // Fails closed: if Upstash is unavailable, signup is blocked.
  try {
    const requestHeaders = await headers();
    const xff = requestHeaders.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0].trim() || "unknown" : "unknown";
    await checkSignupRateLimit(ip);
  } catch (err) {
    if (err instanceof RateLimitError) {
      if (err.isLimiterUnavailable) {
        // Rate limiter is misconfigured or unreachable — fail closed.
        console.error("[auth] signUp | rate limiter unavailable:", err.message);
        return { error: "Service temporarily unavailable. Please try again later." };
      }
      // Rate limit exceeded — generic message, no internal detail.
      return { error: "Too many attempts. Please wait a moment and try again." };
    }
    // Unexpected error — fail closed.
    console.error("[auth] signUp | unexpected rate limit error");
    return { error: "Service temporarily unavailable. Please try again later." };
  }

  const rawPhone = (formData.get("phone") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";

  // Server-side normalization — never trust the client to supply E.164.
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      error:
        "Invalid phone number. Enter a valid Indian mobile number (e.g. 98765 43210).",
    };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // Derive synthetic identifier server-side. Never expose to client.
  let email: string;
  try {
    email = syntheticEmail(phone);
  } catch {
    console.error("[auth] signUp | synthetic identifier derivation failed");
    return { error: "Something went wrong. Please try again." };
  }

  // ── Step 1: create the user via the admin API ─────────────────────────
  //
  // admin.createUser() is used instead of auth.signUp() because hosted
  // Supabase GoTrue rejects .invalid TLD addresses on the public endpoint
  // (code=email_address_invalid). The admin endpoint bypasses email format
  // validation entirely.
  //
  // email_confirm: true — marks the address as confirmed immediately.
  //   Without this, signInWithPassword() in step 2 would fail with
  //   email_not_confirmed (when "Confirm email" is enabled in the dashboard)
  //   or would work but leave the account in an unconfirmed state.
  //   Since there is no real email to confirm, we confirm it here.
  //
  // The admin client requires SUPABASE_SERVICE_ROLE_KEY and must never
  // be instantiated in browser code.
  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    console.error("[auth] signUp | admin client initialization failed — SUPABASE_SERVICE_ROLE_KEY may not be set");
    return { error: "Something went wrong. Please try again." };
  }

  const { error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      // Store the real phone in user metadata so the on_auth_user_created
      // trigger can copy it into profiles.phone.
      // The synthetic email is the auth identifier; this is the human number.
      phone,
    },
  });

  if (createError) {
    logAuthError("signUp/admin.createUser", createError);

    // Duplicate account: return a generic message to avoid account enumeration.
    if (
      createError.code === "user_already_exists" ||
      createError.code === "email_exists" ||
      (createError.message ?? "").toLowerCase().includes("already registered") ||
      (createError.message ?? "").toLowerCase().includes("already been registered")
    ) {
      return {
        error:
          "Something went wrong. Please check your details and try again.",
      };
    }

    return { error: mapAuthError(createError) };
  }

  // ── Step 2: sign in to obtain a session cookie ────────────────────────
  //
  // admin.createUser() does not return a session — it only creates the
  // account. We immediately sign in with the same credentials so the
  // browser receives an HttpOnly session cookie.
  const supabase = await createServerClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    logAuthError("signUp/signInWithPassword", signInError);
    // The account was created but sign-in failed. This is an unexpected
    // state — the account exists but the user cannot access it yet.
    // A descriptive-but-safe message is shown. The operator can investigate
    // via the Supabase dashboard.
    return {
      error:
        "Account created but sign-in failed. Please try signing in manually.",
    };
  }

  redirect("/");
}

// ── signInAction ─────────────────────────────────────────────

/**
 * Server Action: sign in with mobile number + password.
 *
 * Derives the same synthetic identifier and calls Supabase
 * signInWithPassword. Never reveals whether the account exists.
 */
export async function signInAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawPhone = (formData.get("phone") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  // Server-side normalization.
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      error:
        "Invalid phone number. Enter a valid Indian mobile number (e.g. 98765 43210).",
    };
  }

  let email: string;
  try {
    email = syntheticEmail(phone);
  } catch {
    console.error("[auth] signIn | synthetic identifier derivation failed");
    return { error: "Something went wrong. Please try again." };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    logAuthError("signIn", error);
    return { error: mapAuthError(error) };
  }

  redirect("/");
}

// ── signOutAction ─────────────────────────────────────────────

/**
 * Server Action: sign out the current user.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
