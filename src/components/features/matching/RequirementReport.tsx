"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, CircleDashed, CircleMinus, HelpCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportItem, ReportKind, ReportVerdict, RequirementReport as Report } from "@/lib/matching/requirementReport";

/**
 * Every requirement the job states, one row each: what the job asks, what this
 * candidate shows, and the verdict — Has / Partly / Does not have / Needs
 * checking. The employer sees it per applicant; the seeker sees it, in their
 * own voice ("You have…"), on the job page. Status is never colour alone: each
 * row carries an icon and a word.
 */

const VERDICT_STYLE: Record<ReportVerdict, { icon: typeof CheckCircle2; className: string }> = {
  has: { icon: CheckCircle2, className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  partial: { icon: CircleDashed, className: "text-amber-800 bg-amber-50 border-amber-200" },
  missing: { icon: CircleMinus, className: "text-rose-700 bg-rose-50 border-rose-200" },
  verify: { icon: HelpCircle, className: "text-slate-700 bg-slate-50 border-slate-200" },
  // Not asked by the job — shown for information, no points (D19).
  info: { icon: Info, className: "text-sky-800 bg-sky-50 border-sky-200" },
};

const KIND_ORDER: ReportKind[] = ["education", "experience", "skill", "credential", "language", "preferred_skill", "visa"];

interface Props {
  report: Report;
  /** "employer" speaks about the candidate; "seeker" speaks to them. */
  audience: "employer" | "seeker";
  /**
   * One line per requirement — what the job asks and the verdict — without
   * the evidence line or the summary. For narrow columns (Compare).
   */
  compact?: boolean;
  /**
   * "gaps": only the rows that are not fully met (partly / missing / not on
   * the profile) — what the seeker can act on. Nothing to list is not an
   * error there: the summary line alone is the answer.
   */
  rows?: "all" | "gaps";
  /** The must-have badge and counts above the rows. Off where a parent already shows them. */
  summary?: boolean;
  className?: string;
}

const GAP_VERDICTS: ReadonlySet<ReportVerdict> = new Set<ReportVerdict>(["partial", "missing", "verify"]);
const SKILL_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>(["skill", "preferred_skill"]);

/** Rows of a report that are not fully met. */
export function reportGaps(report: Report): ReportItem[] {
  return report.items.filter((item) => GAP_VERDICTS.has(item.verdict));
}

export function RequirementReport({ report, audience, compact = false, rows = "all", summary = true, className }: Props) {
  const t = useTranslations("requirementReport");
  // "Not set for this job" rows are for the employer's eye (what the candidate
  // holds, unasked); to the seeker they say nothing they can use.
  const visible =
    rows === "gaps" ? reportGaps(report) : report.items.filter((item) => audience === "employer" || item.verdict !== "info");
  const groups = KIND_ORDER.map((kind) => ({ kind, items: visible.filter((i) => i.kind === kind) })).filter(
    (g) => g.items.length > 0,
  );
  if (groups.length === 0 && rows !== "gaps") {
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("none")}</p>;
  }

  if (compact) {
    return (
      <ul className={cn("space-y-1.5", className)}>
        {groups.flatMap((group) => group.items).map((item, i) => (
          <CompactRow key={`${item.kind}-${i}`} item={item} audience={audience} />
        ))}
      </ul>
    );
  }

  const m = report.mustHaves;
  // Nothing asked, only rows shown for information: no verdict to summarise.
  const onlyInfo = report.items.every((item) => item.verdict === "info");
  const showSummary = summary && !onlyInfo;
  if (!showSummary && groups.length === 0) return null;
  return (
    <div className={cn("space-y-4", className)}>
      {showSummary && (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* "met" lets Partly through (it is not a miss), but the badge must
            not say "meets all" when a must-have is only partly there. */}
        <StatusBadge status={report.status === "met" && m.partial > 0 ? "partly" : report.status} audience={audience} />
        {m.total > 0 && (
          <span className="text-muted-foreground">
            {m.partial > 0
              ? t("mustHaveSummaryPartly", { has: m.has, partial: m.partial, total: m.total })
              : t("mustHaveSummary", { has: m.has, total: m.total })}
          </span>
        )}
        {/* The tally is a recruiter's reading aid; the seeker gets the verdict. */}
        {audience === "employer" && (
          <span className="text-muted-foreground">
            {t("counts", { has: report.counts.has, partial: report.counts.partial, missing: report.counts.missing, verify: report.counts.verify })}
          </span>
        )}
      </div>
      )}

      {groups.map((group) => (
        <section key={group.kind} aria-labelledby={`req-${group.kind}`}>
          <h4 id={`req-${group.kind}`} className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`kind.${group.kind}`)}
            {rows === "gaps" && SKILL_KINDS.has(group.kind) ? ` · ${t(`verdict.${audience}.missing`)}` : ""}
          </h4>
          {audience === "seeker" && SKILL_KINDS.has(group.kind) ? (
            // A skill has nothing to say beyond its name and have / don't
            // have: one chip each, not a row each. Ten skills asked used to
            // make ten rows of "You have this" (owner, 2026-11-13).
            <ul className="flex flex-wrap gap-1.5">
              {group.items.map((item, i) => {
                const has = item.verdict === "has";
                const Icon = has ? CheckCircle2 : CircleMinus;
                return (
                  <li
                    key={`${item.kind}-${i}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                      has ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-dashed border-border text-muted-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {item.required}
                    <span className="sr-only">{` — ${t(`verdict.${audience}.${item.verdict}`)}`}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
              {group.items.map((item, i) => (
                <Row key={`${item.kind}-${i}`} item={item} audience={audience} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function StatusBadge({ status, audience }: { status: Report["status"] | "partly"; audience: Props["audience"] }) {
  const t = useTranslations("requirementReport");
  const verdict: ReportVerdict =
    status === "met" ? "has" : status === "partly" ? "partial" : status === "not_met" ? "missing" : "verify";
  const { icon: Icon, className } = VERDICT_STYLE[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {t(`status.${audience}.${status}`)}
    </span>
  );
}

function CompactRow({ item, audience }: { item: ReportItem; audience: Props["audience"] }) {
  const t = useTranslations("requirementReport");
  const { icon: Icon, className } = VERDICT_STYLE[item.verdict];
  const tone = className.split(" ").find((c) => c.startsWith("text-"));
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-foreground">{requiredText(item, t)}</span>
      <span className={cn("shrink-0 font-medium", tone)}>{t(`verdict.${audience}.${item.verdict}`)}</span>
    </li>
  );
}

function Row({ item, audience }: { item: ReportItem; audience: Props["audience"] }) {
  const t = useTranslations("requirementReport");
  const { icon: Icon, className } = VERDICT_STYLE[item.verdict];
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          {requiredText(item, t)}
          {item.mustHave && item.kind !== "skill" && (
            <span className="ms-1.5 inline-block whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              {t("mustHave")}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{describe(item, audience, t)}</p>
      </div>
      <span className={cn("inline-flex shrink-0 items-center gap-1 self-start rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
        <Icon className="size-3.5" aria-hidden="true" />
        {t(`verdict.${audience}.${item.verdict}`)}
        {item.equivalent && item.verdict === "has" ? ` · ${t("equivalent")}` : ""}
      </span>
    </li>
  );
}

type T = ReturnType<typeof useTranslations<"requirementReport">>;

/** The job's words; a row the job did not ask for says so. */
function requiredText(item: ReportItem, t: T): string {
  return item.verdict === "info" && !item.required ? t("notSetForJob") : item.required;
}

/** One line under the requirement: what the candidate actually shows. */
function describe(item: ReportItem, audience: Props["audience"], t: T): string {
  const who = audience;
  const d = item.detail ?? {};
  switch (item.kind) {
    case "education": {
      if (item.verdict === "info") {
        return item.actual ? t(`education.${who}.info`, { actual: item.actual }) : t(`education.${who}.infoNone`);
      }
      if (!item.actual) return t(`education.${who}.none`);
      if (d.relation === "different") return t(`education.${who}.differentField`, { actual: item.actual });
      if (item.verdict === "partial" || item.verdict === "missing") return t(`education.${who}.lower`, { actual: item.actual });
      if ((d.heldLevel ?? 0) > (d.level ?? 0)) return t(`education.${who}.higher`, { actual: item.actual });
      if (d.relation === "related") return t(`education.${who}.related`, { actual: item.actual });
      if (d.relation === "not_stated") return t(`education.${who}.fieldNotStated`, { actual: item.actual });
      return t(`education.${who}.held`, { actual: item.actual });
    }
    case "experience": {
      if (d.totalYears === null || d.totalYears === undefined) return t(`experience.${who}.unknown`);
      // A role with no end date: its length is a guess, so it is not counted
      // towards the requirement until the seeker dates it.
      if (d.needsEndDate?.length) {
        return t(`experience.${who}.needsEndDate`, { years: d.confirmedYears ?? 0, roles: d.needsEndDate.join(", ") });
      }
      const roles = (d.relevantRoles ?? []).slice(0, 3).join(", ");
      if (d.relevantYears !== null && d.relevantYears !== undefined && roles) {
        return t(`experience.${who}.relevant`, { relevant: d.relevantYears, total: d.totalYears, roles });
      }
      return t(`experience.${who}.total`, { total: d.totalYears });
    }
    case "skill":
    case "preferred_skill":
      return item.verdict === "has" ? t(`skill.${who}.has`) : t(`skill.${who}.missing`);
    case "credential":
      if (item.source === "profile") return t(`credential.${who}.listed`, { quote: item.actual });
      if (item.source === "cv") return t(`credential.${who}.cv`, { quote: item.actual });
      return t(`credential.${who}.none`);
    case "language":
      if (!(d.have ?? []).length && !(d.missing ?? []).length) return "";
      if (item.verdict === "verify") return t(`language.${who}.none`);
      return (d.missing ?? []).length
        ? t(`language.${who}.some`, { have: (d.have ?? []).join(", ") || "—", missing: (d.missing ?? []).join(", ") })
        : t(`language.${who}.all`);
    case "visa":
      return t("visa");
    default:
      return "";
  }
}
