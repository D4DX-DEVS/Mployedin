import { BROADCAST_ROLES } from "@/lib/communications/broadcastAudience";
import { tokenNames } from "@/lib/communications/whatsapp/tokens";
import { isValidTimeZone } from "@/lib/datetime/zone";
import { hasBlankParam, paramProblem, paramRule, type Translator, type WaSchedule, type WaTemplate } from "./shared";

export const SCHEDULE_ROLES = BROADCAST_ROLES;
export const TIMEZONES = ["Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Kuwait", "Asia/Bahrain", "Asia/Muscat", "Asia/Kolkata", "Europe/London", "UTC"];

/**
 * New parameter slots start with the first-name token only. A schedule's tokens are firstName, fullName,
 * role and title (the schedule's own name): there is no notification sentence, so the automations'
 * "{{message}}" default would go out empty. Any further slot is the admin's own text.
 */
export const SCHEDULE_DEFAULT_PARAMS: readonly string[] = ["{{firstName}}"];

/**
 * The tokens a schedule run fills in: firstName, fullName and role per recipient (audienceSend.ts) and
 * title, the schedule's name (whatsappSchedules.ts). Any other token resolves to "" and every send fails.
 * Automations are not checked against this: they take per-notification tokens of their own.
 */
export const SCHEDULE_TOKENS: readonly string[] = ["firstName", "fullName", "role", "title"];

export type RepeatFrequency = "daily" | "weekly" | "monthly";

/**
 * What the repeat picker holds. Weekdays are cron numbers (0 is Sunday). The day of the month stops at 28
 * so every month has it. The picker writes only three cron shapes (cronFromRepeat); the server's own
 * validation of the cron is unchanged.
 */
export interface Repeat {
  frequency: RepeatFrequency;
  hour: number;
  minute: number;
  weekdays: number[];
  dayOfMonth: number;
}

export const DEFAULT_REPEAT: Repeat = { frequency: "weekly", hour: 9, minute: 0, weekdays: [1], dayOfMonth: 1 };
/** The order the picker and the descriptions list weekdays in: Monday first. */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i);
export const DAYS_OF_MONTH: readonly number[] = Array.from({ length: 28 }, (_, i) => i + 1);

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Five-minute steps, plus the current minute when an API-set cron used another one, so the Select never shows blank. */
export function minuteOptions(current: number): number[] {
  const steps = Array.from({ length: 12 }, (_, i) => i * 5);
  return Number.isInteger(current) && current >= 0 && current < 60 && !steps.includes(current) ? [...steps, current].sort((a, b) => a - b) : steps;
}

/** The locale's own day name. 2023-01-01 was a Sunday, so day d is 1 + d January 2023. */
export function weekdayName(day: number, locale: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + day)));
}

function listOf(items: string[], locale: string): string {
  return typeof Intl.ListFormat === "function" ? new Intl.ListFormat(locale, { type: "conjunction" }).format(items) : items.join(", ");
}

/** "M H * * *", "M H * * d1,d2" (weekdays once each, ascending) or "M H D * *". */
export function cronFromRepeat(r: Repeat): string {
  const time = `${r.minute} ${r.hour}`;
  if (r.frequency === "daily") return `${time} * * *`;
  if (r.frequency === "weekly") return `${time} * * ${Array.from(new Set(r.weekdays)).sort((a, b) => a - b).join(",")}`;
  return `${time} ${r.dayOfMonth} * *`;
}

const PLAIN_NUMBER = /^(0|[1-9]\d?)$/;
const normalizeCron = (cron: string): string => cron.trim().split(/\s+/).join(" ");

/**
 * The picker's reading of a stored cron, or null for any shape it cannot express (ranges, steps, lists of
 * hours, days after the 28th…). Only the picker's own spelling counts: a cron it would write differently
 * (unsorted weekdays, leading zeros) is null too, so opening and saving a schedule never rewrites its timing.
 */
export function repeatFromCron(cron: string): Repeat | null {
  const fields = normalizeCron(cron).split(" ");
  if (fields.length !== 5) return null;
  const [m, h, dom, month, dow] = fields;
  if (!PLAIN_NUMBER.test(m) || !PLAIN_NUMBER.test(h) || month !== "*") return null;
  const base = { ...DEFAULT_REPEAT, hour: Number(h), minute: Number(m) };
  if (base.minute > 59 || base.hour > 23) return null;
  let repeat: Repeat | null = null;
  if (dom === "*" && dow === "*") repeat = { ...base, frequency: "daily" };
  else if (dom === "*" && /^[0-6](,[0-6])*$/.test(dow)) repeat = { ...base, frequency: "weekly", weekdays: dow.split(",").map(Number) };
  else if (dow === "*" && PLAIN_NUMBER.test(dom) && Number(dom) >= 1 && Number(dom) <= 28) repeat = { ...base, frequency: "monthly", dayOfMonth: Number(dom) };
  return repeat && cronFromRepeat(repeat) === fields.join(" ") ? repeat : null;
}

