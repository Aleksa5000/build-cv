#!/usr/bin/env node
// Insert-only editing of an existing .docx CV, keeping its exact formatting. No dependencies.
// Existing paragraphs are never changed or removed; every other file in the package is copied byte for byte.
//
//   node docx-edit.mjs outline <cv.docx>
//       Lists every paragraph: index, style, list flag, text runs. Use it to pick where to insert and which
//       existing paragraph to copy the formatting from.
//   node docx-edit.mjs insert <cv.docx> <out.docx> <plan.json>
//       plan.json: [{ "after": 12, "template": 9, "segments": ["New project", "2026"] }, ...]
//       Clones paragraph `template` (paragraph properties and the formatting of each text run), puts
//       `segments` into its text runs in order (extra template runs are dropped), and inserts it right after
//       paragraph `after` (insertions with the same `after` keep plan order). Never overwrites the input.
//       { "row": true, "after": 13, "template": 12, "segments": ["Backend", "Node.js, Express"] } instead copies
//       the whole table row holding paragraph `template` (one segment per cell with text) and inserts it after
//       the row holding paragraph `after`. Use it for CVs laid out in tables.
//       { "set": 4, "segments": [...], "approved": "<the user's words>" } / { "remove": 5, "approved": "..." }
//       change or remove an existing paragraph. Only for a change the user explicitly asked for; the script
//       refuses without "approved", and verifies that every other paragraph stays byte for byte the same.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

// ---------- zip ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("Not a .docx (zip) file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Broken zip directory.");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), time = buf.readUInt16LE(p + 12), date = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16), comp = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    entries.push({ name, flags: flags & 0x0800, method, time, date, crc, size, raw: buf.subarray(start, start + comp) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function writeZip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(e.flags, 6); local.writeUInt16LE(e.method, 8);
    local.writeUInt16LE(e.time, 10); local.writeUInt16LE(e.date, 12); local.writeUInt32LE(e.crc, 14); local.writeUInt32LE(e.raw.length, 18);
    local.writeUInt32LE(e.size, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, e.raw);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(e.flags, 8); cen.writeUInt16LE(e.method, 10);
    cen.writeUInt16LE(e.time, 12); cen.writeUInt16LE(e.date, 14); cen.writeUInt32LE(e.crc, 16); cen.writeUInt32LE(e.raw.length, 20);
    cen.writeUInt32LE(e.size, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + e.raw.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}
const unpack = (e) => (e.method === 8 ? inflateRawSync(e.raw) : Buffer.from(e.raw));

