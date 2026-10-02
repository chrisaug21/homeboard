-- Countdowns can now carry a display-only location override and a persistent
-- link back to the Google Calendar event they were created from.
-- Both columns are nullable and additive; existing rows are untouched.
alter table public.countdowns
  add column if not exists location text,
  add column if not exists calendar_event_id text;

comment on column public.countdowns.location is
  'Display-only location shown on the countdown card. Never synced back to Google.';
comment on column public.countdowns.calendar_event_id is
  'Google Calendar event id this countdown was created from (null for hand-made or legacy countdowns). Lets admin recognise the event even after the countdown is renamed.';
