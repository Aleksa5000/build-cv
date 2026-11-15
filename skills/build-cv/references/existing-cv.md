# Working with an existing CV

The user's existing CV is **theirs**. Continue it in its own format and voice, add to it, and never change or remove anything you didn't add. These rules beat every other rule in this skill.

## Ownership (the core rule)

- **Locked:** everything that was in the CV the user gave you: every section, entry, bullet, date, skill, heading and its wording, including what you think is weak or wrong.
- **Yours:** only what build-cv added (new projects, bullets, skills, sections), marked `"x-origin": "build-cv"` on the item in `cv.<lang>.json`, or the paragraphs you inserted into their DOCX.
- You may change or remove **only your own** items. You may **add** new items, bullets inside an existing entry (after their bullets), skills (after theirs) and new sections.
- Improvements to locked content are **suggestions in chat only** ("Your 'Frontend developer' entry would be stronger with a number, e.g. how many clients"). Apply one only if the user explicitly asks you to change that exact item, show the before/after, get a yes, then: JSON → change it and run `guard.mjs relock` for that item so the new wording is locked again; DOCX → a `set`/`remove` step in the plan with `"approved"` quoting the user's words (the script refuses without it). Never "tidy up", reformat, translate or reorder locked content on your own.
- If the user asks to delete something locked, confirm the exact item first ("Delete 'Agencija Pixel, 2023–2025' from your CV?"). Never delete as a side effect.

## Never work around the tools

- Never edit `source/` by hand (the original file and the `locked.*.json` snapshots). Only `guard.mjs lock`/`relock` write snapshots.
- Never edit build-cv's scripts, and never put code (CSS, HTML, JavaScript) into `build-cv.json` or the CV JSON.
- If the renderer or `docx-edit.mjs` can't express something from the user's CV (e.g. a two-column layout), tell the user plainly and offer the closest honest option. Don't patch around it.

## 1. Read it and keep the original

1. Get the file (path) or pasted text. Copy the original file unchanged into `<CV folder>/source/` (shell `cp`); never edit or move the user's original.
2. Read it:
   - **DOCX:** `node "<skill dir>/scripts/docx-edit.mjs" outline "<file>"` (every paragraph with style, list flag and text runs, including table cells) and `read-docx.mjs` for plain text.
   - **PDF / LinkedIn PDF:** read it with the agent's file reading (Claude Code's Read tool shows the text and the page image, so you also see the layout). If your agent can't read PDFs, ask for a DOCX or the pasted text.
   - **Markdown / text / pasted:** read it as is.
3. Extract **what the user has done**: name and contacts, title, summary, jobs, projects, education, certificates, skills, languages, dates. Show a short summary and ask only about what's unclear. Don't ask again for what the CV already says.

## 2. Learn its format (write down, in `build-cv.json` → `existing`)

- **Format:** `docx` (edit in place) · `md`/`txt` (edit in place) · `pdf`/`pasted` (rebuild, see below)
- **Language** of the CV, and **voice**: first person ("Razvijala sam…", "I built…") or no pronoun ("Built…"), past/present tense, gender of verb forms where the language has it (e.g. Serbian "radila/radio": copy the user's form).
- **Section names and order**, exactly as written ("RADNO ISKUSTVO", "Professional Experience"…).
- **Entry pattern:** e.g. `Title — place<TAB>date` (bold title, italic place), then bullets.
- **Date format:** `03/2023 – 08/2025`, `Mar 2023 – Aug 2025`, `2015 – 2019`…, the dash and the word for "present" ("danas", "present", "trenutno").
- **Bullet style:** punctuation at the end or not, length, starting with a verb or a noun.
- **Look:** fonts, colors, one or two columns, tables (from the DOCX outline/styles, or what you see in the PDF image).

New content must be indistinguishable in style from the user's: same voice, tense, verb gender, date format, punctuation, section names.

## 3. Add new content in the same format

### DOCX: edit in place (preferred when they gave a .docx)
1. Run `outline`. Choose, for each new piece, an existing paragraph of the same kind as the **template** (an entry title line, a bullet, a table row) and the paragraph to insert **after** (the end of the right section).
2. Write a plan and run:
   `node "<skill dir>/scripts/docx-edit.mjs" insert "<original.docx>" "<CV folder>/<Name>_CV.updated.docx" plan.json`
   Plan steps: `{ "after": 8, "template": 7, "segments": ["Todo API", " — ", "lični projekat", "10/2026 – danas"] }` (one segment per text run of the template: keeps bold/italic/tabs), bullets with a bullet paragraph as the template, table rows with `"row": true`.
3. The script only inserts, keeps every other part of the file byte for byte, refuses to overwrite the original and verifies that removing the inserted paragraphs gives back the original. Run `outline` on the result and show the user the new lines in context.
4. Record what you inserted (paragraph texts) in `build-cv.json` → `existing.inserted`, so later updates know which paragraphs are yours.
5. PDF: there's no Word on most machines to convert it. Tell the user to open the updated DOCX and use **File → Save as → PDF** (Word, LibreOffice or Google Docs).

### Markdown / text: edit in place
Write `<Name>_CV.updated.md` with the new lines inserted in the right places, then verify:
`node "<skill dir>/scripts/guard.mjs" check-lines "<original>" "<updated>"` must print `ok: true`. If not, fix your file; never "fix" the original lines.

### PDF / pasted text: rebuild in JSON, locked
You can't edit a PDF, so rebuild it as close as possible:
1. Put the extracted content into `cv.<lang>.json` **word for word** (no rewording, no fixing typos, no added labels: a skills line without a group name stays a `skills` item without `name`), keeping their section order, section names (`meta.labels`, e.g. `{"work": "RADNO ISKUSTVO", "present": "danas"}`) and order (`design.order`).
2. Match the look in `build-cv.json` → `design`: closest font, accent color, lines, `dateFormat` (`"MM/YYYY"`, `"MMM YYYY"`, `"MMMM YYYY"`, `"MM.YYYY"` or `"YYYY"`), page size. Say honestly what can't be copied (e.g. a two-column Canva layout becomes one column, which also reads better in ATS).
3. Lock it: `node "<skill dir>/scripts/guard.mjs" lock "<CV folder>"` (snapshots into `source/locked.<lang>.json`).
4. Add new items with `"x-origin": "build-cv"`.
5. **Before every save**, write the proposed JSON to a temp file and run `guard.mjs check "<CV folder>" "<proposed.json>"`. If it reports violations, don't save; fix the proposal so locked content stays as it was. After saving, render.

## 4. Updates later

Same rules every time: read `build-cv.json` → `existing`, add new content in the learned format, change only items with `x-origin: build-cv` (JSON) or paragraphs listed in `existing.inserted` (DOCX: for those, regenerate the updated DOCX from the **original** with the new full plan, instead of editing your own output), and run the guard before saving.