// ---------- paragraphs ----------
// Every <w:p> (also inside tables), as [start, end) offsets into document.xml. Nested paragraphs (text boxes)
// are kept inside their outer paragraph.
function paragraphs(xml) {
  const out = [];
  const re = /<w:p(?=[\s>\/])[^>]*?(\/?)>|<\/w:p>/g;
  let depth = 0, start = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] === "</w:p>") { depth--; if (depth === 0) out.push([start, re.lastIndex]); continue; }
    if (m[1] === "/") { if (depth === 0) out.push([m.index, re.lastIndex]); continue; }
    if (depth === 0) start = m.index;
    depth++;
  }
  return out;
}
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const encode = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Top-level runs of a paragraph (not inside nested content), with their text.
function runs(p) {
  const out = [];
  const re = /<w:r(?=[\s>])[^>]*>[\s\S]*?<\/w:r>/g;
  let m;
  while ((m = re.exec(p))) {
    const texts = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((t) => decode(t[1]));
    out.push({ xml: m[0], start: m.index, end: re.lastIndex, text: texts.join(""), hasText: texts.length > 0, tab: /<w:tab\/>/.test(m[0]) });
  }
  return out;
}
function info(p) {
  const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
  const list = /<w:numPr>/.test(p);
  const rs = runs(p).filter((r) => r.hasText || r.tab);
  return { style, list, runs: rs.map((r) => (r.hasText ? r.text : "\\t")) };
}
function clone(p, segments) {
  // No duplicate ids in the new paragraph: drop paragraph ids, bookmarks and comment anchors.
  let q = p.replace(/\sw14:(paraId|textId)="[^"]*"/g, "")
    .replace(/<w:bookmark(Start|End)\b[^>]*\/>/g, "")
    .replace(/<w:commentRange(Start|End)\b[^>]*\/>/g, "")
    .replace(/<w:r(?=[\s>])[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[\s\S]*?<\/w:r>/g, "")
    .replace(/<w:proofErr\b[^>]*\/>/g, "");
  const rs = runs(q);
  const textRuns = rs.filter((r) => r.hasText);
  if (!textRuns.length) throw new Error("The template paragraph has no text run to copy the formatting from.");
  let out = "", last = 0, k = 0;
  for (const r of rs) {
    out += q.slice(last, r.start);
    last = r.end;
    if (!r.hasText) { if (k < segments.length) out += r.xml; continue; }   // keep tabs/breaks between kept segments
    if (k >= segments.length) continue;                                    // extra template runs are dropped
    // Same run (formatting, tabs, breaks inside it); only its text becomes the segment.
    let first = true;
    const seg = encode(segments[k++]);
    out += r.xml.replace(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g, () => (first ? ((first = false), `<w:t xml:space="preserve">${seg}</w:t>`) : ""));
  }
  out += q.slice(last);
  // More segments than text runs: the rest goes in the last run's formatting.
  if (k < segments.length) {
    const rPr = (textRuns[textRuns.length - 1].xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    const extra = segments.slice(k).map((s) => `<w:r>${rPr}<w:t xml:space="preserve">${encode(s)}</w:t></w:r>`).join("");
    out = out.replace(/<\/w:p>$/, `${extra}</w:p>`);
  }
  return out;
}

// Table rows (<w:tr>) as [start, end) offsets.
function rows(xml) {
  const out = [];
  const re = /<w:tr(?=[\s>])[^>]*>|<\/w:tr>/g;
  let depth = 0, start = -1, m;
  while ((m = re.exec(xml))) {
    if (m[0] === "</w:tr>") { depth--; if (depth === 0) out.push([start, re.lastIndex]); continue; }
    if (depth === 0) start = m.index;
    depth++;
  }
  return out;
}
const rowOf = (rs, [a, b]) => rs.find(([s, e]) => s <= a && b <= e);
// Clone a table row: one segment per paragraph that has text, in order (empty cells stay empty).
function cloneRow(row, segments) {
  const ps = paragraphs(row);
  let out = "", last = 0, k = 0;
  for (const [a, b] of ps) {
    const p = row.slice(a, b);
    out += row.slice(last, a);
    last = b;
    out += runs(p).some((r) => r.hasText) && k < segments.length ? clone(p, [segments[k++]]) : p;
  }
  return (out + row.slice(last)).replace(/\sw14:(paraId|textId)="[^"]*"/g, "");
}

// ---------- main ----------
const [cmd, file, outFile, planFile] = process.argv.slice(2);
if (!cmd || !file) { console.error("usage: docx-edit.mjs outline <cv.docx> | insert <cv.docx> <out.docx> <plan.json>"); process.exit(1); }
const entries = readZip(readFileSync(file));
const docEntry = entries.find((e) => e.name === "word/document.xml");
if (!docEntry) { console.error("word/document.xml not found."); process.exit(1); }
const xml = unpack(docEntry).toString("utf8");
const ps = paragraphs(xml);

if (cmd === "outline") {
  ps.forEach(([a, b], i) => {
    const d = info(xml.slice(a, b));
    console.log(`${String(i).padStart(3)} ${(d.style || "-").padEnd(14)} ${d.list ? "list" : "    "} ${JSON.stringify(d.runs)}`);
  });
} else if (cmd === "insert") {
  if (!outFile || !planFile) { console.error("usage: insert <cv.docx> <out.docx> <plan.json>"); process.exit(1); }
  if (resolve(outFile) === resolve(file)) { console.error("Refusing to overwrite the original. Write to a new file."); process.exit(1); }
  const plan = JSON.parse(readFileSync(planFile, "utf8"));
  const edits = [];          // { at, end, text } replacements over the original document.xml
  const touched = new Set(); // paragraphs the user explicitly approved to change or remove
  const trs = rows(xml);
  for (const step of plan) {
    const idx = (k) => { if (!(Number.isInteger(step[k]) && step[k] >= 0 && step[k] < ps.length)) throw new Error(`Bad paragraph index ${k}=${step[k]} (0..${ps.length - 1}).`); return step[k]; };
    if ("set" in step || "remove" in step) {
      // Changing existing text is allowed only with the user's explicit approval, quoted in the plan.
      if (typeof step.approved !== "string" || step.approved.trim().length < 3) throw new Error("set/remove changes existing content: add \"approved\" with the user's own words approving this exact change.");
      const i = idx("set" in step ? "set" : "remove");
      if (touched.has(i)) throw new Error(`Paragraph ${i} is changed twice.`);
      touched.add(i);
      const [a, b] = ps[i];
      if ("set" in step) {
        if (!Array.isArray(step.segments) || !step.segments.length) throw new Error("set needs segments.");
        edits.push({ at: a, end: b, text: clone(xml.slice(a, b), step.segments) });
      } else {
        // A table cell must keep one paragraph: leave an empty one there.
        edits.push({ at: a, end: b, text: rowOf(trs, ps[i]) ? "<w:p/>" : "" });
      }
      continue;
    }
    idx("after"); idx("template");
    if (!Array.isArray(step.segments) || !step.segments.length) throw new Error("Each step needs non-empty segments.");
    if (step.row) {
      // A new table row: copy the row that holds paragraph `template`, insert it after the row that holds `after`.
      const t = rowOf(trs, ps[step.template]), after = rowOf(trs, ps[step.after]);
      if (!t || !after) throw new Error("row: both paragraphs must be inside a table row.");
      edits.push({ at: after[1], end: after[1], text: cloneRow(xml.slice(t[0], t[1]), step.segments) });
    } else {
      const [a, b] = ps[step.template];
      edits.push({ at: ps[step.after][1], end: ps[step.after][1], text: clone(xml.slice(a, b), step.segments) });
    }
  }
  // Apply in document order (a stable sort keeps plan order for insertions at the same place).
  edits.sort((x, y) => x.at - y.at);
  let out = "", last = 0;
  for (const e of edits) {
    if (e.at < last) throw new Error("Overlapping changes in the plan.");
    out += xml.slice(last, e.at) + e.text;
    last = e.end;
  }
  out += xml.slice(last);
  // Proof: every paragraph the user did not approve to change is still there, byte for byte and in order.
  let cursor = 0;
  ps.forEach(([a, b], i) => {
    if (touched.has(i)) return;
    const at = out.indexOf(xml.slice(a, b), cursor);
    if (at < 0) throw new Error(`Safety check failed: paragraph ${i} would change. Nothing was written.`);
    cursor = at + (b - a);
  });
  const data = Buffer.from(out, "utf8");
  const comp = deflateRawSync(data);
  const next = entries.map((e) => (e === docEntry ? { ...e, method: 8, crc: crc32(data), size: data.length, raw: comp } : e));
  if (existsSync(outFile)) console.error(`note: replacing ${outFile}`);
  writeFileSync(outFile, writeZip(next));
  console.log(JSON.stringify({ ok: true, out: resolve(outFile), inserted: plan.length - touched.size, changedByUserApproval: [...touched], originalParagraphs: ps.length, unchangedFiles: entries.length - 1 }));
} else {
  console.error("unknown command"); process.exit(1);
}
