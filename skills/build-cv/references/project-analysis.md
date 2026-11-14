# Project analysis for the CV

Goal: in about 15 file reads, find what a hiring manager wants to know about this project: what it is, who it's for, what the user built, how hard it was, and with what. Read-only.

## Ground rules

- Read with the agent's file tools (Claude Code: Read, Glob, Grep), not with shell commands like `cat`, `ls`, `find`, `grep`. In an agent without file tools (Codex), use only read-only shell commands (`rg --files`, `rg -n ... --glob '!**/.env*'`, `sed -n`/`Get-Content`), never on secret files. Beyond reading files, the only shell commands for analysis are `git log`, `git shortlog` and `git rev-parse`.
- **Never open secrets:** `.env*` (except `.env.example`), keys, credentials, database files. Always exclude them in Grep (`glob: "!**/.env*"`).
- Skip noise: `node_modules/`, `.venv/`, `dist/`, `build/`, `.next/`, `__pycache__/`, `vendor/`, lock files, binaries, datasets.

## Which folder

- The current folder is one project (it has a manifest, source files or a README): analyze it.
- The current folder **contains several projects** (e.g. `~/code` with many subfolders): list them with one line each (name + what it looks like) and ask which ones to include (multi-select). Analyze each chosen one separately.
- An empty folder or the home folder: ask for the project path, or go straight to setup / editing the CV.

## What to collect

1. **Pitch:** what it does and for whom, in one line (from the README, docs, the UI or routes).
2. **Status and dates:**
   - With git: `git log --max-parents=0 --format=%ad --date=short` gives the start date (first commit), `git log -1 --format=%ad --date=short` the latest activity. Use `git shortlog -sn` to see if it's solo or a team project.
   - Without git: ask the user for the start month (one short question), and whether it's finished, ongoing, or used by real people.
3. **Stack:** manifests (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`…), Docker and CI files, the database, external services (names of env variables in `.env.example`, never values). Confirm usage by grepping imports. Don't list unused packages.
4. **Achievements (the bullets):** look for evidence of real engineering. Each one needs a file you saw:
   - core features and own algorithms (scheduling, search, scoring, ML models)
   - auth and security (hashing, sessions, rate limiting, permissions)
   - integrations (payments, email, AI APIs, maps)
   - data (schema design, migrations, background jobs, caching)
   - quality (number of test files, CI, linting, type checking)
   - delivery (Docker, deployment config, desktop/mobile builds)
   - documentation (`docs/`, architecture notes)
5. **Public link:** a GitHub remote (`git remote -v` is not allowed, so read `.git/config` with Read) or a deployed URL from the README. Never put a link to a private repo on a CV without asking.
6. **Possible numbers:** test count, number of supported languages, number of endpoints or features. Only countable facts from the code. Everything else (users, speed, money) must come from the user.

## Ask, don't guess (1 short round per project)

Ask only what the code can't tell, max 4 questions, e.g.:
- "What was your role: did you build all of it, or with others?"
- "Does anyone use it? (users, a client, your own business)"
- "Any result you can share? (e.g. 'used by 30 students', 'cut manual work from 2h to 10 min')"
- "Should the CV link to it? (the repo looks private / there's no public URL)"

## Turn it into a CV entry

Use `writing-guide.md`: a one-line pitch, dates, role, 2–4 bullets (strongest first), a Tech line. Then show the entry and ask before saving (`cv-data.md` → "Safe updates").

## Skills section

Update the grouped skills from all projects: add technologies with real usage, keep the user's own listed skills, never remove anything without asking.
