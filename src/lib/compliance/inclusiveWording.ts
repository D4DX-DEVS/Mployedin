/**
 * Advisory wording checks for UK job adverts.
 *
 * GOV.UK guidance on advertising a job is that an advert must not state or
 * imply a requirement tied to a characteristic protected by the Equality Act
 * 2010. This module flags wording that commonly does that and offers a neutral
 * alternative, so the employer can make an informed edit.
 *
 * Deliberately advisory, never blocking: the platform cannot know an
 * employer's context (a genuine occupational requirement, a positive-action
 * scheme, or a role-neutral use of a flagged word), and clearing these checks
 * is not a determination that an advert is lawful.
 *
 * ponytail: a plain regex term list, not a classifier. It catches the common
 * phrasings; upgrade to a model-backed review only if the term list starts
 * producing more noise than signal.
 */

/** The nine characteristics protected by the Equality Act 2010. */
export type ProtectedCharacteristic =
  | "age"
  | "disability"
  | "gender_reassignment"
  | "marriage_civil_partnership"
  | "pregnancy_maternity"
  | "race"
  | "religion_belief"
  | "sex"
  | "sexual_orientation";

export interface WordingRule {
  characteristic: ProtectedCharacteristic;
  /** Case-insensitive pattern matched against the advert text. */
  pattern: RegExp;
  /** i18n key under `employerCompliance.suggestions` for the neutral rewrite. */
  suggestionKey: string;
}

export interface WordingFinding {
  characteristic: ProtectedCharacteristic;
  /** The exact text that matched, for showing back to the employer. */
  match: string;
  suggestionKey: string;
  /** Character offset of the match in the scanned text. */
  index: number;
}

/**
 * Word-boundary helper. Uses Unicode letter lookaround rather than `\b` so
 * hyphenated and accented forms behave ("young-and-dynamic", "café manager").
 */
const b = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "giu");

export const WORDING_RULES: readonly WordingRule[] = [
  // ── Age ────────────────────────────────────────────────────────────────
  {
    characteristic: "age",
    pattern: b("young|youthful|youngster|mature|elderly|older person"),
    suggestionKey: "ageDescriptor",
  },
  {
    characteristic: "age",
    pattern: b("recent graduate|new graduate|fresh graduate|school[- ]leaver|digital native"),
    suggestionKey: "ageProxy",
  },
  {
    characteristic: "age",
    pattern:
      /(?<!\p{L})(?:under|over|aged?|max(?:imum)?|no more than)\s+\d{1,2}\s*(?:years?\s*(?:old|of age)|\+|yrs?)/giu,
    suggestionKey: "ageLimit",
  },
  {
    characteristic: "age",
    pattern: b("energetic|high[- ]energy|vibrant"),
    suggestionKey: "ageEnergy",
  },

  // ── Sex ────────────────────────────────────────────────────────────────
  {
    characteristic: "sex",
    pattern: b(
      "salesman|salesmen|saleswoman|saleswomen|foreman|foremen|chairman|chairmen|chairwoman|" +
        "handyman|handymen|craftsman|craftsmen|workmanship|manpower|man[- ]hours|" +
        "waitress|barman|barmaid|stewardess|cleaning lady|male nurse"
    ),
    suggestionKey: "genderedJobTitle",
  },
  {
    characteristic: "sex",
    pattern: b("males?|females?|men only|women only|ladies|gentlemen|girls|boys"),
    suggestionKey: "genderedRequirement",
  },

  // ── Race / nationality ─────────────────────────────────────────────────
  {
    characteristic: "race",
    pattern: b(
      "british only|uk nationals? only|native english speaker|native speaker|" +
        "mother[- ]tongue english|english as a first language"
    ),
    suggestionKey: "nativeSpeaker",
  },
  {
    characteristic: "race",
    pattern: b("must be (?:british|english|white|asian|black)|no (?:foreigners|immigrants)"),
    suggestionKey: "nationalityRequirement",
  },
  {
    characteristic: "race",
    pattern: b("good cultural fit|culture fit|cultural fit"),
    suggestionKey: "cultureFit",
  },

  // ── Disability / health ────────────────────────────────────────────────
  {
    characteristic: "disability",
    pattern: b(
      "able[- ]bodied|physically fit|fit and healthy|no health (?:issues|problems|conditions)|" +
        "excellent health|must be able to stand|must be able to walk|must be able to lift|" +
        "no disabilities|clean bill of health|perfect eyesight"
    ),
    suggestionKey: "physicalRequirement",
  },
  {
    characteristic: "disability",
    pattern: b("no sick (?:leave|days)|excellent attendance record|no absence"),
    suggestionKey: "attendanceRequirement",
  },

  // ── Religion or belief ─────────────────────────────────────────────────
  {
    characteristic: "religion_belief",
    pattern: b(
      "christian|muslim|jewish|hindu|sikh|buddhist|catholic|protestant|atheist|church[- ]going"
    ),
    suggestionKey: "religionRequirement",
  },
  {
    characteristic: "religion_belief",
    pattern: b("must work sundays|sunday working (?:essential|required)|no religious observance"),
    suggestionKey: "religiousObservance",
  },

  // ── Pregnancy / maternity ──────────────────────────────────────────────
  {
    characteristic: "pregnancy_maternity",
    pattern: b(
      "not pregnant|no maternity|no career breaks?|no employment gaps?|" +
        "continuous employment history|no plans to (?:start a family|have children)"
    ),
    suggestionKey: "pregnancyRequirement",
  },

  // ── Marriage / civil partnership ───────────────────────────────────────
  {
    characteristic: "marriage_civil_partnership",
    pattern: b("unmarried|no dependants|no children|childless|family status|marital status"),
    suggestionKey: "maritalRequirement",
  },

  // ── Sexual orientation ─────────────────────────────────────────────────
  {
    characteristic: "sexual_orientation",
    pattern: b("heterosexual|homosexual|lesbian|sexual orientation"),
    suggestionKey: "orientationRequirement",
  },

  // ── Gender reassignment ────────────────────────────────────────────────
  {
    characteristic: "gender_reassignment",
    pattern: b("biologically (?:male|female)|born (?:male|female)|real (?:man|woman)|transsexual"),
    suggestionKey: "genderReassignmentRequirement",
  },
];

