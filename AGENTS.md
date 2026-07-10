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
- Check UI changes at `320`, `360`, `390`, `430`, `768`, and `1024` CSS pixels. The layout must not cause page-level horizontal scrolling at any phone width.
- On phones, redesign the information hierarchy instead of merely shrinking desktop UI: multi-column layouts become one column; secondary previews move below or collapse; dense lists become cards; tables become cards or an explicitly scrollable region.
- Phone page gutters are normally `16px`; controls must have a usable touch target of at least `44px` in one dimension.
- Use `100dvh` for viewport-height layouts. Fixed bottom actions and mobile drawers must account for `env(safe-area-inset-bottom)` and leave content padding so actions do not cover it.
- On phones, dialogs with substantial content should use a full-width bottom sheet or a viewport-bounded panel with internal scrolling. Avoid fixed-width centered dialogs. Anchor popovers must remain within the viewport and flip above their trigger when there is insufficient room below.
- Do not hide essential content solely to make a desktop layout fit. Preserve access through stacking, progressive disclosure, or a mobile-specific interaction.
- For `my-app` UI changes, run `npm.cmd run build` from `my-app`. Existing dotLottie sourcemap, Browserslist, and Node `fs.F_OK` warnings are non-blocking unless related to the change.
