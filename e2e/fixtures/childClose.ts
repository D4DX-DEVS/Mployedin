import { canAddressByPid, streamsToRelease } from "./processTree";
import type { Releasable } from "./processTree";

/** True if `promise` settled (either way) within `ms`; the timer never outlives the call. */
export async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((done) => {
    timer = setTimeout(() => done(false), ms);
  });
  try {
    return await Promise.race([promise.then(() => true, () => true), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** What a child process object offers, so that a stand-in can replace the real one in a test. */
export interface ChildLike {
  exitCode: number | null;
  signalCode: string | null;
  killed: boolean;
  stdio: ReadonlyArray<Releasable | null | undefined>;
  once(event: "close", listener: () => void): unknown;
  off(event: "close", listener: () => void): unknown;
}

export type ReleaseResult =
  /** The process has not exited as far as Node knows: its pipes were not touched. */
  | "alive"
  /** Every pipe was already closed, so "close" has come (or is about to). */
  | "already closed"
  /** Our ends of the pipes were destroyed and "close" followed. */
  | "closed"
  /** Our ends were destroyed, but "close" did not come in time. */
  | "not closed";

/**
 * After Node has seen the process exit, lets go of our ends of its pipes, so that
 * Node can emit "close" even though a surviving helper process still holds the
 * other ends.
 *
 * Why it matters: Playwright decides whether a process is still there from that
 * "close" event (its `processClosed` flag), not from the exit. Until it comes, two
 * things Playwright armed earlier can still run `taskkill /pid <id> /T /F`: the
 * 30 s timer of the `server.close()` we started, and its process-exit handler that
 * kills every launched process at worker exit. By then the id may belong to an
 * unrelated process. "close" disarms both (it sets the flag, removes the process
 * from the exit handler's set and settles the pending close).
 *
 * Nothing is touched while Node still holds the process (the pipes are in use).
 */
export async function releaseExitedChild(child: ChildLike, waitMs: number): Promise<ReleaseResult> {
  if (canAddressByPid(child)) return "alive";
  const open = streamsToRelease(child);
  if (open.length === 0) return "already closed";
  let onClose: (() => void) | undefined;
  const closed = new Promise<void>((done) => {
    onClose = () => done();
    child.once("close", onClose);
  });
  for (const stream of open) {
    try {
      stream.destroy();
    } catch {
      // One pipe that will not let go must not stop the others; "close" may still come.
    }
  }
  try {
    return (await settlesWithin(closed, waitMs)) ? "closed" : "not closed";
  } finally {
    if (onClose) child.off("close", onClose);
  }
}

/**
 * Last resort when "close" still did not come: Playwright also guards its kill
 * with the child's `killed` flag, which Node sets when it kills a process. An
 * exited process cannot be killed any more, so marking it makes Playwright's late
 * `taskkill` skip a process that is gone and whose id may have been reused.
 *
 * Checked against Playwright 1.60: its force kill (playwright-core
 * lib/coreBundle.js, killProcess) runs only when
 * `spawnedProcess.pid && !spawnedProcess.killed && !processClosed`. Re-check on an upgrade.
 */
export function markExitedChildKilled(child: ChildLike): void {
  if (!canAddressByPid(child)) child.killed = true;
}
