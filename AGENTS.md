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

## Bilingual UI and Public Content

- Mentory supports switching the interface language in Settings. Whenever a user-facing web feature, page, workflow, or public-facing/marketing page is added or updated in Chinese, implement the corresponding English version in the same change; do not ship Chinese-only copy with English deferred to later.
- Integrate both languages with the project's existing language setting and localization mechanism. Do not create a separate language switch or hard-code bilingual text into the same interface unless the design explicitly requires both languages to appear together.
- Keep feature behavior, information hierarchy, calls to action, validation messages, empty/error/loading states, accessibility labels, metadata, and other visible content functionally equivalent in Chinese and English. Translate for natural meaning and product context rather than word-for-word output.
- Include newly introduced backend-provided display copy, configuration-driven content, and public SEO/share content when they are part of the experience. Keep internal logs, developer comments, identifiers, and admin-only technical data unchanged unless localization is explicitly required.
- Treat Chinese and English as part of the same definition of done: verify both language states and check that longer English text does not cause clipping, overflow, broken wrapping, or layout regressions at the relevant viewport sizes.

## Outbound Email Guidelines (`backend`)

- Every user-facing email sent by Mentory, including transactional messages, verification codes, account/security messages, appointment and course notifications, dispute or review results, and admin broadcasts, must use the shared standard Mentory email card. Do not introduce a standalone or plain custom HTML layout for an individual email.
- The standard HTML layout must include all three of these visible elements: the Mentory Logo, a clear body title beside or immediately associated with the Logo, and a shortcut button below the main content that opens Mentory. An email is not compliant if the shortcut is absent or is rendered only as an inline text link.
- The shortcut must be a visually button-like HTML link with a valid absolute `https://` URL. Link to the most relevant in-product destination when one exists; otherwise use the public Mentory home URL. The default localized labels are `打开 Mentory` for Chinese and `Open Mentory` for English, unless a more specific localized action label better describes the destination.
- Keep the Logo, header/title, content card, and shortcut button in shared helpers in `backend/src/services/mailService.ts` so new and existing email types inherit the same structure and email-client-safe inline styling. Do not rely on CSS classes, JavaScript, relative URLs, or external stylesheets in email HTML.
- Apply the recipient's Mentory language preference to the subject, body title, body copy, action label, and plain-text fallback whenever the email is tied to a user account. Chinese and English variants must remain functionally equivalent.
- Every email must retain a useful plain-text alternative. Include the same destination URL in that alternative because a button cannot be rendered in plain text.
- When adding or changing an email, audit every send path that uses the affected template and add or update automated coverage that asserts the rendered HTML contains the Logo, non-empty body title, and bottom shortcut button with an absolute URL in both supported language variants where applicable.

## Modal Guidelines (`my-app`)

- New or updated modal close buttons must follow the established Mentory style used by `LoginPopup` and `CourseReviewModal`: use the `FiX` icon from `react-icons/fi` inside a `40px × 40px` button with `12px` border radius, no border, white background, `#0f172a` icon color, centered `inline-flex` layout, an `18px × 18px` icon, and `rgba(15, 23, 42, 0.04)` hover background.
- Reuse a shared close-button component when one exists. Until one is available, keep the modal-specific selector scoped but match the established style exactly; do not introduce literal `×` text, gray circular close buttons, or one-off visual variants.
- Every modal close button must be a semantic `button` with `type="button"`, a localized accessible `aria-label`, keyboard focus support, and a disabled state when closing must be blocked during submission.

## Mobile H5 Guidelines (`my-app`)

- Design by CSS viewport width, never by a specific phone brand or model. Start with the mobile layout; add desktop enhancements only when the layout needs them.
- Use these layout tiers: phone by default (`< 600px`), tablet / large phone (`600px–899px`), desktop (`>= 900px`). Add a `max-width: 359px` or `max-width: 480px` rule only for a real small-screen or mobile-interaction issue.
- Desktop is a protected baseline. When changing an existing page for mobile or tablet, do not alter its `>= 900px` layout, visual hierarchy, spacing, typography, or interactions unless the user explicitly requests a desktop redesign.
- Prefer additive, scoped media-query overrides for `< 900px`. Do not replace shared desktop styles with generalized responsive values without checking the desktop result.
- Treat phone, tablet, and desktop as layout tiers rather than device models. Do not target device brands, models, or user-agent strings.
- On phones, an intentionally different information hierarchy is allowed and often required: multi-column sections become stacked sections; dense tables become cards or explicitly scrollable regions; sidebars become drawers, tabs, or bottom navigation; secondary details use progressive disclosure.
- Reuse data fetching, state, and business logic across layout tiers. Create separate `Desktop*` and `Mobile*` presentational components only when their DOM structure or interaction model differs materially.
- Scope page styles under a page-root class. Avoid generic, unscoped selectors (for example `.header`, `.card`, `.content`, or global element selectors) that can affect unrelated pages.
- iOS Safari may apply its system blue to text inside custom buttons, links, or detected data. For labels that must remain neutral, explicitly set both `color` and `-webkit-text-fill-color`, reset `appearance` / `-webkit-appearance` on custom buttons when appropriate, and keep the override scoped to the component instead of relying on inherited browser defaults.
- Avoid fixed widths for primary mobile containers. Use flexible layouts, `width: 100%`, `max-width`, and `min-width: 0` where necessary to prevent overflow.
- When browser-testing mobile UI, prioritize representative iPhone CSS viewports: start with `390×844`, then check the compact `375×667` and large `430×932` sizes when relevant. These are testing priorities only; continue to implement responsive behavior by viewport tiers and never add iPhone-model-specific CSS or user-agent checks.
- Check UI changes at `320`, `360`, `390`, `430`, `768`, and `1024` CSS pixels. The layout must not cause page-level horizontal scrolling at any phone width.
- For every `my-app` UI change, also verify the `900px` desktop boundary. Check for page-level horizontal scrolling, clipped menus, obscured fixed actions, and any desktop regression at `>= 900px`.
- In the final handoff for `my-app` UI changes, state the breakpoints checked and whether desktop behavior was intentionally changed.
- On phones, redesign the information hierarchy instead of merely shrinking desktop UI: multi-column layouts become one column; secondary previews move below or collapse; dense lists become cards; tables become cards or an explicitly scrollable region.
- Phone page gutters are normally `16px`; controls must have a usable touch target of at least `44px` in one dimension.
- Use `100dvh` for viewport-height layouts. Fixed bottom actions and mobile drawers must account for `env(safe-area-inset-bottom)` and leave content padding so actions do not cover it.
- On phones, dialogs with substantial content should use a full-width bottom sheet or a viewport-bounded panel with internal scrolling. Avoid fixed-width centered dialogs. Anchor popovers must remain within the viewport and flip above their trigger when there is insufficient room below.
- Do not hide essential content solely to make a desktop layout fit. Preserve access through stacking, progressive disclosure, or a mobile-specific interaction.
- For `my-app` UI changes, run `npm.cmd run build` from `my-app`. Existing dotLottie sourcemap, Browserslist, and Node `fs.F_OK` warnings are non-blocking unless related to the change.
