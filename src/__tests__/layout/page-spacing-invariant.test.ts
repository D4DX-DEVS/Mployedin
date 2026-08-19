import fs from "fs";
import path from "path";

/**
 * `.page-container` is a flex column whose `gap` is the section rhythm
 * (see the PAGE RHYTHM block in globals.css). Adding `space-y-*` to it stacks
 * margin on top of that gap, which is how the same layout ended up measuring
 * 16px of section spacing on one page and 48px on another.
 * Spacing is tuned via --page-gap / --page-gutter, never per page.
 */
const APP = path.join(process.cwd(), "src/app");
const CLASSNAME = /className="([^"]*)"/g;
// unprefixed + breakpoint-prefixed only; `print:space-y-*` is a deliberate opt-out
const SPACE_Y = /(?<![\w:-])(?:sm:|md:|lg:|xl:|2xl:)?space-y-(?:\d+(?:\.\d+)?|px)(?![\w-])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("page spacing invariant", () => {
  it("no .page-container element also carries space-y-*", () => {
    const offenders: string[] = [];
    for (const file of walk(APP)) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("page-container")) continue;
      for (const m of src.matchAll(CLASSNAME)) {
        const cls = m[1];
        if (cls.includes("page-container") && SPACE_Y.test(cls)) {
          offenders.push(`${path.relative(process.cwd(), file)} → "${cls}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
