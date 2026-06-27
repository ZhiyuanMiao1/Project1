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
- Student management currently has no status filter dropdown.
- Student management "封禁/解封" is displayed as non-clickable text using the current action color, not as a button.
