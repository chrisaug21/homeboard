-- Homeboard-only bookkeeping column on the wedding site's rsvps table.
-- Additive and nullable-free-with-default, so it does not affect the
-- wedding site's insert (name, attending, guest_count only).
alter table rsvps
  add column if not exists excluded_from_auto_match boolean not null default false;
