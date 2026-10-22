import { execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { test as base } from "@playwright/test";
import type { Browser, BrowserServer } from "@playwright/test";
import { markExitedChildKilled, releaseExitedChild, settlesWithin } from "./childClose";
import { canAddressByPid, endCalls, isInside, mayEnd, parseProcessRows, processTree, samePath } from "./processTree";
import type { ProcessRow } from "./processTree";

/**
 * Playwright's own `browser` fixture, except that WebKit is started as a browser
 * server and closed within a time limit.
 *
 * Why: on Windows, WebKit's `browser.close()` or the server's `close()` sometimes
 * never returns, or returns and leaves a network process behind that keeps the
 * worker from exiting. The run then waited five minutes and failed, after every
 * test had passed. Chromium is launched as usual.
 *
 * What it may end, and when. This machine runs other sessions and agents at the
 * same time, so the clean-up is deliberately narrow:
 *  1. Before closing, on Windows only, the server's process tree is listed (read
 *     only, nothing is killed), because the helper processes can only be found by
 *     their parent while the server is alive. Only if the server process is still
 *     the one Node holds a handle to, and is the WebKit program of this install.
 *  2. Both closes finished in time: nothing is killed.
 *  3. A close timed out: Playwright's own `server.kill()` is used, time limited,
 *     but only while Node still holds the server process (no exit seen). Once Node
 *     has seen it exit the id may belong to someone else, and `server.kill()`
 *     (which guards on its "close" event, never fired while a helper keeps the
 *     pipes open) would run `taskkill /pid <id> /T /F` against it.
 *     Once Node has seen the server process exit (whether it was already gone or
 *     `server.kill()` just ended it), our ends of its pipes are destroyed and
 *     "close" is awaited (see ./childClose). Playwright treats a process as gone
 *     only after "close", which a surviving helper holding the pipes prevents, and
 *     until then it can still run the same stale `taskkill` from two places: the
 *     30 s timer of the `server.close()` started above, and its process-exit
 *     handler. "close" disarms both.
 *  4. On Windows only, and only for what is still running after that: processes
 *     that were listed under this worker's own server in step 1. Each is ended
 *     only if it still has the same id, creation time and program file, and that
 *     file is inside the Playwright browsers folder. The final check and the kill
 *     are done on one open process handle, so the id cannot change hands between
 *     them. Anything else is left alone.
 *  5. Elsewhere nothing happens beyond step 3.
 * Every timeout and every kill is printed with the process's id, creation time and
 * path. Set E2E_WEBKIT_CLEANUP_LOG=1 to also print the clean closes.
 */

const CLOSE_LIMIT_MS = 8_000;
const LISTING_LIMIT_MS = 8_000;
const ENDING_LIMIT_MS = 15_000;
const CLOSE_EVENT_LIMIT_MS = 2_000;
const VERBOSE = process.env.E2E_WEBKIT_CLEANUP_LOG === "1";

function log(message: string): void {
  console.warn(`[webkit-cleanup] ${message}`);
}

function identityOf(row: ProcessRow): string {
  return `pid=${row.pid} created=${row.created} path=${row.path || "(unknown)"}`;
}

/** Runs a PowerShell script; `env` adds environment variables the script can read as `$env:NAME`. */
function powershell(script: string, limitMs: number, env?: Record<string, string>): string {
  const exe = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return execFileSync(exe, ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    timeout: limitMs,
    env: env ? { ...process.env, ...env } : undefined,
  });
}

const ROW = '"$($_.ProcessId)|$($_.ParentProcessId)|$(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().Ticks } else { 0 })|$($_.ExecutablePath)"';

/** Rows for the given ids ("every process" when none), or undefined, with a warning, if the listing fails. */
function listProcesses(pids?: number[]): ProcessRow[] | undefined {
  const filter = pids ? ` -Filter "${pids.map((pid) => `ProcessId=${Math.trunc(pid)}`).join(" OR ")}"` : "";
  try {
    return parseProcessRows(powershell(`Get-CimInstance Win32_Process${filter} | ForEach-Object { ${ROW} }`, LISTING_LIMIT_MS));
  } catch (error) {
    log(`could not list processes (${error instanceof Error ? error.message.split("\n")[0] : String(error)}); nothing beyond server.kill() will be done`);
    return undefined;
  }
}

