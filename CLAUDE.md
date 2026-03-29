# Homeboard

Household command center PWA. Runs on a wall-mounted Android tablet in landscape mode, managed from a phone in portrait mode.

## Stack
- Vanilla HTML/CSS/JS — single `index.html`
- Supabase (project: `rgvvsgvxmdebcqlokiwv`)
- Netlify — env vars injected at build via `sed` in `netlify.toml`
- Google Calendar API — read-only, API key based (no OAuth)
- Lucide icons via CDN

## File Structure
```text
index.html          — single HTML file, both display + admin shells
css/
  display.css       — display mode styles only
  admin.css         — admin mode styles only
js/
  shared.js         — Supabase init, VERSION constant, utility functions, shared config
  display.js        — display mode logic (auto-rotate, data fetching, rendering)
  admin.js          — all admin mode logic (screens, modals, event handling)
manifest.json       — PWA manifest for display mode (landscape)
manifest-admin.json — PWA manifest for admin mode (portrait)
sw.js               — service worker, cache key homeboard-v##
netlify.toml        — build config, env var injection via sed
```

## Two Modes
- **Display Mode** — landscape tablet, auto-rotates screens (per-screen timers), manual swipe. Mobile screens (≤ 768 px) are redirected to Admin mode automatically.
- **Admin Mode** — portrait phone, at `/admin`

## Display Screens (in order)
1. Upcoming Calendar (Google Cal read-only) — controlled independently by `display_settings.active_screens` and `screen_order`
2. Monthly Calendar (Google Cal read-only) — controlled independently by `display_settings.active_screens` and `screen_order`
3. To-Do List
4. Meal Plan (dinner only on display)
5. Countdown Board (Lucide icons)
6. RSVP Live Board (Chris & Bailey only — reads `rsvps` table, **hardcoded to this household, retires Oct 9 2026**; intentionally excluded from active-screen toggles; remove via code change after that date)

## Supabase Tables
- `households` — `assistant_name`, `color_scheme`, `google_cal_id`, `google_cal_key`, `display_settings` (JSONB), `total_invited_guests`, admin PIN
- `users` — linked to `auth.users`, household membership, role (admin/member)
- `todos` — soft delete via `archived_at`, never hard delete
- `meal_plan` — `user_id` nullable: null = shared/household, uuid = personal
- `meal_plan_notes` — one note per household per week, keyed by `household_id` + `week_start`
- `countdowns` — `icon` is a Lucide icon name string e.g. `"plane"`
- `rsvps` — pre-existing wedding table, do not modify schema
- `invited_parties` — wedding invite list with `name`, `invited_count`, nullable `rsvp_id`, and `created_at`; this is the source of truth for matched vs pending invite parties

## Wedding RSVP Logic
- Homeboard wedding counts must derive from `rsvps` + `invited_parties`, not from hardcoded totals or subtraction from `households.total_invited_guests`
- `Confirmed attending` = sum of `rsvps.guest_count` where `attending = true`
- `Declined` = sum of `invited_parties.invited_count` where `rsvp_id` is set and the linked RSVP has `attending = false`
- `Pending` = sum of `invited_parties.invited_count` where `rsvp_id` is null
- `Responded` = count of matched `invited_parties`
- Shared fuzzy match scoring for RSVP linking:
  1. exact last-word match is weighted highest
  2. any word overlap is weighted medium
  3. full-string similarity is weighted lower
- Display mode and admin mode use the same matching helper. High-confidence matches may auto-link on refresh and should log to the browser console.

## display_settings JSONB shape
```json
{
  "members":        [{"name": "Chris", "color": "#2563eb"}, ...],
  "active_screens": ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  "screen_order":   ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  "timer_intervals": { "upcoming_calendar": 30, "monthly_calendar": 60, "todos": 45, "meals": 30, "countdowns": 15 },
  "upcoming_days":  5
}
```
- `display_settings.members` drives the todo assignee picker and is managed via the Settings screen. **Planned migration**: move to `users` table when multi-user auth is implemented.
- `upcoming_calendar` and `monthly_calendar` are separate screens across display rotation and admin settings. Never write the legacy `calendar` key back to Supabase.
- The "Default calendar view" setting has been removed. Whichever calendar screen appears first in `screen_order` renders first.
- `display_settings.upcoming_days` drives the `UPCOMING_DAYS` variable in `display.js`. Update both together if changing upcoming-view logic.
- Google Calendar currently reads a single calendar ID (`households.google_cal_id`). **Future enhancement**: support toggling multiple calendars from the Integrations settings.
- **Recurring to-dos** are planned for a future PR and will require a schema change to `todos`.

## Color Palette
- Background: `#F5F0E8` (warm parchment)
- Surface/cards: `#FFFDF7` (warm white)
- Primary text: `#1C1917` (warm near-black)
- Accent: `#B45309` (amber)
- Secondary accent: `#15803D` (sage green)
- Muted text: `#78716C` (warm gray)

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GOOGLE_CAL_KEY`
- `UNSPLASH_ACCESS_KEY`

## Local Dev
Use `netlify dev` — injects env vars correctly.
Use `netlify dev --no-watch` if Mac permissions error occurs.
`file://` and `npx serve .` do not work.

## Homeboard-Specific Rules
- Never modify the `rsvps` table schema — it belongs to the wedding site
- Never hard-delete todos — always set `archived_at`
- `meal_plan` rows with `user_id = null` are shared/household; never show personal rows (`user_id` set) on the display
- sw.js cache prefix: `homeboard-v##`
- When pushing any change: update `VERSION` in `js/shared.js` (patch bump for fixes, minor bump for features), update `CACHE_NAME` in `sw.js` to match, and keep `README.md` accurate — add new tables, env vars, or screens as they are introduced

## Planned future work
- **Household members → users table**: `display_settings.members` currently stores the member list. Migrate to the `users` table when multi-user auth is implemented.
- **Multiple Google Calendars**: the Integrations settings panel has a code comment noting this. When implementing, each calendar will need an ID and an enabled toggle stored in `display_settings`.
- **Recurring to-dos**: planned for a future PR; requires a schema change to the `todos` table.
