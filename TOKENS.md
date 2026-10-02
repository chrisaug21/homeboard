# TOKENS.md

Canonical reference for Homeboard's design tokens. Read this before touching CSS or adding a styled component. The source of truth is [css/tokens.css](css/tokens.css) (copied from `design-system/tokens.css`); the full design rules live in `design-system/README.md` and `design-system/components/*/README.md`.

## 1. Themes

Two themes, plus "Match device":

- `Light` = `:root` / `html[data-theme="light"]`
- `Dark` = `html[data-theme="dark"]`
- `Match device` = no `data-theme` attribute; `@media (prefers-color-scheme: dark)` picks Light or Dark.

Display and admin keep separate choices. Display: `households.color_scheme`; admin: `users.preferences.admin_theme`. Stored values are `light`, `dark` or `auto`. Old saved `warm` / `slate` values are read as `light` by `normalizeTheme()` in `js/display-core.js`; only `light` / `dark` / `auto` are written. Marketing, signup and privacy pages follow the device setting.

Components read tokens only. Never write per-theme override blocks (`html[data-theme="dark"] .foo {...}`), gradients, or one-off hex/`rgba()` colors. If a color is not a token, use `color-mix(in srgb, var(--token) N%, transparent)` for a translucent version.

## 2. Core tokens

| Token | Use |
|---|---|
| `--bg`, `--surface`, `--card`, `--card-sunken` | page, panels, cards, hover/sunken fills |
| `--ink`, `--muted`, `--border`, `--shadow` | text, secondary text, hairlines, shadow |
| `--primary`, `--on-primary` | buttons, active nav, selected controls (aubergine in Light, marigold in Dark) |
| `--success`, `--danger`, `--danger-soft` | positive / error states |
| `--love` | wedding pulse accents only |
| `--eyebrow-bg`, `--eyebrow-fg` | screen title pill on every screen |
| `--font-display` (Rubik), `--font-ui` (Manrope) | all text; fonts are self-hosted in `fonts/` |

## 3. Time scale (color means "how soon")

Anything with a date takes its color from `getTimeTier(dateString)` in `js/shared.js`: `overdue`, `today`, `soon` (1-3 days), `week` (4-7 days), `later`.

| Tier | Fill | Text on it | Other |
|---|---|---|---|
| overdue | `--time-overdue` | `--on-time-overdue` | solid |
| today | `--time-today` | `--on-time-today` | solid |
| soon | `--time-soon` | `--time-soon-fg` | edge `--time-soon-edge`, chip `--time-soon-chip` |
| week | `--time-week` | `--time-week-fg` | edge `--time-week-edge` |
| later | `--card` | `--muted` | plain |

Edge width is `--time-edge` (6px). Color is only ever used for time; never color a card for any other reason.

Countdowns use their own ramp by distance: `--countdown-far` (31+ days), `--countdown-later` (8-30), `--countdown-soon` (1-7), and `--time-today` for today. Card slide tokens: `--on-countdown-soon` (white text on fern), `--countdown-later-sub` (secondary text on the sage fill, lighter in Dark for contrast), `--on-time-today-sub` (secondary text on marigold), `--countdown-stamp-bg`/`--countdown-stamp-fg` (no-photo aubergine block), `--countdown-frame`/`--countdown-frame-on-far` (Postcard frame), `--countdown-perf`/`--countdown-perf-on-today` (Ticket perforation line), `--countdown-credit-bg`/`--countdown-credit-fg` (photo credit chip).

## 4. Person colors

Eight tokens: `--person-blueberry` ... `--person-moss`. Stored member and scorecard colors are raw hex; `resolvePersonColorToken(color, limit)` in `js/shared.js` maps them to the nearest token at render time (no database migration). Set the inline style `--person-color: var(--person-xxx)`; CSS reads `--person: var(--person-color, var(--muted))`. Scorecard players use only the first six (no red, since red means alarm). Palettes live in `js/admin-core.js` (`PERSON_COLOR_PALETTE`, `SCORECARD_PLAYER_COLOR_PALETTE`).

## 5. Structural tokens

`--space-*`, radius tokens (`--button-radius`, `--tag-radius`, `--radius-*`), and `--time-edge` live in `css/tokens.css` or the `:root` block of `index.html`. Display footer nav sizing uses `--display-nav-button-width`, `--display-nav-button-active-width`, `--display-nav-button-height`, `--display-nav-button-gap`, `--display-nav-icon-size` (component-scoped, set in `index.html`).

## 6. Naming new tokens

Use the design-system names (above). Do not reintroduce the removed legacy names: `--amber`, `--amber-soft`, `--color-accent`, `--color-accent-subtle`, `--color-text-on-accent`, `--sage`, `--sage-soft`, `--rose`, `--rose-soft`, `--panel`, `--panel-strong`, `--bg-soft`, `--rsvp-*`, `--marketing-*` (marketing still uses a few local `--marketing-*` aliases inside `.marketing-shell` that point at the tokens above), `--display-nav-active-bg/-border`.

## 7. Logos

Light/dark pairs in `brand/` (`logo.svg` / `logo-on-dark.svg`, `logo-stacked*.svg`, `mark*.svg`, `app-icon.svg`). Render both `<img>`s with `.brand-logo--light` / `.brand-logo--dark`; CSS shows the right one for `data-theme` and `prefers-color-scheme`. Never use CSS filters to recolor a logo.