/** The folder Playwright keeps its browsers in (".../ms-playwright"), or undefined if this install does not look like one. */
function browsersFolder(webkitExecutable: string): string | undefined {
  const folder = dirname(dirname(webkitExecutable));
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const known = basename(folder).toLowerCase() === "ms-playwright" || (custom !== undefined && resolve(custom).toLowerCase() === folder.toLowerCase());
  return known && isInside(webkitExecutable, folder) ? folder : undefined;
}

/**
 * Ends one process through a single open handle: the handle pins the process, so
 * the id cannot be given to another one between the check and the kill. The same
 * rules as `mayEnd` (creation time to the microsecond, program path, inside the
 * browsers folder), checked on what the handle really is. Returns "ended", "gone"
 * or "left: <reason>". Written in C# because PowerShell's Get-Process holds no
 * handle (Windows PowerShell 5.1 reopens the process by id when it is killed).
 */
export const END_IF_SAME = [
  "Add-Type -TypeDefinition @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "using System.Text;",
  "public static class EndIfSame {",
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr handle, out long created, out long exited, out long kernel, out long user);',
  '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageNameW(IntPtr handle, uint flags, StringBuilder name, ref uint size);',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr handle, uint exitCode);',
  '  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);',
  "  public static string Run(uint pid, long wantTicks, string wantPath, string folder) {",
  "    IntPtr handle = OpenProcess(0x0001 | 0x1000, false, pid);", // PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION
  "    if (handle == IntPtr.Zero) {",
  "      int openError = Marshal.GetLastWin32Error();",
  '      if (openError == 87) return "gone";', // ERROR_INVALID_PARAMETER: no process has this id any more
  '      return "left: could not open it, error " + openError;',
  "    }",
  "    try {",
  "      long created, exited, kernel, user;",
  '      if (!GetProcessTimes(handle, out created, out exited, out kernel, out user)) return "left: could not read its creation time";',
  '      if (exited != 0) return "gone";',
  "      long ticks = created + 504911232000000000L;", // FILETIME (1601) to .NET ticks (0001)
  "      StringBuilder name = new StringBuilder(2048);",
  "      uint size = 2048;",
  '      if (!QueryFullProcessImageNameW(handle, 0, name, ref size)) return "left: could not read its program path";',
  "      string path = name.ToString();",
  '      if (ticks / 10 != wantTicks / 10) return "left: not the recorded process, created " + ticks;',
  '      if (!string.Equals(path, wantPath, StringComparison.OrdinalIgnoreCase)) return "left: not the recorded process, program " + path;',
  '      if (!path.StartsWith(folder.TrimEnd((char)92) + (char)92, StringComparison.OrdinalIgnoreCase)) return "left: its program is not in the Playwright browsers folder";',
  '      if (TerminateProcess(handle, 1)) return "ended";',
  "      int error = Marshal.GetLastWin32Error();",
  '      if (WaitForSingleObject(handle, 0) == 0) return "gone";', // it was already exiting on its own
  '      return "left: TerminateProcess failed, error " + error;',
  "    } finally { CloseHandle(handle); }",
  "  }",
  "}",
  "'@",
].join("\n");

