-- ============================================================
-- Migration: 20250102000002_booking_working_hours_validation
-- Purpose:   Replace create_appointment() with a version that
--            validates the requested slot against the barber's
--            working hours schedule AND any time-off periods,
--            both resolved in the salon's IANA timezone
--            (read from salon_settings.timezone).
--
-- Depends:   20250101000004_booking_rpc
--            20250102000001_salon_timezone_kolkata
-- Rollback:  Re-deploy previous create_appointment() from
--            20250101000004_booking_rpc.sql.
-- ============================================================
--
-- Validation added in this migration (steps 3a–3c):
--
--   3a. Barber is scheduled to work on the requested day-of-week
--       (at least one is_working = true row in barber_working_hours
--       whose time range covers the full appointment window).
--
--   3b. The entire appointment window [starts_at, ends_at) falls
--       within one working-hours interval. Split-shift bookings
--       that straddle a break are rejected.
--
--   3c. The appointment window does not overlap any time-off period
--       in barber_time_off.
--
-- Time zone:
--   All time comparisons use the salon timezone resolved from
--   salon_settings.timezone to convert timestamptz → local time.
--   This correctly handles IST (UTC+5:30) for Asia/Kolkata.
--   Never hardcode the UTC offset.
--
-- Concurrency note:
--   The exclusion constraint on public.appointments (btree_gist,
--   active statuses) still provides the final concurrent-booking
--   safety net for step 5 (INSERT). The working-hours check here
--   adds a business-rule layer on top.

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
  v_salon_tz         text;
  v_dow              smallint;   -- day-of-week in salon timezone (0=Sun…6=Sat)
  v_start_time       time;       -- wall-clock start in salon timezone
  v_end_time         time;       -- wall-clock end in salon timezone
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

    v_total_minutes := v_total_minutes + v_service.duration_minutes;
  END LOOP;

  -- ── Step 4: Calculate end time (server-side only) ──────────
  v_ends_at := p_starts_at + (v_total_minutes || ' minutes')::interval;

  -- ── Step 3a–3c: Working hours and time-off validation ──────
  --
  -- Resolve salon timezone. Falls back to 'UTC' only if the
  -- singleton row does not exist (should not happen in production).
  SELECT COALESCE(timezone, 'UTC')
  INTO   v_salon_tz
  FROM   public.salon_settings
  LIMIT  1;

  -- Convert UTC instants to salon local time components.
  v_dow        := EXTRACT(DOW FROM p_starts_at AT TIME ZONE v_salon_tz)::smallint;
  v_start_time := (p_starts_at AT TIME ZONE v_salon_tz)::time;
  v_end_time   := (v_ends_at   AT TIME ZONE v_salon_tz)::time;

  -- 3a + 3b: The barber must have a working-hours row for this
  --          day_of_week whose window fully contains [v_start_time, v_end_time).
  --          is_working must be true. Multiple rows per day are supported;
  --          the appointment need only fit inside one of them.
  IF NOT EXISTS (
    SELECT 1
    FROM   public.barber_working_hours bwh
    WHERE  bwh.barber_id   = p_barber_id
    AND    bwh.day_of_week = v_dow
    AND    bwh.is_working  = true
    AND    bwh.start_time  <= v_start_time
    AND    bwh.end_time    >= v_end_time
  ) THEN
    RAISE EXCEPTION
      'outside_working_hours: barber % is not scheduled on day-of-week % '
      'or the requested time window falls outside their working hours',
      p_barber_id, v_dow
      USING ERRCODE = 'P0008';
  END IF;

  -- 3c: The appointment must not overlap any time-off period.
  --     We compare timestamptz directly (both sides are UTC-aware).
  IF EXISTS (
    SELECT 1
    FROM   public.barber_time_off bto
    WHERE  bto.barber_id = p_barber_id
    AND    bto.starts_at < v_ends_at
    AND    bto.ends_at   > p_starts_at
  ) THEN
    RAISE EXCEPTION
      'barber_time_off: barber % has scheduled time off that overlaps '
      'the requested appointment window',
      p_barber_id
      USING ERRCODE = 'P0009';
  END IF;

  -- ── Step 5: Insert the appointment ────────────────────────
  -- The exclusion constraint enforces concurrent conflict prevention.
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

  RETURN v_appointment_id;
END;
$$;

-- Grants unchanged from the previous migration.
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid[], timestamptz, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_appointment(uuid, uuid[], timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.create_appointment IS
  'Atomic booking creation RPC. Validates: '
  '(1) caller authenticated; '
  '(2) barber active; '
  '(3) services active and assigned to barber; '
  '(3a) barber is scheduled on the requested day-of-week; '
  '(3b) appointment window falls within a working-hours interval; '
  '(3c) appointment does not overlap a time-off period; '
  '(4) end time derived server-side from service durations; '
  '(5) exclusion constraint prevents concurrent slot conflicts. '
  'All time comparisons use the IANA timezone from salon_settings.';
