/**
 * Auth service — mobile number + password authentication.
 *
 * This module is the single source of truth for all authentication calls.
 * All callers must go through these functions rather than calling the
 * Supabase client directly.
 *
 * Authentication model:
 *   - Sign-up:  phone + password + optional full_name metadata.
 *   - Sign-in:  phone + password.
 *   - Sign-out: invalidate the current session.
 *
 * Phone numbers are normalized to E.164 before every auth call so that
 * the same number cannot be registered under two different formats.
 *
 * Password reset:
 *   Standard Supabase password reset relies on email (magic link) or
 *   phone OTP. Both flows are prohibited by this project's auth policy.
 *   Password reset is therefore NOT available without operator assistance.
 *   An admin can update a user's password via the Supabase Dashboard →
 *   Authentication → Users → Edit user → Set new password.
 *
 * Security trade-off (DOCUMENTED):
 *   Phone confirmation via OTP is disabled. The application cannot verify
 *   that a registering user actually controls the mobile number they
 *   provide. The phone number is self-reported. Do not treat it as a
 *   verified identity anchor or use it for out-of-band communication
 *   without an explicit verification step.
 */

import { createBrowserClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils/phone";

// ── Result types ────────────────────────────────────────────

export interface AuthSuccess<T> {
  data: T;
  error: null;
}

export interface AuthFailure {
  data: null;
  error: string;
}

export type AuthResult<T> = AuthSuccess<T> | AuthFailure;

// ── Internal helper ─────────────────────────────────────────

function fail(message: string): AuthFailure {
  return { data: null, error: message };
}

// ── Sign-up ─────────────────────────────────────────────────

export interface SignUpInput {
  /** Raw phone number — will be normalized to E.164. */
  phone: string;
  password: string;
  /** Optional. Stored in raw_user_meta_data and mirrored to profiles.full_name by trigger. */
  fullName?: string;
}

export interface SignUpResult {
  /** The newly created user's id. */
  userId: string;
}

/**
 * Registers a new customer account using phone + password.
 *
 * Role assignment is handled exclusively by the on_auth_user_created
 * database trigger (always 'customer'). The caller cannot influence it.
 */
export async function signUp(
  input: SignUpInput
): Promise<AuthResult<SignUpResult>> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return fail(
      "Invalid phone number. Please enter a valid Indian mobile number (e.g. 98765 43210)."
    );
  }

  const supabase = createBrowserClient();

  const { data, error } = await supabase.auth.signUp({
    phone,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName?.trim() ?? "",
      },
    },
  });

  if (error) {
    return fail(mapAuthError(error.message));
  }

  if (!data.user) {
    return fail("Account creation failed. Please try again.");
  }

  return { data: { userId: data.user.id }, error: null };
}

// ── Sign-in ─────────────────────────────────────────────────

export interface SignInInput {
  /** Raw phone number — will be normalized to E.164. */
  phone: string;
  password: string;
}

export interface SignInResult {
  userId: string;
}

/**
 * Signs in an existing user using phone + password.
 */
export async function signIn(
  input: SignInInput
): Promise<AuthResult<SignInResult>> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return fail(
      "Invalid phone number. Please enter a valid Indian mobile number."
    );
  }

  const supabase = createBrowserClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    phone,
    password: input.password,
  });

  if (error) {
    return fail(mapAuthError(error.message));
  }

  if (!data.user) {
    return fail("Sign-in failed. Please try again.");
  }

  return { data: { userId: data.user.id }, error: null };
}

// ── Sign-out ─────────────────────────────────────────────────

/**
 * Signs out the currently authenticated user.
 * Safe to call even if no session is active.
 */
export async function signOut(): Promise<void> {
  const supabase = createBrowserClient();
  await supabase.auth.signOut();
}

// ── Error message mapping ────────────────────────────────────

/**
 * Converts Supabase Auth error messages into user-facing strings.
 * Does not expose internal error codes or API details.
 */
function mapAuthError(raw: string): string {
  const lower = raw.toLowerCase();

  if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
    return "Incorrect phone number or password.";
  }
  if (lower.includes("user already registered") || lower.includes("phone_exists") || lower.includes("already registered")) {
    return "An account with this phone number already exists.";
  }
  if (lower.includes("password should be") || lower.includes("password is too short") || lower.includes("weak_password")) {
    return "Password must be at least 8 characters and contain letters and digits.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lower.includes("signup is disabled") || lower.includes("signups not allowed")) {
    return "New registrations are currently disabled.";
  }

  // Generic fallback — do not leak raw error to the UI.
  return "Something went wrong. Please try again.";
}
