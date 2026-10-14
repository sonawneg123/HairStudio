-- ============================================================
-- Migration: 20250102000001_salon_timezone_kolkata
-- Purpose:   Set the salon timezone to Asia/Kolkata (IST, UTC+5:30).
--            The previous default 'America/New_York' was a placeholder.
--
-- Depends:   20250101000001_core_tables (salon_settings table)
-- Rollback:  UPDATE public.salon_settings SET timezone = 'America/New_York';
-- ============================================================
--
-- Raj Faded Studio is located in India.
-- IANA timezone: Asia/Kolkata (IST — Indian Standard Time, UTC+5:30).
-- This timezone has no DST transitions; offset is always +05:30.
--
-- All time-based availability calculations (working hours, time-off
-- validation, booking slot display) MUST be performed in this timezone.
-- Appointment instants are stored as timestamptz (UTC internally);
-- conversion to Asia/Kolkata happens at query/display time via
-- AT TIME ZONE 'Asia/Kolkata' or the equivalent in application code.
--
-- Do NOT hardcode the UTC offset (+05:30) in queries or application
-- code. Always reference the IANA name so PostgreSQL handles any
-- future edge cases correctly.

UPDATE public.salon_settings
SET    timezone   = 'Asia/Kolkata',
       updated_at = now()
WHERE  true;

-- If no row exists yet (fresh schema with seeding skipped), insert one.
INSERT INTO public.salon_settings (salon_name, timezone)
VALUES ('Raj Faded Studio', 'Asia/Kolkata')
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.salon_settings.timezone IS
  'IANA timezone identifier for the salon location. '
  'Raj Faded Studio uses Asia/Kolkata (IST, UTC+5:30, no DST). '
  'All availability calculations must use this timezone, never a '
  'hardcoded UTC offset.';
