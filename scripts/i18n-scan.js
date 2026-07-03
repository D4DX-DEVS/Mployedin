// i18n wiring scanner: finds .tsx files that contain hardcoded English UI text
// but never call useTranslations/getTranslations.
// Usage: node scripts/i18n-scan.js            (from mployedin/ root)
// Exit code 1 if any file flagged -> usable as a CI/verification gate.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "src");
const TR = /useTranslations|getTranslations/;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const pages = walk(path.join(ROOT, "app"), []).filter((p) => /page\.tsx$/.test(p));
const feats = walk(path.join(ROOT, "components"), []);

function textHits(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const hits = [];
  for (const m of src.matchAll(/>\s*([A-Z][A-Za-z][A-Za-z0-9 ,.'&()\/-]{3,60})\s*</g)) {
    const s = m[1].trim();
    if (/[a-z] [a-z]/i.test(s) || /^[A-Z][a-z]{3,}/.test(s)) hits.push(s);
  }
  for (const m of src.matchAll(/(?:placeholder|title|label|aria-label|description)\s*[=:]\s*["']([A-Z][A-Za-z0-9 ,.'&()\/-]{3,60})["']/g)) {
    hits.push(m[1]);
  }
  return hits;
}

let total = 0;
function report(files, tag) {
  const flagged = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    if (TR.test(src)) continue;
    const hits = textHits(src);
    if (hits.length >= 3) {
      flagged.push({
        f: path.relative(path.join(__dirname, ".."), f),
        n: hits.length,
        sample: [...new Set(hits)].slice(0, 4),
      });
    }
  }
  flagged.sort((a, b) => b.n - a.n);
  console.log(`\n=== ${tag}: ${flagged.length} files with hardcoded English (no translation hook) ===`);
  for (const x of flagged)
    console.log(`${String(x.n).padStart(3)}  ${x.f}\n      e.g. ${x.sample.join(" | ")}`);
  total += flagged.length;
}

report(pages, "PAGES");
report(feats, "COMPONENTS");
console.log(`\nTOTAL FLAGGED: ${total}`);
process.exit(total > 0 ? 1 : 0);
