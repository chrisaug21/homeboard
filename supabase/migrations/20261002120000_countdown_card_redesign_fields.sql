-- Countdown card redesign (Ticket / Postcard templates).
-- location -> location_name (column was empty), plus structured detail/source,
-- start time (copied once from the calendar event at creation, editable),
-- photo focal point, and a per-countdown template override.
alter table public.countdowns rename column location to location_name;
alter table public.countdowns
  add column location_detail text,
  add column location_source text check (location_source in ('maps', 'freeform'));

-- start_time null + all_day false = no time given (hand-made countdown)
alter table public.countdowns
  add column start_time time,
  add column all_day boolean not null default false;

alter table public.countdowns
  add column photo_focal_x numeric not null default 50 check (photo_focal_x between 0 and 100),
  add column photo_focal_y numeric not null default 50 check (photo_focal_y between 0 and 100),
  add column template text not null default 'auto' check (template in ('auto', 'ticket', 'postcard'));

alter table public.countdowns
  add constraint countdowns_description_max_140 check (char_length(description) <= 140);
