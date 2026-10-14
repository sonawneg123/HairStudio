-- ============================================================
-- Migration: 20250101000001_core_tables
-- Purpose:   Create all core application tables.
-- Depends:   20250101000000_extensions_and_enums
-- Rollback:  Dropping tables is irreversible in production.
--            Keep a backup before running `supabase db reset`.
-- ============================================================

-- ──────────────────────────────────────────────
-- A. profiles
-- ──────────────────────────────────────────────
-- One row per authenticated user. Created automatically via trigger
-- (see 20250101000002_triggers_and_functions.sql).
-- Role is NOT stored here to prevent self-elevation; see user_roles.
CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name   text NOT NULL DEFAULT '',
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Public profile data for every authenticated user. '
  'Role information is stored separately in user_roles.';

-- ──────────────────────────────────────────────
-- B. user_roles
-- ──────────────────────────────────────────────
-- Each user has exactly one role. The UNIQUE constraint on user_id
-- enforces this at the database level.
--
-- Security boundary:
--   • The trigger handle_new_user() inserts the default 'customer' role.
--   • Only the service-role key or an admin using the Supabase SQL Editor
--     may UPDATE or INSERT rows with 'admin' or 'barber' values.
--   • RLS policies DENY any self-elevation (see the RLS migration).
--
-- First admin promotion (safe procedure):
--   Run the following in the Supabase Dashboard → SQL Editor after
--   confirming the user exists in auth.users:
--
--     UPDATE public.user_roles
--     SET role = 'admin'
--     WHERE user_id = '<paste-user-uuid-here>';
--
--   This must be executed with the postgres/service-role credential,
--   never from browser-side code. Do not hardcode any email or password.
CREATE TABLE public.user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  role        public.app_role NOT NULL DEFAULT 'customer',
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_roles IS
  'Single-role assignment per user. '
  'Default role is customer; elevation to admin/barber requires a '
  'privileged SQL Editor operation or service-role call.';

-- ──────────────────────────────────────────────
-- C. services
-- ──────────────────────────────────────────────
-- Catalogue of bookable services offered by the salon.
CREATE TABLE public.services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text NOT NULL UNIQUE,
  description      text,
  duration_minutes integer NOT NULL,
  price            numeric(10, 2) NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  display_order    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT services_duration_positive CHECK (duration_minutes > 0),
  CONSTRAINT services_price_nonnegative CHECK (price >= 0)
);

COMMENT ON TABLE public.services IS
  'Catalogue of services the salon offers. '
  'Only active services (is_active = true) may be booked.';
COMMENT ON COLUMN public.services.slug IS
  'URL-safe unique identifier, e.g. ''fade-haircut''.';

-- ──────────────────────────────────────────────
-- D. barber_profiles
-- ──────────────────────────────────────────────
-- Extended information for users who have the 'barber' role.
-- Only an admin may create or set is_active = true.
CREATE TABLE public.barber_profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio          text,
  avatar_url   text,
  is_active    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.barber_profiles IS
  'Extended profile for barber-role users. '
  'Created and activated only by admins.';

