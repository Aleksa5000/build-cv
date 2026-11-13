# CV folder and data

## Folder layout

The user picks the CV folder during setup (default suggestion: `~/Documents/CV`; never inside a project that might be pushed to a public repo, because the CV holds personal data).

```
<CV folder>/
  build-cv.json             settings: languages, formats, design, target role, country, photo
  cv.en.json                CV content, one file per language (JSON Resume format)
  cv.sr.json                (only if a second language was chosen; same facts as cv.en.json)
  cv.en.md / .html / .pdf / .docx   generated outputs (only the chosen formats)
  photo.jpg                 optional, a copy of the user's photo
  history/                  a backup of every cv.*.json before each change
  tailored/<YYYY-MM-DD>-<company>/   CVs tailored to one job ad
  extras/                   LinkedIn About, README blurbs, cover letters
```

The **`cv.<lang>.json` files are the source of truth.** Never edit generated files (`.md`, `.html`, `.pdf`, `.docx`) by hand. Change the JSON, then regenerate. Tell the user to do the same: edits made directly in the PDF or DOCX would be overwritten on the next update. If they edited a generated file anyway, read it and offer to copy those edits into the JSON first.

## `build-cv.json`

```json
{
  "version": 1,
  "languages": ["en", "sr"],
  "formats": ["pdf", "docx", "md", "html"],
  "design": { "preset": "classic", "font": "Georgia", "accent": "#1f3a5f", "photo": false, "dateFormat": "MMM YYYY" },
  "target": { "role": "Junior Full-stack Developer", "country": "Serbia / EU remote" },
  "projects": [
    { "name": "hsk-learning", "path": "D:/code/hsk-learning", "status": "active", "addedAt": "2026-11-13", "lastSync": "2026-11-13" }
  ]
}
```

`projects` lists the projects this CV is built from and connects them to tracking (`tracking.md`).

## `cv.<lang>.json` (JSON Resume format)

Use the open [JSON Resume](https://jsonresume.org/schema) structure, so the user can also use its many themes and tools:

```json
{
  "basics": {
    "name": "", "label": "Junior Full-stack Developer", "image": "photo.jpg",
    "email": "", "phone": "", "url": "",
    "summary": "",
    "location": { "city": "", "countryCode": "" },
    "profiles": [ { "network": "GitHub", "username": "", "url": "" }, { "network": "LinkedIn", "url": "" } ]
  },
  "projects": [
    {
      "name": "", "description": "one-line pitch", "url": "",
      "startDate": "2026-08", "endDate": "", "roles": ["Solo developer"],
      "highlights": ["bullet", "bullet"],
      "keywords": ["Python", "FastAPI", "PostgreSQL"]
    }
  ],
  "work": [ { "name": "", "position": "", "startDate": "", "endDate": "", "summary": "", "highlights": [] } ],
  "education": [ { "institution": "", "area": "", "studyType": "", "startDate": "", "endDate": "" } ],
  "certificates": [ { "name": "", "issuer": "", "date": "" } ],
  "skills": [ { "name": "Backend", "keywords": ["Python", "FastAPI"] } ],
  "languages": [ { "language": "English", "fluency": "B2" } ],
  "volunteer": [], "awards": [], "interests": [],
  "meta": { "lastModified": "2026-11-13", "generator": "build-cv" }
}
```

Rules:
- Dates are `YYYY-MM` or `YYYY-MM-DD`. An empty `endDate` means "Present".
- Leave out empty sections and fields. Never fill them with placeholders.
- Ongoing projects: empty `endDate`, bullets in present tense ("Building…").
- Keep the same order of projects and sections in every language file.

## Safe updates (always)

1. Read the current `cv.<lang>.json`.
2. **Show the proposed change** as a short before/after per changed section ("Projects › hsk-learning: + 1 bullet, Tech: + Celery"). For a new CV, show the full draft.
3. **Ask for permission.** Only a clear yes applies the change. The user can also say "only the first one" or rephrase a bullet.
4. Copy the current file to `history/cv.<lang>-<YYYY-MM-DD-HHMM>.json`, then write the new version.
5. Regenerate the chosen formats (`export.md`) and update `projects[].lastSync` in `build-cv.json`.
