/**
 * Deal-breaker screening questions — Indeed's "required answer" rule.
 *
 * An employer can mark a screening question as a knockout and say which
 * answers qualify ("Valid UAE driving licence?" → "Yes"; "Years of GCC
 * experience?" → at least 2). A candidate whose answer does not qualify fails
 * that requirement, the same way a candidate short on experience does.
 *
 * The qualifying answers are the employer's private rule. They are stored on
 * `Job.screeningKnockouts`, apart from the public `screeningQuestions`, so
 * every place that serves a question to a seeker — the public job page, the
 * easy-apply dialogs, the jobs API — cannot leak the right answer by
 * forgetting to strip it. The job forms edit both as one object; the API
 * splits them on the way in and merges them back for the owner.
 *
 * A question can instead carry a PREFERRED answer ("FMCG experience?" → "Yes"
 * is a plus, not a must): stored the same private way, shown on the checklist,
 * adding to the score but never excluding anyone.
 */

/** Question types a knockout can be set on, and which rule each takes. */
export const KNOCKOUT_OPTION_TYPES = ["select", "radio", "checkbox"] as const;
export const KNOCKOUT_NUMBER_TYPES = ["number"] as const;

export interface KnockoutRule {
  questionId: string;
  /** select / radio / checkbox: any of these answers qualifies. */
  acceptedAnswers?: string[];
  /** number: an answer at or above this qualifies. */
  minValue?: number;
  /** A nice-to-have, not a deal-breaker: counts toward the score, never excludes. */
  preferred?: boolean;
}

/** A screening question as the job forms and the API carry it, knockout included. */
export interface ScreeningQuestionWithKnockout {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  order?: number;
  knockout?: boolean;
  /** A preferred answer rather than a required one. Ignored when `knockout` is set. */
  preferred?: boolean;
  acceptedAnswers?: string[];
  minValue?: number;
}

export type KnockoutOutcome = "met" | "not_met" | "unknown";

const norm = (value: string) => value.trim().toLowerCase();

function isOptionType(type: string): boolean {
  return (KNOCKOUT_OPTION_TYPES as readonly string[]).includes(type);
}

function isNumberType(type: string): boolean {
  return (KNOCKOUT_NUMBER_TYPES as readonly string[]).includes(type);
}

/**
 * The rule a question carries, or null when it is not a usable knockout.
 *
 * A knockout with nothing to check against is dropped rather than stored: an
 * option rule must name at least one of the question's own options, a number
 * rule a finite minimum. A rule that could never be met — or never be failed —
 * would silently decide every candidate.
 */
export function knockoutRuleOf(question: ScreeningQuestionWithKnockout): KnockoutRule | null {
  if (!question.knockout && !question.preferred) return null;
  // A deal-breaker wins when both are set: the stricter reading.
  const mode = question.knockout ? {} : { preferred: true as const };
  if (isOptionType(question.type)) {
    const options = new Set((question.options ?? []).map(norm).filter(Boolean));
    const accepted = (question.acceptedAnswers ?? [])
      .map((answer) => answer.trim())
      .filter((answer) => answer && options.has(norm(answer)));
    const unique = [...new Map(accepted.map((answer) => [norm(answer), answer])).values()];
    return unique.length > 0 ? { questionId: question.id, acceptedAnswers: unique, ...mode } : null;
  }
  if (isNumberType(question.type)) {
    return typeof question.minValue === "number" && Number.isFinite(question.minValue)
      ? { questionId: question.id, minValue: question.minValue, ...mode }
      : null;
  }
  return null;
}

/**
 * Split form input into the public questions and the private knockout rules.
 *
 * A knockout question is always required: a deal-breaker a candidate may skip
 * would only ever resolve to "unknown". A preferred answer leaves the question
 * as the employer set it — skipping a nice-to-have costs only its points.
 */
export function splitScreeningQuestions<Q extends ScreeningQuestionWithKnockout>(
  input: readonly Q[],
): {
  questions: Array<Omit<Q, "knockout" | "preferred" | "acceptedAnswers" | "minValue"> & { required?: boolean }>;
  knockouts: KnockoutRule[];
} {
  const knockouts: KnockoutRule[] = [];
  const questions = input.map((question) => {
    const { knockout: _knockout, preferred: _preferred, acceptedAnswers: _accepted, minValue: _min, ...rest } = question;
    const rule = knockoutRuleOf(question);
    if (rule) knockouts.push(rule);
    return rule && !rule.preferred ? { ...rest, required: true } : rest;
  });
  return { questions, knockouts };
}

/** The owner's view: each question with its knockout rule folded back in. */
export function mergeScreeningKnockouts<Q extends { id: string }>(
  questions: readonly Q[],
  knockouts: readonly KnockoutRule[] | null | undefined,
): Array<Q & { knockout: boolean; preferred?: boolean; acceptedAnswers?: string[]; minValue?: number }> {
  const byId = new Map((knockouts ?? []).map((rule) => [rule.questionId, rule]));
  return questions.map((question) => {
    const rule = byId.get(question.id);
    if (!rule) return { ...question, knockout: false };
    return {
      ...question,
      knockout: !rule.preferred,
      ...(rule.preferred ? { preferred: true } : {}),
      ...(rule.acceptedAnswers ? { acceptedAnswers: [...rule.acceptedAnswers] } : {}),
      ...(typeof rule.minValue === "number" ? { minValue: rule.minValue } : {}),
    };
  });
}

function answerStrings(answer: unknown): string[] {
  if (answer === null || answer === undefined) return [];
  if (Array.isArray(answer)) return answer.flatMap(answerStrings);
  if (typeof answer === "boolean") return [answer ? "yes" : "no"];
  const text = String(answer).trim();
  return text ? [text] : [];
}

/** Whether one candidate's answer satisfies one knockout rule. */
export function evaluateKnockout(rule: KnockoutRule, answer: unknown): KnockoutOutcome {
  const given = answerStrings(answer);
  if (given.length === 0) return "unknown";

  if (typeof rule.minValue === "number") {
    const value = Number(given[0]);
    if (!Number.isFinite(value)) return "not_met";
    return value >= rule.minValue ? "met" : "not_met";
  }

  const accepted = new Set((rule.acceptedAnswers ?? []).map(norm));
  if (accepted.size === 0) return "unknown";
  // Multi-select: one qualifying choice is enough ("GCC licence" among several).
  return given.some((value) => accepted.has(norm(value))) ? "met" : "not_met";
}

/** Human-readable form of what a rule accepts, for the employer's checklist. */
export function describeKnockout(rule: KnockoutRule): string {
  if (typeof rule.minValue === "number") return `≥ ${rule.minValue}`;
  return (rule.acceptedAnswers ?? []).join(" / ");
}