-- ──────────────────────────────────────────────
-- E. barber_services
-- ──────────────────────────────────────────────
-- Junction table: which services each barber performs.
-- Composite PK prevents duplicate assignments.
CREATE TABLE public.barber_services (
  barber_id   uuid NOT NULL REFERENCES public.barber_profiles (id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES public.services (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (barber_id, service_id)
);

COMMENT ON TABLE public.barber_services IS
  'Maps barbers to the services they are authorised to perform. '
  'Booking validation must check this table before creating an appointment.';

-- ──────────────────────────────────────────────
-- F. salon_settings
-- ──────────────────────────────────────────────
-- Singleton table: the CHECK constraint limits it to one row.
-- Application code should INSERT … ON CONFLICT DO UPDATE (upsert).
CREATE TABLE public.salon_settings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_name     text NOT NULL DEFAULT 'Raj Faded Studio',
  -- IANA timezone string (e.g. 'America/New_York').
  -- Must NOT be left as 'UTC' in production; set the actual salon timezone.
  timezone       text NOT NULL DEFAULT 'America/New_York',
  contact_phone  text,
  address        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Enforce singleton: only one settings row is allowed.
  CONSTRAINT salon_settings_single_row CHECK (id IS NOT NULL)
);

-- Partial unique index is the canonical PostgreSQL singleton pattern.
CREATE UNIQUE INDEX salon_settings_singleton
  ON public.salon_settings ((true));

COMMENT ON TABLE public.salon_settings IS
  'Singleton row containing salon-wide configuration. '
  'Timezone must be a valid IANA string matching the salon''s physical location.';
COMMENT ON COLUMN public.salon_settings.timezone IS
  'IANA timezone identifier for the salon location, e.g. ''America/New_York''. '
  'All time-based availability calculations should be performed in this timezone.';

-- ──────────────────────────────────────────────
-- G. barber_working_hours
-- ──────────────────────────────────────────────
-- Regular weekly schedule for each barber.
-- day_of_week: 0 (Sunday) … 6 (Saturday).
-- is_working = false means the barber does not work on that day.
--
-- Multiple intervals per day:
--   To model a split shift (e.g. 9–12 and 14–18) insert two rows
--   for the same barber_id and day_of_week, each with is_working = true
--   and non-overlapping start/end times. Application code must merge
--   these intervals before displaying availability.
--
-- Absent days:
--   A barber may simply have no row for a given day_of_week, which is
--   equivalent to is_working = false. Both representations are valid.
CREATE TABLE public.barber_working_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid NOT NULL REFERENCES public.barber_profiles (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  is_working  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT working_hours_day_range   CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT working_hours_time_order  CHECK (end_time > start_time)
);

CREATE INDEX barber_working_hours_barber_day
  ON public.barber_working_hours (barber_id, day_of_week);

COMMENT ON TABLE public.barber_working_hours IS
  'Regular weekly schedule. day_of_week: 0=Sun … 6=Sat. '
  'Multiple rows per barber+day are allowed to model split shifts.';

-- ──────────────────────────────────────────────
-- H. barber_time_off
-- ──────────────────────────────────────────────
-- One-time or planned leave/unavailability intervals.
--
-- Recurring breaks (e.g. lunch every day):
--   This table stores one-time intervals only. Recurring breaks
--   (e.g. a daily lunch break) should be modelled as a gap in
--   barber_working_hours (e.g. two rows: 09:00–12:00 and 13:00–18:00)
--   rather than inserting a time-off row for every occurrence.
--   Only use barber_time_off for exceptions: planned holidays,
--   sick leave, or special closures.
CREATE TABLE public.barber_time_off (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id   uuid NOT NULL REFERENCES public.barber_profiles (id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT time_off_order CHECK (ends_at > starts_at)
);

CREATE INDEX barber_time_off_barber_range
  ON public.barber_time_off (barber_id, starts_at, ends_at);

COMMENT ON TABLE public.barber_time_off IS
  'One-time unavailability periods (leave, holidays, ad-hoc closures). '
  'For recurring breaks use barber_working_hours gaps instead.';

-- ──────────────────────────────────────────────
-- I. appointments
-- ──────────────────────────────────────────────
-- Core booking record.
--
-- Concurrency & overlap prevention:
--   An EXCLUSION CONSTRAINT using tstzrange and btree_gist prevents
--   two active appointments for the same barber from overlapping,
--   including concurrent booking attempts (enforced at the row lock
--   level by PostgreSQL before the transaction commits).
--
--   'active' is defined as status IN ('pending', 'confirmed').
--   'cancelled', 'completed', and 'no_show' appointments are excluded
--   from the constraint via the partial index condition.
--
--   This means a barber_id with cancelled or completed appointments
--   CAN have a new booking in the same time slot. Only the two live
--   statuses block the slot.
--
--   Pending appointments act as live reservations. An explicit
--   confirm or cancel workflow is REQUIRED to avoid indefinitely
--   blocking time slots. Implement an automated stale-pending
--   cleanup job (e.g. a pg_cron task or Edge Function) for production.
--
--   Note: btree_gist must be installed (see migration 000000).
CREATE TABLE public.appointments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES auth.users (id),
  barber_id            uuid NOT NULL REFERENCES public.barber_profiles (id),
  starts_at            timestamptz NOT NULL,
  ends_at              timestamptz NOT NULL,
  status               public.appointment_status NOT NULL DEFAULT 'pending',
  customer_notes       text,
  cancellation_reason  text,
  cancelled_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at),

  -- Prevent overlapping active appointments for the same barber.
  -- Only applies when status is 'pending' or 'confirmed'.
  -- btree_gist extension required (installed in migration 000000).
  EXCLUDE USING gist (
    barber_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

-- Index: barber schedule lookup (availability checks, calendar view).
CREATE INDEX appointments_barber_time
  ON public.appointments (barber_id, starts_at);

-- Index: customer appointment history.
CREATE INDEX appointments_customer_time
  ON public.appointments (customer_id, starts_at);

-- Index: status-based querying (e.g. find all pending, find today's confirmed).
CREATE INDEX appointments_status_time
  ON public.appointments (status, starts_at);

COMMENT ON TABLE public.appointments IS
  'Core booking records. Overlap is prevented at the DB level via '
  'an exclusion constraint on barber_id × tstzrange for active statuses. '
  'Pending appointments block the slot until confirmed or cancelled.';

-- ──────────────────────────────────────────────
-- J. appointment_services
-- ──────────────────────────────────────────────
-- Snapshot of each service included in an appointment.
--
-- Why snapshots?
--   Service names, prices, and durations may change over time.
--   Storing snapshots at booking time ensures historical records
--   remain accurate even after a service is edited or deleted.
--
-- Booking transaction guarantee:
--   The booking RPC (create_appointment — see the booking transaction
--   design document in docs/booking-transaction.md) MUST:
--     1. Calculate total_duration = SUM(snapshot.duration_minutes) server-side.
--     2. Derive ends_at = starts_at + total_duration (server-side only).
--     3. Insert the appointment and these snapshot rows atomically.
--   Client-supplied duration or ends_at values MUST NOT be trusted.
--
-- Barber eligibility:
--   Before inserting, the booking RPC validates that every requested
--   service_id exists in barber_services for the selected barber.
CREATE TABLE public.appointment_services (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid NOT NULL REFERENCES public.appointments (id) ON DELETE CASCADE,
  service_id        uuid NOT NULL REFERENCES public.services (id),
  -- Snapshot values captured at booking time.
  service_name      text NOT NULL,
  unit_price        numeric(10, 2) NOT NULL,
  duration_minutes  integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appt_service_duration_positive  CHECK (duration_minutes > 0),
  CONSTRAINT appt_service_price_nonnegative  CHECK (unit_price >= 0)
);

CREATE INDEX appointment_services_appointment
  ON public.appointment_services (appointment_id);

COMMENT ON TABLE public.appointment_services IS
  'Service snapshots for each appointment line item. '
  'Values are captured at booking time and are immutable thereafter.';
