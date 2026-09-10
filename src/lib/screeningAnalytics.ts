/**
 * Aggregation behind the employer's Screening Questions Analytics page.
 *
 * It lives outside the route because the shape of a stored answer is the
 * subtle part: `Application.screeningAnswers[].answer` is `Schema.Types.Mixed`,
 * so a checkbox arrives as a real array, a plain field as a string, and a
 * skipped optional question as `""` — the apply form posts an entry for every
 * question, answered or not.
 */

/** A stored answer, in every shape the Mixed field actually holds. */
export type ScreeningAnswerValue = string | string[] | boolean;

export interface ScreeningQuestionInput {
  id: string;
  label: string;
  type: string;
  options?: string[];
}

export interface ScreeningApplicationInput {
  screeningAnswers?: { questionId: string; answer: ScreeningAnswerValue }[];
}

export interface ScreeningQuestionAnalytics {
  questionId: string;
  label: string;
  type: string;
  /** Applications that gave this question a non-empty answer. */
  totalResponses: number;
  distribution?: Record<string, number>;
  sampleAnswers?: string[];
  numericStats?: { avg: number; min: number; max: number };
  dateStats?: { earliest: string; latest: string };
}

const CHOICE_TYPES = ["select", "radio", "checkbox"];
const TEXT_TYPES = ["text", "textarea"];
const SAMPLE_LIMIT = 10;

/**
 * Every value a single answer carries, blanks removed. A checkbox yields one
 * entry per ticked option — counting the array as a whole is what used to
 * stringify "React,Node" into the Other bucket.
 */
function toValues(answer: ScreeningAnswerValue | undefined): string[] {
  if (answer === undefined || answer === null) return [];
  if (Array.isArray(answer)) {
    return answer.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof answer === "boolean") return [answer ? "Yes" : "No"];
  const value = String(answer).trim();
  return value ? [value] : [];
}

export function aggregateScreeningAnswers(
  questions: ScreeningQuestionInput[],
  applications: ScreeningApplicationInput[]
): ScreeningQuestionAnalytics[] {
  return questions.map((q) => {
    // One entry per application that answered this question, blanks dropped:
    // an unticked optional question is not a response.
    const responses = applications
      .map((app) => app.screeningAnswers?.find((a) => a.questionId === q.id))
      .map((answer) => toValues(answer?.answer))
      .filter((values) => values.length > 0);

    const totalResponses = responses.length;
    const flat = responses.flat();

    let distribution: Record<string, number> | undefined;
    if (q.options?.length && CHOICE_TYPES.includes(q.type)) {
      distribution = Object.fromEntries(q.options.map((opt) => [opt, 0]));
      for (const value of flat) {
        if (value in distribution) distribution[value]++;
        // Only real strays open an Other bucket — an all-known set must not
        // grow a phantom zero row.
        else distribution.Other = (distribution.Other ?? 0) + 1;
      }
    }

    let sampleAnswers: string[] | undefined;
    if (TEXT_TYPES.includes(q.type)) {
      sampleAnswers = flat.slice(0, SAMPLE_LIMIT);
    }

    let numericStats: { avg: number; min: number; max: number } | undefined;
    if (q.type === "number") {
      const nums = flat.map((v) => parseFloat(v)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        numericStats = {
          avg: Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length),
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    }

    let dateStats: { earliest: string; latest: string } | undefined;
    if (q.type === "date") {
      // Sorted on the parsed timestamp but reported as the value the candidate
      // gave, so the page renders their own formatting rather than a re-derived
      // date that can slip a day across time zones.
      const parsed = flat
        .map((value) => ({ value, time: Date.parse(value) }))
        .filter((d) => !Number.isNaN(d.time))
        .sort((a, b) => a.time - b.time);
      if (parsed.length > 0) {
        dateStats = { earliest: parsed[0].value, latest: parsed[parsed.length - 1].value };
      }
    }

    return { questionId: q.id, label: q.label, type: q.type, totalResponses, distribution, sampleAnswers, numericStats, dateStats };
  });
}
