-- ============================================================
-- Migration: 20250101000004_booking_rpc
-- Purpose:   Atomic booking creation RPC with full server-side
--            validation, snapshot capture, and conflict protection.
-- Depends:   20250101000003_rls_policies
-- Rollback:  DROP FUNCTION public.create_appointment(uuid, uuid, uuid[], timestamptz);
-- ============================================================
--
-- Booking transaction design:
--   1. Verify the caller is the authenticated customer (auth.uid() check).
--   2. Verify the barber exists and is active.
--   3. Verify every requested service is active and assigned to the barber.
--   4. Calculate total duration and end time server-side (client values ignored).
--   5. Insert the appointment row.
--   6. Insert service snapshot rows.
--   7. The exclusion constraint on appointments enforces conflict prevention
--      for concurrent requests — the database rejects overlapping active slots.
--   8. Return the new appointment id on success or raise an exception on conflict.
--
-- Concurrency guarantee:
--   The exclusion constraint uses FOR KEY SHARE locking internally.
--   Concurrent transactions attempting to insert conflicting rows will
--   block until the first commits or rolls back, then fail with a
--   `exclusion constraint violation` if the slot is taken. This is
--   stronger than an application-level check (which has a TOCTOU race).
--
-- This function is implemented here but the booking UI is a later loop.
-- It may be called directly from a Server Action using the service-role
-- client or from a Route Handler. Never call it from the browser with
-- the anon key without proper authentication validation.
--
-- Parameters:
--   p_barber_id   — UUID of the barber_profiles row
--   p_service_ids — Array of service UUIDs to include
--   p_starts_at   — Requested start time (timestamptz)
--   p_notes       — Optional customer notes
--
-- Returns: UUID of the newly created appointment.

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_barber_id   uuid,
  p_service_ids uuid[],
  p_starts_at   timestamptz,
  p_notes       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id      uuid;
  v_barber_active    boolean;
  v_total_minutes    integer := 0;
  v_ends_at          timestamptz;
  v_appointment_id   uuid;
  v_service          record;
  v_service_id       uuid;
BEGIN
  -- ── Step 1: Verify the authenticated customer ──────────────
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required: caller is not authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 2: Verify the barber is active ────────────────────
  SELECT is_active INTO v_barber_active
  FROM   public.barber_profiles
  WHERE  id = p_barber_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'barber_not_found: barber % does not exist', p_barber_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_barber_active THEN
    RAISE EXCEPTION 'barber_inactive: barber % is not currently available', p_barber_id
      USING ERRCODE = 'P0003';
  END IF;

  -- ── Step 3: Validate services (active + assigned to barber) ─
  IF p_service_ids IS NULL OR array_length(p_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'no_services: at least one service must be selected'
      USING ERRCODE = 'P0004';
  END IF;

  FOREACH v_service_id IN ARRAY p_service_ids LOOP
    -- Check the service exists and is active.
    SELECT s.id, s.name, s.price, s.duration_minutes, s.is_active
    INTO   v_service
    FROM   public.services s
    WHERE  s.id = v_service_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'service_not_found: service % does not exist', v_service_id
        USING ERRCODE = 'P0005';
    END IF;

    IF NOT v_service.is_active THEN
      RAISE EXCEPTION 'service_inactive: service % is not currently bookable', v_service_id
        USING ERRCODE = 'P0006';
    END IF;

    -- Check the barber is assigned to this service.
    IF NOT EXISTS (
      SELECT 1
      FROM   public.barber_services bs
      WHERE  bs.barber_id  = p_barber_id
      AND    bs.service_id = v_service_id
    ) THEN
      RAISE EXCEPTION 'service_not_offered: barber % does not perform service %',
        p_barber_id, v_service_id
        USING ERRCODE = 'P0007';
    END IF;

    -- Accumulate total duration server-side.
    v_total_minutes := v_total_minutes + v_service.duration_minutes;
  END LOOP;

  -- ── Step 4: Calculate end time (server-side only) ──────────
  v_ends_at := p_starts_at + (v_total_minutes || ' minutes')::interval;

  -- ── Step 5: Insert the appointment ────────────────────────
  -- The exclusion constraint will raise an exception here if a
  -- conflicting active appointment exists for this barber.
  INSERT INTO public.appointments (
    customer_id,
    barber_id,
    starts_at,
    ends_at,
    status,
    customer_notes
  )
  VALUES (
    v_customer_id,
    p_barber_id,
    p_starts_at,
    v_ends_at,
    'pending',
    p_notes
  )
  RETURNING id INTO v_appointment_id;

  -- ── Step 6: Insert service snapshots ──────────────────────
  FOREACH v_service_id IN ARRAY p_service_ids LOOP
    SELECT s.name, s.price, s.duration_minutes
    INTO   v_service
    FROM   public.services s
    WHERE  s.id = v_service_id;

    INSERT INTO public.appointment_services (
      appointment_id,
      service_id,
      service_name,
      unit_price,
      duration_minutes
    )
    VALUES (
      v_appointment_id,
      v_service_id,
      v_service.name,
      v_service.price,
      v_service.duration_minutes
    );
  END LOOP;

  -- ── Step 7 & 8: Return the appointment id ─────────────────
  -- If the exclusion constraint fires it will raise a PostgreSQL
  -- `exclusion_violation` (23P01) exception before reaching here.
  RETURN v_appointment_id;
END;
$$;

-- Grant execution to authenticated users only.
-- The SECURITY DEFINER context already enforces caller auth.uid() check.
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid[], timestamptz, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_appointment(uuid, uuid[], timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.create_appointment IS
  'Atomic booking creation RPC. Validates barber activity, service '
  'eligibility, calculates server-side end time, inserts appointment '
  'and service snapshots, and relies on the exclusion constraint for '
  'concurrent conflict prevention. Raises descriptive exceptions on failure. '
  'NOTE: working hours and time-off validation will be added in a later loop.';

-- ──────────────────────────────────────────────
-- Grant the create_appointment RPC write access
-- through RLS on behalf of the authenticated caller.
-- ──────────────────────────────────────────────
-- Because the function is SECURITY DEFINER it runs as the postgres user,
-- which bypasses RLS. This is the intended behaviour: all safety checks
-- are performed inside the function body before any INSERT.
--
-- To allow the RPC to write appointment_services (which has no customer
-- INSERT policy), we rely on SECURITY DEFINER bypassing RLS for those
-- rows. This is acceptable because the function validates every input
-- before inserting. The RPC is the sole write path for new bookings.
