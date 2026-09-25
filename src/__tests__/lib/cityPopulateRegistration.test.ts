/**
 * @jest-environment node
 */
/**
 * GET /api/invoices/[id] populated `assignedCityIds` without importing the City
 * model. Whether that worked depended on some other route having registered City
 * earlier in the same process; on a fresh one it threw MissingSchemaError and
 * the invoice dialog got a 500 (audit re-verification 2026-09-24). Any route
 * that populates city refs must register City itself.
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

it("every API module that populates city refs imports the City model", () => {
  const offenders = walk(path.join(process.cwd(), "src/app/api"))
    .filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /populate\(\s*["'](assignedCityIds|cityIds)["']|path:\s*["'](assignedCityIds|cityIds)["']/.test(src)
        && !/from\s+["']@\/models\/City["']|import\s+["']@\/models\/City["']/.test(src);
    })
    .map((f) => path.relative(process.cwd(), f));
  expect(offenders).toEqual([]);
});
