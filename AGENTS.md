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
sw.js               — service worker (cache key: homeboard-v##)
netlify.toml        — build + env var injection via sed
```

## Architecture
- Supabase-first. No offline writes — show error toast if Supabase unreachable on write.
- localStorage is read-only cache only.
- No frameworks, no bundlers. Plain vanilla JS.
- Two modes: Display Mode (landscape) and Admin Mode (`/admin`, portrait).
- Admin add/edit forms use a shared bottom-sheet modal (`#admin-modal`) — inject form HTML via `openAdminModal()`, dismiss via `closeAdminModal()`. Do not add new always-visible form panels.

## Supabase Tables
| Table | Key notes |
|---|---|
| `households` | `assistant_name`, `color_scheme`, `google_cal_id`, `display_settings` (JSONB — see shape below), `total_invited_guests`, admin PIN |
| `users` | Linked to `auth.users`. Role: `admin` or `member` |
| `todos` | Soft delete only — set `archived_at`, never hard delete |
| `meal_plan` | `user_id` null = shared (show on display). `user_id` set = personal (admin only) |
| `meal_plan_notes` | One note per household per week. Keyed by `household_id` + `week_start` (Monday's date) |
| `countdowns` | `icon` = Lucide icon name string |
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
  "active_screens": ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  "screen_order":   ["upcoming_calendar", "monthly_calendar", "todos", "meals", "countdowns"],
  "timer_intervals": {"upcoming_calendar": 30, "monthly_calendar": 60, "todos": 45, "meals": 30, "countdowns": 15},
  "upcoming_days":  5
}
```
- `members` → todo assignee picker. **Future**: migrate to `users` table when multi-user auth is implemented.
- `upcoming_calendar` and `monthly_calendar` are separate display screens everywhere in code and settings. Do not collapse them back into a single `calendar` key.
- The old "Default calendar view" setting has been removed. Rotation order now comes only from `screen_order`.
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
- When pushing any change: bump `VERSION` in `js/shared.js` (patch for fixes, minor for features), update `CACHE_NAME` in `sw.js` to match, and keep `README.md` accurate — document new tables, env vars, or screens as they are added

## Styling Conventions
- Shared corner radius tokens live in `:root` in `index.html`: use `--button-radius` for admin/display buttons and `--tag-radius` for pills, badges, and other tag-like labels
- Keep admin action-button sizing responsive: on screens up to 480 px, a lone primary action should fill the row and two-button action rows should split into equal widths
- The admin nav is a fixed bottom bar pinned flush to the viewport edge; do not reintroduce floating gaps, translucent glass treatment, or drop shadows there
- Toasts must clear the fixed admin nav so navigation stays tappable while a toast is visible
- The display footer assistant label (`#household-name`) uses the Google Font `Righteous`; load it from Google Fonts in `index.html` and keep fallback fonts in CSS
- The display footer assistant label should render the stored `assistant_name` exactly as saved in Supabase; do not force title case or uppercase it in JS or CSS
- The display to-do screen must scroll vertically, not via CSS columns or any layout that conflicts with horizontal screen-swipe gestures
- Admin loading states should use skeleton loaders that roughly match the final card/form layout instead of plain `Loading…` text
- Todo assignee pills in both admin and display must use a single shared member-color lookup helper sourced from `display_settings.members`; never duplicate the lookup logic, never hardcode per-person colors, and fall back to the neutral pill only when no configured color exists
- The admin to-do loader must not fail just because household settings fail; load the todo data first, then re-render for member colors if `display_settings.members` arrives later
- The RSVP display guest-list empty state is a centered neutral waiting state with muted blue styling, not a small rose warning/error pill
- The RSVP display confirmed-guest total should use the pending-blue tone at `0` and the rose tone only when the count is `1+`
- The admin RSVP `Pending` pill should use the same pending-blue waiting-state treatment as the RSVP display, not amber warning styling
- The countdown admin calendar-event picker should hide events dated before today; this filtering applies to selectable source events, not saved countdown rows
- User-facing error messages must never mention Supabase, backend services, table names, or internal config details; use plain language like `Something went wrong loading your data. Please try refreshing.` or `Something went wrong saving your changes. Please try again.`

## Local Dev
`netlify dev` is the only correct local workflow. `file://` and `npx serve .` do not work.
