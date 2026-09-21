/**
 * @jest-environment node
 *
 * The permission editor used to paint a checkbox for every one of the 29
 * resources times 7 actions — 203 boxes — while only a subset of those pairs
 * is ever consulted by a route guard, a copilot tool, a nav gate or a
 * `can()` call in a page. Unticking one of the other ~110 changed nothing,
 * which made the whole screen untrustworthy: an admin could not tell which
 * box did something and which was decoration.
 *
 * ENFORCED_PERMISSIONS is the honest list, and it is hand-maintained, so this
 * test re-derives it from the source tree and fails when the two drift — a new
 * guard must be surfaced in the editor, a deleted guard must disappear from it.
 */
import fs from "fs";
import path from "path";
import { ENFORCED_PERMISSIONS, isEnforced, ENFORCED_RESOURCES } from "@/lib/permissions/enforcement";
import { ALL_ACTIONS, ALL_RESOURCES } from "@/lib/permissions/matrix";
import type { Action, Resource } from "@/types/user";

const SRC = path.join(process.cwd(), "src");
const RESOURCE_SET = new Set<string>(ALL_RESOURCES);
const ACTION_SET = new Set<string>(ALL_ACTIONS);
const ACTION_ALT = ALL_ACTIONS.join("|");

/** Files that define the map or its test are excluded — they'd match themselves. */
const EXCLUDED = [
  "lib/permissions/enforcement.ts",
  "lib/permissions/matrix.ts",
  "types/user.ts",
  "components/shared/PermissionEditor.tsx",
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "__mocks__" || entry.name === "node_modules") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      const rel = path.relative(SRC, full).split(path.sep).join("/");
      if (!EXCLUDED.includes(rel)) out.push(full);
    }
  }
  return out;
}

/**
 * Comments are blanked rather than removed so that indices still line up, and
 * because a JSDoc example (`withAuth(inner, { resource: "ai_cv", ... })` in
 * withSubscription.ts) otherwise reads as a live guard.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => " ".repeat(m.length));
}

/** For each character, the index of the innermost enclosing `{`. */
function enclosingBrace(src: string): number[] {
  const stack: number[] = [];
  const owner = new Array<number>(src.length).fill(-1);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") stack.push(i);
    owner[i] = stack.length ? stack[stack.length - 1] : -1;
    if (c === "}" && stack.length) stack.pop();
  }
  return owner;
}

/**
 * A pair counts as enforced when `resource` and `action` sit in the SAME object
 * literal — that is the shape of a withAuth guard, a CopilotTool definition and
 * a quickActions `permission:` block alike — or when they are passed positionally
 * to `can()` / `canAccess()`.
 */
function scan(): Record<string, Set<string>> {
  const found: Record<string, Set<string>> = {};
  const add = (resource: string, action: string) => {
    if (!RESOURCE_SET.has(resource) || !ACTION_SET.has(action)) return;
    (found[resource] ??= new Set()).add(action);
  };

  for (const file of sourceFiles(SRC)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const owner = enclosingBrace(src);
    const objects = new Map<number, { resource?: string; actions: Set<string> }>();
    const bucket = (i: number) => {
      const key = owner[i];
      let b = objects.get(key);
      if (!b) objects.set(key, (b = { actions: new Set() }));
      return b;
    };

    for (const m of src.matchAll(/\bresource:\s*"([a-z_]+)"/g)) {
      bucket(m.index!).resource = m[1];
    }
    for (const m of src.matchAll(new RegExp(`\\baction:\\s*"(${ACTION_ALT})"`, "g"))) {
      bucket(m.index!).actions.add(m[1]);
    }
    for (const { resource, actions } of objects.values()) {
      if (!resource) continue;
      for (const action of actions) add(resource, action);
    }

    for (const m of src.matchAll(new RegExp(`\\bcan\\(\\s*"([a-z_]+)"\\s*,\\s*"(${ACTION_ALT})"`, "g"))) {
      add(m[1], m[2]);
    }
    for (const m of src.matchAll(new RegExp(`\\bcanAccess\\([^,()]+,\\s*"([a-z_]+)"\\s*,\\s*"(${ACTION_ALT})"`, "g"))) {
      add(m[1], m[2]);
    }
  }
  return found;
}

describe("ENFORCED_PERMISSIONS", () => {
  const scanned = scan();

  it("matches the guards actually present in the source tree", () => {
    const fromSource: Record<string, Action[]> = {};
    for (const resource of ALL_RESOURCES) {
      const actions = scanned[resource];
      if (!actions?.size) continue;
      fromSource[resource] = ALL_ACTIONS.filter((a) => actions.has(a));
    }

    const declared: Record<string, Action[]> = {};
    for (const resource of ALL_RESOURCES) {
      const actions = ENFORCED_PERMISSIONS[resource];
      if (actions?.length) declared[resource] = ALL_ACTIONS.filter((a) => actions.includes(a));
    }

    expect(declared).toEqual(fromSource);
  });

  it("only ever lists real resources and actions", () => {
    for (const [resource, actions] of Object.entries(ENFORCED_PERMISSIONS)) {
      expect(ALL_RESOURCES).toContain(resource as Resource);
      for (const action of actions ?? []) expect(ALL_ACTIONS).toContain(action);
    }
  });

  it("exposes isEnforced() consistently with the map", () => {
    expect(isEnforced("users", "impersonate")).toBe(true);
    // ai_assistant has no guard anywhere — the editor must not offer it.
    expect(isEnforced("ai_assistant", "read")).toBe(false);
    for (const resource of ALL_RESOURCES) {
      for (const action of ALL_ACTIONS) {
        expect(isEnforced(resource, action)).toBe(
          Boolean(ENFORCED_PERMISSIONS[resource]?.includes(action)),
        );
      }
    }
  });

  it("ENFORCED_RESOURCES keeps ALL_RESOURCES order and drops unenforced ones", () => {
    expect(ENFORCED_RESOURCES).toEqual(
      ALL_RESOURCES.filter((r) => (ENFORCED_PERMISSIONS[r]?.length ?? 0) > 0),
    );
  });
});
