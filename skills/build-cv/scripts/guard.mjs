#!/usr/bin/env node
// build-cv guard: content the user already had (an imported CV) is locked. build-cv may add to it, never
// change or remove it. No dependencies.
//
//   node guard.mjs lock <cv folder>             snapshot every cv.<lang>.json into source/locked.<lang>.json
//                                               (run once, right after importing an existing CV)
//   node guard.mjs check <cv folder> [file.json] check the CV (or a proposed file) against the snapshots.
//                                               Exit code 1 + a list of violations if anything locked was
//                                               changed, removed or reordered.
//   node guard.mjs check-lines <original> <new> every line of an original text/Markdown CV must still be there,
//                                               unchanged and in order (insert-only editing)
//   node guard.mjs relock <cv folder> <lang> <json pointer>
//                                               ONLY when the user explicitly asked to change that one locked item
//                                               themselves: takes the current value at the pointer (e.g.
//                                               /work/0/position) into the snapshot.
//   node guard.mjs hash <cv folder>             fingerprints of build-cv.json and every cv.<lang>.json, as JSON.
//                                               Take them when you read the CV, before proposing anything.
//   node guard.mjs save <cv folder> <target> <proposed file> <expected hash>
//                                               compare-and-swap write of <target> (e.g. cv.en.json): writes
//                                               only if the file still has <expected hash>, i.e. no other session
//                                               or agent changed it since you read it. Backs it up to history/
//                                               first and, for a locked CV, runs the guard check. Exit 2 = it
//                                               changed meanwhile: re-read it and re-apply your change on top.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const fingerprint = (f) => (existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16) : "missing");

const ID_KEYS = ["name", "title", "institution", "position", "organization", "language", "network", "url", "issuer"];
const read = (f) => JSON.parse(readFileSync(f, "utf8"));
const strip = (v) => {   // build-cv's own bookkeeping is never part of the locked content
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("x-") && k !== "meta").map(([k, x]) => [k, strip(x)]));
  return v;
};
const show = (v) => JSON.stringify(v).slice(0, 90);

// Is `locked` still fully present in `cur`? Collects human-readable violations.
function compare(locked, cur, path, out) {
  if (locked === null || locked === undefined || locked === "") return;
  if (Array.isArray(locked)) {
    if (!Array.isArray(cur)) { out.push(`${path}: removed (was ${show(locked)})`); return; }
    if (locked.every((x) => typeof x !== "object")) {
      // strings/numbers: every locked value still there, in the same relative order (additions allowed anywhere)
      let i = 0;
      for (const v of locked) {
        const at = cur.indexOf(v, i);
        if (at < 0) out.push(cur.includes(v) ? `${path}: "${v}" moved out of its original order` : `${path}: "${v}" was changed or removed`);
        else i = at + 1;
      }
      return;
    }
    // objects: match each locked item by its identity keys, keep relative order
    let i = 0;
    for (const item of locked) {
      const key = ID_KEYS.find((k) => item && item[k]);
      const at = cur.findIndex((c, j) => j >= i && c && (key ? c[key] === item[key] : JSON.stringify(strip(c)) === JSON.stringify(item)));
      if (at < 0) {
        const anywhere = key && cur.findIndex((c) => c && c[key] === item[key]);
        out.push(anywhere >= 0 && anywhere !== false ? `${path}: "${item[key]}" moved out of its original order` : `${path}: item ${key ? `"${item[key]}"` : show(item)} was changed or removed`);
        continue;
      }
      compare(item, cur[at], `${path}[${key ? item[key] : at}]`, out);
      i = at + 1;
    }
    return;
  }
  if (typeof locked === "object") {
    if (!cur || typeof cur !== "object") { out.push(`${path}: removed`); return; }
    for (const [k, v] of Object.entries(locked)) compare(v, cur[k], `${path}/${k}`, out);
    return;
  }
  if (locked !== cur) out.push(`${path}: changed from ${show(locked)} to ${show(cur)}`);
}

const [cmd, a, b, c] = process.argv.slice(2);
const langs = (dir) => readdirSync(dir).filter((f) => /^cv\.[a-z]{2,3}(-[A-Za-z]{2,4})?\.json$/.test(f)).map((f) => f.split(".")[1]);

