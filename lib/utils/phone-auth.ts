/**
 * Server-side synthetic email identifier for phone+password auth.
 *
 * Supabase Auth uses email+password internally. Because this application
 * collects only a mobile number from the user, we derive a stable,
 * privacy-preserving synthetic email identifier on the server and never
 * expose it to the browser.
 *
 * Scheme:
 *   email = "ph." + HMAC-SHA256(E.164_phone, PHONE_HMAC_SECRET)[0..31] + "@internal.rajfaded.invalid"
 *
 * Properties:
 *   • Domain: `.invalid` is IANA-reserved (RFC 2606) and can never receive mail.
 *   • HMAC keyed with a server-side secret: without the secret the mapping
 *     cannot be reversed or brute-forced across the Indian number space.
 *   • 128-bit truncated digest: birthday probability over 1.4 × 10⁹ Indian
 *     numbers is negligible (~2⁻⁵⁷ per pair).
 *   • Deterministic: same phone + same secret → same identifier every call.
 *   • This module must only be imported from server-side code ("use server",
 *     Server Components, Route Handlers). It must never reach the browser bundle.
 *
 * IMPORTANT: This is an internal workaround, not native phone authentication.
 *   • The phone number is NOT cryptographically verified (no OTP).
 *   • Account recovery via email is not possible — there is no real email.
 *   • Operators must handle account recovery through the Supabase dashboard
 *     by looking up the user UUID.
 *   • Never log, display, or return the synthetic identifier to the user.
 */

import "server-only";

import { createHmac } from "crypto";

/** The domain suffix for all synthetic identifiers. RFC 2606 reserved. */
const INTERNAL_DOMAIN = "@internal.rajfaded.invalid";

/**
 * Derives the internal synthetic email for a normalized E.164 phone number.
 *
 * Must be called from server-side code only.
 * The PHONE_HMAC_SECRET environment variable must be set.
 *
 * @param e164 - Normalized E.164 phone number (e.g. "+919876543210").
 * @returns Synthetic email string — never expose this to the browser.
 * @throws If PHONE_HMAC_SECRET is not set or is too short.
 */
export function syntheticEmail(e164: string): string {
  const secret = process.env.PHONE_HMAC_SECRET;
  // Require at least 32 bytes of raw entropy.  A base64-encoded 32-byte
  // secret produced by `openssl rand -base64 32` is 44 chars; a hex-encoded
  // one is 64 chars.  Either way the raw value must be ≥ 32 characters so
  // that even a worst-case ASCII-printable secret carries ≥ 190 bits of key
  // material.  The old threshold of 16 was too lenient.
  if (!secret || secret.length < 32) {
    throw new Error(
      "[phone-auth] PHONE_HMAC_SECRET is not set or is too short. " +
        "Set a cryptographically random secret of at least 32 bytes. " +
        "Generate one with: openssl rand -base64 32"
    );
  }

  // HMAC-SHA256 keyed on the secret, message is the E.164 string.
  const digest = createHmac("sha256", secret)
    .update(e164, "utf8")
    .digest("hex");

  // Take the first 32 hex characters (128 bits of entropy).
  const token = digest.slice(0, 32);

  return `ph.${token}${INTERNAL_DOMAIN}`;
}
