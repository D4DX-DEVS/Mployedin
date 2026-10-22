/**
 * @jest-environment node
 *
 * scripts/update-legal-content.mjs writes the privacy and cookie policy pages
 * to the database the owner points it at. Its default must be a dry run that
 * never loads the database driver, and only --apply may write. Nothing here
 * can reach a database: every child run gets an empty MONGODB_URI and no
 * --env-file, and --apply is only ever run to see it refuse.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(ROOT, "scripts/update-legal-content.mjs");

function run(...args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, MONGODB_URI: "", NODE_OPTIONS: "" },
  });
}

describe("update-legal-content.mjs: source", () => {
  const source = readFileSync(SCRIPT, "utf8");

  it("does not import the database driver at the top of the file", () => {
    expect(source).not.toMatch(/^\s*import\s[^;\n]*["']mongoose["']/m);
    expect(source).not.toMatch(/^\s*(const|let|var)\s[^\n]*require\(["']mongoose["']\)/m);
  });

  it("loads mongoose only through a dynamic import, in the --apply path", () => {
    const hits = [...source.matchAll(/import\(["']mongoose["']\)/g)];
    expect(hits).toHaveLength(1);
    const applyFn = source.indexOf("async function applyUpdate");
    expect(applyFn).toBeGreaterThan(-1);
    expect(source.indexOf('import("mongoose")')).toBeGreaterThan(applyFn);
  });

  it("checks MONGODB_URI before it imports mongoose", () => {
    expect(source.indexOf("Missing MONGODB_URI")).toBeLessThan(source.indexOf('import("mongoose")'));
  });

  it("no longer writes the old cookie text: the old body is only the left side of the diff", () => {
    expect(source).toMatch(/PREVIOUS_COOKIE_BODY/);
    expect(source).not.toMatch(/body:\s*COOKIE_BODY\b/);
  });
});

describe("update-legal-content.mjs: dry run (the default)", () => {
  it("exits 0 with no arguments, prints a diff for en and ar, and never mentions connecting", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/dry run/i);
    expect(result.stdout).toMatch(/cookie-policy \(en\)/);
    expect(result.stdout).toMatch(/cookie-policy \(ar\)/);
    expect(result.stdout).toMatch(/^--- /m);
    expect(result.stdout).toMatch(/^\+\+\+ /m);
    expect(result.stdout).toMatch(/^@@ /m);
    expect(result.stdout).toContain("-<p>By using our website");
    expect(result.stdout).toContain('+<h2 id="strictly-necessary">');
    expect(result.stdout).not.toMatch(/Connected to MongoDB/);
    expect(result.stdout).toMatch(/--apply/);
  });

  it("--dry-run is accepted and behaves the same", () => {
    const result = run("--dry-run");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/cookie-policy \(en\)/);
  });

  it("says that the live page may differ from the baseline and that --apply overwrites CMS edits", () => {
    const result = run();
    expect(result.stdout).toMatch(/edited .*CMS|CMS/i);
  });
});

describe("update-legal-content.mjs: which pages it touches", () => {
  /** The lines under "--apply would write these pages". */
  const wouldWrite = (stdout: string) => (stdout.split("--apply would write")[1] ?? "").split(/\nNot touched|\n\n/)[0];

  it("touches only the cookie policy by default: the Privacy Policy is never rewritten by surprise", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(wouldWrite(result.stdout)).toMatch(/- cookie-policy/);
    expect(wouldWrite(result.stdout)).not.toMatch(/privacy-policy/);
    expect(result.stdout).not.toMatch(/=== privacy-policy/);
    // It says how to include another page, so nobody edits the script to do it.
    expect(result.stdout).toMatch(/--slug=privacy-policy/);
  });

  it("touches the Privacy Policy only when it is named with --slug, and then only it", () => {
    const result = run("--slug=privacy-policy");
    expect(result.status).toBe(0);
    expect(wouldWrite(result.stdout)).toMatch(/- privacy-policy/);
    expect(wouldWrite(result.stdout)).not.toMatch(/cookie-policy/);
    expect(result.stdout).toMatch(/=== privacy-policy \(en\) ===/);
    expect(result.stdout).not.toMatch(/=== cookie-policy/);
  });

  it("takes both slugs, as two flags or one comma list", () => {
    for (const args of [["--slug=cookie-policy", "--slug=privacy-policy"], ["--slug=cookie-policy,privacy-policy"]]) {
      const result = run(...args);
      expect(result.status).toBe(0);
      expect(wouldWrite(result.stdout)).toMatch(/- privacy-policy/);
      expect(wouldWrite(result.stdout)).toMatch(/- cookie-policy/);
    }
  });

  it.each([["an unknown slug", "--slug=terms"], ["an empty slug", "--slug="], ["a slug without =", "--slug"]])("rejects %s and does nothing", (_label, arg) => {
    const result = run(arg);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/slug/i);
    expect(result.stdout).not.toMatch(/=== /);
  });

  it("prints, per page and language, the size change and the first changed lines before the full diff", () => {
    const result = run();
    const summary = /cookie-policy \(en\): ([\d,]+) -> ([\d,]+) characters \(([+-][\d,]+)\)/.exec(result.stdout);
    expect(summary).not.toBeNull();
    const [, before, after, delta] = summary as RegExpExecArray;
    const n = (v: string) => Number(v.replace(/[,+]/g, ""));
    expect(n(after) - n(before)).toBe(n(delta));
    expect(result.stdout).toMatch(/cookie-policy \(ar\): [\d,]+ -> [\d,]+ characters/);
    // The first changed lines come right after the size line, before the full diff.
    const block = result.stdout.slice(result.stdout.indexOf("cookie-policy (en): "));
    expect(block.indexOf("First changed lines:")).toBeGreaterThan(-1);
    expect(block.indexOf("First changed lines:")).toBeLessThan(block.indexOf("--- "));
  });

  it("says when the Privacy Policy text is the same as the last text the script wrote, and that CMS edits would still be lost", () => {
    const result = run("--slug=privacy-policy");
    expect(result.stdout).toMatch(/privacy-policy \(en\): .*no change/i);
    expect(result.stdout).toMatch(/CMS/);
  });
});