if (cmd === "hash") {
  const files = ["build-cv.json", ...langs(a).map((l) => `cv.${l}.json`)];
  console.log(JSON.stringify(Object.fromEntries(files.map((f) => [f, fingerprint(join(a, f))])), null, 2));
} else if (cmd === "save") {
  const [target, proposed, expected] = [b, c, process.argv[6]];
  if (!target || !proposed || !expected) { console.error("usage: save <cv folder> <target> <proposed file> <expected hash>"); process.exit(1); }
  if (target !== basename(target) || !/^(build-cv|cv\.[a-z]{2,3}(-[A-Za-z]{2,4})?)\.json$/.test(target)) { console.error("target must be build-cv.json or cv.<lang>.json in the CV folder"); process.exit(1); }
  const file = join(a, target);
  const now = fingerprint(file);
  if (now !== expected) {
    console.log(JSON.stringify({ ok: false, reason: `${target} was changed by someone else since you read it (expected ${expected}, now ${now}). Nothing was written. Re-read it, re-apply your change on top of the new version, show the user, and save with the new hash.` }));
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(proposed, "utf8"));   // must be valid JSON
  const m = target.match(/^cv\.(.+)\.json$/);
  if (m && existsSync(join(a, "source", `locked.${m[1]}.json`))) {
    const out = [];
    compare(read(join(a, "source", `locked.${m[1]}.json`)), data, "", out);
    if (out.length) { console.log(JSON.stringify({ ok: false, reason: "locked content would change", violations: out }, null, 2)); process.exit(1); }
  }
  if (existsSync(file)) {
    mkdirSync(join(a, "history"), { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    copyFileSync(file, join(a, "history", target.replace(/\.json$/, `-${stamp}.json`)));
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, saved: target, hash: fingerprint(file) }));
} else if (cmd === "lock") {
  mkdirSync(join(a, "source"), { recursive: true });
  const done = [];
  for (const l of langs(a)) {
    const target = join(a, "source", `locked.${l}.json`);
    if (existsSync(target)) { done.push(`${l}: already locked (unchanged)`); continue; }
    writeFileSync(target, JSON.stringify(strip(read(join(a, `cv.${l}.json`))), null, 2));
    done.push(`${l}: locked`);
  }
  console.log(JSON.stringify({ ok: true, done }));
} else if (cmd === "check") {
  const files = b ? [[b.match(/cv\.([a-z-]+)\.json$/i)?.[1] || langs(a)[0], b]] : langs(a).map((l) => [l, join(a, `cv.${l}.json`)]);
  const violations = [];
  let checked = 0;
  for (const [l, f] of files) {
    const snap = join(a, "source", `locked.${l}.json`);
    if (!existsSync(snap)) continue;
    checked++;
    const out = [];
    compare(read(snap), read(f), "", out);
    violations.push(...out.map((v) => `[${l}] ${v}`));
  }
  console.log(JSON.stringify({ ok: violations.length === 0, checked, violations }, null, 2));
  process.exit(violations.length ? 1 : 0);
} else if (cmd === "check-lines") {
  const orig = readFileSync(a, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const now = readFileSync(b, "utf8").split(/\r?\n/);
  const missing = [];
  let i = 0;
  for (const line of orig) {
    const at = now.indexOf(line, i);
    if (at < 0) missing.push(line); else i = at + 1;
  }
  console.log(JSON.stringify({ ok: missing.length === 0, missing: missing.slice(0, 20) }, null, 2));
  process.exit(missing.length ? 1 : 0);
} else if (cmd === "relock") {
  const snapFile = join(a, "source", `locked.${b}.json`);
  const snap = read(snapFile), cur = strip(read(join(a, `cv.${b}.json`)));
  const keys = c.split("/").filter(Boolean);
  let s = snap, v = cur;
  for (const k of keys.slice(0, -1)) { s = s[k]; v = v[k]; if (s === undefined || v === undefined) { console.error("pointer not found"); process.exit(1); } }
  const last = keys[keys.length - 1];
  const before = s[last];
  s[last] = v[last];
  writeFileSync(snapFile, JSON.stringify(snap, null, 2));
  console.log(JSON.stringify({ ok: true, pointer: c, before, after: v[last] }));
} else {
  console.error("usage: guard.mjs lock <dir> | check <dir> [file] | check-lines <orig> <new> | relock <dir> <lang> <pointer>");
  process.exit(1);
}
