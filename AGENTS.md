# AGENTS.md — Homeboard

Project-specific instructions. Global coding standards and git discipline are in `~/.codex/AGENTS.md`.

## What This Project Is
Household command center PWA. Wall-mounted Android tablet (landscape display) + phone admin (portrait). Single `index.html`, Supabase backend, Netlify hosting.

## File Structure
```text
index.html          — single HTML file, both display + admin shells
css/display.css     — display mode styles only
css/admin.css       — admin mode styles only
js/shared.js        — Supabase init, VERSION constant, utilities, shared config
js/display.js       — display mode logic
js/admin.js         — all admin mode logic (screens, modals, event handling)
manifest.json       — PWA manifest for display mode (landscape)
manifest-admin.json — PWA manifest for admin mode (portrait)
homeboard_logo.svg  — default display-footer logo asset
sw.js               — service worker (cache key: homeboard-v##)
netlify.toml        — build + env var injection via sed
```

## Architecture
- Supabase-first. No offline writes — show error toast if Supabase unreachable on write.
- localStorage is read-only cache only.
- No frameworks, no bundlers. Plain vanilla JS.
- Two modes: Display Mode (landscape) and Admin Mode (`/admin`, portrait).
- Admin add/edit forms use a shared bottom-sheet modal (`#admin-modal`) — inject form HTML via `openAdminModal()`, dismiss via `closeAdminModal()`. Do not add new always-visible form panels.
- Admin Settings is still its own screen, but it is opened from the gear icon in the admin header instead of a bottom-nav tab.

