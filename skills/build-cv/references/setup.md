# First-time setup

Run this when there is no CV folder yet (`track.mjs status` shows `cvFolder: null`, or the folder has no `build-cv.json`). Keep it quick: two or three short rounds of questions, using `AskUserQuestion` when available (max 4 questions per call), otherwise short numbered lists.

## Round 1: where and what

1. **Where to save the CV?** Suggest `~/Documents/CV` (show the real absolute path for their OS). Warn in one line: not inside a project that may go to a public repo, because the CV contains personal data.
2. **Do you already have a CV?**
   - No → start fresh.
   - Yes → ask for the file path or to paste the text. Accept PDF, DOCX, Markdown, plain text or a LinkedIn "Save to PDF" export (see "Import an existing CV" below). Say once: "I'll keep everything that's in it as it is and continue in the same format; I only add."
   - With an existing CV, skip the design round and the personal-information form: take both from the CV, and ask only what's missing.
3. **CV language(s):** English · <the user's language> · both. Recommend English for remote or international jobs.
4. **Output formats** (multi-select): PDF (recommended, what you send) · Word .docx (some companies and agencies ask for it) · Markdown · HTML page.

## Round 2: personal information

Ask in one message as a short form the user can fill in, and say that anything can be skipped:

```
Full name:
Title (e.g. Junior Full-stack Developer):
City, country (or "Remote"):
Email:
Phone (optional):
GitHub / LinkedIn / portfolio links:
Spoken languages and level (e.g. English B2):
Education (school, field, years):
Work experience (any jobs, also non-IT, briefly; or "none"):
Certificates / courses (optional):
Photo (optional, path to a .jpg/.png):
Target role and country/market you're applying to:
```

- Photo: mention once that photos are common in much of Europe but discouraged in the US, UK, Ireland and Canada. Copy the photo into the CV folder as `photo.jpg`/`photo.png` (shell `cp`), never move the original.
- Never ask for date of birth, nationality, marital status or ID numbers. Add them only if the user insists.
- Don't ask again for what an imported CV already contains; confirm it instead ("I found your education and 2 jobs in your old CV. Still correct?").

## Round 3: design

Ask **one** question, and don't apply your own default look:
- **Classic:** serif font (Georgia), dark-blue accent, thin lines under headings
- **Modern:** sans font (Calibri), teal accent, no lines
- **Minimal:** black and white (Helvetica/Arial), no lines
- **Compact:** smaller sans font, more on one page
- **Custom:** the user names a font, an accent color (name or hex) and lines yes/no, and a page size (A4 or US Letter)

If the user says "doesn't matter", pick Classic and say they can change it any time with `/build-cv design`. Store the choice in `build-cv.json` → `design` (`preset`, optional `font`, `accent`, `lines`, `photo`, `size`).

## Save

1. Create the folder and `build-cv.json` (format in `cv-data.md`).
2. Run `node "<skill dir>/scripts/track.mjs" set-folder "<CV folder>"`, so the skill and the hook can always find the CV.
3. Continue with the project analysis (`project-analysis.md`).

## Import an existing CV

- **PDF:** read it with the agent's file reading (Claude Code's Read tool reads PDFs). If your agent can't read PDFs, ask the user to paste the text.
- **DOCX:** `node "<skill dir>/scripts/read-docx.mjs" "<file.docx>"` prints its text. If that fails, ask the user to save it as PDF or paste the text.
- **Pasted text, Markdown, LinkedIn PDF export:** read directly.
Then follow `existing-cv.md`: keep the original untouched, continue in its format, lock what was there, and only add. Don't ask which parts to "keep or drop": everything they had stays.
