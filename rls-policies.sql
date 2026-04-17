-- ─────────────────────────────────────────────────────────────
-- Homeboard RLS Policies — Phase 1 Multi-User Auth
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/rgvvsgvxmdebcqlokiwv/sql
--
-- Strategy:
--   • anon role → SELECT only (display view reads without login)
--   • authenticated role → full CRUD scoped to the user's household
--
-- DO NOT touch rsvps or invited_parties — those are wedding-site tables.
-- ─────────────────────────────────────────────────────────────

-- Helper function: returns the household_id of the logged-in user.
-- SECURITY DEFINER lets it read public.users even if that table has RLS.
CREATE OR REPLACE FUNCTION auth_household_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;


-- ── HOUSEHOLDS ─────────────────────────────────────────────────
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_households" ON households;
DROP POLICY IF EXISTS "auth_select_households"  ON households;
DROP POLICY IF EXISTS "auth_update_households"  ON households;

CREATE POLICY "anon_select_households" ON households
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_households" ON households
  FOR SELECT TO authenticated
  USING (id = auth_household_id());

CREATE POLICY "auth_update_households" ON households
  FOR UPDATE TO authenticated
  USING (id = auth_household_id())
  WITH CHECK (id = auth_household_id());


-- ── TODOS ──────────────────────────────────────────────────────
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_todos"  ON todos;
DROP POLICY IF EXISTS "auth_select_todos"  ON todos;
DROP POLICY IF EXISTS "auth_insert_todos"  ON todos;
DROP POLICY IF EXISTS "auth_update_todos"  ON todos;

CREATE POLICY "anon_select_todos" ON todos
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_todos" ON todos
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_todos" ON todos
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_todos" ON todos
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());

-- Todos are never hard-deleted (archived_at only), no DELETE policy needed.


-- ── MEAL_PLAN ──────────────────────────────────────────────────
ALTER TABLE meal_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_plan"  ON meal_plan;
DROP POLICY IF EXISTS "auth_select_meal_plan"  ON meal_plan;
DROP POLICY IF EXISTS "auth_insert_meal_plan"  ON meal_plan;
DROP POLICY IF EXISTS "auth_update_meal_plan"  ON meal_plan;
DROP POLICY IF EXISTS "auth_delete_meal_plan"  ON meal_plan;

CREATE POLICY "anon_select_meal_plan" ON meal_plan
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_meal_plan" ON meal_plan
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_meal_plan" ON meal_plan
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_meal_plan" ON meal_plan
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_delete_meal_plan" ON meal_plan
  FOR DELETE TO authenticated
  USING (household_id = auth_household_id());


-- ── MEAL_PLAN_NOTES ────────────────────────────────────────────
ALTER TABLE meal_plan_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_meal_plan_notes"  ON meal_plan_notes;
DROP POLICY IF EXISTS "auth_select_meal_plan_notes"  ON meal_plan_notes;
DROP POLICY IF EXISTS "auth_insert_meal_plan_notes"  ON meal_plan_notes;
DROP POLICY IF EXISTS "auth_update_meal_plan_notes"  ON meal_plan_notes;
DROP POLICY IF EXISTS "auth_delete_meal_plan_notes"  ON meal_plan_notes;

CREATE POLICY "anon_select_meal_plan_notes" ON meal_plan_notes
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_meal_plan_notes" ON meal_plan_notes
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_meal_plan_notes" ON meal_plan_notes
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_meal_plan_notes" ON meal_plan_notes
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_delete_meal_plan_notes" ON meal_plan_notes
  FOR DELETE TO authenticated
  USING (household_id = auth_household_id());


-- ── COUNTDOWNS ─────────────────────────────────────────────────
ALTER TABLE countdowns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_countdowns"  ON countdowns;
DROP POLICY IF EXISTS "auth_select_countdowns"  ON countdowns;
DROP POLICY IF EXISTS "auth_insert_countdowns"  ON countdowns;
DROP POLICY IF EXISTS "auth_update_countdowns"  ON countdowns;
DROP POLICY IF EXISTS "auth_delete_countdowns"  ON countdowns;

CREATE POLICY "anon_select_countdowns" ON countdowns
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_countdowns" ON countdowns
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_countdowns" ON countdowns
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_countdowns" ON countdowns
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_delete_countdowns" ON countdowns
  FOR DELETE TO authenticated
  USING (household_id = auth_household_id());


-- ── SCORECARDS ─────────────────────────────────────────────────
ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scorecards"  ON scorecards;
DROP POLICY IF EXISTS "auth_select_scorecards"  ON scorecards;
DROP POLICY IF EXISTS "auth_insert_scorecards"  ON scorecards;
DROP POLICY IF EXISTS "auth_update_scorecards"  ON scorecards;

CREATE POLICY "anon_select_scorecards" ON scorecards
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_scorecards" ON scorecards
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_scorecards" ON scorecards
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_scorecards" ON scorecards
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());


-- ── SCORECARD_SESSIONS ─────────────────────────────────────────
ALTER TABLE scorecard_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scorecard_sessions"  ON scorecard_sessions;
DROP POLICY IF EXISTS "auth_select_scorecard_sessions"  ON scorecard_sessions;
DROP POLICY IF EXISTS "auth_insert_scorecard_sessions"  ON scorecard_sessions;
DROP POLICY IF EXISTS "auth_update_scorecard_sessions"  ON scorecard_sessions;

CREATE POLICY "anon_select_scorecard_sessions" ON scorecard_sessions
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_scorecard_sessions" ON scorecard_sessions
  FOR SELECT TO authenticated
  USING (household_id = auth_household_id());

CREATE POLICY "auth_insert_scorecard_sessions" ON scorecard_sessions
  FOR INSERT TO authenticated
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "auth_update_scorecard_sessions" ON scorecard_sessions
  FOR UPDATE TO authenticated
  USING (household_id = auth_household_id())
  WITH CHECK (household_id = auth_household_id());


-- ── USERS (self-read only) ─────────────────────────────────────
-- Users can only read their own row (needed for the auth lookup at login).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_own_user" ON users;

CREATE POLICY "auth_select_own_user" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Note: the auth_household_id() function uses SECURITY DEFINER to bypass
-- this policy when looking up the household for a given auth.uid().