/** Ends what is left of `recorded`, each one only if it is still the same process. Returns how many were ended. */
function endSurvivors(recorded: ProcessRow[], folder: string): number {
  // First pass, from the process listing: which recorded processes are still there, and still look the same.
  const now = listProcesses(recorded.map((row) => row.pid));
  if (!now) return 0;
  const candidates: ProcessRow[] = [];
  for (const row of recorded) {
    const current = now.find((candidate) => candidate.pid === row.pid);
    if (!current) continue; // gone already
    if (mayEnd(row, current, folder)) {
      candidates.push(row);
      continue;
    }
    const same = current.created / BigInt(10) === row.created / BigInt(10) && samePath(current.path, row.path);
    log(
      same
        ? `left alone, its program is not in the Playwright browsers folder: ${identityOf(row)}`
        : `left alone, no longer the process that was recorded: recorded ${identityOf(row)}; running now ${identityOf(current)}`,
    );
  }
  if (candidates.length === 0) return 0;

  // Second pass, on an open handle: the check and the kill cannot be separated by an id change.
  const { lines, env } = endCalls(candidates, folder); // paths travel as environment variables, not as quoted text
  let output: string;
  try {
    output = powershell(`${END_IF_SAME}\n${lines.join("\n")}`, ENDING_LIMIT_MS, env);
  } catch (error) {
    log(`could not end the left-over processes (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
    return 0;
  }
  let ended = 0;
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [pid, result] = line.split("|");
    const row = candidates.find((candidate) => String(candidate.pid) === pid);
    if (!row) continue;
    if (result === "ended") {
      ended += 1;
      log(`ended ${identityOf(row)}`);
    } else if (result !== "gone") {
      log(`${result?.replace(/^left: /, "left alone, ")}: ${identityOf(row)}`);
    }
  }
  return ended;
}

/**
 * Once Node has seen the server process exit, lets go of our ends of its pipes and
 * waits for "close", so that Playwright's own later kills (the timer of the close it
 * started, and its exit handler) find the process closed and do nothing. When
 * "close" still does not come, the child is marked as killed, which Playwright's
 * kill also checks, and that is logged.
 */
async function disarmPlaywrightKills(child: ChildProcess): Promise<void> {
  const result = await releaseExitedChild(child, CLOSE_EVENT_LIMIT_MS);
  if (result === "alive") {
    log("the server process is still running; its pipes were not touched");
  } else if (result === "not closed") {
    markExitedChildKilled(child);
    log(`no "close" event ${CLOSE_EVENT_LIMIT_MS} ms after letting go of the server's pipes; marked it as killed so Playwright's later kill skips it`);
  } else if (VERBOSE) {
    log(result === "closed" ? "let go of the exited server's pipes; \"close\" followed" : "the exited server's pipes were already closed");
  }
}

/** Closes the browser and its server as described at the top of this file (exported so a probe can drive it with stand-ins). */
export async function closeWebkit(browser: Browser, server: BrowserServer, webkitExecutable: string): Promise<void> {
  const child = server.process();
  const pid = child.pid;
  const folder = process.platform === "win32" ? browsersFolder(webkitExecutable) : undefined;
  // Looked up while the browser is alive, so its helper processes can still be found by their parent.
  let recorded: ProcessRow[] = [];
  if (process.platform === "win32") {
    if (!folder) {
      log(`${webkitExecutable} is not inside a Playwright browsers folder; its helper processes are not looked up`);
    } else if (pid === undefined || !canAddressByPid(child)) {
      log("the server process has already exited; its helper processes are not looked up");
    } else {
      const rows = listProcesses();
      const tree = rows ? processTree(rows, pid) : [];
      if (tree.length > 0 && !samePath(tree[0].path, webkitExecutable)) {
        log(`pid ${pid} is not the WebKit program of this install (it is ${tree[0].path || "(unknown)"}); its helper processes are not recorded`);
      } else {
        recorded = tree;
      }
    }
  }

  const started = Date.now();
  const browserClosed = await settlesWithin(browser.close(), CLOSE_LIMIT_MS);
  const serverClosed = await settlesWithin(server.close(), CLOSE_LIMIT_MS);
  if (browserClosed && serverClosed) {
    if (VERBOSE) log(`closed in time (${Date.now() - started} ms); nothing ended`);
    return;
  }

  log(`close timed out after ${Date.now() - started} ms (browser.close: ${browserClosed ? "ok" : "timed out"}, server.close: ${serverClosed ? "ok" : "timed out"})`);
  // The check and server.kill() (whose taskkill runs synchronously) happen in the same turn: no await between them.
  if (canAddressByPid(child)) {
    log("using server.kill()");
    if (!(await settlesWithin(server.kill(), CLOSE_LIMIT_MS))) log("server.kill() did not finish in time");
  } else {
    log("server.kill() skipped: the server process has already exited, so its id may belong to another process by now");
  }
  await disarmPlaywrightKills(child);
  if (folder && recorded.length > 0) {
    const ended = endSurvivors(recorded, folder);
    log(`${ended} left-over process(es) ended; ${recorded.length} were recorded under the server`);
  }
}

export const test = base.extend<object, { browser: Browser }>({
  browser: [
    async ({ playwright, browserName, headless, channel, launchOptions }, use) => {
      const options = { headless, channel, ...launchOptions };
      if (browserName !== "webkit") {
        const browser = await playwright[browserName].launch(options);
        await use(browser);
        await browser.close();
        return;
      }
      const server = await playwright.webkit.launchServer(options);
      // Once Node has seen the launcher exit, its id may be reused by another process:
      // mark it killed at once, so that no kill (ours or Playwright's, which also checks
      // `killed`) can be aimed at that id afterwards.
      const child = server.process();
      child.once("exit", () => {
        (child as { killed: boolean }).killed = true; // read-only in @types/node; Playwright reads the field
      });
      const browser = await playwright.webkit.connect(server.wsEndpoint());
      await use(browser);
      await closeWebkit(browser, server, playwright.webkit.executablePath());
    },
    { scope: "worker", timeout: 0 },
  ],
});
