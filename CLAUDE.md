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
homeboard_logo.svg  — default display-footer logo asset
sw.js               — service worker, cache key homeboard-v##
netlify.toml        — build config, env var injection via sed
```

## Two Modes
- **Display Mode** — landscape tablet, auto-rotates screens (per-screen timers), manual swipe. Mobile screens (≤ 768 px) are redirected to Admin mode automatically.
- **Admin Mode** — portrait phone, at `/admin`
- Admin Settings is opened from the gear icon in the admin header, not a bottom-nav tab.

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
- `countdowns` — `icon` is a Lucide icon name string e.g. `"plane"`; optional `unsplash_image_url`, `days_before_visible`, and `photo_keyword` support countdown photos and delayed visibility
- `scorecards` — scorecard definitions with `name`, `increments` (JSONB number array), `players` (JSONB `{name,color}` array), `show_history`, `allow_negative`, and soft delete via `archived_at`
- `scorecard_sessions` — per-game scorecard sessions with `started_at`, `ended_at`, `scores` JSONB, optional `wagers`, optional `wager_results`, optional `winner`, and `is_final_jeopardy`
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
  "active_screens": ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecards"],
  "screen_order":   ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecard_<id>"],
  "timer_intervals": { "upcoming_calendar": 30, "monthly_calendar": 60, "todos": 45, "meals": 30, "countdowns": 15, "scorecards": 30 },
  "upcoming_days":  5
}
```
- `display_settings.members` drives the todo assignee picker and is managed via the Settings screen. **Planned migration**: move to `users` table when multi-user auth is implemented.
- `upcoming_calendar` and `monthly_calendar` are separate screens across display rotation and admin settings. Never write the legacy `calendar` key back to Supabase.
- The "Default calendar view" setting has been removed. Whichever calendar screen appears first in `screen_order` renders first.
- Scorecards are toggled by the shared `scorecards` active-screen key. In the Settings UI, Scorecards appears as one screen-order row; saving expands that slot into the underlying `scorecard_[id]` entries used by display rotation.
- `display_settings.upcoming_days` drives the `UPCOMING_DAYS` variable in `display.js`. Update both together if changing upcoming-view logic.
- Google Calendar currently reads a single calendar ID (`households.google_cal_id`). **Future enhancement**: support toggling multiple calendars from the Integrations settings.
- **Recurring to-dos** are planned for a future PR and will require a schema change to `todos`.
- Countdown admin supports optional Unsplash photos plus `days_before_visible` timing. Past calendar events are filtered out of the countdown source-event picker, but saved countdown rows are not mutated.

## Color Palette
- Background: `#F5F0E8` (warm parchment)
- Surface/cards: `#FFFDF7` (warm white)
- Primary text: `#1C1917` (warm near-black)
- Accent: `#B45309` (amber)
- Secondary accent: `#15803D` (sage green)
- Muted text: `#78716C` (warm gray)

