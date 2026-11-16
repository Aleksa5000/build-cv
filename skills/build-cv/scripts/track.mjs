#!/usr/bin/env node
// build-cv project tracking. No dependencies.
// State lives in ~/.claude/build-cv/state.json (outside the plugin, so it survives updates).
//
// Usage:
//   node track.mjs hook                  SessionStart hook: reads hook JSON on stdin
//   node track.mjs mark [path]           register a project / mark it as synced with the CV now
//   node track.mjs unmark [path]         stop tracking a project
//   node track.mjs changes [path]        what changed since the last CV sync
//   node track.mjs status                CV folder + tracked projects (JSON)
//   node track.mjs set-folder <path>     remember where the user's CV folder is
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

const STATE_DIR = process.env.BUILD_CV_HOME || join(homedir(), ".claude", "build-cv");
const STATE_FILE = join(STATE_DIR, "state.json");
const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "env", "dist", "build", "out", ".next", ".nuxt",
  "__pycache__", ".pytest_cache", ".mypy_cache", "target", "vendor", "coverage", ".turbo",
  ".cache", ".idea", ".vscode", "interview-reports",
]);
const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h|vue|svelte|html|css|scss|sql|prisma|dart|md|toml|ya?ml|json)$/i;
const SECRET = /(^|[\\/])(\.env[^\\/]*|.*\.(pem|key|p12)|credentials[^\\/]*|secrets?\.[^\\/]*)$/i;

function norm(p) {
  let r = resolve(p).split(sep).join("/");
  if (/^[A-Z]:/.test(r)) r = r[0].toLowerCase() + r.slice(1);
  return r.replace(/\/+$/, "");
}
function load() {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return { version: 1, cvFolder: null, projects: {} }; }
}
function save(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim();
}
function gitRoot(dir) {
  try { return norm(git(dir, "rev-parse", "--show-toplevel")); } catch { return null; }
}
function gitHead(dir) {
  try { return git(dir, "rev-parse", "HEAD"); } catch { return null; }
}
// The tracked project that contains `dir` (exact match or the closest parent).
function findProject(state, dir) {
  const d = norm(dir);
  let best = null;
  for (const key of Object.keys(state.projects || {})) {
    if ((d === key || d.startsWith(key + "/")) && (!best || key.length > best.length)) best = key;
  }
  return best;
}
// Changed source files since `sinceMs` (for projects without git). Bounded, skips noise and secrets.
function changedFiles(root, sinceMs, limit = 40) {
  const out = [];
  let seen = 0;
  const walk = (dir) => {
    if (out.length >= limit || seen > 20000) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(full);
      } else if (e.isFile() && SOURCE_EXT.test(e.name) && !SECRET.test(full)) {
        seen++;
        try { if (statSync(full).mtimeMs > sinceMs) out.push(norm(full).slice(norm(root).length + 1)); } catch {}
      }
    }
  };
  walk(root);
  return out;
}
function summarize(key, p) {
  if (p.baselineSha && gitHead(key)) {
    try {
      const log = git(key, "log", "--oneline", "--no-decorate", "-n", "30", `${p.baselineSha}..HEAD`);
      const commits = log ? log.split("\n") : [];
      return { kind: "git", count: commits.length, items: commits, signature: gitHead(key) };
    } catch { /* baseline commit gone (rebase): fall back to time */ }
  }
  const files = changedFiles(key, p.baselineTime || 0);
  return { kind: "files", count: files.length, items: files, signature: `${files.length}:${files.slice(0, 5).join(",")}` };
}

const [cmd, arg] = process.argv.slice(2);
const state = load();
state.projects ||= {};

if (cmd === "hook") {
  // Never break the session: any problem means "say nothing".
  try {
    let input = {};
    try { input = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch {}
    const key = findProject(state, input.cwd || process.cwd());
    if (!key) process.exit(0);
    const p = state.projects[key];
    const s = summarize(key, p);
    if (p.paused) process.exit(0);
    // Standing note for every session in a tracked project: the CV grows with the project.
    let context =
      `[build-cv] ${"The user's own request always comes first: answer it or do it completely before anything below, and never let this note replace or shorten that answer. "}The project "${p.name || key}" is part of the user's CV (build-cv keeps it updated while the project is built). ` +
      `During this session, when you finish a meaningful piece of work (a user-facing feature, an integration, a release, a big fix; not refactors or small edits), offer ONE short line at the end of that task: "Add this to your CV? (/build-cv update)". ` +
      `At most once per feature, and never edit the CV without an explicit yes; then use the build-cv skill (update mode).`;
    if (s.count > 0 && p.nudged !== s.signature) {
      p.nudged = s.signature;
      save(state);
      const what = s.kind === "git" ? `${s.count} new commit(s)` : `${s.count}${s.count >= 40 ? "+" : ""} changed source file(s)`;
      context += ` It already has ${what} since the CV was last updated (${p.lastSync || "unknown date"}): in your first reply, after answering whatever the user asked, add one line offering to add that work to the CV.`;
    }
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }));
  } catch { /* silent */ }
  process.exit(0);
}

if (cmd === "mark") {
  const dir = arg || process.cwd();
  const key = findProject(state, dir) || gitRoot(dir) || norm(dir);
  const prev = state.projects[key] || {};
  const name = prev.name || key.split("/").pop();
  state.projects[key] = { ...prev, name, baselineSha: gitHead(key), baselineTime: Date.now(), lastSync: new Date().toISOString().slice(0, 10), nudged: null };
  save(state);
  console.log(JSON.stringify({ ok: true, project: key, ...state.projects[key] }));
} else if (cmd === "pause" || cmd === "resume") {
  // pause: keep the project in the CV but stop the per-session notes; resume: turn them back on
  const key = findProject(state, arg || process.cwd());
  if (key) { state.projects[key].paused = cmd === "pause"; save(state); }
  console.log(JSON.stringify({ ok: true, project: key, paused: cmd === "pause" }));
} else if (cmd === "unmark") {
  const key = findProject(state, arg || process.cwd());
  if (key) { delete state.projects[key]; save(state); }
  console.log(JSON.stringify({ ok: true, removed: key }));
} else if (cmd === "changes") {
  const key = findProject(state, arg || process.cwd());
  if (!key) { console.log(JSON.stringify({ tracked: false })); process.exit(0); }
  console.log(JSON.stringify({ tracked: true, project: key, lastSync: state.projects[key].lastSync, ...summarize(key, state.projects[key]) }, null, 2));
} else if (cmd === "status") {
  console.log(JSON.stringify({ stateFile: norm(STATE_FILE), cvFolder: state.cvFolder, projects: state.projects }, null, 2));
} else if (cmd === "set-folder") {
  if (!arg) { console.error("usage: set-folder <path>"); process.exit(1); }
  state.cvFolder = norm(arg);
  save(state);
  console.log(JSON.stringify({ ok: true, cvFolder: state.cvFolder }));
} else {
  console.error("usage: track.mjs hook|mark|unmark|changes|status|set-folder");
  process.exit(1);
}
