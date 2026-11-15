#!/usr/bin/env node
// build-cv renderer: cv.<lang>.json (JSON Resume) + build-cv.json -> .md / .html / .pdf / .docx
// No dependencies. PDF uses an installed Chromium browser (Edge, Chrome, Chromium, Brave) in headless mode.
//
// Usage: node render.mjs <dir> [--formats pdf,docx,md,html] [--lang en]
//   <dir> holds cv.<lang>.json files; build-cv.json is read from <dir> or a parent folder.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateRawSync } from "node:zlib";

// ---------- settings ----------
const args = process.argv.slice(2);
const dir = resolve(args[0] || ".");
const opt = (name) => { const i = args.indexOf(`--${name}`); return i > -1 ? args[i + 1] : null; };

function findSettings(start) {
  let d = start;
  for (let i = 0; i < 4; i++) {
    const f = join(d, "build-cv.json");
    if (existsSync(f)) return { file: f, data: JSON.parse(readFileSync(f, "utf8")) };
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return { file: null, data: {} };
}
const settings = findSettings(dir).data;
const formats = (opt("formats") || (settings.formats || ["pdf", "md"]).join(",")).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const PRESETS = {
  classic: { font: "Georgia, 'Times New Roman', serif", accent: "#1f3a5f", lines: true, base: 10.5 },
  modern: { font: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif", accent: "#0f766e", lines: false, base: 10.5 },
  minimal: { font: "Helvetica, Arial, sans-serif", accent: "#111111", lines: false, base: 10 },
  compact: { font: "Arial, Helvetica, sans-serif", accent: "#374151", lines: true, base: 9.5 },
};
const userDesign = settings.design || {};
const design = { ...(PRESETS[userDesign.preset] || PRESETS.classic), ...userDesign };
// Settings are data, never code: a font is a list of names, a colour is a hex or a colour word.
{
  const base = PRESETS[userDesign.preset] || PRESETS.classic;
  if (typeof design.font !== "string" || /[;{}<>:()\\]/.test(design.font)) design.font = base.font;
  if (typeof design.accent !== "string" || !/^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(design.accent)) design.accent = base.accent;
  design.base = Number(design.base) > 6 && Number(design.base) < 16 ? Number(design.base) : base.base;
}
const DEFAULT_ORDER = ["summary", "skills", "projects", "work", "education", "certificates", "languages", "volunteer", "awards", "interests"];
const order = design.order || DEFAULT_ORDER;

const LABELS = {
  en: { summary: "Summary", skills: "Skills", projects: "Projects", work: "Experience", education: "Education", certificates: "Certificates", languages: "Languages", volunteer: "Volunteering", awards: "Awards", interests: "Interests", present: "Present", tech: "Tech" },
  sr: { summary: "Profil", skills: "Veštine", projects: "Projekti", work: "Radno iskustvo", education: "Obrazovanje", certificates: "Sertifikati", languages: "Jezici", volunteer: "Volontiranje", awards: "Nagrade", interests: "Interesovanja", present: "danas", tech: "Tehnologije" },
};

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const has = (a) => Array.isArray(a) && a.length > 0;
function fmtDate(d, lang) {
  if (!d) return "";
  const [y, m] = String(d).split("-");
  if (!m) return y;
  // design.dateFormat copies an existing CV's style: "MM/YYYY", "MM.YYYY", "YYYY", "MMMM YYYY", default "MMM YYYY".
  const f = design.dateFormat;
  if (f === "MM/YYYY") return `${m}/${y}`;
  if (f === "MM.YYYY") return `${m}.${y}`;
  if (f === "YYYY") return y;
  try {
    if (f === "MMMM YYYY") {
      const loc = design.dateLocale || { sr: "sr-Latn", bs: "bs-Latn" }[lang] || lang;
      return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(new Date(Number(y), Number(m) - 1, 1)).replace(/\.$/, "");
    }
    // "sr" defaults to Cyrillic in ICU; CVs are usually Latin. Override with design.dateLocale (e.g. "sr-Cyrl").
    const locale = design.dateLocale || { sr: "sr-Latn", bs: "bs-Latn" }[lang] || lang;
    const s = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(Number(y), Number(m) - 1, 1));
    return s.replace(/\.$/, "");
  } catch { return `${m}/${y}`; }
}
function range(a, b, lang, L) {
  if (!a && !b) return "";
  return `${fmtDate(a, lang)} – ${b ? fmtDate(b, lang) : L.present}`;
}
function contactParts(b) {
  const parts = [];
  if (b.location && (b.location.city || b.location.countryCode || b.location.region)) parts.push([b.location.city, b.location.region, b.location.countryCode].filter(Boolean).join(", "));
  if (b.email) parts.push(b.email);
  if (b.phone) parts.push(b.phone);
  if (b.url) parts.push(b.url.replace(/^https?:\/\//, ""));
  for (const p of b.profiles || []) if (p.url || p.username) parts.push((p.url || p.username).replace(/^https?:\/\//, ""));
  return parts;
}

// Normalized sections: [{ key, title, items: [{ title, sub, date, lines[], tech }] }] shared by all formats.
function sections(cv, lang) {
  const L = { ...(LABELS[lang] || LABELS.en), ...(cv.meta?.labels || {}) };
  const out = [];
  for (const key of order) {
    let items = [];
    if (key === "summary" && cv.basics?.summary) items = [{ text: cv.basics.summary }];
    else if (key === "skills" && has(cv.skills)) items = cv.skills.map((s) => (s.name ? { inline: `${s.name}: `, text: (s.keywords || []).join(", ") } : { text: (s.keywords || []).join(", ") }));   // unnamed groups stay unnamed (an existing CV)
    else if (key === "projects" && has(cv.projects)) items = cv.projects.map((p) => ({
      title: p.name, sub: [p.description, (p.roles || []).join(", ")].filter(Boolean).join(" · "), date: range(p.startDate, p.endDate, lang, L),
      link: p.url, lines: p.highlights || [], tech: has(p.keywords) ? `${L.tech}: ${p.keywords.join(", ")}` : "",
    }));
    else if (key === "work" && has(cv.work)) items = cv.work.map((w) => ({
      title: [w.position, w.name].filter(Boolean).join(" · "), sub: w.location || "", date: range(w.startDate, w.endDate, lang, L),
      link: w.url, lines: [w.summary, ...(w.highlights || [])].filter(Boolean),
    }));
    else if (key === "education" && has(cv.education)) items = cv.education.map((e) => ({
      title: [e.studyType, e.area].filter(Boolean).join(", ") || e.institution, sub: e.studyType || e.area ? e.institution : "",
      date: range(e.startDate, e.endDate, lang, L), lines: e.courses || [],
    }));
    else if (key === "certificates" && has(cv.certificates)) items = cv.certificates.map((c) => ({ title: c.name, sub: c.issuer || "", date: fmtDate(c.date, lang), link: c.url }));
    else if (key === "languages" && has(cv.languages)) items = [{ text: cv.languages.map((l) => (l.fluency ? `${l.language} (${l.fluency})` : l.language)).join(" · ") }];
    else if (key === "volunteer" && has(cv.volunteer)) items = cv.volunteer.map((v) => ({ title: [v.position, v.organization].filter(Boolean).join(" · "), date: range(v.startDate, v.endDate, lang, L), lines: [v.summary, ...(v.highlights || [])].filter(Boolean) }));
    else if (key === "awards" && has(cv.awards)) items = cv.awards.map((a) => ({ title: a.title, sub: a.awarder || "", date: fmtDate(a.date, lang), lines: a.summary ? [a.summary] : [] }));
    else if (key === "interests" && has(cv.interests)) items = [{ text: cv.interests.map((i) => i.name).join(" · ") }];
    if (items.length) out.push({ key, title: L[key] || key, items });
  }
  return out;
}

// ---------- Markdown ----------
function toMarkdown(cv, lang) {
  const b = cv.basics || {};
  let md = `# ${b.name || ""}\n\n`;
  if (b.label) md += `**${b.label}**\n\n`;
  const c = contactParts(b);
  if (c.length) md += `${c.join(" · ")}\n\n`;
  for (const s of sections(cv, lang)) {
    md += `## ${s.title}\n\n`;
    for (const it of s.items) {
      if (it.text !== undefined) { md += it.inline ? `- **${it.inline.trim()}** ${it.text}\n` : `${it.text}\n`; continue; }
      md += `### ${it.title}${it.date ? ` · ${it.date}` : ""}\n`;
      if (it.sub) md += `*${it.sub}*\n`;
      if (it.link) md += `${it.link}\n`;
      md += "\n";
      for (const l of it.lines || []) md += `- ${l}\n`;
      if (it.tech) md += `\n${it.tech}\n`;
      md += "\n";
    }
    md += "\n";
  }
  return md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------- HTML ----------
function toHtml(cv, lang) {
  const b = cv.basics || {};
  const a = design.accent;
  const photo = design.photo && b.image && existsSync(join(dir, b.image)) ? `<img class="photo" src="${esc(b.image)}" alt="">` : "";
  const body = sections(cv, lang).map((s) => {
    const items = s.items.map((it) => {
      if (it.text !== undefined) return `<p class="${it.inline ? "skill" : "text"}">${it.inline ? `<strong>${esc(it.inline)}</strong>` : ""}${esc(it.text)}</p>`;
      return `<div class="item"><div class="row"><h3>${esc(it.title)}</h3>${it.date ? `<span class="date">${esc(it.date)}</span>` : ""}</div>` +
        (it.sub ? `<div class="sub">${esc(it.sub)}</div>` : "") +
        (it.link ? `<div class="link"><a href="${esc(it.link)}">${esc(it.link.replace(/^https?:\/\//, ""))}</a></div>` : "") +
        (has(it.lines) ? `<ul>${it.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "") +
        (it.tech ? `<div class="tech">${esc(it.tech)}</div>` : "") + `</div>`;
    }).join("\n");
    return `<section><h2>${esc(s.title)}</h2>\n${items}</section>`;
  }).join("\n");
  const size = design.size === "Letter" ? "Letter" : "A4";
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.name || "CV")}${b.label ? ` · ${esc(b.label)}` : ""}</title>
<meta name="author" content="${esc(b.name || "")}"><meta name="generator" content="build-cv">
<style>
@page { size: ${size}; margin: 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1a1a1a; background: #fff; font-family: ${design.font}; font-size: ${design.base}pt; line-height: 1.38; }
main { max-width: 780px; margin: 0 auto; padding: 24px 20px; }
@media print { main { padding: 0; max-width: none; } a { color: inherit; text-decoration: none; } }
header { display: flex; gap: 18px; align-items: center; margin-bottom: 10px; }
.photo { width: 84px; height: 84px; object-fit: cover; border-radius: 4px; }
h1 { margin: 0; font-size: 2.1em; line-height: 1.1; color: ${a}; }
.label { margin-top: 2px; font-size: 1.15em; }
.contact { margin-top: 4px; color: #444; font-size: .95em; }
h2 { margin: 14px 0 6px; font-size: 1.05em; text-transform: uppercase; letter-spacing: .06em; color: ${a};${design.lines ? ` border-bottom: 1px solid ${a}; padding-bottom: 2px;` : ""} }
h3 { margin: 0; font-size: 1em; }
.item { margin: 0 0 8px; break-inside: avoid; }
.row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.date { white-space: nowrap; color: #444; font-size: .95em; }
.sub, .link { color: #444; font-style: italic; }
.link { font-style: normal; font-size: .95em; }
a { color: ${a}; }
ul { margin: 3px 0 0; padding-left: 18px; }
li { margin: 1px 0; }
.tech { margin-top: 2px; color: #444; font-size: .95em; }
p { margin: 0 0 4px; }
</style></head>
<body><main>
<header>${photo}<div><h1>${esc(b.name || "")}</h1>${b.label ? `<div class="label">${esc(b.label)}</div>` : ""}<div class="contact">${contactParts(b).map(esc).join(" · ")}</div></div></header>
${body}
</main></body></html>
`;
}

// ---------- PDF (headless Chromium) ----------
function findBrowser() {
  if (process.env.BUILD_CV_BROWSER && existsSync(process.env.BUILD_CV_BROWSER)) return process.env.BUILD_CV_BROWSER;
  const c = [];
  if (process.platform === "win32") {
    for (const base of [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean)) {
      c.push(join(base, "Microsoft/Edge/Application/msedge.exe"), join(base, "Google/Chrome/Application/chrome.exe"),
        join(base, "Chromium/Application/chrome.exe"), join(base, "BraveSoftware/Brave-Browser/Application/brave.exe"));
    }
  } else if (process.platform === "darwin") {
    c.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser");
  } else {
    for (const n of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "brave-browser"]) {
      try { c.push(execFileSync("which", [n], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()); } catch {}
    }
  }
  return c.find((p) => p && existsSync(p)) || null;
}
function toPdf(htmlFile, pdfFile) {
  const browser = findBrowser();
  if (!browser) throw new Error("No Chromium browser found (Edge, Chrome, Chromium or Brave). Install one, set BUILD_CV_BROWSER, or open the .html file and use Print → Save as PDF.");
  const profile = mkdtempSync(join(tmpdir(), "build-cv-"));
  try {
    execFileSync(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`,
      "--no-pdf-header-footer", `--print-to-pdf=${pdfFile}`, pathToFileURL(htmlFile).href], { stdio: "ignore", timeout: 60000 });
  } finally { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
  if (!existsSync(pdfFile) || statSync(pdfFile).size < 500) throw new Error("The browser did not produce a PDF.");
}

// ---------- DOCX (minimal OOXML + zip writer) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const comp = deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}
function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: "png", type: "image/png" };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5), ext: "jpeg", type: "image/jpeg" };
      i += 2 + len;
    }
  }
  return null;
}
function toDocx(cv, lang) {
  const b = cv.basics || {};
  const font = String(design.font).split(",")[0].replace(/['"]/g, "").trim();
  const color = String(design.accent).replace("#", "");
  const half = Math.round(design.base * 2);
  const x = (s) => esc(s);
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.i ? "<w:i/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ""}${o.caps ? "<w:caps/>" : ""}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const para = (runs, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ""}${o.keep ? "<w:keepNext/>" : ""}${o.tabs ? `<w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs>` : ""}${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="220"/>` : ""}<w:spacing w:before="${o.before || 0}" w:after="${o.after ?? 40}"/>${o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${color}"/></w:pBdr>` : ""}</w:pPr>${runs}</w:p>`;
  const media = [];
  let photoXml = "";
  if (design.photo && b.image && existsSync(join(dir, b.image))) {
    const img = readFileSync(join(dir, b.image));
    const sz = imageSize(img);
    if (sz) {
      const cx = 914400, cy = Math.round(cx * sz.h / sz.w);
      media.push({ name: `media/photo.${sz.ext}`, data: img, type: sz.type, ext: sz.ext });
      photoXml = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Photo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="photo"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    }
  }
  let body = photoXml;
  body += para(run(b.name || "", { b: true, sz: half * 2, color }), { after: 20 });
  if (b.label) body += para(run(b.label, { sz: Math.round(half * 1.15) }), { after: 20 });
  const c = contactParts(b);
  if (c.length) body += para(run(c.join(" · "), { color: "444444" }), { after: 120 });
  for (const s of sections(cv, lang)) {
    body += para(run(s.title, { b: true, caps: true, color }), { before: 200, after: 80, keep: true, border: design.lines });
    for (const it of s.items) {
      if (it.text !== undefined) { body += para((it.inline ? run(it.inline, { b: true }) : "") + run(it.text)); continue; }
      body += para(run(it.title, { b: true }) + (it.date ? `<w:r><w:tab/></w:r>${run(it.date, { color: "444444" })}` : ""), { tabs: true, keep: true, before: 60, after: 0 });
      if (it.sub) body += para(run(it.sub, { i: true, color: "444444" }), { after: 0 });
      if (it.link) body += para(run(it.link.replace(/^https?:\/\//, ""), { color }), { after: 0 });
      for (const l of it.lines || []) body += para(run(`• ${l}`), { ind: 300, after: 10 });
      if (it.tech) body += para(run(it.tech, { color: "444444" }), { after: 60 });
    }
  }
  const size = design.size === "Letter" ? `<w:pgSz w:w="12240" w:h="15840"/>` : `<w:pgSz w:w="11906" w:h="16838"/>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr>${size}<w:pgMar w:top="794" w:right="907" w:bottom="794" w:left="907" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${x(font)}" w:hAnsi="${x(font)}" w:cs="${x(font)}" w:eastAsia="${x(font)}"/><w:sz w:val="${half}"/><w:szCs w:val="${half}"/><w:lang w:val="${x(lang)}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${media.map((m) => `<Default Extension="${m.ext}" ContentType="${m.type}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m) => `<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name}"/>`).join("")}</Relationships>`],
    ["word/document.xml", doc],
    ["word/styles.xml", styles],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(b.name || "CV")}</dc:title><dc:creator>${x(b.name || "")}</dc:creator><cp:lastModifiedBy>${x(b.name || "")}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
    ...media.map((m) => [`word/${m.name}`, m.data]),
  ];
  return zip(files);
}

// ---------- main ----------
const langFilter = opt("lang");
const cvFiles = readdirSync(dir).filter((f) => /^cv\.[a-z]{2,3}(-[A-Za-z]{2,4})?\.json$/.test(f) && (!langFilter || f === `cv.${langFilter}.json`));
if (!cvFiles.length) { console.error(`No cv.<lang>.json files in ${dir}`); process.exit(1); }
const results = [];
for (const f of cvFiles) {
  const lang = f.split(".")[1];
  const cv = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const base = join(dir, `cv.${lang}`);
  const done = [], errors = [];
  const html = toHtml(cv, lang);
  if (formats.includes("md")) { writeFileSync(`${base}.md`, toMarkdown(cv, lang)); done.push(`${base}.md`); }
  if (formats.includes("html") || formats.includes("pdf")) { writeFileSync(`${base}.html`, html); if (formats.includes("html")) done.push(`${base}.html`); }
  if (formats.includes("pdf")) { try { toPdf(`${base}.html`, `${base}.pdf`); done.push(`${base}.pdf`); } catch (e) { errors.push(`pdf: ${e.message}`); } }
  if (formats.includes("pdf") && !formats.includes("html")) { try { rmSync(`${base}.html`); } catch {} }
  if (formats.includes("docx")) { try { writeFileSync(`${base}.docx`, toDocx(cv, lang)); done.push(`${base}.docx`); } catch (e) { errors.push(`docx: ${e.message}`); } }
  results.push({ lang, written: done, errors });
}
console.log(JSON.stringify({ ok: results.every((r) => !r.errors.length), design: { preset: userDesign.preset || "classic", font: design.font, accent: design.accent }, results }, null, 2));
