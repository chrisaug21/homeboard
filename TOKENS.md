# TOKENS.md

Canonical reference for CSS design tokens in Homeboard. Any agent should read this file before touching CSS or adding a new styled component.

## 1. How color schemes work

Homeboard has three color schemes:

- `Warm` is the default scheme defined in `:root` in [index.html](/Users/chrisaugustine/projects/homeboard/index.html).
- `Dark` is defined in [css/display.css](/Users/chrisaugustine/projects/homeboard/css/display.css) under `html[data-scheme="dark"]`.
- `Slate` is defined in [css/display.css](/Users/chrisaugustine/projects/homeboard/css/display.css) under `html[data-scheme="slate"]`.

The active scheme is applied by `applyColorScheme()` in [js/display.js](/Users/chrisaugustine/projects/homeboard/js/display.js). That function sets or removes the `data-scheme` attribute on the `<html>` element:

- no `data-scheme` attribute = Warm
- `data-scheme="dark"` = Dark
- `data-scheme="slate"` = Slate

## 2. Semantic tokens — ALWAYS use these for new components

These are the canonical interaction tokens for any new component.

### `--color-accent`

Current values by scheme:

| Scheme | Value | Notes |
|---|---|---|
| Warm | `#b45309` | terracotta |
| Dark | `#f59e0b` | gold |
| Slate | `#0369a1` | blue |

Use for:

- primary interactive elements
- active states
- selected states
- focus indicators
- any element that needs to stand out as the primary action or selection

### `--color-accent-subtle`

Current values by scheme:

| Scheme | Value | Notes |
|---|---|---|
| Warm | `#f7d9aa` | soft peach |
| Dark | `rgba(245, 158, 11, 0.18)` | soft gold, low opacity |
| Slate | `rgba(3, 105, 161, 0.11)` | soft blue, low opacity |

Use for:

- background fills on active or selected elements where a full accent color would be too heavy
- hover states
- selected row backgrounds
- subtle highlights

Note: on light schemes (`Warm`, `Slate`) this is too subtle for nav active states. Use `--color-accent` instead for those.

### `--color-text-on-accent`

Current values by scheme:

| Scheme | Value |
|---|---|
| Warm | `#ffffff` |
| Dark | `#ffffff` |
| Slate | `#ffffff` |

Use for:

- text rendered on top of `--color-accent`
- icons rendered on top of `--color-accent`

## 3. Legacy tokens — do not use for new components

Warning: these tokens are legacy and should not be used in any new component.

### `--amber` and `--amber-soft`

These tokens exist in all three scheme blocks, but the names are misleading. In Slate, `--amber` is blue (`#0369a1`), not amber.

They predate the semantic token system and are being migrated out. Do not reference them in new components. Use `--color-accent` and `--color-accent-subtle` instead.

Migration status:

- partially complete
- `--display-nav-active-bg` has already been migrated
- all other references are still using legacy tokens and should be updated in the Phase 2 token audit PR

## 4. Component-scoped tokens — use only within their component

The following RSVP tokens are intentionally component-scoped:

- `--rsvp-pending-bg`
- `--rsvp-review-bg-flagged`
- `--rsvp-review-bg-clear`
- `--rsvp-attending-pill-bg`
- `--rsvp-attending-pill-color`
- `--rsvp-undercount-pill-bg`
- `--rsvp-undercount-pill-color`
- `--rsvp-clear`
- `--rsvp-flagged`

These are correct and intentional for RSVP admin components. Do not use them outside RSVP components.

If a non-RSVP component needs a similar color treatment, use `--color-accent` or `--color-accent-subtle` instead.

## 5. Structural tokens — reference freely

These tokens are safe to use anywhere in the project:

- `--bg`, `--bg-soft`: page and surface backgrounds
- `--panel`, `--panel-strong`: card and panel backgrounds
- `--ink`: primary text color
- `--muted`: secondary or muted text
- `--border`: default border color
- `--shadow`: box shadow
- `--radius-lg`, `--radius-md`, `--radius-sm`: border radius for cards and containers
- `--button-radius`: `8px`, use for all interactive buttons
- `--tag-radius`: `12px`, use for all tags and pills
- `--sage`, `--sage-soft`: success and positive states
- `--rose`, `--rose-soft`: error, negative, and love states
- `--transition`: standard animation timing

## 6. Token naming convention for new tokens

Any new token added to the project should follow this pattern:

- semantic purpose tokens: `--color-[purpose]` such as `--color-accent` or `--color-accent-subtle`
- component-scoped tokens: `--[component]-[purpose]` such as `--rsvp-pending-bg` or `--scorecard-active-player-bg`
- never name a token after a color such as `--amber` or `--blue` unless it is a raw palette entry that is not intended for direct use

## 7. Phase 2 audit — what still needs to be done

- Find all references to `var(--amber)` and `var(--amber-soft)` outside of their token definitions and update them to `--color-accent` or `--color-accent-subtle` as appropriate.
- Confirm all `--rsvp-*` tokens are only used in RSVP components.
- Remove `--display-nav-button-radius` if it is still present and unused.
