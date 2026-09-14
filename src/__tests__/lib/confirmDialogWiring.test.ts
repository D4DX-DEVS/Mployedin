/**
 * @jest-environment node
 */
/**
 * `useConfirm` resolves its promise from the buttons inside `ConfirmDialogNode`.
 * A component that calls `confirm()` but never renders that node therefore
 * awaits a promise nothing can settle: the click does nothing, forever, with no
 * error and no dialog. `admin/exhibitions` shipped exactly that — every delete
 * and bulk-reject on the page was dead.
 *
 * The same hook is used across all six roles, so this is checked globally
 * rather than per role.
 */
import fs from "fs";
import path from "path";

const ROOTS = [
  path.join(process.cwd(), "src", "app"),
  path.join(process.cwd(), "src", "components"),
];

function sourceFiles(): string[] {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        visit(target);
      } else if (/\.tsx$/.test(entry.name)) {
        files.push(target);
      }
    }
  };
  ROOTS.filter((root) => fs.existsSync(root)).forEach(visit);
  return files;
}

/** The hook is routinely renamed: `const { confirm: confirmDialog } = useConfirm()`. */
function confirmFnName(source: string): string {
  const aliased = source.match(
    /const\s*\{[^}]*confirm\s*:\s*(\w+)[^}]*\}\s*=\s*useConfirm\s*\(/
  );
  return aliased ? aliased[1] : "confirm";
}

describe("useConfirm wiring", () => {
  const consumers = sourceFiles().filter((file) =>
    /=\s*useConfirm\s*\(/.test(fs.readFileSync(file, "utf8"))
  );

  it("finds the components that use the hook", () => {
    expect(consumers.length).toBeGreaterThan(0);
  });

  it("renders ConfirmDialogNode wherever the hook is used, so the promise can resolve", () => {
    const unrendered = consumers
      .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        // Destructuring the node but never placing it in the tree is the same bug.
        return !/\{\s*ConfirmDialogNode\s*\}/.test(source);
      })
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"));

    expect(unrendered).toEqual([]);
  });

  it("awaits every confirm() call, so a declined dialog actually cancels", () => {
    // Without `await` the returned promise is truthy, so the guarded action runs
    // regardless of which button was pressed. The destructuring line is not a
    // call site: there the name is followed by `,` or `}`, never `(`.
    const unawaited = consumers.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const fn = confirmFnName(source);
      const calls = new RegExp(`${fn}\\s*\\(`, "g");
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");

      return [...source.matchAll(calls)]
        .filter((match) => {
          const charBefore = source[match.index! - 1] ?? "";
          // Skip `useConfirm(` and any longer identifier ending in this name.
          if (/[.\w]/.test(charBefore)) return false;
          const preceding = source.slice(Math.max(0, match.index! - 12), match.index!);
          return !/await\s+$/.test(preceding);
        })
        .map((match) => `${rel}:${source.slice(0, match.index!).split("\n").length}`);
    });

    expect(unawaited).toEqual([]);
  });
});