/** The repeat in words, for example "Every Monday and Thursday at 09:00". Day names come from Intl, in the page's locale. */
export function describeRepeat(r: Repeat, t: Translator, locale: string): string {
  const time = `${pad2(r.hour)}:${pad2(r.minute)}`;
  if (r.frequency === "daily") return t("repeatDescDaily", { time });
  // A string, not a number: ICU would format a number in the locale's digits, unlike the time beside it.
  if (r.frequency === "monthly") return t("repeatDescMonthly", { day: String(r.dayOfMonth), time });
  const days = WEEKDAY_ORDER.filter((d) => r.weekdays.includes(d)).map((d) => weekdayName(d, locale));
  return t("repeatDescWeekly", { days: listOf(days, locale), time });
}

export interface ScheduleForm {
  name: string;
  kind: "once" | "recurring";
  runAt: string;
  /** The stored cron, sent unchanged while `repeat` is null. */
  cron: string;
  /** The repeat picker; null only for a stored cron the picker cannot express ("custom timing"). */
  repeat: Repeat | null;
  timezone: string;
  /** A template is addressed by (name, language), as Meta and the send API do. */
  templateName: string;
  language: string;
  params: string[];
  targetAll: boolean;
  targetRoles: string[];
}

export const EMPTY_FORM: ScheduleForm = {
  name: "", kind: "once", runAt: "", cron: "", repeat: DEFAULT_REPEAT, timezone: "Asia/Dubai", templateName: "", language: "", params: [], targetAll: true, targetRoles: [],
};

/** One Select value for the (name, language) pair. Names are [a-z0-9_] and languages [a-z]{2}(_[A-Z]{2})?, so "::" never occurs in either. */
export const templateKey = (name: string, language: string): string => `${name}::${language}`;

/** The cron a save sends: the picker's, or the stored one while the picker holds a custom timing. */
const timingCron = (f: ScheduleForm): string => (f.repeat ? cronFromRepeat(f.repeat) : f.cron.trim());

export function toForm(s: WaSchedule): ScheduleForm {
  return {
    name: s.name,
    kind: s.kind,
    runAt: s.runAt ?? "",
    cron: s.cron ?? "",
    // A one-off has no cron: the picker starts from the default if the admin makes it repeat.
    repeat: s.cron ? repeatFromCron(s.cron) : DEFAULT_REPEAT,
    timezone: s.timezone,
    templateName: s.template.templateName,
    language: s.template.language,
    params: [...s.template.params],
    targetAll: s.audience.targetAll,
    targetRoles: [...s.audience.targetRoles],
  };
}

/**
 * A one-time schedule that has already fired. The tick switches a one-off off when it claims its run
 * (`enabled = false`), so a switched-off one-off whose time has passed (or that has none) is done, not
 * paused: the server refuses to resume it, and only a new future time makes it run again.
 */
export function isSpentOneOff(s: Pick<WaSchedule, "kind" | "enabled" | "runAt">, now: Date): boolean {
  return s.kind === "once" && !s.enabled && (!s.runAt || new Date(s.runAt).getTime() <= now.getTime());
}

/** The form's own part of a body, the same for POST and PATCH. */
function contentOf(f: ScheduleForm) {
  return {
    name: f.name.trim(),
    template: { templateName: f.templateName, language: f.language, params: f.params },
    audience: { targetAll: f.targetAll, targetRoles: f.targetAll ? [] : f.targetRoles },
  };
}

/**
 * Body for POST. Only the half of the timing that applies to the kind is sent. A one-off sends no
 * timezone: it is ignored for one-time schedules, the dialog hides the field, and the schema defaults it.
 */
export function toBody(f: ScheduleForm) {
  const { name, template, audience } = contentOf(f);
  return {
    name,
    kind: f.kind,
    runAt: f.kind === "once" ? new Date(f.runAt).toISOString() : undefined,
    cron: f.kind === "recurring" ? timingCron(f) : undefined,
    timezone: f.kind === "recurring" ? f.timezone.trim() : undefined,
    template,
    audience,
  };
}