## Styling Conventions
- Before writing any CSS or adding styled components, read `TOKENS.md` for the canonical token reference. Always use semantic tokens (`--color-accent`, `--color-accent-subtle`) for new interactive components. Never use `--amber` or `--amber-soft` in new code.
- Shared corner-radius tokens live in `:root` in `index.html`: use `--button-radius` for interactive buttons and `--tag-radius` for pills, badges, date chips, and other tag-like UI
- On admin mobile layouts up to `480px`, single primary actions should run full width and two-button action rows should split evenly across the row
- The admin nav is a fixed bottom bar pinned flush to the bottom edge of the viewport; keep toast positioning above it so nav actions stay accessible
- The display footer assistant label (`#household-name`) uses the Google Font `Righteous`, loaded from Google Fonts in `index.html`
- The display footer assistant label should render the stored `assistant_name` exactly as saved in Supabase; do not re-case it in JS or force uppercase in CSS
- If `assistant_name` is null, missing, or blank, the display footer should render `homeboard_logo.svg` as an `<img>` at about `120px` wide instead of text; if that SVG fails to load, use the image `onerror` handler to fall back to the Righteous text label `Homeboard`
- The footer logo should stay scheme-aware: Warm can use a subtle `brightness(0.97)`, Slate should use no filter, and Dark should use `saturate(0) brightness(0) invert(0.93) sepia(0.22) saturate(0.7) brightness(1.02)` so the mark reads as a warm off-white close to the dark scheme ink color instead of orange or gold
- The display footer screen nav uses icon buttons, not dash/notch pagination. Use small rounded-square buttons with muted/outline inactive styling and the primary accent fill for the active screen
- Display footer nav sizing should be controlled through the shared CSS custom properties `--display-nav-button-width`, `--display-nav-button-active-width`, `--display-nav-button-height`, `--display-nav-button-gap`, and `--display-nav-icon-size`; nav corner radius should use the shared global `--button-radius`
- The display footer nav should not have an outer capsule/frame; the buttons sit directly in the footer with no shared background, border, or shadow wrapper
- The display footer nav active colors should be controlled per scheme via `--display-nav-active-bg` and `--display-nav-active-border`; light schemes should use `--color-accent` for the active nav background, while the dark scheme should use `--color-accent-subtle`
- Semantic interaction tokens are `--color-accent`, `--color-accent-subtle`, and `--color-text-on-accent`; use them for any new interactive, selected, highlighted, or accent-fill UI
- Scorecard components should follow `TOKENS.md`: use `--color-accent` and `--color-accent-subtle` for interactive/active states, and use `--sage-soft` / `--rose-soft` only for positive or negative score feedback
- `--amber` and `--amber-soft` are legacy color tokens being deprecated; keep them only for older component references during migration and do not use them directly in new components
- The display footer upcoming/month nav buttons should use a custom inline SVG calendar outline with an empty body area so the centered `upcoming_days` / `30` overlay remains readable; do not use a Lucide calendar glyph there
- Display footer icon mapping: `todos` = `list-todo`, `meals` = `utensils-crossed`, `upcoming_calendar` = calendar icon with centered `display_settings.upcoming_days` overlay (default `7`), `monthly_calendar` = the same calendar icon with centered `30` overlay, `countdowns` = `hourglass`, `scorecards` = `trophy`, `rsvp` = `heart`, fallback = generic layout/grid icon
- All countdown screens collapse into one footer nav button. Tapping that hourglass always jumps to the first countdown in the current rotation order, and the button remains active across every countdown screen
- All scorecard screens collapse into one footer trophy button. Tapping it jumps to the first scorecard in the current rotation order, and swipe navigation moves between individual scorecard screens.
- Scorecard display layout auto-switches by player count: 2-4 players render as per-player columns, 5-6 players render as selectable rows plus shared increment buttons.
- End Game and Bonus Round controls are available on both the display scorecard screen and the admin scorecard detail view; both paths write to the same shared scorecard session state.
- Bonus Round uses the same 3-step flow on both admin and display: wager entry, correct/incorrect result entry, then automatic session end plus a fresh zeroed session. Each wager must be between `0` and that player's current score.
- When a display footer nav button is tapped, auto-rotation should reset immediately and resume using that destination screen's configured `display_settings.timer_intervals` value, never a hardcoded fallback unless the screen has no saved timer
- The display to-do screen should use vertical scrolling only; avoid column-based layouts that interfere with horizontal swipe navigation between screens
- The Settings screen sync row should keep visible spacing below its helper copy so the sync button/timestamp do not crowd the paragraph above
- Admin tabs should use skeleton loaders that approximate the final layout while data is loading, especially on the RSVP screen
- Todo assignee pills in both admin and display should use one shared member-color lookup helper sourced from `display_settings.members`; never duplicate the lookup logic, never hardcode per-person colors, and use the neutral fallback only when no configured color exists
- The admin to-do screen must not fail just because household settings fail; render the todo data first, then re-render for member colors if `display_settings.members` arrives afterward
- Active incomplete todos with `due_date < today` should show the overdue treatment on both display and admin: red left border, subtle red card tint, and red overdue date-pill text
- Todo completion celebration animations are display-view only and must fully clean up any temporary DOM they create
- Display celebrations load `canvas-confetti@1.9.2` and `gsap@3.12.5` by CDN in `index.html`; confetti burst, star shower, and fireworks use Canvas Confetti, bubble float / thumbs up bounce / ink splash use GSAP, and ripple rings stay CSS/JS only
- Every library-backed display celebration must guard calls with runtime `typeof` checks (`confetti` / `gsap`) and silently degrade to a simple pure CSS/JS particle burst if a CDN script fails to load
- Celebration particle colors should resolve the active scheme accent at runtime from `getComputedStyle(...).getPropertyValue('--amber')` and mix it with white, bright gold, and fresh green so effects stay scheme-aware without hardcoding one palette
- Display todo completion timing should be: checkmark immediately, item fade/removal starts roughly 10-15% into the celebration with a quick ~200 ms opacity transition, and the celebration continues independently as a send-off
- Checking off a display todo must reset the auto-rotation timer using the same `resetAutoRotate()` path as other display interactions so the screen does not rotate away mid-celebration
- Rotation reset root cause: a previously scheduled auto-rotate callback can already be queued when the todo completion happens, so `clearTimeout()` alone is not sufficient; guard auto-rotate with a token/generation check so stale queued callbacks no-op instead of rotating the screen
- GSAP bubble-float motion should use per-bubble sinusoidal horizontal drift while rising, with randomized amplitude/frequency/phase and slight stagger, so bubbles float organically instead of traveling straight up
- The celebration pool includes 7 animations total; `ink splash` is a GSAP effect with 6-8 accent/gold/green blobs that burst from the checkbox, pulse slightly larger, then contract away alongside one fast expanding ring
- The old sparkle-trail celebration is replaced by ripple rings: three concentric accent-color outline rings expand from the checkbox position, staggered by about 120 ms, and fade as they grow to roughly 200-300 px diameter
- Bubble float and ink splash should not use white in their color mix; use the runtime accent plus visible celebration tones like gold, coral, teal, purple, and green so particles stay readable on light and dark schemes
- The RSVP display guest-list empty state is a centered neutral waiting state in the pending-blue tone, with a matching zero-count color for the confirmed guest total
- The admin RSVP `Pending` pill should use the same pending-blue waiting-state styling as the RSVP display, not the amber warning tone
- Hide pre-today Google Calendar events from the admin countdown source-event picker; do not delete or mutate saved countdown rows
- User-facing error messages must stay non-technical: never mention Supabase, service names, table names, or raw config instructions. Use plain patterns like `Something went wrong loading your data. Please try refreshing.` and `Something went wrong saving your changes. Please try again.`
- User-facing version labels should always render as lowercase `v${VERSION}` and must not be uppercased by CSS

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
- When pushing any change: always increment `VERSION` in `js/shared.js` by at least a patch bump (use a minor bump for features when appropriate), update `CACHE_NAME` in `sw.js` to match, and keep `README.md` accurate — add new tables, env vars, or screens as they are introduced

## Planned future work
- **Household members → users table**: `display_settings.members` currently stores the member list. Migrate to the `users` table when multi-user auth is implemented.
- **Multiple Google Calendars**: the Integrations settings panel has a code comment noting this. When implementing, each calendar will need an ID and an enabled toggle stored in `display_settings`.
- **Recurring to-dos**: planned for a future PR; requires a schema change to the `todos` table.
