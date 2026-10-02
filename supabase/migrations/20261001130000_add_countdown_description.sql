-- Optional free-text note shown on a countdown card. Typed by the household
-- in Homeboard only; never copied from or synced to Google Calendar.
alter table public.countdowns
  add column if not exists description text;
