/**
 * @jest-environment jsdom
 */
import { layoutLegalHtml } from "@/lib/cms/legalLayout";

const summary = { show: (rows: number) => `Show the list (${rows})`, hide: "Hide the list" };

describe("layoutLegalHtml", () => {
  it("gives every h2 an anchor and lists them as sections", () => {
    const { html, sections } = layoutLegalHtml("<h2>1. Intro</h2><p>a</p><h2>2. Rights</h2>", summary);
    expect(sections).toEqual([{ id: "section-1", title: "1. Intro" }, { id: "section-2", title: "2. Rights" }]);
    expect(html).toContain('<h2 id="section-1">1. Intro</h2>');
  });

  it("folds a table with its scroll wrapper into details, counting body rows", () => {
    const { html } = layoutLegalHtml(
      '<p>before</p><div class="overflow-x-auto"><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table></div><p>after</p>',
      summary,
    );
    expect(html).toBe(
      '<p>before</p><details class="legal-fold"><summary><span class="legal-fold-show">Show the list (2)</span><span class="legal-fold-hide">Hide the list</span></summary><div class="overflow-x-auto"><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table></div></details><p>after</p>',
    );
  });

  it("folds a bare table and leaves prose untouched", () => {
    const { html } = layoutLegalHtml("<p>x</p><table><tr><th>h</th></tr><tr><td>1</td></tr></table>", summary);
    expect(html).toMatch(/^<p>x<\/p><details class="legal-fold"><summary><span class="legal-fold-show">Show the list \(1\)<\/span><span class="legal-fold-hide">Hide the list<\/span><\/summary><table>/);
  });
});
