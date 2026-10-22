/**
 * The E2E clean-up for WebKit on Windows (e2e/fixtures/webkitServer.ts) may end
 * only processes that belong to the browser server its own worker started. These
 * are the rules that keep it from touching anything else on a machine that runs
 * other sessions and agents: Windows recycles process ids and never clears a
 * process's recorded parent, so an id alone proves nothing.
 */
import {
  canAddressByPid,
  endCalls,
  isInside,
  mayEnd,
  parseProcessRows,
  processTree,
  sameMoment,
  samePath,
  streamsToRelease,
} from "../../../../e2e/fixtures/processTree";
import type { ProcessRow } from "../../../../e2e/fixtures/processTree";

const FOLDER = "C:\\Users\\dev\\AppData\\Local\\ms-playwright";
const WEBKIT = `${FOLDER}\\webkit-2272\\Playwright.exe`;
const NETWORK = `${FOLDER}\\webkit-2272\\WebKitNetworkProcess.exe`;

// Creation times are exact tick counts (BigInt: more than a JavaScript number can hold).
const t = (value: number | string) => BigInt(value);
const row = (pid: number, parentPid: number, created: number | string, path = WEBKIT): ProcessRow => ({
  pid,
  parentPid,
  created: t(created),
  path,
});

describe("parseProcessRows", () => {
  it("reads pid|parent|created|path lines and skips blanks and noise", () => {
    const rows = parseProcessRows(`10|1|500|${WEBKIT}\r\n\r\nnot a row\n11|10|600|\n12|x|600|${WEBKIT}\n`);

    expect(rows).toEqual([row(10, 1, 500), row(11, 10, 600, "")]);
  });

  it("keeps a pipe inside the path", () => {
    expect(parseProcessRows("10|1|500|C:\\odd|name\\a.exe")[0].path).toBe("C:\\odd|name\\a.exe");
  });

  it("keeps a creation time exactly, even one a JavaScript number would round", () => {
    const ticks = "639281775637640707";

    expect(parseProcessRows(`10|1|${ticks}|${WEBKIT}`)[0].created).toBe(t(ticks));
    expect(String(Number(ticks))).not.toBe(ticks); // the reason it is a BigInt
  });
});

describe("processTree", () => {
  it("returns the root and everything below it, created after its parent", () => {
    const rows = [row(100, 1, 1000), row(101, 100, 1100, NETWORK), row(102, 100, 1200), row(103, 102, 1300), row(999, 1, 900, "C:\\other.exe")];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100, 101, 102, 103]);
  });

  it("does not list a process whose recorded parent is this root but which is older than the root (a recycled id)", () => {
    const rows = [row(100, 1, 1000), row(200, 100, 500, "C:\\Windows\\notepad.exe")];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100]);
  });

  it("does not follow an old orphan's own subtree", () => {
    // 150's parent (100) was recycled: 150 is older than the root that now has pid 100.
    const rows = [row(100, 1, 1000), row(150, 100, 400), row(151, 150, 450)];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100]);
  });

  it("is empty when the root is not running or has no creation time", () => {
    expect(processTree([row(1, 0, 10)], 100)).toEqual([]);
    expect(processTree([row(100, 1, 0)], 100)).toEqual([]);
  });

  it("ignores children with no creation time, and a child created at the very moment of its parent", () => {
    const rows = [row(100, 1, 1000), row(101, 100, 0), row(102, 100, 1000)];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100]);
  });

  it("tells apart creation times that a JavaScript number could not", () => {
    // 6.39e17: neighbouring ticks collapse into one number, but not into one BigInt.
    const rows = [row(100, 1, "639281775637640700"), row(101, 100, "639281775637640701")];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100, 101]);
  });

  it("cannot loop on a cycle of recorded parents", () => {
    const rows = [row(100, 101, 1000), row(101, 100, 1100)];

    expect(processTree(rows, 100).map((entry) => entry.pid)).toEqual([100, 101]);
  });
});

describe("isInside", () => {
  it("is true only for a file in the folder, whatever the case or slash", () => {
    expect(isInside(WEBKIT, FOLDER)).toBe(true);
    expect(isInside(WEBKIT.toUpperCase(), FOLDER.toLowerCase())).toBe(true);
    expect(isInside(WEBKIT.replace(/\\/g, "/"), `${FOLDER}\\`)).toBe(true);
  });

  it("is false for a sibling that shares the folder's name as a prefix, for another place and for nothing", () => {
    expect(isInside(`${FOLDER}-evil\\webkit\\Playwright.exe`, FOLDER)).toBe(false);
    expect(isInside("C:\\Program Files\\nodejs\\node.exe", FOLDER)).toBe(false);
    expect(isInside("", FOLDER)).toBe(false);
  });
});

describe("samePath", () => {
  it("matches the same file in any case or slash, normalised the way isInside does", () => {
    expect(samePath(WEBKIT, WEBKIT.toUpperCase())).toBe(true);
    expect(samePath(WEBKIT, WEBKIT.replace(/\\/g, "/"))).toBe(true);
  });

  it("does not match a different file, a different folder, or an empty path", () => {
    expect(samePath(WEBKIT, NETWORK)).toBe(false);
    expect(samePath(WEBKIT, WEBKIT.replace("webkit-2272", "webkit-2273"))).toBe(false);
    expect(samePath("", "")).toBe(false);
    expect(samePath(WEBKIT, "")).toBe(false);
  });
});

describe("sameMoment", () => {
  it("compares to the microsecond (ten ticks), the precision of Windows' process listing", () => {
    expect(sameMoment(t("639281775637640700"), t("639281775637640709"))).toBe(true);
    expect(sameMoment(t("639281775637640700"), t("639281775637640710"))).toBe(false);
  });
});

