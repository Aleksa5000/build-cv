# Changelog

## 0.2.0 — 2026-11-15
- **Existing CVs are respected:** build-cv keeps the original file untouched, learns its format (sections, voice, tense, date format, bullets, look) and continues in it. It only adds; anything it didn't add is locked.
- `docx-edit.mjs`: edits a copy of a Word CV in place: inserts new paragraphs and table rows with the CV's own formatting, keeps every other part byte for byte, and proves that no original paragraph changed. Changing or removing an existing line requires the user's explicit approval, quoted in the plan.
- `guard.mjs`: locks the content of an imported CV and checks every proposed save (JSON) or updated file (Markdown/text) against it.
- Renderer: `dateFormat` (`MM/YYYY`, `MM.YYYY`, `YYYY`, `MMMM YYYY`), skill lines without group names, custom section names, and design settings are sanitized (no code in settings).

## 0.1.1 — 2026-11-14
- Works in **Codex** too: agent-neutral instructions (file tools in Claude Code, read-only shell with `.env` excluded in Codex), `$skill` commands in Codex, numbered-list questions when there's no question tool. Install steps for Codex in the README.
- The reminder hook now uses a single command string, so Codex can run it too (after you approve it there).

## 0.1.0 — 2026-11-13
- First release: CV entries written from your real projects (pitch, dates, role, achievement bullets, tech line), with no invented facts.
- Setup: CV folder, existing CV import (PDF, DOCX, Markdown, text, LinkedIn PDF), languages, formats, personal details, design (Classic, Modern, Minimal, Compact or custom).
- Export to PDF (headless Edge/Chrome/Chromium/Brave), DOCX (generated with no dependencies), Markdown and HTML, from JSON Resume files.
- `/build-cv track` and `/build-cv update`, plus a SessionStart hook that offers once to add new work to the CV.
- `/build-cv tailor` with a job match table, and extras: LinkedIn About, README blurbs, cover letters.
- Every change is shown before/after and saved only after a yes, with a backup in `history/`.
