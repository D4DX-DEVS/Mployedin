/**
 * Field-of-study families: which subjects count as "related" to each other.
 *
 * A short fixed list, like the skill groups in matchScore.ts — no AI call. A
 * job asking for "Computer Science" accepts an MCA as related, not as the same
 * field; a B.Com is a different field. Families were checked by eye against the
 * live data on 2026-11-12. Health is split by profession: an Ayurveda degree is
 * not a nursing degree.
 *
 * Pure, no I/O.
 */

interface FamilyRule {
  name: string;
  re: RegExp;
}

const w = (s: string) => `(?<![a-z])${s}(?![a-z])`;

const FAMILIES: FamilyRule[] = [
  {
    name: "computing",
    re: new RegExp(
      [
        "computer", "computing", "software", "information technology", w("it"), w("bca"), w("mca"), "cyber",
        "information security", "data science", w("cse"), "informatics", "artificial intelligence", w("pgdca"),
      ].join("|"),
    ),
  },
  {
    name: "business",
    re: new RegExp(
      [
        "commerce", "business", "management", w("bba"), w("bbm"), w("mba"), "finance", "accounting", "accountancy",
        w("b ?com"), w("m ?com"), "economics", "marketing", "human resource", w("hr"), w("hrm"), "logistics",
        "supply chain", "banking",
      ].join("|"),
    ),
  },
  { name: "civil", re: /civil|construction|structural|architecture|(?<![a-z])b ?arch(?![a-z])/ },
  { name: "mechanical", re: /mechanical|automobile|automotive|mechatronics/ },
  { name: "electrical", re: /electrical|electronics|(?<![a-z])ece(?![a-z])|(?<![a-z])eee(?![a-z])|instrumentation|telecommunication/ },
  { name: "nursing", re: /nursing|(?<![a-z])gnm(?![a-z])|(?<![a-z])anm(?![a-z])|midwifery/ },
  { name: "pharmacy", re: /pharmacy|pharmaceutical|(?<![a-z])pharm(?![a-z])|pharm ?d/ },
  { name: "medicine", re: /medicine|(?<![a-z])mbbs(?![a-z])|(?<![a-z])bds(?![a-z])|dental|ayurved|(?<![a-z])bams(?![a-z])|(?<![a-z])bhms(?![a-z])|homeopath|unani/ },
  { name: "allied_health", re: /physiotherapy|lab(?:oratory)? technolog|(?<![a-z])mlt(?![a-z])|radiolog|paramedical|medical imaging|optometry|cardiac/ },
  { name: "media", re: /mass communication|journalism|media|film|broadcast|public relations|visual communication/ },
  { name: "design", re: /design|fine art|visual art|animation|multimedia|graphic|fashion/ },
  { name: "teaching", re: /(?<![a-z])b ?ed(?![a-z])|(?<![a-z])m ?ed(?![a-z])|(?:bachelor|master|diploma|degree) (?:of|in) education|teaching|teacher|(?<![a-z])ttc(?![a-z])/ },
  { name: "hospitality", re: /hotel|hospitality|tourism|culinary|catering/ },
  { name: "law", re: /(?<![a-z])law(?![a-z])|(?<![a-z])llb(?![a-z])|(?<![a-z])llm(?![a-z])|legal/ },
  // A named subject is a field of its own: a BSc in Psychology is a different
  // field from Computer Science, not "field not stated" (live check
  // 2026-11-12). "science" / "arts" below stay generic: they say what kind of
  // degree, not which subject.
  { name: "natural_science", re: /physics|chemistry|mathematics|maths|biology|biotechnology|zoology|botany|microbiology|statistics|biochemistry|geology/ },
  { name: "humanities", re: /english|literature|history|sociology|psychology|political|philosophy|social work|(?<![a-z])msw(?![a-z])|geography|arabic|islamic|malayalam|hindi/ },
  { name: "science", re: /(?<![a-z])science(?![a-z])|(?<![a-z])b ?sc(?![a-z])|(?<![a-z])m ?sc(?![a-z])/ },
  { name: "arts", re: /(?<![a-z])arts(?![a-z])|(?<![a-z])b ?a(?![a-z])|(?<![a-z])m ?a(?![a-z])/ },
  { name: "engineering", re: /engineering|(?<![a-z])b ?tech(?![a-z])|(?<![a-z])m ?tech(?![a-z])/ },
];

/** Families that say "what kind of degree", not "what subject": never a field on their own. */
export const GENERIC_FAMILIES: ReadonlySet<string> = new Set(["engineering", "science", "arts"]);

/** The families a piece of education text belongs to. */
export function familiesOf(text: string): Set<string> {
  const flat = text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/computer science|data science|political science|library science|social science|pharmaceutical science/g, (m) =>
      m.replace(/ science$/, ""),
    )
    .replace(/fine arts|visual arts/g, (m) => m.replace(/ arts$/, " art"));
  const out = new Set<string>();
  for (const { name, re } of FAMILIES) if (re.test(flat)) out.add(name);
  return out;
}

/** True when the set names a real subject, not only "a science degree". */
export function hasSpecificFamily(families: ReadonlySet<string>): boolean {
  for (const f of families) if (!GENERIC_FAMILIES.has(f)) return true;
  return false;
}
