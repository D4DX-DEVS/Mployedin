/**
 * @jest-environment node
 *
 * `bypassSuppression` skips the number-level STOP list (WhatsAppSuppression).
 * Only the keyword replies may use it: the STOP and START confirmations (the
 * STOP reply goes to a number that has just been listed, and the confirmation
 * is part of the opt-out) and the reply to a START that verified nobody. Any
 * other caller would message a number that said STOP. This scan keeps the flag
 * where it is: set only in webhookHandlers.ts, defined only in send.ts, and
 * only on the text input.
 */
import fs from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "src");
const SEND = path.join("lib", "communications", "whatsapp", "send.ts");
const HANDLERS = path.join("lib", "communications", "whatsapp", "webhookHandlers.ts");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "__mocks__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * The top-level arguments of every `deliver(` call (not its definition), with
 * the offset each call starts at. Brackets and string literals are skipped, so
 * a comma inside an object or an arrow function does not split an argument.
 */
function deliverCalls(src: string): { at: number; args: string[] }[] {
  const calls: { at: number; args: string[] }[] = [];
  for (const match of src.matchAll(/(?<!function )\bdeliver\(/g)) {
    const args: string[] = [];
    let depth = 0;
    let current = "";
    let quote: string | null = null;
    let closed = false;
    for (let i = match.index + match[0].length; i < src.length && !closed; i += 1) {
      const ch = src[i];
      if (quote) {
        current += ch;
        if (ch === quote && src[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        current += ch;
      } else if (ch === "," && depth === 0) {
        if (current.trim()) args.push(current.trim());
        current = "";
      } else if (")}]".includes(ch) && depth === 0) {
        if (current.trim()) args.push(current.trim());
        closed = true;
      } else {
        if ("({[".includes(ch)) depth += 1;
        if (")}]".includes(ch)) depth -= 1;
        current += ch;
      }
    }
    calls.push({ at: match.index, args: closed ? args : ["<unterminated call>"] });
  }
  return calls;
}

/** What the scan finds wrong in send.ts: nothing, while the flag is only where it belongs. */
function scanSend(src: string): string[] {
  const problems: string[] = [];
  /** The text from one anchor to the next; a missing anchor is a problem, never an empty slice that passes. */
  const between = (from: string, to: string): string => {
    const start = src.indexOf(from);
    const end = start < 0 ? -1 : src.indexOf(to, start + from.length);
    if (start < 0 || end < 0) {
      problems.push(`anchor not found: ${start < 0 ? from : to}`);
      return "";
    }
    return src.slice(start, end);
  };
  if (between("interface CommonInput", "}").includes("bypassSuppression")) problems.push("CommonInput carries the flag");
  if (between("export interface SendTemplateInput", "}").includes("bypassSuppression")) problems.push("SendTemplateInput carries the flag");
  if (!between("export interface SendTextInput", "}").includes("bypassSuppression")) problems.push("SendTextInput lacks the flag");
  const template = between("export async function sendWhatsAppTemplate", "export async function sendWhatsAppText");
  if (template.includes("bypassSuppression")) problems.push("sendWhatsAppTemplate uses the flag");
  const text = between("export async function sendWhatsAppText", "\n}");

  // Every mention of the flag is one of exactly four: the text input's field, deliver's parameter and its check,
  // and sendWhatsAppText forwarding the caller's value. Anything else (a literal `bypassSuppression: true`, a second
  // forward) is reported.
  const allowed = ["bypassSuppression?: boolean;", "bypassSuppression = false,", "if (!bypassSuppression) {", "input.bypassSuppression,"];
  const mentions = src
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^(\*|\/\/|\/\*)/.test(line) && /\bbypassSuppression\b/.test(line));
  if (JSON.stringify(mentions) !== JSON.stringify(allowed)) problems.push(`unexpected uses of the flag: ${JSON.stringify(mentions)}`);

  // deliver(base, send, bypass): only sendWhatsAppText passes a third argument, and only the caller's flag. A positional
  // `true` from the template path (or any new path) is reported.
  const calls = deliverCalls(src);
  if (calls.length === 0) problems.push("no deliver( call found");
  const textStart = src.indexOf("export async function sendWhatsAppText");
  for (const call of calls) {
    if (call.args.length <= 2) continue;
    const inText = textStart >= 0 && call.at > textStart && call.at < textStart + text.length;
    if (!inText || call.args.length !== 3 || call.args[2] !== "input.bypassSuppression") problems.push(`deliver( called with a bypass: ${call.args.slice(2).join(", ")}`);
  }
  const templateStart = src.indexOf("export async function sendWhatsAppTemplate");
  const templateCall = calls.find((call) => templateStart >= 0 && call.at > templateStart && call.at < templateStart + template.length);
  if (!templateCall) problems.push("sendWhatsAppTemplate's deliver( call not found");
  else if (templateCall.args.length !== 2) problems.push(`sendWhatsAppTemplate passes ${templateCall.args.length} arguments to deliver(`);
  return problems;
}

const sendSource = fs.readFileSync(path.join(SRC, SEND), "utf8");

describe("bypassSuppression", () => {
  it("appears only in send.ts (its definition) and webhookHandlers.ts (the keyword replies)", () => {
    const users = sourceFiles(SRC)
      .filter((file) => fs.readFileSync(file, "utf8").includes("bypassSuppression"))
      .map((file) => path.relative(SRC, file))
      .sort();
    expect(users).toEqual([HANDLERS, SEND].sort());
  });

  it("is set by webhookHandlers.ts only on text sends", () => {
    const src = fs.readFileSync(path.join(SRC, HANDLERS), "utf8");
    const calls = src.split("\n").filter((line) => line.includes("bypassSuppression"));
    expect(calls.length).toBeGreaterThan(0);
    for (const line of calls) expect(line).toContain("sendWhatsAppText(");
  });

  it("is part of the text input only, and only sendWhatsAppText forwards it: the template input and sendWhatsAppTemplate have no bypass", () => {
    expect(scanSend(sendSource)).toEqual([]);
  });

  // J2: the scan above must fail when send.ts changes shape, not pass because it found nothing to look at.
  describe("the send.ts scan cannot pass without checking", () => {
    it("reports an anchor it cannot find (a renamed interface or function) instead of passing", () => {
      expect(scanSend(sendSource.replace("interface CommonInput", "interface SharedInput"))).not.toEqual([]);
      expect(scanSend(sendSource.replace("export async function sendWhatsAppTemplate", "export async function sendTemplate"))).not.toEqual([]);
    });

    it("reports a hardcoded true passed to deliver() by sendWhatsAppTemplate", () => {
      const mutated = sendSource.replace(/(bodyParams: input\.params\.map\(sanitizeTemplateParam\),\s*\}\),)(\s*\);)/, "$1\n    true,$2");
      expect(mutated).not.toBe(sendSource);
      expect(scanSend(mutated)).not.toEqual([]);
    });

    it("reports any other use of the flag in send.ts, such as a literal bypassSuppression: true", () => {
      const mutated = sendSource.replace("const row = { ...base, to: `+${recipient}` };", "const row = { ...base, to: `+${recipient}` };\n  const forced = { bypassSuppression: true };");
      expect(mutated).not.toBe(sendSource);
      expect(scanSend(mutated)).not.toEqual([]);
    });
  });
});
