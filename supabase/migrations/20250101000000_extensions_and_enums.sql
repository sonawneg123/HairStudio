-- ============================================================
-- Migration: 20250101000000_extensions_and_enums
-- Purpose:   Enable required PostgreSQL extensions and define
--            application-wide enum types.
-- Rollback:  DROP TYPE and DROP EXTENSION are destructive; see
--            notes below before reversing in production.
-- ============================================================

-- btree_gist is required for the exclusion constraint on
-- appointments (overlapping-interval conflict prevention).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ──────────────────────────────────────────────
-- Enums
-- ──────────────────────────────────────────────

-- Application roles.
-- IMPORTANT: Do NOT change enum values without a companion migration.
--            Adding a value is safe; removing one requires a full type
--            replacement and is a breaking change.
CREATE TYPE public.app_role AS ENUM ('admin', 'barber', 'customer');

-- Appointment lifecycle statuses.
-- pending   — created but not yet confirmed; counts as an active reservation.
-- confirmed — confirmed by the barber or admin; active reservation.
-- cancelled — explicitly cancelled; excluded from overlap constraints.
-- completed — the appointment took place successfully.
-- no_show   — customer did not attend.
--
-- Pending appointments MUST be either confirmed or cancelled to free
-- the time slot. An automated expiry job (not implemented in this
-- migration) should cancel stale pending appointments.
CREATE TYPE public.appointment_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

-- Day-of-week convention: 0 = Sunday … 6 = Saturday,
-- matching JavaScript's Date.getDay() and PostgreSQL's EXTRACT(DOW …).
-- A CHECK constraint enforces this range on barber_working_hours.
