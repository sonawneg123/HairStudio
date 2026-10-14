/**
 * Phone number normalization utilities.
 *
 * This application uses mobile number + password authentication only.
 * All phone numbers are stored and compared in E.164 format:
 *   +<country code><subscriber number>  e.g. +919876543210
 *
 * Indian numbers (+91) are the primary use case.
 * Rules:
 *   - Strip spaces, dashes, dots, parentheses.
 *   - A 10-digit number (starts with 6–9) is treated as an Indian mobile
 *     number and prefixed with +91.
 *   - A number that already has +91 is kept as-is after cleaning.
 *   - A number with any other country code (+1, +44 …) is kept as-is
 *     after cleaning.
 *   - Anything that does not produce a valid E.164 string causes
 *     normalizePhone to return null (caller must show a validation error).
 *
 * E.164 definition: leading +, 7–15 digits (ITU-T E.164).
 */

/** Strip all non-digit, non-plus characters. */
function stripFormatting(raw: string): string {
  return raw.replace(/[\s\-().]/g, "");
}

/**
 * Normalizes a phone number string to E.164 format.
 *
 * Returns the normalized string on success, or `null` if the input
 * cannot be interpreted as a valid mobile number.
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = stripFormatting(raw.trim());

  if (!cleaned) return null;

  let e164: string;

  if (cleaned.startsWith("+")) {
    // Already has country code — keep it.
    e164 = cleaned;
  } else if (/^[6-9]\d{9}$/.test(cleaned)) {
    // Bare 10-digit Indian mobile number.
    e164 = "+91" + cleaned;
  } else if (/^91[6-9]\d{9}$/.test(cleaned)) {
    // 91 prefix without the +.
    e164 = "+" + cleaned;
  } else {
    return null;
  }

  // Validate E.164: + followed by 7–15 digits.
  if (!/^\+\d{7,15}$/.test(e164)) return null;

  return e164;
}

/**
 * Returns true if the string looks like a valid E.164 phone number.
 * Useful for form validation before calling normalizePhone.
 */
export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}
