/**
 * Minimal English singularizer for dialog titles (BUG-011).
 *
 * The admin dialogs used to build their titles with `title.replace(/s$/, "")`,
 * which produced "Add Industrie" (Industries), "Add FAQ{s}" leftovers, and
 * would have turned "Marital Status" into "Marital Statu". Covers exactly the
 * shapes our titles take:
 *   - "…ies"  → "…y"   (Industries → Industry, Job categories → Job category)
 *   - "…(s)s" / "…us" → unchanged (Status → Status)
 *   - trailing single "s" → stripped (Genders → Gender, FAQs → FAQ, Videos → Video)
 *   - anything else → unchanged
 */
export function singularizeTitle(title: string): string {
  const words = title.split(" ");
  const last = words[words.length - 1];
  let singular = last;
  if (/ies$/i.test(last)) {
    singular = last.replace(/ies$/i, "y");
  } else if (/(ss|us)$/i.test(last)) {
    singular = last;
  } else if (/s$/i.test(last)) {
    singular = last.replace(/s$/i, "");
  }
  if (singular === last) return title;
  return [...words.slice(0, -1), singular].join(" ");
}
