# Migration from v2.4

How to move the codebase (`index.html`, `css/display.css`, `css/admin.css`, `js/*`) onto this system. Work in this order: tokens, then chrome, then screens.

## 1. Themes

- Replace the three schemes with two: `html[data-theme="light"]` and `html[data-theme="dark"]`, plus "match device" (`prefers-color-scheme`).
- Settings: map saved values `warm` and `slate` to `light`; `dark` stays `dark`. Display and admin keep separate choices.
- Delete every `html[data-scheme="slate"]` and `html[data-scheme="dark"]` override block, and the one-off rgba colors inside them (about 60). Components should read tokens only.
- Remove all `radial-gradient` and `linear-gradient` backgrounds (body, countdown cards, dark panels). Flat fills only.

## 2. Tokens: old to new

| Old | New |
|---|---|
| `--bg` | `bg` |
| `--bg-soft` | `card-sunken` |
| `--panel`, `--panel-strong` | `surface` |
| `--ink`, `--muted`, `--border`, `--shadow` | same names, new values |
| `--color-accent`, `--amber` | `primary` (buttons, nav) or `time-today` (today highlights): check each use |
| `--color-accent-subtle`, `--amber-soft` | `card-sunken` (hover) or `time-soon`/`time-week` (by meaning) |
| `--color-text-on-accent` | `on-primary` |
| `--sage` | `success`; `.todo-due-pill--today` moves to `time-today` |
| `--sage-soft` | `time-soon` |
| `--rose` | `love` (RSVP hero, names title) or `danger` (errors, incorrect) |
| `--rose-soft` | `danger-soft` |
| `--rsvp-*` (9 tokens) | removed; see Wedding pulse below |
| `--marketing-*` | removed; the marketing page uses the Light tokens |
| `--display-nav-active-bg` | `primary` |

## 3. Chrome

- **Fonts:** load Rubik 500/700/800 and Manrope 400-800. Drop Bricolage Grotesque, Fraunces and Righteous. Every `font-family` naming Bricolage becomes `var(--font-display)`.
- **Logo:** replace `homeboard_logo.svg` and its variants with `logo.svg` / `logo-on-dark.svg`. Delete the dark-scheme `filter:` rules on `.household-logo`, `.display-pairing-logo` and `.admin-login-logo`. Footer logo about 22px tall; pairing and login screens use `logo-stacked`.
- **Manifest:** icons become `app-icon.svg`; `background_color` and `theme_color` become `#f6f5f0`.
- **Eyebrow** (`.eyebrow` / `.screen-title-row` pill): `eyebrow-bg` + `eyebrow-fg` on every screen.
- **Nav:** active tab `primary` / `on-primary`.

## 4. Screens

**To-dos** (`display-todos.js`, `.todo-*`)
- Tier logic: overdue, today, 1-3 days, 4-7 days, later. Today's `soon` pill (orange) and `today` pill (green) go away.
- The whole card takes the tier: `.todo-card--overdue` becomes a solid `time-overdue` card; add `--today`, `--soon`, `--week` modifiers.
- Remove `.todo-due-pill`; render the date as text in the `meta` style and the tier's `-fg` color.
- Remove `.todo-assignee` chips; render a 9px dot in the member's color + name.
- Celebration palette (`getCelebrationPalette*`): marigold, sage, fern, aubergine, and the assignee's person color.

**Upcoming and Month** (`display-calendar.js`, `.day-column`, `.month-day`)
- `.day-column.today` and `.month-day--today`: solid `time-today` with a "TODAY" tag.
- Days 1-3 ahead: `time-soon` with a 5px `time-soon-edge` top border.
- Event chips: `card-sunken`; translucent white on today's fill; `time-soon-chip` on soon columns and cells. If an event has an owner, a 3px left bar in their person color.
- `.month-more-pill`: marigold pill, dark text.

**Meals** (`display-meals.js`, `.meal-*`)
- `.meal-card.today`: `time-today` + "TONIGHT" tag; the next 3 days `time-soon`.
- Keep the layout (two-column grid, centered cards, "This week" note card last). Replace the seven colored `.meal-type--*` pills and their emoji with a monotone line icon + word: cooking = pot, HelloFresh = box, going out = storefront, pick-up = bag, delivery = scooter, date night = heart, fend for yourself = leaf. The text takes the card's tier color.
- `.meal-note-card`: `time-week` fill with a `time-week-edge` left edge.

**Countdowns** (`display-countdowns.js`, `.countdown-*`)
- Show **Today!** instead of "0 days", and "1 day" (singular).
- Panel color by distance: 31+ days `countdown-far`; 8-30 days `countdown-later`; 1-7 days `countdown-soon` (white display text); today `time-today`.
- Remove the rotating `.countdown-card--variant-2/3/4` tints.

**Scorecard** (`display-scorecards.js`, `.scorecard-*`)
- Player palette: `person-blueberry` through `person-olive` (the first six). Remove red from the player palette.
- `.is-leading`: 2px marigold border + "Leading" tag. `.scorecard-history-pill.is-winner`: marigold fill.
- Score deltas and bonus results: `success` / `danger`.

**Wedding pulse** (`display-rsvp.js`, `.rsvp-*`, `.name-pill*`)
- `.hero-number--active`, `.names-title`, eyebrow: `love`.
- Breakdown tiles neutral; "Review RSVPs" goes solid `time-today` when above zero.
- Guest tiles: attending `countdown-later`; undercount adds a marigold left edge + ⚠; declined faded + struck through; pending dashed border.

**Admin** (`css/admin.css`, `js/admin-*.js`)
- Same tokens and themes; delete the Dark/Slate overrides and gradients like display. Admin and display keep separate theme settings; the Display settings section gets a Light / Dark / Match device segmented control.
- Header: mark + "ADMIN" pill (`eyebrow-bg`/`eyebrow-fg`) + version + gear. Bottom tabs: active tab `primary` pill.
- Buttons: "+ Add" and "Generate pairing code" `primary`; Edit / Refresh photo `card-sunken`; Delete `danger` text; "Unpair this display" `danger-soft` fill with `danger` text.
- Settings checkbox and radio rows: drop the tan fill on checked rows; checked = `primary` 1.5px border + filled `primary` control.
- To-dos: same tier logic and card treatment as the display (whole-card color, date as tier-colored text, person dots instead of colored names).
- Meals: today/soon tiers on day cards; type pill becomes icon + word in the tier color; reorder arrows neutral.
- Events: event rows tinted by tier with relative dates; countdown rows get a small distance tag in the countdown ramp color; the plain date chip goes away.
- RSVP: "Needs review" rows get a marigold left edge + "⚠ Duplicate" text; confirmed parties `countdown-later` tiles with "Attending"; partial parties add the marigold edge + "⚠ 1 of 2".
- Scorecards: players as person dots; leader row marigold border + "Leading" tag.
- Person color picker offers the eight `person-*` colors (map existing member colors to the nearest one).
