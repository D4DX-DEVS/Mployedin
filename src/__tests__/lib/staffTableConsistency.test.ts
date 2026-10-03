/**
 * @jest-environment node
 */
/**
 * The staff dashboards (admin, super agent, agent) share one table kit:
 * `InlineFilterBar` for filters and `formatListDate` / `formatDate` for dates
 * (TABLE-CONSISTENCY-AUDIT.md, S1 and S6). Two regressions slipped back in
 * before and no CSS can catch them:
 *
 * - `TableToolbar`, the old Show/Hide Filters panel, hid every filter behind
 *   a toggle on the pages that still imported it.
 * - A hard-coded locale (`toLocaleDateString("en-US")`) showed Arabic users
 *   English month names; a bare `toLocaleDateString()` renders differently on
 *   the server and in the browser and breaks hydration.
 *
 * Employer and job-seeker pages are out of scope: employer is the frozen
 * visual reference and still uses `TableToolbar` on purpose.
 */
import fs from "fs";
import path from "path";

const DASHBOARD = path.join(process.cwd(), "src", "app", "[locale]", "(dashboard)");
const STAFF_ROOTS = ["admin", "super-agent", "agent"].map((role) => path.join(DASHBOARD, role));

/**
 * Deliberate exceptions, by path relative to the dashboard folder.
 * analytics: the PDF export draws with jsPDF's Latin-only helvetica font,
 * so its "generated on" stamp must stay in a Latin locale.
 */
const HARD_CODED_LOCALE_ALLOWED = new Set([path.join("admin", "analytics", "page.tsx")]);

function sourceFiles(): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.tsx?$/.test(entry.name)) files.push(target);
    }
  };
  STAFF_ROOTS.filter((root) => fs.existsSync(root)).forEach(visit);
  return files;
}

const relative = (file: string) => path.relative(DASHBOARD, file);

describe("staff table consistency", () => {
  const files = sourceFiles();

  it("finds the staff dashboard sources", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no staff page imports the old TableToolbar", () => {
    const offenders = files
      .filter((file) => /from\s+["']@\/components\/shared\/TableToolbar["']/.test(fs.readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it("no staff page hard-codes a date locale", () => {
    const offenders = files
      .filter((file) => !HARD_CODED_LOCALE_ALLOWED.has(relative(file)))
      .flatMap((file) =>
        fs
          .readFileSync(file, "utf8")
          .split("\n")
          .map((line, i) => ({ line, at: `${relative(file)}:${i + 1}` }))
          .filter(({ line }) => /\.toLocale(Date|Time)?String\(\s*["'`]/.test(line))
          .map(({ at }) => at)
      );
    expect(offenders).toEqual([]);
  });

  it("no staff page formats a date with the runtime's own locale", () => {
    const offenders = files.flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${relative(file)}:${i + 1}` }))
        .filter(({ line }) => /\.toLocale(Date|Time)String\(\s*\)/.test(line))
        .map(({ at }) => at)
    );
    expect(offenders).toEqual([]);
  });
});