const sameInstant = (a: string | undefined, b: string): boolean => a !== undefined && new Date(a).getTime() === new Date(b).getTime();

/**
 * Body for PATCH. Timing keys (kind, cron, runAt, timezone) go out only when they differ from the schedule
 * being edited: the route treats the presence of any of them as a timing change and recomputes `nextRunAt`,
 * so resending unchanged timing on a rename would skip an occurrence a paused or deferred schedule still owes.
 *
 * A fired one-off that gets a new future time is also switched back on (`enabled: true`): the route keeps
 * `enabled` as stored, so the new time would otherwise sit on a switched-off row and never run.
 */
export function toPatchBody(f: ScheduleForm, original: WaSchedule, now: Date) {
  const body: Record<string, unknown> = contentOf(f);
  const kindChanged = f.kind !== original.kind;
  if (kindChanged) body.kind = f.kind;
  if (f.kind === "once") {
    // A kind change always sends the half it needs, since the stored schedule has none (or a stale one).
    if (kindChanged || !sameInstant(original.runAt, f.runAt)) {
      const runAt = new Date(f.runAt);
      body.runAt = runAt.toISOString();
      if (isSpentOneOff(original, now) && runAt.getTime() > now.getTime()) body.enabled = true;
    }
  } else {
    // Compared with the spacing normalised on both sides: "0  9 * * 1" stored and "0 9 * * 1" picked are the same timing,
    // and so is a custom timing whose stored cron has repeated inner spaces (the server only trims it). What goes out is
    // the picker's cron, or the stored spelling untouched while the picker holds a custom timing.
    const cron = timingCron(f);
    if (kindChanged || normalizeCron(cron) !== normalizeCron(original.cron ?? "")) body.cron = cron;
    const timezone = f.timezone.trim();
    if (timezone !== original.timezone) body.timezone = timezone;
  }
  return body;
}

export type ParamError = { kind: "mismatch"; expected: number } | { kind: "blank" } | { kind: "unknownToken"; token: string };

/** A code per field, not a sentence: the dialog maps each to its own localized copy. */
export interface ScheduleErrors {
  name?: "required";
  template?: "required";
  params?: ParamError;
  runAt?: "required" | "past";
  repeat?: "days" | "time";
  timezone?: "invalid";
  audience?: "required";
}

/**
 * The server's checks it is cheap to repeat here, so the admin gets the reason beside the field in the
 * page's own language: the server's 400 text is English and may name internals. What this does not repeat
 * (a cron that never fires, a zone whose clocks shift by part of an hour) comes back as a 400 and the
 * dialog shows one generic "check the fields" message for it.
 * `willRun` is whether the schedule will be enabled after saving: only then must a one-time run be in the
 * future (a paused, already-fired one keeps its old time until the admin picks a new one).
 */
export function validateForm(f: ScheduleForm, approved: WaTemplate[] | null, opts: { willRun: boolean; now: Date }): ScheduleErrors {
  const errors: ScheduleErrors = {};
  if (!f.name.trim()) errors.name = "required";
  if (!f.templateName || !f.language) errors.template = "required";
  else {
    const problem = paramProblem(paramRule(approved, f.templateName, f.language), f.params);
    const unknownToken = f.params.flatMap(tokenNames).find((name) => !SCHEDULE_TOKENS.includes(name));
    if (problem?.kind === "mismatch") errors.params = problem;
    else if (hasBlankParam(f.params)) errors.params = { kind: "blank" };
    else if (unknownToken !== undefined) errors.params = { kind: "unknownToken", token: unknownToken };
  }
  // The zone only matters to a recurring schedule; the dialog hides the field for a one-off, so it is not judged there.
  if (f.kind === "recurring" && !isValidTimeZone(f.timezone.trim())) errors.timezone = "invalid";
  if (f.kind === "once") {
    const at = new Date(f.runAt);
    if (!f.runAt || Number.isNaN(at.getTime())) errors.runAt = "required";
    else if (opts.willRun && at.getTime() <= opts.now.getTime()) errors.runAt = "past";
  } else if (f.repeat) {
    // A custom timing (repeat null) is the stored cron, sent as it is: the server judges it.
    const { hour, minute } = f.repeat;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) errors.repeat = "time";
    else if (f.repeat.frequency === "weekly" && f.repeat.weekdays.length === 0) errors.repeat = "days";
  }
  if (!f.targetAll && f.targetRoles.length === 0) errors.audience = "required";
  return errors;
}

export const hasErrors = (errors: ScheduleErrors): boolean => Object.keys(errors).length > 0;
