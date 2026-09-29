-- Meal types become per-household: a set of standard types that can be toggled on/off,
-- plus household-defined custom types (stored as display_settings.meal_types, keys
-- prefixed "custom_"). meal_plan.meal_type / meal_library.meal_type therefore must accept
-- any key, so drop any CHECK constraint that pinned them to the old fixed list.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.meal_plan'::regclass, 'public.meal_library'::regclass)
      AND pg_get_constraintdef(oid) ILIKE '%meal_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;

-- Map legacy free-form values (e.g. "Fend for Yourself", "Pick-Up") onto the standard keys.
UPDATE public.meal_plan
SET meal_type = regexp_replace(lower(trim(meal_type)), '[\s-]+', '_', 'g')
WHERE meal_type IS NOT NULL
  AND meal_type <> regexp_replace(lower(trim(meal_type)), '[\s-]+', '_', 'g');

UPDATE public.meal_library
SET meal_type = regexp_replace(lower(trim(meal_type)), '[\s-]+', '_', 'g')
WHERE meal_type IS NOT NULL
  AND meal_type <> regexp_replace(lower(trim(meal_type)), '[\s-]+', '_', 'g');

-- Existing households already use every standard type today (including HelloFresh), so
-- they keep all seven enabled as "defaults" with no custom entries or icon overrides.
-- New households start without meal_types and get the app default set (no HelloFresh).
UPDATE public.households
SET display_settings = jsonb_set(
  COALESCE(display_settings, '{}'::jsonb),
  '{meal_types}',
  jsonb_build_object(
    'enabled', jsonb_build_array('cooking', 'hellofresh', 'going_out', 'delivery', 'pick_up', 'fend_for_yourself', 'date_night'),
    'icons', '{}'::jsonb,
    'custom', '[]'::jsonb
  )
)
WHERE COALESCE(display_settings, '{}'::jsonb) -> 'meal_types' IS NULL;
