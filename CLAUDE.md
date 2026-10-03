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
privacy.html        — standalone public privacy policy at /privacy (linked from the marketing footer; update it if data handling changes)
css/
  display.css       — display mode styles only
  admin.css         — admin mode styles only
js/
  shared.js         — Supabase init, VERSION constant, utility functions, shared config
  display.js        — display mode logic (auto-rotate, data fetching, rendering)
  admin.js          — all admin mode logic (screens, modals, event handling)
design-system/     — reference only (not served): new design system tokens, fonts, logos, component previews. Redesign plan: docs/design-system-implementation-plan.md
manifest.json       — PWA manifest for display mode (landscape)
manifest-admin.json — PWA manifest for admin mode (portrait)
brand/              — logo, mark and app-icon SVGs (light/dark pairs); fonts/ — self-hosted Rubik + Manrope; css/tokens.css — design tokens
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
4. Meal Plan — one screen per enabled meal type (breakfast, lunch, dinner), controlled by `display_settings.meal_slots`; all meal screens collapse into a single footer nav button (like countdowns/scorecards) and each screen's header reads "Meal Plan - <Type>"
5. Countdown Board (Lucide icons)
6. RSVP Live Board (Chris & Bailey only — reads `rsvps` table, **hardcoded to this household, hidden starting Oct 11, 2026**; intentionally excluded from active-screen toggles; remove via code change after that date)

