-- The admin "Delete RSVP" soft-delete flow (js/admin-rsvp.js) writes
-- status = 'dismissed', but rsvps_status_check only allowed 'active' and
-- 'superseded', so every delete attempt failed with a constraint violation.
-- Additive change to a homeboard-owned column; the wedding site never
-- writes to status, so this does not affect its inserts.
alter table public.rsvps
  drop constraint if exists rsvps_status_check;

alter table public.rsvps
  add constraint rsvps_status_check
  check (status = any (array['active'::text, 'superseded'::text, 'dismissed'::text]));
