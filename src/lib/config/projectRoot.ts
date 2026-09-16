import fs from "fs";

/**
 * The project root in its one canonical spelling — what Turbopack must be
 * handed as `outputFileTracingRoot` (its `[project]` filesystem root).
 *
 * `process.cwd()` is whatever the launcher passed in. On Windows that is
 * `D:\Mployedin` from a PowerShell prompt but `d:\Mployedin` from anything VS
 * Code spawns (integrated terminal, the Playwright extension's `webServer`),
 * and neither Node nor Next normalises the drive letter — Next's own
 * `realpathSync` is the JS implementation on win32, which preserves it. Only
 * `fs.realpathSync.native` asks the OS for the real name.
 *
 * Handing Turbopack two spellings across restarts is not cosmetic: its
 * persistent dev cache (`turbopackFileSystemCacheForDev`, default on) is keyed
 * by that root, so a cache written under one and restored under the other
 * becomes two project filesystems at once. See
 * src/__tests__/lib/config/projectRoot.test.ts for what that did on 2026-09-16.
 */
export function canonicalProjectRoot(cwd: string = process.cwd()): string {
  return fs.realpathSync.native(cwd);
}