## Supabase Tables
- `households` — `assistant_name`, `color_scheme`, `google_cal_id`, `google_cal_key`, `display_settings` (JSONB), `total_invited_guests`, admin PIN. The anon role (wall display) has column-level SELECT only on the display-facing columns — never `admin_pin` or `google_cal_key` — so display code must select explicit columns, never `*`; `google_cal_key` is unused by the app (the legacy public-calendar path uses the `GOOGLE_CAL_KEY` env var)
- `users` — linked to `auth.users`, household membership, role (admin/member)
- `todos` — soft delete via `archived_at`, never hard delete
- `meal_plan` — `user_id` nullable: null = shared/household, uuid = personal; `meal_slot` is `breakfast`/`lunch`/`dinner`, gated for display by `display_settings.meal_slots`
- `meal_plan_notes` — one note per household per week, keyed by `household_id` + `week_start`
- `countdowns` — card content: `location_name` / `location_detail` / `location_source` (`maps` = name + second line, `freeform` = one line; prefilled from the calendar event once at creation, then user-editable, never synced to Google), `description` (user-typed only, max 140 chars, never copied from Google), `start_time` + `all_day` (copied once from the event at creation, editable; null time + not all-day = no time line), `photo_focal_x`/`photo_focal_y` (0-100 `object-position` focal point), `template` (`auto`/`ticket`/`postcard`), and `calendar_event_id` (Google event id set when created from a calendar event; admin uses it to mark that event "Saved" even after a rename, falling back to name+date only for older rows with no id); `icon` is a Lucide icon name string e.g. `"plane"`; optional `unsplash_image_url`, `days_before_visible`, and `photo_keyword` support countdown photos and delayed visibility
- `scorecards` — scorecard definitions with `name`, `increments` (JSONB number array), `players` (JSONB `{id,name,color}` array with stable player identifiers), `show_history`, `allow_negative`, and soft delete via `archived_at`
- `scorecard_sessions` — per-game scorecard sessions with `started_at`, `ended_at`, `scores`, `wagers`, and `wager_results` JSONB objects keyed by `players[].id`, plus `score_events` JSONB audit entries, optional `winner`, and `is_final_jeopardy`
- `rsvps` — pre-existing wedding table owned by the separate wedding site repo, which only ever inserts `name`, `attending`, `guest_count`. Homeboard may add its own additive, nullable-or-defaulted bookkeeping columns (existing precedent: `status`, `merged_into_party_id`, `excluded_from_auto_match`) but must never rename, drop, or add a non-defaulted NOT NULL constraint to a column the wedding site writes
- `invited_parties` — wedding invite list with `name`, `invited_count`, nullable `rsvp_id`, and `created_at`; this is the source of truth for matched vs pending invite parties
- `google_calendar_connections` — one row per household's connected Google account (RLS on, no policies — service-role only, via edge functions): `google_account_email`, `refresh_token_secret_id` (a Supabase Vault secret id, never the token itself), `status` (`active`/`needs_reauth`), `selected_calendars` (JSONB `{id,summary}` array), `private_events_mode` (`busy` default/`full`)
- `invite_codes` — signup gate (`code`, `max_uses`, `use_count`, `is_active`); no anon/authenticated access. Enforced server-side: `create-household-on-signup` calls `consume_invite_code()` (atomic, service-role only) and rolls back with `release_invite_code()` on failure; the signup page only uses the yes/no `check_invite_code()` RPC. Add or change codes via the SQL editor
- `display_pairings` — short-lived 4-character pairing codes; no anon access, written only by the `generate-pairing-code` edge function, consumed by `validate-pairing-code`. `pairing_attempts` (service-role only, timestamps only) throttles failed guesses globally (20 per 10 min)
- `display_devices` — one row per paired wall display (RLS on, no policies — service-role only): `household_id`, `token_hash` (SHA-256 of the device's own secret token, never the raw token), `revoked_at`. The device token is a paired display's only credential and is what proves it may read a private Google Calendar — a bare `household_id` isn't proof of anything, since `households` is readable with just the app's public key

## Wedding RSVP Logic
- RSVP soft delete uses `rsvps.status`, never hard delete rows
- Status values: `active`, `superseded` (merged into another party as a duplicate), and `dismissed` (soft-deleted from admin Needs Review)
- `rsvps.merged_into_party_id` is the explicit link from a superseded RSVP to the invited party it was merged into
- `rsvps.excluded_from_auto_match` is set to `true` whenever an admin manually unlinks an RSVP from an invited party (via either the Review RSVPs unlink flow or the Edit Party modal's unlink-then-save flow). The shared auto-link helper (`autoLinkHighConfidenceRsvps` in `js/shared.js`) skips any RSVP with this flag set, on both admin and display, so a manually-rejected match is never silently re-established — it stays in Needs Review until a human manually links it
- All RSVP queries used for counts, matching, or display must read `status = 'active'` only
- Homeboard wedding counts must derive from `rsvps` + `invited_parties`, not from hardcoded totals or subtraction from `households.total_invited_guests`
- `Attending` = matched attending people only; use the linked RSVP guest count, clamped to the invited party count if an RSVP overstates guests so totals stay consistent
- `Declined` = full declines plus partial declines (`invited_count - guest_count` when a matched attending RSVP brings fewer guests than invited)
- The display `Declined Guests` modal lists both full declines (`attending = false`) and partial declines (matched attending parties with `guest_count < invited_count`); each row shows a per-party declined-guest count so the rows sum to the `Declined` total, partial rows carry a "Partial" badge, and a subheader breaks out the full-vs-partial party counts. Partial under-counts also stay visible in the guest list
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
- On the display guest list, matched attending parties with `guest_count < invited_count` stay in the list with a marigold left edge and a "⚠ x of y" note.
- On the admin RSVP guest list, under-counted attending parties show a marigold edge and `⚠ X of Y` text; exact-match attending parties use the sage tile with "Attending".

## display_settings JSONB shape
```json
{
  "members":        [{"name": "Chris", "color": "#2563eb"}, ...],
  "active_screens": ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecards"],
  "screen_order":   ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecard_<id>"],
  "timer_intervals": { "upcoming_calendar": 30, "monthly_calendar": 60, "todos": 45, "meals": 30, "countdowns": 15, "scorecards": 30 },
  "upcoming_days":  5,
  "meal_slots":     ["dinner"],
  "meal_slot_labels": { "lunch": "Olivia's Lunch" }
}
```
- `display_settings.members` drives the todo assignee picker and is managed via the Settings screen. **Planned migration**: move to `users` table when multi-user auth is implemented.
- `upcoming_calendar` and `monthly_calendar` are separate screens across display rotation and admin settings. Never write the legacy `calendar` key back to Supabase.
- The "Default calendar view" setting has been removed. Whichever calendar screen appears first in `screen_order` renders first.
- Scorecards are toggled by the shared `scorecards` active-screen key. In the Settings UI, Scorecards appears as one screen-order row; saving expands that slot into the underlying `scorecard_<id>` entries used by display rotation.
- `display_settings.meal_slots` (subset of `["breakfast", "lunch", "dinner"]`, defaults to `["dinner"]` when unset) controls which meal types are enabled. The Meal Plan checkbox group lives in Settings > Display, alongside the "Active screens" list — at least one meal type must stay checked. The single shared `meals` active-screen key still gates the whole Meal Plan feature on/off; `meal_slots` only controls which types render inside it. Unlike scorecards, meal screens are not expanded into `screen_order` — the display layer clones the `.screen--meals` template into one screen per enabled slot at render time (same pattern as countdowns), keyed by `dataset.mealSlot`/`dataset.screenKey = "meal_<slot>"`. Admin meal editing shows type tabs (breakfast/lunch/dinner) when more than one slot is enabled; the currently selected admin tab is `adminCurrentMealSlot` and every `meal_plan` read/write in `js/admin-meals.js` is scoped to it.
- `display_settings.meal_slot_labels` (object keyed by `breakfast`/`lunch`/`dinner`, values are trimmed custom display names up to 30 chars, entries omitted when blank or unset) overrides the default "Breakfast"/"Lunch"/"Dinner" labels everywhere they're user-facing: the admin meal-slot tabs, the meal edit sheet's field label/placeholder, the "No `<label>` set yet" empty state, the Meal Library modal's slot filter/badges, the Settings > Meal Plan types checkbox labels, and the display Meal Plan screen header ("Meal Plan - `<label>`"). Renamed via Settings > Display > Meal Plan types > "Rename meal types", which opens a bottom-sheet with one text input per slot; clearing a field reverts that slot to its default name. Resolve a slot's effective label with `resolveMealSlotLabel(slot, mealSlotLabels)` (shared.js) rather than reading `MEAL_SLOT_LABELS[slot]` directly in new user-facing code — the slot key itself (`breakfast`/`lunch`/`dinner`) never changes, only its display text.
- `meal_library.meal_slot` (nullable, `breakfast`/`lunch`/`dinner`) scopes saved meal names to the meal they were saved under, in addition to the existing `meal_type` (cooking/HelloFresh/etc). The Meal Plan typeahead and the Meal Library modal's dedupe/save logic both filter/key on name + `meal_slot` (entries with a null `meal_slot` match any slot, kept for backward compatibility). The Meal Library modal has two independent filter dropdowns — "All meals" (slot) and "All types" (meal_type) — plus a slot badge per row.
- `display_settings.meal_types` (`{ enabled: [standard keys], icons: { key: "prefix:name" }, custom: [{ key, label, icon }] }`) controls the "what kind of meal" options (`meal_plan.meal_type` / `meal_library.meal_type`). Standard types (cooking, hellofresh, going_out, delivery, pick_up, fend_for_yourself, date_night) live in `STANDARD_MEAL_TYPES` in `js/shared.js` and are toggled on/off per household; custom types use keys prefixed `custom_`. When unset, everything except HelloFresh is enabled; existing households were backfilled with all seven enabled. Turning off or deleting a type never rewrites existing meals — resolve display via `getMealTypePresentation()`, which still renders unknown/removed keys. Icons are Iconify names (`prefix:name`) rendered with the `<iconify-icon>` web component (`buildMealTypeIconHTML`); the admin picker (`js/admin-meal-types.js`) is search-and-select against the Iconify search API, never free-typed. Lucide remains elsewhere for now (app-wide swap to Iconify is a follow-up).
- `display_settings.upcoming_days` drives the `UPCOMING_DAYS` variable in `display.js`. Update both together if changing upcoming-view logic.
- Google Calendar supports two paths, tried in this order by `fetchCalendarEvents()` in `js/shared.js`: (1) Google OAuth — admin connects via Settings > Integrations, picks one or more calendars (`google_calendar_connections.selected_calendars`), events are fetched server-side by the `google-calendar-events` edge function so the refresh token never reaches the browser; (2) the legacy public calendar ID (`households.google_cal_id`), used only as a fallback when OAuth isn't connected. One Google account per household in v1 — a partner's calendar is added by sharing it into the connected account inside Google, not by connecting a second account.
- **Recurring to-dos** are planned for a future PR and will require a schema change to `todos`.
- **Countdown slides** have two templates, Ticket (photo left, info right, perforation) and Postcard (text left, tilted photo frame right). `template = auto` alternates them using a global counter bumped every time a countdown slide is shown (`prepareCountdownSlideForShow` in `js/display-countdowns.js`, called from `goToScreen`), so the same template never shows twice in a row; an explicit `ticket`/`postcard` wins. Both use the days-remaining color ramp (31+ neutral, 8-30 sage, 1-7 fern, today marigold); on the day the number becomes a TODAY!/TONIGHT! pill (TONIGHT when `start_time` is 5 PM or later) and the title scales up. Sizes are in `--cd-u` (one 1280x780 pixel) so the slide scales with the screen. No photo shows an aubergine block with the event icon and a date stamp.
- Countdown photos are never fetched automatically: a countdown has no photo until the user taps "Get photo" / "Refresh photo" (Unsplash) or uploads one, and a countdown has one photo only (an upload replaces any Unsplash photo). No-photo countdowns render the aubergine stamp block. Countdown admin supports optional Unsplash photos plus `days_before_visible` timing. Past calendar events are filtered out of the countdown source-event picker, but saved countdown rows are not mutated.

## Design System
Aubergine / marigold / sage, Rubik + Manrope, flat fills (no gradients), two themes (Light, Dark) plus Match device. Tokens live in `css/tokens.css`; read `TOKENS.md` before styling. Color is reserved for time (overdue / today / soon / week / later) and for person identity (`--person-*`); never use it decoratively. Full design rules: `design-system/README.md`.

## Styling Conventions
- Before writing any CSS or adding styled components, read `TOKENS.md` for the canonical token reference. Use only design-system tokens (`--primary`, `--on-primary`, `--card-sunken`, `--success`, `--danger`, `--time-*`, `--person-*`, ...). Never add per-theme override blocks, gradients, or hardcoded hex/rgba colors; the removed legacy names (`--amber`, `--color-accent`, `--sage`, `--rose`, `--panel`, ...) must not come back.
- Shared corner-radius tokens live in `:root` in `index.html`: use `--button-radius` for interactive buttons and `--tag-radius` for pills, badges, date chips, and other tag-like UI
- On admin mobile layouts up to `480px`, single primary actions should run full width and two-button action rows should split evenly across the row
- The admin nav is a fixed bottom bar pinned flush to the bottom edge of the viewport; keep toast positioning above it so nav actions stay accessible
- The display footer assistant label (`#household-name`) uses `--font-display` (Rubik, self-hosted in `fonts/`). Fonts are never loaded from Google Fonts or any other third party.
- The display footer assistant label renders the stored `assistant_name` exactly as saved in Supabase (never re-case it in JS); the footer CSS displays it uppercase with letter spacing as part of the design, which only affects how it looks.
- If `assistant_name` is null, missing, or blank, the display footer renders the `brand/logo.svg` / `brand/logo-on-dark.svg` pair (22px tall, `.brand-logo--light` / `.brand-logo--dark`) instead of text; if an image fails to load, fall back to the text label `Homeboard`.
- Logos swap between light and dark files via CSS (`data-theme` or `prefers-color-scheme`); never recolor a logo with CSS filters.
- The display footer screen nav uses icon buttons, not dash/notch pagination. Use small rounded-square buttons with muted/outline inactive styling and the primary accent fill for the active screen
- Display footer nav sizing should be controlled through the shared CSS custom properties `--display-nav-button-width`, `--display-nav-button-active-width`, `--display-nav-button-height`, `--display-nav-button-gap`, and `--display-nav-icon-size`; nav corner radius should use the shared global `--button-radius`
- The display footer nav should not have an outer capsule/frame; the buttons sit directly in the footer with no shared background, border, or shadow wrapper
- The display footer nav active button uses `--primary` fill with `--on-primary` text in both themes.
- Interactive, selected, highlighted, or accent-fill UI uses `--primary` / `--on-primary`, with `--card-sunken` for hover and soft fills.
- Scorecard components follow `TOKENS.md`: `--primary` for interactive states, `--success` / `--danger` for score feedback, `--person-*` for players (first six only), and a marigold border + "Leading" tag for the leader.
- The display footer upcoming/month nav buttons should use a custom inline SVG calendar outline with an empty body area so the centered `upcoming_days` / `30` overlay remains readable; do not use a Lucide calendar glyph there
- Display footer icon mapping: `todos` = `list-todo`, `meals` = `utensils-crossed`, `upcoming_calendar` = calendar icon with centered `display_settings.upcoming_days` overlay (default `7`), `monthly_calendar` = the same calendar icon with centered `30` overlay, `countdowns` = `hourglass`, `scorecards` = `trophy`, `rsvp` = `heart`, fallback = generic layout/grid icon
- All countdown screens collapse into one footer nav button. Tapping that hourglass always jumps to the first countdown in the current rotation order, and the button remains active across every countdown screen
- All scorecard screens collapse into one footer trophy button. Tapping it jumps to the first scorecard in the current rotation order, and swipe navigation moves between individual scorecard screens.
- Scorecard display layout auto-switches by player count: 2-4 players render as per-player columns, 5-6 players render as selectable rows plus shared increment buttons.
- End Game and Bonus Round controls are available on both the display scorecard screen and the admin scorecard detail view.
- Scorecard undo is an in-memory action stack scoped to the active session. It does not persist through reloads and it resets when a new game starts.
- Scorecard audit history is persisted in `scorecard_sessions.score_events` as an append-only JSONB array of per-player entries with `player`, signed `amount`, `type`, and ISO `timestamp`.
- Scorecard player scores and bonus wager maps are keyed internally by stable player `id`, not player name; keep player names/colors only for display.
- End Game closes the current scorecard session immediately, shows the winner state, and waits for `New game` before creating the next session; both the display winner overlay and admin winner modal also offer `Archive scorecard` to soft-archive that scorecard from the winner screen.
- Bonus Round is separate from End Game. It is a fully local in-memory flow on whichever surface starts it: masked wager entry, correct/incorrect selection, reveal, then one final score write when `Apply results` is tapped.
- Bonus Round wager state is also persisted to `scorecard_sessions` (`wagers`, `wager_results`, `is_final_jeopardy`) so refreshes can recover the active round state.
- Bonus Round does not sync or mirror mid-flow between admin and display. The other surface stays on its normal scorecard state until it refreshes from the final score write.
- Each wager must be between `0` and that player's current score.
- When a display footer nav button is tapped, auto-rotation should reset immediately and resume using that destination screen's configured `display_settings.timer_intervals` value, never a hardcoded fallback unless the screen has no saved timer
- The display to-do screen should use vertical scrolling only; avoid column-based layouts that interfere with horizontal swipe navigation between screens
- The Settings screen sync row should keep visible spacing below its helper copy so the sync button/timestamp do not crowd the paragraph above
- Admin tabs should use skeleton loaders that approximate the final layout while data is loading, especially on the RSVP screen
- Todo cards in both admin and display take the whole-card time tier (`.todo-card--overdue/today/soon/week`) and show assignees as colored names separated by commas, then a bullet and the due date as plain text in the tier color (no pills, no dots), via `buildTodoTierMetaLineHTML` / `resolveTodoAssignees` in `js/shared.js`. Never duplicate the lookup logic or hardcode per-person colors; person colors come from `display_settings.members` mapped to `--person-*` tokens.
- Todos support multiple assignees via `todos.assignee_member_ids` (uuid[]); `assignee_member_id` / `assignee` mirror the first assignee for legacy fallback. Admin picks them with multi-select chips
- The admin to-do screen must not fail just because household settings fail; render the todo data first, then re-render for member colors if `display_settings.members` arrives afterward
- Active incomplete todos with `due_date < today` use the overdue tier (solid `--time-overdue` card with a warning mark) on both display and admin.
- Todo completion celebration animations are display-view only and must fully clean up any temporary DOM they create
- Display celebrations load local bundled copies from `js/vendor/confetti.min.js` and `js/vendor/gsap.min.js`; confetti burst, star shower, and fireworks use Canvas Confetti, bubble float / thumbs up bounce / ink splash use GSAP, and ripple rings stay CSS/JS only
- Every library-backed display celebration must guard calls with runtime `typeof` checks (`confetti` / `gsap`) and silently degrade to a simple pure CSS/JS particle burst if those globals are absent
- Celebration particle colors come from the design palette (marigold, sage, fern, aubergine) plus the assignee's person color (`celebrationPersonColorTokens` in `js/display-todos.js`), resolved at runtime from the active theme's tokens via `getComputedStyle`.
- Display todo completion timing should be: checkmark immediately, item fade/removal starts roughly 10-15% into the celebration with a quick ~200 ms opacity transition, and the celebration continues independently as a send-off
- Checking off a display todo must reset the auto-rotation timer using the same `resetAutoRotate()` path as other display interactions so the screen does not rotate away mid-celebration
- Rotation reset root cause: a previously scheduled auto-rotate callback can already be queued when the todo completion happens, so `clearTimeout()` alone is not sufficient; guard auto-rotate with a token/generation check so stale queued callbacks no-op instead of rotating the screen
- GSAP bubble-float motion should use per-bubble sinusoidal horizontal drift while rising, with randomized amplitude/frequency/phase and slight stagger, so bubbles float organically instead of traveling straight up
- The celebration pool includes 7 animations total; `ink splash` is a GSAP effect with 6-8 accent/gold/green blobs that burst from the checkbox, pulse slightly larger, then contract away alongside one fast expanding ring
- The old sparkle-trail celebration is replaced by ripple rings: three concentric accent-color outline rings expand from the checkbox position, staggered by about 120 ms, and fade as they grow to roughly 200-300 px diameter
- Bubble float and ink splash should not use white in their color mix; use visible celebration tones from the palette so particles stay readable in Light and Dark.
- The RSVP display guest-list empty state is a centered neutral waiting state; pending parties use a dashed neutral border (see the wedding pulse rules in `design-system/guidelines/migration.md`).
- The admin RSVP `Pending` state uses neutral `--card-sunken` styling like the RSVP display, not a warning color.
- Hide pre-today Google Calendar events from the admin countdown source-event picker; do not delete or mutate saved countdown rows
- User-facing error messages must stay non-technical: never mention Supabase, service names, table names, or raw config instructions. Use plain patterns like `Something went wrong loading your data. Please try refreshing.` and `Something went wrong saving your changes. Please try again.`
- User-facing version labels should always render as lowercase `v${VERSION}` and must not be uppercased by CSS

## Env Vars (never hardcode)
Netlify build env vars (injected into `js/shared.js`/`signup.html` via `sed`):
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GOOGLE_CAL_KEY`
- `UNSPLASH_ACCESS_KEY`

Supabase Edge Function secrets (set in the Supabase dashboard, not Netlify — never in the repo or client bundle):
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — Google OAuth client for the Calendar-connect flow
- `OAUTH_STATE_SECRET` — signs the OAuth `state` param (see `google-calendar-connect`/`google-calendar-callback`); an app-invented secret, not something Google issues

## Local Dev
Use `netlify dev` — injects env vars correctly.
Use `netlify dev --no-watch` if Mac permissions error occurs.
`file://` and `npx serve .` do not work.

## Edge Function deployment — JWT verification

All Edge Functions on this project must be deployed with `verify_jwt = false`.

This project uses ES256 asymmetric JWT signing. Supabase's built-in JWT verifier only supports HS256 and will reject all requests with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` if `verify_jwt = true`.

Functions handle JWT decoding directly in their own code using the `decodeJwtFromHeader` pattern. Do not deploy any Edge Function on this project with `verify_jwt = true`. Each function's directory should contain a `config.toml` with `verify_jwt = false`.

## Privacy Policy Compliance (CRITICAL)

The public privacy policy lives at `privacy.html` (served at `/privacy`, linked from the marketing footer). It is a legal-style promise to users AND a Google requirement: Homeboard's Google OAuth consent screen points at it, and Google can pull API access if the app stops matching what it says. **Code must never drift from that policy.**

**Every LLM/agent working in this repo MUST, before writing code and again before opening or updating a PR, check whether the change touches anything below. If it does, STOP and tell the user plainly ("this change needs a privacy policy update because ..."), then update `privacy.html` (and bump its "Last updated" date) in the same PR. Never silently ship a change that makes the policy inaccurate, and never skip this because the change seems small.**

Changes that REQUIRE a policy review/update:
- Collecting, storing, or logging any new kind of personal data (new columns/tables holding names, emails, locations, photos, device IDs, IP addresses, or free-text users type in)
- Adding or changing any third-party service, SDK, script, font, CDN, analytics/tracking tool, or API that receives user data or the visitor's IP (current list in the policy: Supabase, Netlify, Google Calendar + Google Analytics, jsDelivr CDN, Unsplash, Iconify; fonts are self-hosted, not a third party)
- Sending user data to a new place, or using existing data for a new purpose (especially advertising, profiling, AI/LLM processing, or sharing/selling)
- Any change to Google OAuth scopes, or to what we do with Google data
- Changing how long data is kept or how users can delete it or disconnect
- Adding user-facing accounts, roles, or sharing between households
- Adding children-oriented features (policy says Homeboard is not directed at children under 13)

Standing commitments the code must keep (each one is stated in the policy):
- **Google Calendar is read-only.** Only the scopes `calendar.readonly`, `openid`, and `userinfo.email`. Never write to a user's calendar. Adding any scope requires a policy update AND a Google consent-screen/verification change (tell the user).
- **Google Calendar event data is not persisted server-side, with one disclosed exception.** No copies of events or calendars in Supabase tables, edge function caches, or logs; fetch on demand and pass through. Never log event titles, descriptions, locations, or attendee data. (Client-side in-memory use for rendering is fine.) The exception, stated in `privacy.html`: when an admin turns a calendar event into a countdown, the event's **title, date, start time, location, and event id** are copied into that `countdowns` row (user-editable, never re-synced, never written back to Google). Event **descriptions** and attendee data are never copied — `countdowns.description` is user-typed only. Do not add further fields to that copy without updating the policy.
- **Google refresh/access tokens live only in Supabase Vault / edge function memory.** Never in `households`, never in the browser, never in localStorage, logs, error messages, or URLs.
- **Google data is used only to display the user's own events** on their household's display/admin. No advertising, no selling, no sharing, no analytics on event contents, no feeding it to AI models.
- **Private-event masking is enforced server-side** (`private_events_mode`, default `busy`), so private details never reach the tablet when masked.
- **Disconnect must actually delete** the stored token (Vault secret) and revoke it at Google. "Delete my data" requests are handled via the contact email in the policy.
- **We do not sell personal information or share it for advertising.**

When in doubt whether something needs a policy update, assume it does and ask the user. Also keep the "Third parties" list in `privacy.html` and the list above in sync.

## Homeboard-Specific Rules
- The `rsvps` table is owned by the wedding site, which only writes `name`, `attending`, `guest_count`. Homeboard may add its own additive, nullable-or-defaulted columns for its own bookkeeping, but must never rename, drop, or add a non-defaulted NOT NULL constraint to a column the wedding site depends on
- Never hard-delete todos — always set `archived_at`
- `meal_plan` rows with `user_id = null` are shared/household; never show personal rows (`user_id` set) on the display
- sw.js cache prefix: `homeboard-v##`
- VERSION BUMPS ARE REQUIRED ON EVERY SINGLE PUSH WITHOUT EXCEPTION.
- Before any push, always increment `VERSION` in `js/shared.js`, update `CACHE_NAME` in `sw.js` to the exact same version, and verify both files are included in the push.
- If code is otherwise ready but the version has not changed yet, stop and add the version bump before pushing.
- When pushing any change, also keep `README.md` accurate — add new tables, env vars, or screens as they are introduced.

## Planned future work
- **Household members → users table**: `display_settings.members` currently stores the member list. Migrate to the `users` table when multi-user auth is implemented.
- **Multiple Google Calendars**: the Integrations settings panel has a code comment noting this. When implementing, each calendar will need an ID and an enabled toggle stored in `display_settings`.
- **Recurring to-dos**: planned for a future PR; requires a schema change to the `todos` table.

## Pull Request drafts

Always open new PRs as drafts (`--draft` flag with `gh pr create`). This prevents CodeRabbit from auto-triggering a review before the work is ready. Only mark a PR ready for review when explicitly instructed to do so.