/**
 * Screening questions get a stricter list than advert prose: asking a
 * candidate directly for a protected characteristic is far harder to justify
 * than the same word appearing in a description.
 */
export const SCREENING_QUESTION_RULES: readonly WordingRule[] = [
  {
    characteristic: "age",
    pattern: b("age|how old|date of birth|dob|birth ?date|year of birth|birthday"),
    suggestionKey: "askAge",
  },
  {
    characteristic: "marriage_civil_partnership",
    pattern: b("marital status|married|civil partnership|spouse|dependants|children|kids"),
    suggestionKey: "askMaritalStatus",
  },
  {
    characteristic: "pregnancy_maternity",
    pattern: b("pregnan(?:t|cy)|expecting|maternity|planning a family"),
    suggestionKey: "askPregnancy",
  },
  {
    characteristic: "disability",
    pattern: b(
      "disabilit(?:y|ies)|disabled|health condition|medical condition|illness|mental health|" +
        "sick (?:leave|days)|impairment|long[- ]term condition"
    ),
    suggestionKey: "askHealth",
  },
  {
    characteristic: "race",
    pattern: b(
      "ethnicity|ethnic (?:origin|background)|race|nationality|country of birth|" +
        "native language|first language"
    ),
    suggestionKey: "askEthnicity",
  },
  {
    characteristic: "religion_belief",
    pattern: b("religion|religious|faith|belief|church|mosque|synagogue|temple"),
    suggestionKey: "askReligion",
  },
  {
    characteristic: "sex",
    pattern: b("gender|sex|male or female"),
    suggestionKey: "askGender",
  },
  {
    characteristic: "sexual_orientation",
    pattern: b("sexual orientation|sexuality"),
    suggestionKey: "askOrientation",
  },
  {
    characteristic: "gender_reassignment",
    pattern: b("gender identity|gender reassignment|trans(?:gender)? status|sex assigned at birth"),
    suggestionKey: "askGenderIdentity",
  },
];

/**
 * Scan text against a rule set. Returns at most one finding per rule so a word
 * repeated ten times does not produce ten warnings.
 */
export function checkWording(
  text: string,
  rules: readonly WordingRule[] = WORDING_RULES
): WordingFinding[] {
  if (!text || !text.trim()) return [];

  const findings: WordingFinding[] = [];

  for (const rule of rules) {
    // Reset before each scan — these module-level regexes carry the /g flag,
    // so a stale lastIndex would make the same rule miss on the next call.
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (!match) continue;

    findings.push({
      characteristic: rule.characteristic,
      match: match[0],
      suggestionKey: rule.suggestionKey,
      index: match.index,
    });
  }

  return findings;
}

/** Convenience wrapper for a whole advert: title + description + list fields. */
export function checkAdvert(parts: {
  title?: string;
  description?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
}): WordingFinding[] {
  const text = [
    parts.title ?? "",
    parts.description ?? "",
    ...(parts.responsibilities ?? []),
    ...(parts.qualifications ?? []),
    ...(parts.benefits ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  return checkWording(text, WORDING_RULES);
}

/**
 * A narrow experience band reads as a proxy for age even when no age is
 * mentioned ("1–2 years' experience" screens out career changers and returners).
 * Flags tight caps only, never a minimum on its own.
 */
export function checkExperienceCap(min: number, max: number): boolean {
  return max > 0 && max <= 3 && max - min <= 2;
}
