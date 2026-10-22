/**
 * @jest-environment node
 *
 * The dry run of scripts/update-legal-content.mjs prints this diff, so the
 * owner can read what --apply would change. The property that matters: the
 * patch, applied to the old text, gives the new text, and every @@ header
 * counts the lines it says it does.
 */
import { unifiedDiff } from "../../../scripts/lib/unifiedDiff.mjs";

function lines(text: string): string[] {
  const out = text.replace(/\r\n/g, "\n").split("\n");
  if (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

function applyPatch(oldText: string, patch: string): string {
  const oldLines = lines(oldText);
  const out: string[] = [];
  let pos = 0;
  const rows = patch.split("\n");
  let i = 0;
  while (i < rows.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(rows[i]);
    if (!m) {
      i++;
      continue;
    }
    const oldStart = Number(m[1]);
    const oldCount = m[2] === undefined ? 1 : Number(m[2]);
    const newCount = m[4] === undefined ? 1 : Number(m[4]);
    const startIdx = oldCount === 0 ? oldStart : oldStart - 1;
    while (pos < startIdx) out.push(oldLines[pos++]);
    i++;
    let seenOld = 0;
    let seenNew = 0;
    while (i < rows.length && !rows[i].startsWith("@@")) {
      const row = rows[i++];
      if (row.startsWith(" ")) {
        expect(oldLines[pos]).toBe(row.slice(1));
        out.push(oldLines[pos++]);
        seenOld++;
        seenNew++;
      } else if (row.startsWith("-")) {
        expect(oldLines[pos]).toBe(row.slice(1));
        pos++;
        seenOld++;
      } else if (row.startsWith("+")) {
        out.push(row.slice(1));
        seenNew++;
      }
    }
    expect(seenOld).toBe(oldCount);
    expect(seenNew).toBe(newCount);
  }
  while (pos < oldLines.length) out.push(oldLines[pos++]);
  return out.join("\n");
}

describe("unifiedDiff", () => {
  it("returns an empty string when nothing changed", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n")).toBe("");
  });

  it("labels both files and marks removed and added lines", () => {
    const diff = unifiedDiff("one\ntwo\nthree\n", "one\n2\nthree\n", { oldLabel: "current", newLabel: "generated" });
    expect(diff.startsWith("--- current\n+++ generated\n")).toBe(true);
    expect(diff).toContain("-two\n");
    expect(diff).toContain("+2\n");
    expect(diff).toContain(" one\n");
    expect(diff).toMatch(/^@@ -1,3 \+1,3 @@$/m);
  });

  it("handles a file that is entirely new and one that is entirely removed", () => {
    expect(applyPatch("", unifiedDiff("", "x\ny\n"))).toBe("x\ny");
    expect(applyPatch("x\ny\n", unifiedDiff("x\ny\n", ""))).toBe("");
    expect(unifiedDiff("", "x\n")).toMatch(/^@@ -0,0 \+1 @@$/m);
  });

  it("keeps far-apart changes in separate hunks and near ones in one", () => {
    const base = Array.from({ length: 40 }, (_, i) => `line ${i}`);
    const far = [...base];
    far[2] = "changed A";
    far[35] = "changed B";
    expect((unifiedDiff(base.join("\n"), far.join("\n")).match(/^@@/gm) ?? []).length).toBe(2);
    const near = [...base];
    near[10] = "changed A";
    near[12] = "changed B";
    expect((unifiedDiff(base.join("\n"), near.join("\n")).match(/^@@/gm) ?? []).length).toBe(1);
  });

  it("treats CRLF and LF the same", () => {
    expect(unifiedDiff("a\r\nb\r\n", "a\nb\n")).toBe("");
  });

  it("round-trips: applying the patch to the old text gives the new text (300 random cases)", () => {
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const alphabet = ["", "a", "b", "c", "d", "<p>x</p>", "  y"];
    for (let round = 0; round < 300; round++) {
      const make = () => Array.from({ length: rand(30) }, () => alphabet[rand(alphabet.length)]);
      const a = make();
      const b = rand(3) === 0 ? make() : a.map((l) => (rand(5) === 0 ? alphabet[rand(alphabet.length)] : l)).filter(() => rand(8) !== 0);
      const oldText = a.length ? a.join("\n") + "\n" : "";
      const newText = b.length ? b.join("\n") + "\n" : "";
      const patch = unifiedDiff(oldText, newText);
      if (oldText === newText) {
        expect(patch).toBe("");
        continue;
      }
      expect(applyPatch(oldText, patch)).toBe(b.join("\n"));
    }
  });
});
