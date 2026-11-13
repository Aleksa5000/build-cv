# Changelog

## 0.1.0 — 2026-11-13
- First release: CV entries written from your real projects (pitch, dates, role, achievement bullets, tech line), with no invented facts.
- Setup: CV folder, existing CV import (PDF, DOCX, Markdown, text, LinkedIn PDF), languages, formats, personal details, design (Classic, Modern, Minimal, Compact or custom).
- Export to PDF (headless Edge/Chrome/Chromium/Brave), DOCX (generated with no dependencies), Markdown and HTML, from JSON Resume files.
- `/build-cv track` and `/build-cv update`, plus a SessionStart hook that offers once to add new work to the CV.
- `/build-cv tailor` with a job match table, and extras: LinkedIn About, README blurbs, cover letters.
- Every change is shown before/after and saved only after a yes, with a backup in `history/`.
