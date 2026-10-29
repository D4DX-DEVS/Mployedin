/**
 * Turns a sanitised legal page body into a layered page (ICO: give the key
 * points first, the detail one step away). Runs in the browser after
 * sanitizePublicHtml, which strips `id` and `<details>`, so the anchors and
 * fold-outs added here are ours, never the CMS author's:
 *
 *  - every <h2> gets an id (`section-1`, `section-2`, …) for the contents list;
 *  - every table (and the scroll wrapper the cookie policy puts round it) folds
 *    into a <details> whose summary reads "Show the list (N)" closed and
 *    "Hide the list" open, so the long cookie
 *    tables stop filling the screen while the prose around them stays open.
 */
export interface LegalSection {
  id: string;
  title: string;
}

export interface LegalLayout {
  html: string;
  sections: LegalSection[];
}

export function layoutLegalHtml(
  sanitised: string,
  labels: { show: (rows: number) => string; hide: string },
  doc: Document = document,
): LegalLayout {
  const root = doc.createElement("div");
  root.innerHTML = sanitised;

  const sections: LegalSection[] = [];
  root.querySelectorAll("h2").forEach((h2, i) => {
    const id = `section-${i + 1}`;
    h2.id = id;
    sections.push({ id, title: (h2.textContent ?? "").trim() });
  });

  root.querySelectorAll("table").forEach((table) => {
    const parent = table.parentElement;
    // The cookie policy wraps each table in a horizontal-scroll div; fold the wrapper, not just the table.
    const target = parent && parent !== root && parent.children.length === 1 ? parent : table;
    // Rows with data cells: a browser puts a bare table's header row inside an implied <tbody> too.
    const rows = Array.from(table.querySelectorAll("tr")).filter((row) => row.querySelector("td")).length;
    const details = doc.createElement("details");
    details.className = "legal-fold";
    const summary = doc.createElement("summary");
    // Both wordings sit in the summary; CSS shows the one that fits the open state.
    const show = doc.createElement("span");
    show.className = "legal-fold-show";
    show.textContent = labels.show(rows);
    const hide = doc.createElement("span");
    hide.className = "legal-fold-hide";
    hide.textContent = labels.hide;
    summary.append(show, hide);
    target.replaceWith(details);
    details.append(summary, target);
  });

  return { html: root.innerHTML, sections };
}
