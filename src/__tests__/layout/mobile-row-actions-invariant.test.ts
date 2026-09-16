import fs from "fs";
import path from "path";

/**
 * Guards the two-branch rule for `td[data-mobile-actions] > div` in globals.css.
 *
 * Under 640px that div holds a card row's action buttons. It used to be a single
 * unconditional horizontal scroller with `scrollbar-width: none`, which is why
 * /en/agent/jobs measured clientWidth 280 / scrollWidth 290 at 390px and painted
 * "View Job" as "View Jo" — overflowing by ten pixels with no scrollbar, no
 * shadow, and nothing to suggest the row could be swiped. QA filed it as clipped
 * text, which is exactly how it looked.
 *
 * The fix splits the rule by action count:
 *   - one or two actions  → wrap, so the row can never need scrolling
 *   - three or more       → keep the scroller (admin's five-action employer rows
 *                           wrapped to three lines and made the collapsed card
 *                           taller than the record) and paint a scroll shadow
 *
 * Both branches matter. Deleting the wrap branch brings the clipping back;
 * deleting the shadow makes the remaining scrollers invisible again. jsdom
 * cannot evaluate this — the rules live behind a media query and depend on
 * `:has()` and on real layout — so the CSS text itself is the assertion, with
 * e2e/mobile-row-actions-overflow.spec.ts measuring the actual behaviour in a
 * browser at 390px.
 */
const GLOBALS = path.join(process.cwd(), "src", "app", "globals.css");

/**
 * Only the rule blocks that select the actions row, whitespace collapsed.
 *
 * Matching against the whole file works but makes every failure print 130KB of
 * CSS as the "received" value, which buries the thing that actually broke.
 */
function readActionRules(): string[] {
  const css = fs.readFileSync(GLOBALS, "utf8").replace(/\s+/g, " ");
  const blocks = css.match(/[^{}]*td\[data-mobile-actions\][^{}]*\{[^}]*\}/g) ?? [];
  return blocks.map((block) => block.trim());
}

/** The single block whose selector matches `predicate`, for readable failures. */
function findRule(rules: string[], predicate: (selector: string) => boolean): string | undefined {
  return rules.find((rule) => predicate(rule.slice(0, rule.indexOf("{"))));
}

describe("mobile row-actions invariant", () => {
  it("rows with one or two actions wrap instead of scrolling", () => {
    const rules = readActionRules();
    const wrapRule = findRule(rules, (s) => s.includes(":not(:has(> :nth-child(3)))"));

    expect(wrapRule ?? "NO :not(:has(> :nth-child(3))) RULE FOUND").toContain("flex-wrap: wrap");
  });

  it("rows that keep the scroller are selected by having a third action", () => {
    const rules = readActionRules();
    const scrollRule = findRule(
      rules,
      (s) => s.includes(":has(> :nth-child(3))") && !s.includes(":not(:has")
    );

    expect(scrollRule ?? "NO :has(> :nth-child(3)) RULE FOUND").toContain("flex-wrap: nowrap");
  });

  it("the surviving scroller paints a scroll shadow", () => {
    const rules = readActionRules();
    const scrollRule =
      findRule(rules, (s) => s.includes(":has(> :nth-child(3))") && !s.includes(":not(:has")) ?? "";

    // background-attachment local/scroll is what makes the shadow appear only
    // when there is content outside the box, with no JS measurement.
    expect(scrollRule).toContain("gradient");
    expect(scrollRule).toContain("local");
  });

  it("no unconditional nowrap rule is left to override the wrap branch", () => {
    const rules = readActionRules();

    // A bare `td[data-mobile-actions] > div { flex-wrap: nowrap }` with no
    // :has() qualifier would re-apply the scroller to every row and silently
    // undo the fix, while both branch assertions above still passed.
    const unqualified = rules.filter((rule) => {
      const selector = rule.slice(0, rule.indexOf("{"));
      return selector.includes(":where(div, span)") && !selector.includes(":has") && rule.includes("flex-wrap: nowrap");
    });

    expect(unqualified).toEqual([]);
  });
});
