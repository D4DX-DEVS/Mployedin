/**
 * Who is making the AI call.
 *
 * About twenty call sites reach a provider and none of them knows the caller.
 * Rather than thread a user through every signature, the auth wrapper opens one
 * of these around each request handler; the provider layer reads it when the
 * response arrives and logs the call against that person. A call made with no
 * context (a cron job, a script) is logged as role "system".
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { AiFeature } from "./aiFeatures";

export interface AiCaller {
  /** The real actor. In tenant view this is the staff member, not the employer. */
  userId?: string | null;
  role: string;
  /** Owner user of the employer account the call belongs to, when there is one. */
  employerUserId?: string | null;
  /** Employer id, when the route already knows it (tagged by the route). */
  employerId?: string | null;
  /** Staff acting for an employer rather than on their own work. */
  onBehalf?: boolean;
  feature?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<AiCaller>();

export function runWithAiCaller<T>(caller: AiCaller, fn: () => T): T {
  return storage.run({ ...caller }, fn);
}

/**
 * For routes that read their own session instead of using `withAuth`: wrap the
 * handler once, and the quota check (which every AI route calls with the signed-in
 * user) fills in who is calling. Each request gets its own context, so overlapping
 * requests never see each other's caller.
 */
export function withAiContext<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  return (...args: A) => storage.run({ role: "system" }, () => handler(...args));
}

/**
 * Names the caller on the current request's context, once. Does nothing outside a
 * wrapped request, and never overwrites a caller that is already named (`withAuth`
 * names the real actor and the employer, which is more than a quota check knows).
 */
export function identifyAiCaller(caller: AiCaller): void {
  const store = storage.getStore();
  if (!store || store.userId) return;
  Object.assign(store, caller);
}

export function getAiCaller(): AiCaller | undefined {
  return storage.getStore();
}

/** Let a route say which employer a call is for (e.g. an agent's job assistant). */
export function tagAiEmployer(employerId: string, onBehalf = true): void {
  const store = storage.getStore();
  if (!store) return;
  store.employerId = employerId;
  if (onBehalf) store.onBehalf = true;
}

export { AI_FEATURES, type AiFeature } from "./aiFeatures";

const PATH_FEATURES: Array<[RegExp, AiFeature]> = [
  [/\/api\/ai\/job-assist/, "job_assistant"],
  [/\/api\/ai\/(job-extract|job-description|skills-suggest|skills-gap|enhance-text)/, "job_assistant"],
  [/\/api\/ai\/(cv-extract|cv-assistant|profile-fill|ats-check|generate-summary|speech-to-text)/, "cv_reading"],
  [/\/api\/ai\/(match|screen-candidates)/, "job_matching"],
  [/\/api\/ai\/poster/, "poster"],
  [/\/api\/ai\/(copilot|chat)/, "copilot"],
  [/\/api\/ai\/(report|daily-insights|salary-benchmark)/, "market_report"],
  [/\/api\/ai\/(lead-|email-draft)/, "lead_tools"],
  [/\/api\/ai\/interview/, "interview"],
  [/filters|search/, "search"],
];

/** Feature for a request path, or "other". */
export function featureFromPath(path: string | undefined): AiFeature {
  if (!path) return "other";
  for (const [re, feature] of PATH_FEATURES) if (re.test(path)) return feature;
  return "other";
}
