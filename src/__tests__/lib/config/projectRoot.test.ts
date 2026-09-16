import fs from "fs";
import path from "path";

import { canonicalProjectRoot } from "@/lib/config/projectRoot";

/**
 * Guards the one spelling of the project root that Turbopack is allowed to see.
 *
 * On Windows the cwd a dev server inherits depends on who launched it: a
 * PowerShell prompt hands Next `D:\Mployedin`, VS Code (its terminal, its
 * Playwright extension's `webServer`) hands it `d:\Mployedin`. Neither Node's
 * `process.cwd()` nor Next's own `realpathSync` normalises the drive letter, so
 * `outputFileTracingRoot: process.cwd()` gave Turbopack a different `[project]`
 * filesystem root per launcher. With `turbopackFileSystemCacheForDev` (on by
 * default since Next 16) a cache written under one spelling and restored under
 * the other became two project roots at once: globals.css from the cached root
 * could not be relativised to the live one, PostCSS ran with `from: ""`, and
 * Tailwind resolved `source("../../src")` from cwd — the
 * "`source(../../src)` does not exist" error — while Turbopack rebuilt a
 * duplicated graph, spawned ~47 workers in six seconds and exhausted commit
 * memory hard enough to hang the whole machine (2026-09-16).
 *
 * `fs.realpathSync.native` is the only call that returns the canonical
 * spelling on Windows, so both assertions below pin it: the helper must map
 * every casing of the cwd to one string, and next.config.ts must use the
 * helper rather than the raw cwd.
 */
describe("canonicalProjectRoot", () => {
  const cwd = process.cwd();

  it("returns the same root for every casing of the drive letter", () => {
    if (process.platform !== "win32") {
      expect(canonicalProjectRoot(cwd)).toBe(fs.realpathSync.native(cwd));
      return;
    }

    const lower = cwd[0].toLowerCase() + cwd.slice(1);
    const upper = cwd[0].toUpperCase() + cwd.slice(1);

    expect(canonicalProjectRoot(lower)).toBe(canonicalProjectRoot(upper));
    expect(canonicalProjectRoot(lower)).toMatch(/^[A-Z]:\\/);
  });

  it("defaults to the current working directory", () => {
    expect(canonicalProjectRoot()).toBe(canonicalProjectRoot(cwd));
  });
});

describe("next.config.ts", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

  it("derives outputFileTracingRoot from canonicalProjectRoot, not the raw cwd", () => {
    expect(source).toMatch(/outputFileTracingRoot:\s*canonicalProjectRoot\(\)/);
    expect(source).not.toMatch(/outputFileTracingRoot:\s*process\.cwd\(\)/);
  });
});
