/**
 * @jest-environment node
 */
/**
 * The agent and super-agent list pages were moved onto the admin table kit
 * (TABLE-CONSISTENCY-AUDIT.md, 2026-10-02). The admin rollout itself drifted
 * back within days (10 of 28 header rows), and no CSS can catch these, so the
 * rules that keep the two roles on the standard are checked here. Employer is
 * the frozen reference and is deliberately not scanned.
 */
import fs from "fs";
import path from "path";

const DASHBOARD = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");
const ROLES = ["agent", "super-agent"];

function sourceFiles(): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.tsx$/.test(entry.name)) files.push(target);
    }
  };
  ROLES.map((role) => path.join(DASHBOARD, role)).filter((dir) => fs.existsSync(dir)).forEach(visit);
  return files;
}

const rel = (file: string) => path.relative(process.cwd(), file).split(path.sep).join("/");

function offenders(test: (source: string) => boolean): string[] {
  return sourceFiles().filter((file) => test(fs.readFileSync(file, "utf8"))).map(rel);
}

describe("agent and super-agent table standard", () => {
  it("scans the role pages", () => {
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it("uses InlineFilterBar, not the Show/Hide TableToolbar", () => {
    expect(offenders((s) => /from\s+["']@\/components\/shared\/TableToolbar["']/.test(s))).toEqual([]);
  });

  it("formats dates through intlFormat, never with a hard-coded locale", () => {
    // `toLocaleDateString(locale, …)` with the page's locale is tolerated; a
    // literal ("en-GB", "en-US", []) or no argument at all is what drifted.
    const hardCoded =
      /\.toLocale(?:Date|Time)?String\(\s*(?:\)|["'`[])|new\s+Intl\.DateTimeFormat\(\s*["'`]/;
    expect(offenders((s) => hardCoded.test(s))).toEqual([]);
  });

  it("never hides a row action until hover (unreachable on touch and keyboard)", () => {
    expect(offenders((s) => /\bhidden\s+(?:[^\s"'`]+\s+)*group-hover:(?:inline-)?flex/.test(s))).toEqual([]);
  });

  it("keeps the bin out of table rows: Delete belongs in RowActions' menu", () => {
    // RowActions takes the icon as a value (`icon: Trash2`), so a rendered
    // <Trash2> in a file with table cells is a hand-built inline delete.
    expect(offenders((s) => /<TableCell\b/.test(s) && /<Trash2\b/.test(s))).toEqual([]);
  });
});
