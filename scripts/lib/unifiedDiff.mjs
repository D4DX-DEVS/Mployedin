/**
 * A small unified-diff writer for the dry run of scripts/update-legal-content.mjs.
 * Line based, no dependencies, no I/O. The output is what `diff -u` would give
 * for the same two texts (context 3 by default), so a reader can follow it
 * without knowing this file exists.
 */

/** Split into lines the way a diff sees them: CRLF == LF, no empty last line from a trailing newline. */
function splitLines(text) {
  const lines = String(text).replace(/\r\n/g, "\n").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Edit script between two line arrays: [{ op: " " | "-" | "+", line }].
 * Trims the common head and tail, then walks a longest-common-subsequence table
 * over what is left (policy bodies are a few hundred lines, so O(n*m) is fine).
 */
function editScript(a, b) {
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const n = midA.length;
  const m = midB.length;
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        midA[i] === midB[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const ops = [];
  for (let k = 0; k < head; k++) ops.push({ op: " ", line: a[k] });
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      ops.push({ op: " ", line: midA[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      ops.push({ op: "-", line: midA[i++] });
    } else {
      ops.push({ op: "+", line: midB[j++] });
    }
  }
  while (i < n) ops.push({ op: "-", line: midA[i++] });
  while (j < m) ops.push({ op: "+", line: midB[j++] });
  for (let k = a.length - tail; k < a.length; k++) ops.push({ op: " ", line: a[k] });
  return ops;
}

/** "-3,4" / "-3" / "-2,0" the way `diff -u` writes a range (start is the line before when the range is empty). */
function range(start, count) {
  if (count === 1) return String(start);
  return `${count === 0 ? start - 1 : start},${count}`;
}

/**
 * @param {string} oldText
 * @param {string} newText
 * @param {{ oldLabel?: string, newLabel?: string, context?: number }} [options]
 * @returns {string} the diff, or "" when the two texts have the same lines
 */
export function unifiedDiff(oldText, newText, { oldLabel = "a", newLabel = "b", context = 3 } = {}) {
  const ops = editScript(splitLines(oldText), splitLines(newText));
  const changed = [];
  ops.forEach((entry, index) => {
    if (entry.op !== " ") changed.push(index);
  });
  if (changed.length === 0) return "";

  // Line number (1-based) each op starts at, in the old and the new text.
  const oldAt = [];
  const newAt = [];
  let o = 1;
  let n = 1;
  for (const entry of ops) {
    oldAt.push(o);
    newAt.push(n);
    if (entry.op !== "+") o++;
    if (entry.op !== "-") n++;
  }

  // Changes with at most two contexts of unchanged lines between them share a hunk (as `diff -u` does).
  const hunks = [];
  let from = changed[0];
  let to = changed[0];
  for (const index of changed.slice(1)) {
    if (index - to - 1 > context * 2) {
      hunks.push([from, to]);
      from = index;
    }
    to = index;
  }
  hunks.push([from, to]);

  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const [first, last] of hunks) {
    const start = Math.max(0, first - context);
    const end = Math.min(ops.length - 1, last + context);
    const slice = ops.slice(start, end + 1);
    const oldCount = slice.filter((entry) => entry.op !== "+").length;
    const newCount = slice.filter((entry) => entry.op !== "-").length;
    out.push(`@@ -${range(oldAt[start], oldCount)} +${range(newAt[start], newCount)} @@`);
    for (const entry of slice) out.push(`${entry.op}${entry.line}`);
  }
  return out.join("\n") + "\n";
}
