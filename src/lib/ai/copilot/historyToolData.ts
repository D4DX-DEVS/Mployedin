/**
 * The Copilot client keeps a compact copy of each tool result in the chat
 * history so follow-ups ("shortlist the second one") still have context.
 * Sent back as an assistant turn, the model reads the blob as something it
 * said and starts echoing `[data from …] [{…}]` at the top of its replies —
 * so the history is reshaped before it reaches the model, and any echo that
 * slipped through is stripped before it is shown.
 */

type HistoryMessage = { role: "user" | "assistant"; content: string };

const MARKER = /\[data from ([\w-]+)\]\s*/g;
const DATA_ENTRY = /^\[data from ([\w-]+)\]\s*([\s\S]*)$/;

export function toolDataEntry(tool: string, payload: string): string {
  return `[data from ${tool}] ${payload}`;
}

/** Index just past the JSON value starting at `start`. */
function jsonValueEnd(text: string, start: number): number {
  const open = text[start];
  if (open !== "[" && open !== "{" && open !== '"') return start;

  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') {
        inString = false;
        if (depth === 0) return i + 1;
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  // ponytail: unterminated (payload cut at 1500 chars, or still streaming) — drop the rest of the line
  const newline = text.indexOf("\n", start);
  return newline === -1 ? text.length : newline;
}

export function stripToolDataEcho(text: string): string {
  if (!text.includes("[data from ")) return text;

  let out = "";
  let cursor = 0;
  MARKER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER.exec(text))) {
    out += text.slice(cursor, match.index);
    let end = jsonValueEnd(text, match.index + match[0].length);
    while (text[end] === " " || text[end] === "\t") end++;
    cursor = end;
    MARKER.lastIndex = end;
  }
  return out + text.slice(cursor);
}

export function prepareHistoryForModel(messages: { role: string; content: string }[]): HistoryMessage[] {
  return messages.map(({ role, content }) => {
    if (role === "user") return { role, content };

    const stripped = stripToolDataEcho(content);
    const entry = DATA_ENTRY.exec(content);
    if (entry && !stripped.trim()) {
      return {
        role: "user",
        content: `(Reference data returned by the ${entry[1]} tool earlier in this conversation — supplied by the system, not typed by the user, and never shown to them. Use it to answer follow-up questions; never repeat it or its JSON in a reply.)\n${entry[2]}`,
      };
    }
    return { role: "assistant", content: stripped };
  });
}