describe("mayEnd", () => {
  const recorded = row(101, 100, 1100, NETWORK);

  it("allows the very process that was recorded", () => {
    expect(mayEnd(recorded, { ...recorded }, FOLDER)).toBe(true);
    expect(mayEnd(recorded, { ...recorded, path: NETWORK.toUpperCase() }, FOLDER)).toBe(true);
  });

  it("allows a creation time that differs only below the microsecond", () => {
    const exact = row(101, 100, "639281775637640700", NETWORK);

    expect(mayEnd(exact, { ...exact, created: t("639281775637640705") }, FOLDER)).toBe(true);
  });

  it("refuses when nothing runs under that id any more", () => {
    expect(mayEnd(recorded, undefined, FOLDER)).toBe(false);
  });

  it("refuses a recycled id: a different creation time", () => {
    expect(mayEnd(recorded, { ...recorded, created: t(2000) }, FOLDER)).toBe(false);
    const exact = row(101, 100, "639281775637640700", NETWORK);
    expect(mayEnd(exact, { ...exact, created: t("639281775637640710") }, FOLDER)).toBe(false);
  });

  it("refuses a different program, even with the same id and creation time", () => {
    expect(mayEnd(recorded, { ...recorded, path: WEBKIT }, FOLDER)).toBe(false);
  });

  it("refuses a program outside the Playwright browsers folder, even if it matches what was recorded", () => {
    const outside = row(101, 100, 1100, "C:\\Program Files\\nodejs\\node.exe");

    expect(mayEnd(outside, { ...outside }, FOLDER)).toBe(false);
  });

  it("refuses when the record is incomplete (no creation time or no path)", () => {
    expect(mayEnd(row(101, 100, 0, NETWORK), row(101, 100, 0, NETWORK), FOLDER)).toBe(false);
    expect(mayEnd(row(101, 100, 1100, ""), row(101, 100, 1100, ""), FOLDER)).toBe(false);
  });
});

/**
 * Playwright's own server.kill() guards on its "close" event, which does not fire
 * while a surviving helper process holds the launcher's pipes open, so after the
 * launcher has exited it would still run taskkill against its (maybe reused) id.
 * Ours asks Node, which sets exitCode / signalCode on exit and then lets go of the handle.
 */
describe("canAddressByPid (whether server.kill() may be called)", () => {
  it("is true while Node has seen neither an exit code nor a signal", () => {
    expect(canAddressByPid({ exitCode: null, signalCode: null })).toBe(true);
  });

  it("is false once the process exited, with any code, including zero", () => {
    expect(canAddressByPid({ exitCode: 0, signalCode: null })).toBe(false);
    expect(canAddressByPid({ exitCode: 1, signalCode: null })).toBe(false);
  });

  it("is false once it was ended by a signal", () => {
    expect(canAddressByPid({ exitCode: null, signalCode: "SIGKILL" })).toBe(false);
  });
});

describe("streamsToRelease (which of the launcher's pipes may be let go of)", () => {
  const pipe = (destroyed = false) => ({ destroyed, destroy: jest.fn() });

  it("is none while Node still holds the process: its pipes are in use", () => {
    const stdio = [null, pipe(), pipe(), pipe(), pipe()];

    expect(streamsToRelease({ exitCode: null, signalCode: null, stdio })).toEqual([]);
  });

  it("is every pipe that is still open once the process has exited, skipping ignored and destroyed ones", () => {
    const open = [pipe(), pipe(), pipe()];
    const stdio = [null, open[0], pipe(true), open[1], open[2]];

    expect(streamsToRelease({ exitCode: 0, signalCode: null, stdio })).toEqual(open);
    expect(streamsToRelease({ exitCode: null, signalCode: "SIGKILL", stdio })).toEqual(open);
  });

  it("is none once they are all closed already (\"close\" has come)", () => {
    const stdio = [null, pipe(true), pipe(true), undefined];

    expect(streamsToRelease({ exitCode: 1, signalCode: null, stdio })).toEqual([]);
  });
});

describe("endCalls (what is handed to PowerShell)", () => {
  const folderWithQuotes = "C:\\Users\\O\u2019Neil\\ms-playwright";
  const rows = [
    row(101, 100, "639281775637640700", `${folderWithQuotes}\\webkit-2272\\WebKitNetworkProcess.exe`),
    row(102, 100, "639281775637640701", "C:\\odd \u2018name\u2019 ' $(calc)\\a.exe"),
  ];

  it("passes every path and the folder as environment variables, exactly as recorded", () => {
    const { env } = endCalls(rows, folderWithQuotes);

    expect(env).toEqual({
      E2E_WEBKIT_END_FOLDER: folderWithQuotes,
      E2E_WEBKIT_END_PATH_0: rows[0].path,
      E2E_WEBKIT_END_PATH_1: rows[1].path,
    });
  });

  it("writes no path and no quote character of any kind into the script text", () => {
    const { lines } = endCalls(rows, folderWithQuotes);
    const text = lines.join("\n");

    expect(text).not.toMatch(/['\u2018\u2019\u201A\u201B]/);
    expect(text).not.toContain("Neil");
    expect(text).not.toContain("calc");
    expect(lines).toEqual([
      '"101|" + [EndIfSame]::Run(101, 639281775637640700L, $env:E2E_WEBKIT_END_PATH_0, $env:E2E_WEBKIT_END_FOLDER)',
      '"102|" + [EndIfSame]::Run(102, 639281775637640701L, $env:E2E_WEBKIT_END_PATH_1, $env:E2E_WEBKIT_END_FOLDER)',
    ]);
  });
});
