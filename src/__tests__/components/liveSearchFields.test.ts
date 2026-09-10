import fs from "fs";
import path from "path";

/**
 * `TableToolbar` renders its search box as a *controlled* input
 * (`value={search ?? ""}`). A page that hands it a literal empty string plus a
 * no-op change handler therefore ships a field that focuses, is neither
 * disabled nor readonly, and silently discards every keystroke — nothing in
 * tsc, eslint or the i18n checks sees it, only a real keypress does.
 *
 * It shipped twice (agent and employer invoices) because the stub looks
 * deliberate: `onSearchChange` is optional, and omitting it renders no search
 * field at all, so the no-op is what makes a dead box appear.
 *
 * Wire the field to state instead — `useUrlFilter(key, "", { debounceMs: 400 })`
 * where the page already keeps filters in the query string, `useState` plus
 * `useDebounce` where it does not.
 */
const ROOTS = ["src/app", "src/components"].map((d) => path.join(process.cwd(), d));

// `search=""` and `onSearchChange={() => {}}` (any whitespace, empty body).
const EMPTY_SEARCH = /\bsearch=""/;
const NOOP_HANDLER = /\bonSearchChange=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * Blanks comments while preserving line numbering, so a comment *describing*
 * the stub — like the one above the fix in employer/invoices — is not reported
 * as the stub itself.
 */
function stripComments(src: string): string[] {
  const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\r\n]/g, " ")
  );
  return withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""));
}

describe("search fields are wired to state", () => {
  it("no page renders a search box that cannot be typed into", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = fs.readFileSync(file, "utf8");
        if (!src.includes("onSearchChange")) continue;

        const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
        stripComments(src).forEach((line, i) => {
          if (NOOP_HANDLER.test(line)) {
            offenders.push(`${rel}:${i + 1} — onSearchChange discards the value`);
          } else if (EMPTY_SEARCH.test(line) && line.includes("onSearchChange")) {
            offenders.push(`${rel}:${i + 1} — search is pinned to ""`);
          }
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
