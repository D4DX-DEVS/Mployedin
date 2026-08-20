import fs from "fs";
import path from "path";

/**
 * `.page-container` is a flex column whose `gap` is the section rhythm
 * (see the PAGE RHYTHM block in globals.css). Setting `space-y-*` on it stacks
 * margin on top of that gap, and `gap-*` overrides the token outright — both
 * are how the same layout ended up measuring 16px of section spacing on one
 * page and 48px on another.
 * Spacing is tuned via --page-gap / --page-gutter, never per page.
 */
const ROOTS = ["src/app", "src/components"].map((d) => path.join(process.cwd(), d));
const CLASSNAME = /className="([^"]*)"/g;
// unprefixed + breakpoint-prefixed only; `print:space-y-*` is a deliberate opt-out
const RHYTHM = [
  /(?<![\w:-])(?:sm:|md:|lg:|xl:|2xl:)?space-y-(?:\d+(?:\.\d+)?|px)(?![\w-])/,
  /(?<![\w:-])(?:sm:|md:|lg:|xl:|2xl:|max-sm:)?gap-(?:x-|y-)?(?:\d+(?:\.\d+)?|px)(?![\w-])/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("page spacing invariant", () => {
  it("no .page-container element also sets its own section rhythm", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = fs.readFileSync(file, "utf8");
        if (!src.includes("page-container")) continue;
        for (const m of src.matchAll(CLASSNAME)) {
          const cls = m[1];
          if (cls.includes("page-container") && RHYTHM.some((re) => re.test(cls))) {
            offenders.push(`${path.relative(process.cwd(), file)} → "${cls}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
