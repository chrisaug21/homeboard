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
6. RSVP Live Board (Chris & Bailey only — reads `rsvps` table, **hardcoded to this household, hidden starting Oct 11, 2026**; intentionally excluded from active-screen toggles; remove via code change after that date)

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
- RSVP soft delete uses `rsvps.status`, never hard delete rows
- Status values: `active` and `superseded`
- `rsvps.merged_into_party_id` is the explicit link from a superseded RSVP to the invited party it was merged into
- All RSVP queries used for counts, matching, or display must read `status = 'active'` only
- Homeboard wedding counts must derive from `rsvps` + `invited_parties`, not from hardcoded totals or subtraction from `households.total_invited_guests`
- `Attending` = matched attending people only; use the linked RSVP guest count, clamped to the invited party count if an RSVP overstates guests so totals stay consistent
- `Declined` = full declines plus partial declines (`invited_count - guest_count` when a matched attending RSVP brings fewer guests than invited)
- The display `Declined Parties` modal lists only full declines where the linked RSVP has `attending = false`; partial under-counts stay visible in the guest list
- `Pending` = sum of `invited_parties.invited_count` where `rsvp_id` is null
- `Responded` = count of matched `invited_parties`
- `Review RSVPs` = count of flagged RSVP rows in `Needs Review`
- Display totals must reconcile: `attending + declined + pending = total invited_count across invited_parties`
- Shared fuzzy match scoring for RSVP linking:
  1. surname matching is weighted highest, including a strong bonus when the RSVP's last meaningful token appears anywhere in the invited party name
  2. any word overlap is weighted medium
  3. full-string similarity is weighted lower
- Single-word RSVPs get a special pass: if the RSVP exactly matches the first name of exactly one invited party across all parties, treat it as high confidence
- Needs Review categories: `Unmatched`, `Duplicate`, `Count mismatch`, `Low confidence`
- Display mode and admin mode use the same matching helper. Duplicate detection must score against all `invited_parties`, including already-matched parties. High-confidence matches may auto-link on refresh and should log to the browser console, but only after that all-parties duplicate check passes. If the best match is already linked above the duplicate threshold, flag it as `Duplicate` instead of auto-linking or treating it as `Unmatched`.
- Duplicate review modals use a single confirm flow: show the linked RSVP plus any number of competing active RSVPs for that party, choose the primary RSVP, edit the guest count, link the primary RSVP to the invited party, and set every other conflict RSVP to `superseded` with `merged_into_party_id`.
- RSVP review actions live in the shared admin bottom-sheet modal. A resolved issue should disappear from the Needs Review list after the modal action completes.
- On the display guest list, matched attending parties with `guest_count < invited_count` stay in the list and use an amber guest-count pill to signal the under-count.
- On the admin RSVP guest list, under-counted attending parties should collapse into one amber status pill that reads `Attending • X of Y`; exact-match attending counts keep the normal green attending pill.

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

## Styling Conventions
- Shared corner-radius tokens live in `:root` in `index.html`: use `--button-radius` for interactive buttons and `--tag-radius` for pills, badges, date chips, and other tag-like UI
- On admin mobile layouts up to `480px`, single primary actions should run full width and two-button action rows should split evenly across the row
- The admin nav is a fixed bottom bar pinned flush to the bottom edge of the viewport; keep toast positioning above it so nav actions stay accessible
- The display footer assistant label (`#household-name`) uses the Google Font `Righteous`, loaded from Google Fonts in `index.html`
- The display footer assistant label should render the stored `assistant_name` exactly as saved in Supabase; do not re-case it in JS or force uppercase in CSS
- The display to-do screen should use vertical scrolling only; avoid column-based layouts that interfere with horizontal swipe navigation between screens
- Admin tabs should use skeleton loaders that approximate the final layout while data is loading, especially on the RSVP screen
- Todo assignee pills in both admin and display should use one shared member-color lookup helper sourced from `display_settings.members`; never duplicate the lookup logic, never hardcode per-person colors, and use the neutral fallback only when no configured color exists
- The admin to-do screen must not fail just because household settings fail; render the todo data first, then re-render for member colors if `display_settings.members` arrives afterward
- The RSVP display guest-list empty state is a centered neutral waiting state in the pending-blue tone, with a matching zero-count color for the confirmed guest total
- The admin RSVP `Pending` pill should use the same pending-blue waiting-state styling as the RSVP display, not the amber warning tone
- Hide pre-today Google Calendar events from the admin countdown source-event picker; do not delete or mutate saved countdown rows
- User-facing error messages must stay non-technical: never mention Supabase, service names, table names, or raw config instructions. Use plain patterns like `Something went wrong loading your data. Please try refreshing.` and `Something went wrong saving your changes. Please try again.`

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
