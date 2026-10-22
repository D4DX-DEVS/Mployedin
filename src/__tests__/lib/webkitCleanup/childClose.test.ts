/**
 * @jest-environment node
 *
 * After Node has seen the browser server's launcher exit, the E2E clean-up lets go
 * of its ends of the launcher's pipes so that "close" comes, because Playwright's
 * own later kills (the timer of the close it started, its process-exit handler)
 * are guarded by "close" and would otherwise still run `taskkill /pid <id> /T /F`
 * against an id that may have been reused (e2e/fixtures/childClose.ts).
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { markExitedChildKilled, releaseExitedChild, settlesWithin } from "../../../../e2e/fixtures/childClose";
import type { ChildLike } from "../../../../e2e/fixtures/childClose";

/** A pipe whose destroy() closes it on the next tick, as a real socket does. */
function fakePipe(onClosed: () => void, destroyed = false) {
  const pipe = {
    destroyed,
    destroy: jest.fn(() => {
      if (pipe.destroyed) return;
      pipe.destroyed = true;
      setImmediate(onClosed);
    }),
  };
  return pipe;
}

/**
 * A stand-in for the launcher (already exited, unless the state says otherwise): like
 * Node's ChildProcess it emits "close" once every pipe is closed. `brokenPipe` never closes.
 */
function fakeChild(state: { exitCode: number | null; signalCode: string | null }, options: { brokenPipe?: boolean } = {}) {
  const emitter = new EventEmitter();
  let open = 3;
  const closed = () => {
    open -= 1;
    if (open === 0) emitter.emit("close", state.exitCode, state.signalCode);
  };
  const pipes = [fakePipe(closed), fakePipe(closed), fakePipe(closed)];
  if (options.brokenPipe) pipes[2].destroy = jest.fn();
  const stdio = [null, ...pipes];
  const child: ChildLike = {
    exitCode: state.exitCode,
    signalCode: state.signalCode,
    killed: false,
    stdio,
    once: (event, listener) => emitter.once(event, listener),
    off: (event, listener) => emitter.off(event, listener),
  };
  return { child, stdio, emitter };
}

describe("releaseExitedChild", () => {
  it("touches nothing while Node still holds the process", async () => {
    const { child, stdio } = fakeChild({ exitCode: null, signalCode: null });

    await expect(releaseExitedChild(child, 200)).resolves.toBe("alive");

    for (const pipe of stdio) if (pipe) expect(pipe.destroy).not.toHaveBeenCalled();
  });

  it("after an exit, destroys the open pipes and resolves when \"close\" follows", async () => {
    const { child, stdio } = fakeChild({ exitCode: 1, signalCode: null });
    const closeSeen = jest.fn();
    child.once("close", closeSeen);

    await expect(releaseExitedChild(child, 1_000)).resolves.toBe("closed");

    for (const pipe of stdio) if (pipe) expect(pipe.destroy).toHaveBeenCalledTimes(1);
    expect(closeSeen).toHaveBeenCalledTimes(1);
  });

  it("also works for a process ended by a signal", async () => {
    const { child } = fakeChild({ exitCode: null, signalCode: "SIGKILL" });

    await expect(releaseExitedChild(child, 1_000)).resolves.toBe("closed");
  });

  it("does not wait when every pipe is closed already", async () => {
    const { child, stdio } = fakeChild({ exitCode: 0, signalCode: null });
    for (const pipe of stdio) if (pipe) pipe.destroyed = true;

    await expect(releaseExitedChild(child, 5_000)).resolves.toBe("already closed");
  });

  it("gives up after the limit when \"close\" never comes, and leaves no listener behind", async () => {
    const { child, emitter } = fakeChild({ exitCode: 1, signalCode: null }, { brokenPipe: true });

    await expect(releaseExitedChild(child, 50)).resolves.toBe("not closed");

    expect(emitter.listenerCount("close")).toBe(0);
  });

  it("a pipe whose destroy() throws does not stop the others, and the call still resolves", async () => {
    const { child, stdio } = fakeChild({ exitCode: 1, signalCode: null });
    const throwing = stdio[1]!;
    throwing.destroy = jest.fn(() => {
      throw new Error("EBADF");
    });

    await expect(releaseExitedChild(child, 50)).resolves.toBe("not closed");

    expect(throwing.destroy).toHaveBeenCalledTimes(1);
    expect(stdio[2]!.destroy).toHaveBeenCalledTimes(1);
    expect(stdio[3]!.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("markExitedChildKilled", () => {
  it("marks an exited process as killed, so Playwright's kill (which also checks it) skips it", () => {
    const { child } = fakeChild({ exitCode: 1, signalCode: null });

    markExitedChildKilled(child);

    expect(child.killed).toBe(true);
  });

  it("never marks a process Node still holds", () => {
    const { child } = fakeChild({ exitCode: null, signalCode: null });

    markExitedChildKilled(child);

    expect(child.killed).toBe(false);
  });
});

describe("settlesWithin", () => {
  it("is true for a promise that settles in time, whichever way, and false for one that does not", async () => {
    await expect(settlesWithin(Promise.resolve(), 100)).resolves.toBe(true);
    await expect(settlesWithin(Promise.reject(new Error("x")), 100)).resolves.toBe(true);
    await expect(settlesWithin(new Promise(() => undefined), 20)).resolves.toBe(false);
  });
});

/**
 * The real thing, with a process this test starts itself: a parent that exits while
 * its own child (detached, so that it outlives the parent on Windows, and started with
 * the parent's pipes) keeps them open for a few seconds.
 * That is the stuck state of the WebKit launcher: "exit" arrives, "close" does not.
 * The grandchild ends by itself; nothing here kills anything.
 */
describe("releaseExitedChild on a real process whose pipes a survivor holds open", () => {
  it("brings the \"close\" event while the survivor is still running", async () => {
    const survivorSeconds = 5;
    const parentCode = [
      "const { spawn } = require('node:child_process');",
      `const survivor = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${survivorSeconds * 1000})'], { detached: true, stdio: 'inherit' });`,
      "console.log('survivor ' + survivor.pid);",
      "setTimeout(() => process.exit(0), 100);",
    ].join("\n");
    const child = spawn(process.execPath, ["-e", parentCode], { stdio: ["ignore", "pipe", "pipe"] });
    let survivorPid = 0;
    child.stdout?.on("data", (chunk: Buffer) => {
      const match = /survivor (\d+)/.exec(String(chunk));
      if (match) survivorPid = Number(match[1]);
    });
    let closed = false;
    child.once("close", () => {
      closed = true;
    });
    await new Promise<void>((done) => child.once("exit", () => done()));
    // Exit seen, and the survivor still holds the pipes: this is the state to get out of.
    await new Promise((done) => setTimeout(done, 300));
    expect(closed).toBe(false);
    expect(survivorPid).toBeGreaterThan(0);

    const started = Date.now();
    const result = await releaseExitedChild(child, 2_000);

    expect(result).toBe("closed");
    expect(closed).toBe(true);
    expect(Date.now() - started).toBeLessThan(survivorSeconds * 1000 - 1_000);
  }, 20_000);
});
