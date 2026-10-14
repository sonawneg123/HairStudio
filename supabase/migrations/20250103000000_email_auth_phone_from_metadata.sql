-- ============================================================
-- Migration: 20250103000000_email_auth_phone_from_metadata
-- Purpose:   Update handle_new_user() to copy the phone number
--            from raw_user_meta_data (instead of auth.users.phone)
--            into public.profiles at account creation time.
--
--            Context: the application switched from phone+password
--            authentication (Supabase Phone provider) to email+password
--            with a server-side synthetic email identifier. With this
--            change, auth.users.phone is no longer populated. Instead,
--            the real E.164 phone number is passed in
--            options.data.phone (raw_user_meta_data->>'phone') by the
--            signUp server action and copied here.
--
-- Depends:   20250102000000_phone_auth_profile
-- Rollback:  Re-deploy the previous handle_new_user() body from
--            20250102000000_phone_auth_profile.sql.
-- ============================================================
--
-- Security notes:
--   • Phone number ownership is NOT verified. Because OTP / SMS
--     confirmation is disabled, the application cannot assert that
--     the user actually controls the number they registered with.
--     The phone column stores the value as self-reported.
--   • The synthetic email identifier is stored in auth.users.email,
--     not in profiles.phone. profiles.phone receives the human-readable
--     E.164 number from raw_user_meta_data.
--   • SECURITY DEFINER + fixed search_path retained from original.
--   • ON CONFLICT DO NOTHING keeps the function idempotent.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile row.
  -- full_name: from raw_user_meta_data supplied at signUp time.
  -- phone:     from raw_user_meta_data->>'phone', supplied by the
  --            server action. auth.users.phone is no longer populated
  --            because signup now uses email+password.
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone'  -- may be NULL if not supplied
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert default 'customer' role.
  -- No elevated role is ever assigned here.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Trigger function: creates a profile (with phone from raw_user_meta_data) '
  'and a default customer role for every new auth.users row. '
  'Phone is read from raw_user_meta_data->>"phone" (set by the signUp server '
  'action); auth.users.phone is not used because signup uses email+password. '
  'Phone ownership is NOT verified. Idempotent via ON CONFLICT DO NOTHING.';
