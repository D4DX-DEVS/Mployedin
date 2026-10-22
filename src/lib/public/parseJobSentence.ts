/**
 * Splits a sentence like "Nursing roles in Abu Dhabi" into the two things the
 * public jobs search filters on: a keyword and a place. Plain rules, no model
 * call — it runs in the browser while the visitor types.
 */
export interface ParsedJobSentence {
  /** Job title or keyword; empty when the sentence only named a place. */
  search: string;
  /** City or country, or "Remote"; empty when none was named. */
  location: string;
}

// Words that describe the search itself, not the job ("design jobs" → "design").
const FILLER = /\b(jobs?|roles?|positions?|vacanc(?:y|ies)|openings?|hiring|wanted|work)\b/gi;
const REMOTE = /\b(remote(?:ly)?|work(?:ing)? from home|wfh)\b|عن بعد/i;
// "in Dubai", "at Doha, live-in": up to three words, ended by a comma or a joining word.
const PLACE = /(?:^|\s)(?:in|at|near|around|في)\s+((?:[^\s,.;]+\s?){1,3}?)(?=$|[,.;]|\s(?:with|for|and|who|that|paying|earning|و)\b)/i;

function tidy(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[\s,.;-]+|[\s,.;-]+$/g, "");
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function parseJobSentence(sentence: string): ParsedJobSentence {
  let rest = tidy(sentence);
  if (!rest) return { search: "", location: "" };

  let location = "";
  if (REMOTE.test(rest)) {
    location = "Remote";
    rest = rest.replace(REMOTE, " ");
  } else {
    const place = rest.match(PLACE);
    if (place) {
      location = titleCase(tidy(place[1]));
      rest = rest.replace(place[0], " ");
    }
  }

  rest = tidy(rest.replace(/\s*[,;]\s*/g, " "));
  const withoutFiller = tidy(rest.replace(FILLER, " "));
  // "jobs in Dubai" leaves nothing but filler: that is a place-only search, not a search for "jobs".
  return { search: withoutFiller || (location ? "" : rest), location };
}
