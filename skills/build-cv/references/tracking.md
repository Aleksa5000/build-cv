# Tracking a project while it's being built

The script `scripts/track.mjs` (next to `SKILL.md`) remembers which projects belong to the CV and when the CV was last synced with each. State lives in `~/.claude/build-cv/state.json`. When installed as a plugin, a SessionStart hook runs `track.mjs hook`: in a tracked project with new commits (or changed source files, for projects without git) it reminds Claude to ask the user **once** whether to update the CV. The hook never writes the CV.

Commands (run from the project folder, or pass its path):
- `node "<skill dir>/scripts/track.mjs" mark [path]`: start tracking / mark as synced now
- `node "<skill dir>/scripts/track.mjs" changes [path]`: what changed since the last sync (commit list or changed files)
- `node "<skill dir>/scripts/track.mjs" unmark [path]`: stop tracking
- `node "<skill dir>/scripts/track.mjs" status`: the CV folder and all tracked projects
- `node "<skill dir>/scripts/track.mjs" pause|resume [path]`: stop or resume the per-session notes, keeping the project tracked

## `/build-cv track` (a new idea or a project just started)

1. If there is no CV yet, run setup first (`setup.md`).
2. Ask for the idea in 2–3 sentences if the folder is still empty: what it is, for whom, planned stack.
3. Propose an **in-progress** entry (empty `endDate`, present tense, e.g. "Building a … with …"). Keep it modest; promise nothing that isn't built yet. If there's nothing built yet, it's fine to save it to `build-cv.json` only, and add it to the CV after the first real feature.
4. After a yes: save, run `track.mjs mark`, and add the project to `build-cv.json` → `projects` with `status: "active"`.
5. Tell the user: "From now on, when you open Claude Code in this project and there's new work, I'll ask once whether to add it to your CV. You can also run `/build-cv update` any time." Mention that the reminder needs the Claude Code plugin install (a manual copy, and Codex, have no reminder hook: there, run `$build-cv update` after bigger features).

## `/build-cv update` (or after the hook's reminder, if the user says yes)

1. `track.mjs changes` → the new commits or changed files since the last sync. Nothing changed → say so and stop.
2. Look at what's new with Read/Grep (and `git log`/`git show --stat` for commits; never print diffs of secret files). Focus on **features and achievements**, not refactors, typo fixes or dependency bumps.
3. Decide what is CV-worthy. Most small changes are not, and that's fine: say "Nothing new worth adding" and still run `mark`, so the user isn't asked again for the same work.
4. Propose concrete changes as before/after: a new or sharper bullet, a new technology in the Tech line, updated dates, status "finished" (set `endDate`, switch to past tense) when the user says it's done. Max 2–3 changes per update, to keep the CV short.
5. Apply only what the user approves (`cv-data.md` → "Safe updates"), regenerate the outputs, then `track.mjs mark`.

## Finished projects

When a project is done, ask whether to keep tracking it. `unmark` stops the reminders; the CV entry stays.
