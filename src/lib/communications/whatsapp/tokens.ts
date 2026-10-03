/**
 * Template parameter values. Admin-facing strings may carry tokens such as
 * "{{firstName}}"; the sender resolves them per recipient. Meta rejects
 * parameters with newlines, tabs or more than four consecutive spaces, and
 * caps them at 1024 characters, so every value is sanitised on the way out.
 */
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The token names a value uses, in order ("Hi {{ firstName }}" → ["firstName"]). */
export function tokenNames(value: string): string[] {
  return [...value.matchAll(TOKEN_RE)].map((m) => m[1]);
}

export function resolveTokens(values: string[], ctx: Record<string, unknown>): string[] {
  return values.map((v) =>
    v.replace(TOKEN_RE, (_, name: string) => {
      const val = ctx[name];
      return val === undefined || val === null ? "" : String(val);
    }),
  );
}

export function sanitizeTemplateParam(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {5,}/g, "    ")
    .trim()
    .slice(0, 1024);
}

export function firstNameOf(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}
