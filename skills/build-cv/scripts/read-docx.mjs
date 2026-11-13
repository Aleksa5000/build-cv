#!/usr/bin/env node
// Print the plain text of a .docx file (paragraphs on separate lines). No dependencies.
// Usage: node read-docx.mjs <file.docx>
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const file = process.argv[2];
if (!file) { console.error("usage: read-docx.mjs <file.docx>"); process.exit(1); }
const buf = readFileSync(file);

// Find the end-of-central-directory record, then walk the central directory.
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
if (eocd < 0) { console.error("Not a .docx (zip) file."); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
let p = buf.readUInt32LE(eocd + 16);
let xml = null;
for (let n = 0; n < count; n++) {
  const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
  const local = buf.readUInt32LE(p + 42);
  const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
  if (name === "word/document.xml") {
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    xml = (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    break;
  }
  p += 46 + nameLen + extraLen + commentLen;
}
if (!xml) { console.error("word/document.xml not found."); process.exit(1); }
const text = xml
  .replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<\/w:p>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
  .replace(/\n{3,}/g, "\n\n").trim();
process.stdout.write(text + "\n");