## Supabase Tables
| Table | Key notes |
|---|---|
| `households` | `assistant_name`, `color_scheme`, `google_cal_id`, `display_settings` (JSONB — see shape below), `total_invited_guests`, admin PIN |
| `users` | Linked to `auth.users`. Role: `admin` or `member` |
| `todos` | Soft delete only — set `archived_at`, never hard delete |
| `meal_plan` | `user_id` null = shared (show on display). `user_id` set = personal (admin only) |
| `meal_plan_notes` | One note per household per week. Keyed by `household_id` + `week_start` (Monday's date) |
| `countdowns` | `icon` = Lucide icon name string; optional `unsplash_image_url`, `days_before_visible`, and `photo_keyword` drive countdown photos and delayed visibility |
| `scorecards` | Scoreboard definitions. Columns: `id`, `household_id`, `name`, `increments` (JSONB number array), `players` (JSONB `{name,color}` array), `show_history`, `allow_negative`, `created_at`, `archived_at` |
| `scorecard_sessions` | Scorecard game sessions. Columns: `id`, `scorecard_id`, `household_id`, `started_at`, `ended_at`, `scores` (JSONB `{player_id: score}`), nullable `wagers`, nullable `wager_results`, `score_events` (JSONB audit log array), nullable `winner`, `is_final_jeopardy`, `created_at` |
| `rsvps` | Wedding table — **do not modify schema** |
| `invited_parties` | Wedding invite list. `rsvp_id` null = pending; set = matched to an RSVP row |

## RSVP Matching
- RSVP soft delete uses `rsvps.status`, never hard delete rows
- Status values: `active` and `superseded`
- `rsvps.merged_into_party_id` is the explicit audit link from a superseded RSVP to the invited party it was merged into
- All RSVP queries used for counts, matching, or display must read `status = 'active'` only
- Wedding RSVP counts on Homeboard must come from `rsvps` + `invited_parties`, never from hardcoded totals or subtraction from `households.total_invited_guests`
- `Attending` = matched attending people only; use the linked RSVP guest count, clamped to the invited party count if the RSVP overstates guests so totals still reconcile
- `Declined` = full declines plus partial declines (`invited_count - guest_count` when a matched attending RSVP brings fewer guests than invited)
- The display `Declined Parties` modal only lists full declines where the linked RSVP has `attending = false`; partial under-counts stay in the guest list
- `Pending` = sum of `invited_parties.invited_count` where `rsvp_id` is null
- `Responded` = count of matched `invited_parties` rows
- `Review RSVPs` = flagged RSVP count only; categories are `Unmatched`, `Duplicate`, `Count mismatch`, and `Low confidence`
- The totals must reconcile: `attending + declined + pending = total invited_count across invited_parties`
- Fuzzy matching logic is shared between display/admin auto-linking and manual suggestions:
  1. surname matching carries the most weight, including a strong bonus when the RSVP's last meaningful token appears anywhere in the invited party name
  2. word overlap carries medium weight
  3. full-string similarity carries lower weight
- Single-word RSVPs get a special pass: if that word exactly matches the first name of exactly one invited party across all parties, treat it as high confidence
- Duplicate detection must score new RSVPs against all `invited_parties` rows, including already-matched parties; only the final auto-link step may restrict to unmatched parties
- High-confidence fuzzy matches may auto-link unmatched RSVPs to unmatched `invited_parties` rows during regular refreshes; if the best-scoring party is already matched above the duplicate threshold, flag the RSVP as `Duplicate` instead of auto-linking, not `Unmatched`
- Duplicate review modals use a single confirm flow: show the currently linked RSVP plus any number of competing active RSVPs for that party, choose the primary RSVP, edit the guest count, link the primary RSVP to the invited party, and set every other conflict RSVP to `superseded` with `merged_into_party_id`
- Review actions must stay in the shared admin modal pattern: tap a review row, resolve the issue in the modal, close automatically when the issue is fully resolved
- On the display guest list, matched attending parties with `guest_count < invited_count` keep their attending row but use an amber guest-count pill instead of the default green pill
- On the admin RSVP guest list, under-counted attending parties should use a single amber status pill reading `Attending • X of Y`; do not show a second under-count pill on the left

## display_settings JSONB shape
```json
{
  "members":        [{"name": "Chris", "color": "#2563eb"}],
  "active_screens": ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecards"],
  "screen_order":   ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns", "scorecard_<id>"],
  "timer_intervals": {"upcoming_calendar": 30, "monthly_calendar": 60, "todos": 45, "meals": 30, "countdowns": 15, "scorecards": 30},
  "upcoming_days":  5
}
```
- `members` → todo assignee picker. **Future**: migrate to `users` table when multi-user auth is implemented.
- `upcoming_calendar` and `monthly_calendar` are separate display screens everywhere in code and settings. Do not collapse them back into a single `calendar` key.
- The old "Default calendar view" setting has been removed. Rotation order now comes only from `screen_order`.
- Scorecards are toggleable via the shared `scorecards` active-screen key. In the Settings UI, Scorecards appears as one screen-order row; saving expands that slot into the underlying `scorecard_<id>` entries used by display rotation and nav grouping.
- `upcoming_days` → drives the `UPCOMING_DAYS` variable in `display.js`. Update both together.
- RSVP screen is **hardcoded to this household** and excluded from `active_screens` and `screen_order`. It is hidden starting Oct 11, 2026 — remove via code change after that date.
- Google Calendar: single calendar ID in `households.google_cal_id`. **Future**: support toggling multiple calendars.
- Recurring to-dos: planned future PR, requires schema change to `todos`.

## Hard Rules
- Never modify `rsvps` table schema
- Never hard-delete todos — use `archived_at`
- Never show `meal_plan` rows where `user_id` is set in Display Mode
- Never hardcode `SUPABASE_URL` or `SUPABASE_KEY` — injected by Netlify at build
- sw.js cache prefix must be `homeboard-v##`
- VERSION BUMPS ARE REQUIRED ON EVERY SINGLE PUSH WITHOUT EXCEPTION.
- Before any push, always increment `VERSION` in `js/shared.js`, update `CACHE_NAME` in `sw.js` to the exact same version, and verify both changed in the diff.
- If a commit has already been made but not yet pushed, add another commit with the version bump before pushing.
- When pushing any change, also keep `README.md` accurate — document new tables, env vars, or screens as they are added.

## Styling Conventions
- Before writing any CSS or adding styled components, read `TOKENS.md` for the canonical token reference. Always use semantic tokens (`--color-accent`, `--color-accent-subtle`) for new interactive components. Never use `--amber` or `--amber-soft` in new code.
- Shared corner radius tokens live in `:root` in `index.html`: use `--button-radius` for admin/display buttons and `--tag-radius` for pills, badges, and other tag-like labels
- Keep admin action-button sizing responsive: on screens up to 480 px, a lone primary action should fill the row and two-button action rows should split into equal widths
- The admin nav is a fixed bottom bar pinned flush to the viewport edge; do not reintroduce floating gaps, translucent glass treatment, or drop shadows there
- Toasts must clear the fixed admin nav so navigation stays tappable while a toast is visible
- The display footer assistant label (`#household-name`) uses the Google Font `Righteous`; load it from Google Fonts in `index.html` and keep fallback fonts in CSS
- The display footer assistant label should render the stored `assistant_name` exactly as saved in Supabase; do not force title case or uppercase it in JS or CSS
- If `assistant_name` is null, missing, or blank, the display footer should show `homeboard_logo.svg` as an `<img>` around `120px` wide; if the SVG fails to load, use the image `onerror` event to replace it with the text `Homeboard` in the same Righteous styling
- If `assistant_name` is set, the custom name fully replaces the logo in the display footer; do not show both together
- Keep the footer logo scheme-aware: Warm may use a subtle `brightness(0.97)`, Slate should use no filter, and Dark should use `saturate(0) brightness(0) invert(0.93) sepia(0.22) saturate(0.7) brightness(1.02)` so the logo reads as a warm off-white near the dark scheme ink color instead of gold or orange
- The display footer screen nav uses small tappable rounded-square icon buttons instead of dash notches; inactive buttons stay muted/outline and the active screen button uses the primary accent fill
- Display footer nav sizing should be tuned via the shared CSS custom properties `--display-nav-button-width`, `--display-nav-button-active-width`, `--display-nav-button-height`, `--display-nav-button-gap`, and `--display-nav-icon-size`; nav corner radius should use the shared global `--button-radius`
- The display footer nav has no outer capsule/frame; the buttons should sit directly in the footer without a shared background, border, or shadow wrapper
- The display footer nav active colors are controlled per scheme via `--display-nav-active-bg` and `--display-nav-active-border`; light schemes should use `--color-accent` for the active nav background, while the dark scheme should use `--color-accent-subtle`
- Semantic interaction tokens are `--color-accent`, `--color-accent-subtle`, and `--color-text-on-accent`; use them for any new interactive, selected, highlighted, or accent-filled UI
- `--amber` and `--amber-soft` are legacy color tokens being deprecated; keep them only for older component references during migration and do not use them directly in new components
- The display footer calendar nav buttons should use a custom inline SVG calendar outline with an empty body area so the overlaid `upcoming_days` / `30` number stays legible; do not switch those buttons back to a Lucide calendar icon
- Display footer icon mapping: `todos` = `list-todo`, `meals` = `utensils-crossed`, `upcoming_calendar` = calendar icon with dynamic `display_settings.upcoming_days` overlay (default `7`), `monthly_calendar` = same calendar icon with `30` overlay, `countdowns` = `hourglass`, `rsvp` = `heart`, fallback = generic layout/grid icon
- All countdown display screens share one footer hourglass button; tapping it always jumps to the first countdown in rotation order, and the hourglass stays active while any countdown screen is visible
- Tapping a display footer nav button should pause/reset auto-rotation immediately and resume from that destination screen using its configured `display_settings.timer_intervals` value; never resume with a hardcoded duration
- The display to-do screen must scroll vertically, not via CSS columns or any layout that conflicts with horizontal screen-swipe gestures
- The Settings screen sync row should keep a little breathing room below its helper text; do not let the sync button/timestamp sit flush against the paragraph above
- Admin loading states should use skeleton loaders that roughly match the final card/form layout instead of plain `Loading…` text
- Todo assignee pills in both admin and display must use a single shared member-color lookup helper sourced from `display_settings.members`; never duplicate the lookup logic, never hardcode per-person colors, and fall back to the neutral pill only when no configured color exists
- The admin to-do loader must not fail just because household settings fail; load the todo data first, then re-render for member colors if `display_settings.members` arrives later
- Active incomplete todos with `due_date < today` should use the overdue treatment in both display and admin: red left border, subtle red card tint, and red overdue date-pill text
- Todo completion celebration animations are display-view only and must clean up all temporary DOM/styles after each run
- Display celebrations load locally bundled `canvas-confetti@1.9.2` from `js/vendor/` plus `gsap@3.12.5`; confetti burst, star shower, and fireworks use Canvas Confetti, bubble float / thumbs up bounce / ink splash use GSAP, and ripple rings stay CSS/JS only
- Every library-backed display celebration must guard calls with runtime `typeof` checks (`confetti` / `gsap`) and silently degrade to a simple pure CSS/JS particle burst if a CDN script fails to load
- Celebration particle colors should resolve the active scheme accent at runtime from `getComputedStyle(...).getPropertyValue('--amber')` and mix it with white, bright gold, and fresh green so effects stay scheme-aware without hardcoding one palette
- Display todo completion timing should be: checkmark immediately, item fade/removal starts roughly 10-15% into the celebration with a quick ~200 ms opacity transition, and the celebration continues independently as a send-off
- Checking off a display todo must reset the auto-rotation timer using the same `resetAutoRotate()` path as other display interactions so the screen does not rotate away mid-celebration
- Rotation reset root cause: a previously scheduled auto-rotate callback can already be queued when the todo completion happens, so `clearTimeout()` alone is not sufficient; guard auto-rotate with a token/generation check so stale queued callbacks no-op instead of rotating the screen
- GSAP bubble-float motion should use per-bubble sinusoidal horizontal drift while rising, with randomized amplitude/frequency/phase and slight stagger, so bubbles float organically instead of traveling straight up
- The celebration pool includes 7 animations total; `ink splash` is a GSAP effect with 6-8 accent/gold/green blobs that burst from the checkbox, pulse slightly larger, then contract away alongside one fast expanding ring
- The old sparkle-trail celebration is replaced by ripple rings: three concentric accent-color outline rings expand from the checkbox position, staggered by about 120 ms, and fade as they grow to roughly 200-300 px diameter
- Bubble float and ink splash should not use white in their color mix; use the runtime accent plus visible celebration tones like gold, coral, teal, purple, and green so particles stay readable on light and dark schemes
- The RSVP display guest-list empty state is a centered neutral waiting state with muted blue styling, not a small rose warning/error pill
- The RSVP display confirmed-guest total should use the pending-blue tone at `0` and the rose tone only when the count is `1+`
- The admin RSVP `Pending` pill should use the same pending-blue waiting-state treatment as the RSVP display, not amber warning styling
- The countdown admin calendar-event picker should hide events dated before today; this filtering applies to selectable source events, not saved countdown rows
- User-facing error messages must never mention Supabase, backend services, table names, or internal config details; use plain language like `Something went wrong loading your data. Please try refreshing.` or `Something went wrong saving your changes. Please try again.`
- User-facing version labels should always render as lowercase `v${VERSION}` and must not be uppercased by CSS
- Scorecard display layout auto-switches by player count: 2-4 players = per-player columns, 5-6 players = selectable player rows plus shared increment buttons
- End Game and Bonus Round controls are available on both the display scorecard screen and the admin scorecard detail view
- Scorecard undo is an in-memory action stack scoped to the active session only; it does not persist through reloads and it resets when a new game starts
- Scorecard audit history is persisted separately in `scorecard_sessions.score_events` as an append-only JSONB array; each score change writes per-player events with `player`, signed `amount`, `type`, and ISO `timestamp`
- Scorecard player scores and bonus wager maps are keyed internally by stable player `id`, not player name; keep player names/colors only for display
- End Game closes the current scorecard session immediately, shows the winner state, and waits for an explicit `New game` action before creating the next session; both the display winner overlay and admin winner modal also offer `Archive scorecard` to soft-archive that scorecard from the winner screen
- Bonus Round is separate from End Game. It is a fully local in-memory flow on whichever surface starts it: masked wager entry, correct/incorrect selection, reveal, then one final score write when `Apply results` is tapped
- Bonus Round wager state is also persisted to `scorecard_sessions` (`wagers`, `wager_results`, `is_final_jeopardy`) so refreshes can recover the active round state
- Bonus Round does not sync or mirror mid-flow between admin and display. The other surface keeps its normal scorecard view until it refreshes from the final score write
- Bonus Round wagers must be between `0` and that player's current score
- New scorecard UI should use `--color-accent` and `--color-accent-subtle` for active/interactive states per `TOKENS.md`; do not use `--amber` / `--amber-soft` in new scorecard components

## Local Dev
`netlify dev` is the only correct local workflow. `file://` and `npx serve .` do not work.