describe("update-legal-content.mjs: flags", () => {
  it("--apply with --slug still refuses without MONGODB_URI", () => {
    const result = run("--apply", "--slug=privacy-policy");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Missing MONGODB_URI/);
  });

  it("rejects an unknown flag with a non-zero exit and a usage line, doing nothing", () => {
    const result = run("--bogus");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Unknown option/i);
    expect(result.stderr).toMatch(/--apply/);
    expect(result.stdout).not.toMatch(/cookie-policy \(en\)/);
  });

  it("rejects a stray positional argument", () => {
    expect(run("cookie-policy").status).not.toBe(0);
  });

  it("rejects --apply together with --dry-run", () => {
    const result = run("--apply", "--dry-run");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not both|together|either/i);
  });

  it("--apply without MONGODB_URI refuses before touching anything", () => {
    const result = run("--apply");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Missing MONGODB_URI/);
    expect(result.stdout).not.toMatch(/Connected to MongoDB/);
  });
});

/** Every module the script imports statically, and every import() it makes, following relative specifiers. */
function importGraph(entry: string) {
  const seen = new Set<string>();
  const staticBare = new Set<string>();
  const dynamic = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    const specifiers: string[] = [];
    for (const re of [
      /^\s*(?:import|export)\s[^'"\n;]*?\bfrom\s*["']([^"']+)["']/gm,
      /^\s*import\s*["']([^"']+)["']/gm,
    ]) {
      for (const match of source.matchAll(re)) specifiers.push(match[1]);
    }
    for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) dynamic.add(match[1]);
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), specifier));
      else if (!specifier.startsWith("node:")) staticBare.add(specifier);
    }
  };
  visit(entry);
  return { files: [...seen].map((file) => path.relative(ROOT, file).replaceAll("\\", "/")), staticBare: [...staticBare], dynamic: [...dynamic] };
}

describe("update-legal-content.mjs: works on a production-only install (no devDependencies)", () => {
  it("imports no package statically, so nothing from devDependencies (typescript) is needed to run it", () => {
    const graph = importGraph(SCRIPT);
    expect(graph.files).toEqual(
      expect.arrayContaining([
        "scripts/update-legal-content.mjs",
        "scripts/lib/cookiePolicyFromRegistry.mjs",
        "scripts/lib/unifiedDiff.mjs",
      ]),
    );
    expect(graph.files).not.toContain("scripts/lib/consentRegistryExport.mjs");
    expect(graph.staticBare).toEqual([]);
    expect(graph.dynamic).toEqual(["mongoose"]); // the --apply path only
  });

  it("the dry run still runs when 'typescript' cannot be resolved", () => {
    const blocker =
      'export async function resolve(specifier, context, next) { ' +
      'if (specifier === "typescript" || specifier.startsWith("typescript/")) throw new Error("typescript was imported"); ' +
      "return next(specifier, context); }";
    const register = `import { register } from "node:module"; register(${JSON.stringify(
      "data:text/javascript," + encodeURIComponent(blocker),
    )});`;
    const result = spawnSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(register), SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, MONGODB_URI: "", NODE_OPTIONS: "" },
    });
    expect(result.stderr).not.toMatch(/typescript was imported/);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/cookie-policy \(en\)/);
  });
});

describe("update-legal-content.mjs: the dry run builds the policy once", () => {
  it("reads registry.json and each messages file once, not once per use", () => {
    const counter =
      'import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module"; ' +
      "const reads = {}; const real = fs.readFileSync; " +
      "fs.readFileSync = function (file, ...rest) { " +
      'const name = String(file).split(/[\\\\/]/).slice(-1)[0]; ' +
      'if (/^(registry\\.json|en\\.json|ar\\.json)$/.test(name)) reads[name] = (reads[name] || 0) + 1; ' +
      "return real.call(this, file, ...rest); }; " +
      "syncBuiltinESMExports(); " +
      'process.on("exit", () => console.error("READS " + JSON.stringify(reads)));';
    const result = spawnSync(process.execPath, ["--import", "data:text/javascript," + encodeURIComponent(counter), SCRIPT], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, MONGODB_URI: "", NODE_OPTIONS: "" },
    });
    expect(result.status).toBe(0);
    const line = /READS (\{.*\})/.exec(result.stderr);
    expect(line).not.toBeNull();
    expect(JSON.parse((line as RegExpExecArray)[1])).toEqual({ "registry.json": 1, "en.json": 1, "ar.json": 1 });
  });
});
