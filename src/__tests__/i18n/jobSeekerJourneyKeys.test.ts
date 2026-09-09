import IntlMessageFormat from "intl-messageformat";
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  type MessageFormatElement,
} from "@formatjs/icu-messageformat-parser";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";

type Ns = Record<string, unknown>;
const enAll = en as unknown as Record<string, Ns>;
const arAll = ar as unknown as Record<string, Ns>;

function get(ns: Ns | undefined, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Ns)[k] : undefined), ns);
}

/**
 * Recursively collects every named-argument reference in a parsed ICU AST.
 * `#` (a plural's own running value) is not a named argument and is never
 * counted. A plural/select element's own selector argument IS counted, and
 * every one of its branches is walked too, so a placeholder referenced only
 * inside a single plural/select branch is still found.
 */
function collectArgNames(elements: MessageFormatElement[], names: Set<string> = new Set()): Set<string> {
  for (const el of elements) {
    if (isArgumentElement(el) || isNumberElement(el) || isDateElement(el) || isTimeElement(el)) {
      names.add(el.value);
    } else if (isPluralElement(el) || isSelectElement(el)) {
      names.add(el.value);
      for (const option of Object.values(el.options)) {
        collectArgNames(option.value, names);
      }
    } else if (isTagElement(el)) {
      collectArgNames(el.children, names);
    }
    // literal and pound (`#`) elements carry no argument name.
  }
  return names;
}

function argNamesOf(message: string, locale: string): Set<string> {
  return collectArgNames(new IntlMessageFormat(message, locale).getAst());
}

/** key → sample ICU arguments, so the message is compiled, not just present. */
const REQUIRED: Record<string, Record<string, unknown>> = {
  "jobSeekerJourney.title": {},
  "jobSeekerJourney.navLabel": {},
  "jobSeekerJourney.attention": { title: "Interviews", count: 2 },
  "jobSeekerJourney.contextApplications": { total: 27, active: 8 },
  "jobSeekerJourney.contextInterviews": { upcoming: "1", past: "8" },
  "jobSeekerJourney.contextOffers": { pending: "1", accepted: "1" },
  "jobSeekerJourney.contextOnboarding": { count: 0 },
  "jobSeekerInterviews.view.list": {},
  "jobSeekerInterviews.view.calendar": {},
  "jobSeekerInterviews.statusFiltersLabel": {},
  "jobSeekerOffers.statusFiltersLabel": {},
};

const DELETED = [
  "jobSeekerApplications.summary",
  "jobSeekerInterviews.summary",
  "jobSeekerOffers.header",
  "jobSeekerOnboarding.subtitle",
  "jobSeekerOnboarding.backToApplications",
];

describe("job-seeker journey keys", () => {
  it.each(Object.entries(REQUIRED))("%s exists in en and ar and compiles as ICU", (path, args) => {
    for (const [locale, all] of [["en", enAll], ["ar", arAll]] as const) {
      const [ns, ...rest] = path.split(".");
      const value = get(all[ns], rest.join("."));
      expect(typeof value).toBe("string");
      expect(() => new IntlMessageFormat(value as string, locale).format(args)).not.toThrow();
    }
  });

  it.each(Object.keys(REQUIRED))("%s references the same argument names in en and ar", (path) => {
    const [ns, ...rest] = path.split(".");
    const enValue = get(enAll[ns], rest.join(".")) as string;
    const arValue = get(arAll[ns], rest.join(".")) as string;
    expect(argNamesOf(arValue, "ar")).toEqual(argNamesOf(enValue, "en"));
  });

  it.each(DELETED)("%s is gone from both locales", (path) => {
    const [ns, ...rest] = path.split(".");
    expect(get(enAll[ns], rest.join("."))).toBeUndefined();
    expect(get(arAll[ns], rest.join("."))).toBeUndefined();
  });

  it("never uses the banned 'Failed to' copy", () => {
    for (const all of [enAll, arAll]) {
      expect(JSON.stringify(all.jobSeekerJourney)).not.toMatch(/Failed to/);
    }
  });
});
