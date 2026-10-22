/**
 * Which processes a closed browser may have left behind, and which of them are
 * safe to end. Pure functions over a process listing, no I/O: this decides what
 * is allowed to be killed on a machine that runs other people's processes too, so
 * it is unit tested (src/__tests__/lib/webkitCleanup/processTree.test.ts).
 *
 * A process is named by three things, not by its id alone, because Windows
 * recycles ids and never clears a process's recorded parent when the parent
 * exits: the id, when it was created, and the file it was started from.
 */

const ZERO = BigInt(0);
const TEN = BigInt(10);

export interface ProcessRow {
  pid: number;
  parentPid: number;
  /**
   * Creation time as .NET ticks (100 ns, UTC), exact: a tick count is larger than
   * a JavaScript number can hold without rounding. Zero when the system did not
   * report it.
   */
  created: bigint;
  /** Full path of the program; empty when the system did not report it. */
  path: string;
}

/** Parses lines of `pid|parentPid|createdTicks|path` (what the PowerShell listing prints). */
export function parseProcessRows(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [pid, parentPid, created, ...path] = line.trim().split("|");
    if (!/^\d+$/.test(pid ?? "") || !/^\d+$/.test(parentPid ?? "") || !/^\d+$/.test(created ?? "")) continue;
    rows.push({ pid: Number(pid), parentPid: Number(parentPid), created: BigInt(created), path: path.join("|") });
  }
  return rows;
}

/**
 * The process `rootPid` and everything below it, found by following parent ids.
 * A process only counts as a child if it was created after its parent: a stale
 * parent id that now belongs to a recycled process (or to nothing) points at a
 * process that cannot have started it. Empty when the root is not in the listing.
 */
export function processTree(rows: ProcessRow[], rootPid: number): ProcessRow[] {
  const root = rows.find((row) => row.pid === rootPid);
  if (!root || root.created <= ZERO) return [];
  const tree = [root];
  const seen = new Set([root.pid]);
  for (let at = 0; at < tree.length; at += 1) {
    const parent = tree[at];
    for (const row of rows) {
      if (seen.has(row.pid) || row.parentPid !== parent.pid) continue;
      if (row.created <= ZERO || row.created <= parent.created) continue;
      seen.add(row.pid);
      tree.push(row);
    }
  }
  return tree;
}

/** A Windows path in one comparable spelling: backslashes, lower case, no trailing backslash. */
function normalPath(value: string): string {
  return value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

/** True when `file` is inside `folder` (case-insensitive, as Windows paths are). */
export function isInside(file: string, folder: string): boolean {
  return file !== "" && normalPath(file).startsWith(normalPath(folder) + "\\");
}

/** True when two paths name the same file, spelled with any case or slash. Empty never matches. */
export function samePath(a: string, b: string): boolean {
  return a !== "" && b !== "" && normalPath(a) === normalPath(b);
}

/** True when two creation times (ticks) are the same to the microsecond, the precision Windows' process listing reports. */
export function sameMoment(a: bigint, b: bigint): boolean {
  return a / TEN === b / TEN;
}

/**
 * Whether `now` (what is running under that id at this moment) is still the very
 * process that was recorded as `recorded`: same creation time (to the
 * microsecond), same program, and a program that lives in the Playwright
 * browsers folder.
 */
export function mayEnd(recorded: ProcessRow, now: ProcessRow | undefined, browsersFolder: string): boolean {
  if (!now || recorded.created <= ZERO || recorded.path === "") return false;
  return (
    now.pid === recorded.pid &&
    sameMoment(now.created, recorded.created) &&
    samePath(now.path, recorded.path) &&
    isInside(now.path, browsersFolder)
  );
}

/**
 * Whether the server's launcher process may still be addressed by its id. Node
 * sets `exitCode` / `signalCode` when the process exits and then lets go of the
 * handle, after which the operating system may give the same id to an unrelated
 * process. While both are still null the handle is held and the id is ours.
 * Playwright's own `server.kill()` guards on its "close" event instead, which
 * never fires if a surviving helper process keeps the launcher's pipes open, so
 * it would run `taskkill /pid <id> /T /F` against a possibly recycled id.
 */
export function canAddressByPid(child: { exitCode: number | null; signalCode: string | null }): boolean {
  return child.exitCode === null && child.signalCode === null;
}

/** One of the launcher's pipes, as far as the decision below needs to know. */
export interface Releasable {
  destroyed: boolean;
  destroy(): unknown;
}

/**
 * The pipes of the server's launcher process that may be let go of: none while
 * Node still holds the process (they are in use), and after it has exited every
 * one that is still open. Pipes that were ignored at launch (null) or are already
 * destroyed are not in the result. Letting go is what allows Node's "close" event
 * (see releaseExitedChild in ./childClose).
 */
export function streamsToRelease(child: {
  exitCode: number | null;
  signalCode: string | null;
  stdio: ReadonlyArray<Releasable | null | undefined>;
}): Releasable[] {
  if (canAddressByPid(child)) return [];
  return child.stdio.filter((stream): stream is Releasable => stream != null && !stream.destroyed);
}

/**
 * The PowerShell lines that end each candidate through `[EndIfSame]::Run`, and the
 * environment variables they read. The program path and the browsers folder are
 * passed as environment variables, never written into the script text: PowerShell
 * treats the typographic quotes U+2018 to U+201B as single quotes as well, so no
 * escaping of a path inside a quoted string can be relied on.
 */
export function endCalls(candidates: ProcessRow[], folder: string): { lines: string[]; env: Record<string, string> } {
  const env: Record<string, string> = { E2E_WEBKIT_END_FOLDER: folder };
  const lines = candidates.map((row, index) => {
    const name = `E2E_WEBKIT_END_PATH_${index}`;
    env[name] = row.path;
    return `"${Math.trunc(row.pid)}|" + [EndIfSame]::Run(${Math.trunc(row.pid)}, ${row.created}L, $env:${name}, $env:E2E_WEBKIT_END_FOLDER)`;
  });
  return { lines, env };
}
