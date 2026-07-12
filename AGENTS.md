# AGENTS.md

## Project Notes

- Main user-facing React app: `my-app`.
- Admin console React app: `admin-app`.
- Backend API: `backend`.
- The repository contains Chinese UI text. Preserve UTF-8 text exactly.

## Editing Rules

- Prefer `apply_patch` for source edits.
- Do not rewrite files containing Chinese text with plain PowerShell `Set-Content`, `Out-File`, or shell redirection.
- If a scripted rewrite is unavoidable, use UTF-8 without BOM explicitly:

```powershell
$encoding = New-Object System.Text.UTF8Encoding($false)
$path = Resolve-Path "path\to\file.js"
$lines = [System.IO.File]::ReadAllLines($path, $encoding)
[System.IO.File]::WriteAllLines($path, $lines, $encoding)
```

- Keep `.editorconfig` and `.gitattributes` encoding and line-ending rules intact.
- Do not add a UTF-8 BOM. React/ESLint reports this as `unicode-bom`.

## Verification

- For admin console UI changes, run:

```powershell
npm.cmd run build
```

from `admin-app`.

- Existing build warnings about `Browserslist` data age or Node `fs.F_OK` deprecation are non-blocking unless the task is specifically about dependency maintenance.

## UI Notes

- The admin console uses a compact left sidebar in `admin-app/src/styles.css`.


## Mobile H5 Guidelines (`my-app`)

- Design by CSS viewport width, never by a specific phone brand or model. Start with the mobile layout; add desktop enhancements only when the layout needs them.
- Use these layout tiers: phone by default (`< 600px`), tablet / large phone (`600px–899px`), desktop (`>= 900px`). Add a `max-width: 359px` or `max-width: 480px` rule only for a real small-screen or mobile-interaction issue.
- Desktop is a protected baseline. When changing an existing page for mobile or tablet, do not alter its `>= 900px` layout, visual hierarchy, spacing, typography, or interactions unless the user explicitly requests a desktop redesign.
- Prefer additive, scoped media-query overrides for `< 900px`. Do not replace shared desktop styles with generalized responsive values without checking the desktop result.
- Treat phone, tablet, and desktop as layout tiers rather than device models. Do not target device brands, models, or user-agent strings.
- On phones, an intentionally different information hierarchy is allowed and often required: multi-column sections become stacked sections; dense tables become cards or explicitly scrollable regions; sidebars become drawers, tabs, or bottom navigation; secondary details use progressive disclosure.
- Reuse data fetching, state, and business logic across layout tiers. Create separate `Desktop*` and `Mobile*` presentational components only when their DOM structure or interaction model differs materially.
- Scope page styles under a page-root class. Avoid generic, unscoped selectors (for example `.header`, `.card`, `.content`, or global element selectors) that can affect unrelated pages.
- Avoid fixed widths for primary mobile containers. Use flexible layouts, `width: 100%`, `max-width`, and `min-width: 0` where necessary to prevent overflow.
- Check UI changes at `320`, `360`, `390`, `430`, `768`, and `1024` CSS pixels. The layout must not cause page-level horizontal scrolling at any phone width.
- For every `my-app` UI change, also verify the `900px` desktop boundary. Check for page-level horizontal scrolling, clipped menus, obscured fixed actions, and any desktop regression at `>= 900px`.
- In the final handoff for `my-app` UI changes, state the breakpoints checked and whether desktop behavior was intentionally changed.
- On phones, redesign the information hierarchy instead of merely shrinking desktop UI: multi-column layouts become one column; secondary previews move below or collapse; dense lists become cards; tables become cards or an explicitly scrollable region.
- Phone page gutters are normally `16px`; controls must have a usable touch target of at least `44px` in one dimension.
- Use `100dvh` for viewport-height layouts. Fixed bottom actions and mobile drawers must account for `env(safe-area-inset-bottom)` and leave content padding so actions do not cover it.
- On phones, dialogs with substantial content should use a full-width bottom sheet or a viewport-bounded panel with internal scrolling. Avoid fixed-width centered dialogs. Anchor popovers must remain within the viewport and flip above their trigger when there is insufficient room below.
- Do not hide essential content solely to make a desktop layout fit. Preserve access through stacking, progressive disclosure, or a mobile-specific interaction.
- For `my-app` UI changes, run `npm.cmd run build` from `my-app`. Existing dotLottie sourcemap, Browserslist, and Node `fs.F_OK` warnings are non-blocking unless related to the change.
