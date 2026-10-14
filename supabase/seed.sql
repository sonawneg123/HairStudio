-- ============================================================
-- Seed file: supabase/seed.sql
-- Purpose:   Development-only sample data.
--            NOT for production — do not run against a live database.
-- Usage:     Applied automatically during `supabase db reset`.
--            To skip seeding in production, set
--            [db.seed] enabled = false in supabase/config.toml.
-- ============================================================
--
-- ⚠  DEVELOPMENT DATA ONLY
-- Prices below are PLACEHOLDER values for development and testing.
-- They do not represent actual Raj Faded Studio pricing.
-- Replace with real pricing before going live.
-- ──────────────────────────────────────────────

-- Seed salon settings singleton
-- Timezone: Asia/Kolkata — Indian Standard Time (IST, UTC+5:30, no DST).
INSERT INTO public.salon_settings (salon_name, timezone)
VALUES ('Raj Faded Studio', 'Asia/Kolkata')
ON CONFLICT DO NOTHING;

-- Seed example services (placeholder prices — not real salon pricing)
INSERT INTO public.services (name, slug, description, duration_minutes, price, is_active, display_order)
VALUES
  ('Classic Fade',       'classic-fade',       'Clean skin fade with scissors finish.',          45, 35.00, true, 1),
  ('Beard Trim',         'beard-trim',          'Shape and clean up beard line.',                 20, 20.00, true, 2),
  ('Hair + Beard Combo', 'hair-beard-combo',    'Classic fade plus beard trim.',                  60, 50.00, true, 3),
  ('Kids Cut',           'kids-cut',            'Haircut for children under 12.',                 30, 25.00, true, 4),
  ('Hot Towel Shave',    'hot-towel-shave',     'Traditional straight-razor shave with hot towel.',45, 40.00, true, 5)
ON CONFLICT (slug) DO NOTHING;
