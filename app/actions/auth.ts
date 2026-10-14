/**
 * Server Actions for authentication.
 *
 * These run on the server. They use the server-side Supabase client so
 * that session cookies are set correctly.
 */
"use server";

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils/phone";

// ── Shared result type ───────────────────────────────────────

export interface ActionState {
  error: string | null;
}

// ── Error mapping ────────────────────────────────────────────

function mapAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid_credentials")
  ) {
    return "Incorrect phone number or password.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("phone_exists") ||
    lower.includes("already registered")
  ) {
    return "An account with this phone number already exists.";
  }
  if (
    lower.includes("password should be") ||
    lower.includes("password is too short") ||
    lower.includes("weak_password")
  ) {
    return "Password must be at least 8 characters and contain letters and digits.";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    lower.includes("signup is disabled") ||
    lower.includes("signups not allowed")
  ) {
    return "New registrations are currently disabled.";
  }
  return "Something went wrong. Please try again.";
}

// ── signUpAction ─────────────────────────────────────────────

/**
 * Server Action: register a new customer account.
 *
 * Role assignment ('customer') is handled by the on_auth_user_created
 * trigger. The caller cannot choose their own role.
 */
export async function signUpAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawPhone = (formData.get("phone") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      error:
        "Invalid phone number. Enter a valid Indian mobile number (e.g. 98765 43210).",
    };
  }

  if (password.length < 8) {
    return {
      error: "Password must be at least 8 characters.",
    };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    return { error: mapAuthError(error.message) };
  }

  redirect("/");
}

// ── signInAction ─────────────────────────────────────────────

/**
 * Server Action: sign in with phone + password.
 */
export async function signInAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const rawPhone = (formData.get("phone") as string | null)?.trim() ?? "";
  const password = (formData.get("password") as string | null) ?? "";

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      error:
        "Invalid phone number. Enter a valid Indian mobile number (e.g. 98765 43210).",
    };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    phone,
    password,
  });

  if (error) {
    return { error: mapAuthError(error.message) };
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
