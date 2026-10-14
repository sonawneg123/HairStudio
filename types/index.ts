/**
 * Application-wide type exports.
 *
 * UserRole and AppUser are derived from the database types to keep a
 * single source of truth. The canonical definitions live in database.ts.
 */
export type { AppRole as UserRole, AppointmentStatus } from "./database";

/**
 * Minimal authenticated user shape shared across the application.
 *
 * NOTE: This application uses phone+password authentication only.
 * There is no email field. The phone number is stored in E.164 format.
 * Phone ownership is NOT verified (OTP confirmation is disabled).
 */
import type { AppRole } from "./database";

export interface AppUser {
  id: string;
  /** E.164 format, e.g. "+919876543210". Self-reported; not verified. */
  phone: string | null;
  role: AppRole;
  fullName: string | null;
}
