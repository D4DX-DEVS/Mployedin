/**
 * Just enough of MongoDB's aggregation expression language to run the
 * cookie-choice grouping's category flags ($group $max accumulators, then the
 * $project $switch) on a few rows in a unit test, so the test checks what a
 * category comes out as rather than how the expression is spelled. The real
 * database runs the same stages in admin-gdpr-consent-choices.db.test.ts.
 */

type Doc = Record<string, unknown>;

export function evaluate(expr: unknown, doc: Doc): unknown {
  if (typeof expr === "string" && expr.startsWith("$")) return doc[expr.slice(1)];
  if (typeof expr !== "object" || expr === null || Array.isArray(expr)) return expr;
  const [op, arg] = Object.entries(expr)[0];
  const args = arg as unknown[];
  switch (op) {
    case "$eq":
      return evaluate(args[0], doc) === evaluate(args[1], doc);
    case "$and":
      return args.every((e) => Boolean(evaluate(e, doc)));
    case "$cond":
      return evaluate(args[0], doc) ? evaluate(args[1], doc) : evaluate(args[2], doc);
    case "$switch": {
      const s = arg as { branches: Array<{ case: unknown; then: unknown }>; default: unknown };
      const hit = s.branches.find((b) => Boolean(evaluate(b.case, doc)));
      return hit ? evaluate(hit.then, doc) : evaluate(s.default, doc);
    }
    default:
      throw new Error(`the test evaluator has no ${op}`);
  }
}

/**
 * One group's preferences and media, as `group`'s numeric $max accumulators
 * and `project`'s preferences/media expressions make them from `rows`.
 */
export function categoriesFromStages(group: Doc, project: Doc, rows: Doc[]): { preferences: unknown; media: unknown } {
  const grouped: Doc = {};
  for (const [key, accumulator] of Object.entries(group)) {
    if (key === "_id") continue;
    const [op, expr] = Object.entries(accumulator as Doc)[0];
    if (op !== "$max") continue;
    const values = rows.map((r) => evaluate(expr, r));
    if (values.every((v) => typeof v === "number")) grouped[key] = Math.max(...(values as number[]));
  }
  return { preferences: evaluate(project.preferences, grouped), media: evaluate(project.media, grouped) };
}
