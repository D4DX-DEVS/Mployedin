"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import { ReportCardHeader, ReportEmpty, reportCardClassName, reportLinkClassName } from "@/components/features/admin/reports/ReportCard";
import type { TargetPerson } from "./types";

const MAX_ROWS = 6;

/** The people furthest behind the share of the year expected by now, each opening their plan. */
export function BehindPaceList({ people, year, expectedProgress, locale, className = "" }: {
  people: TargetPerson[];
  year: number;
  expectedProgress: number;
  locale: string;
  className?: string;
}) {
  const t = useTranslations("adminTargetReport");
  const behind = people
    .filter((person) => person.pace === "behind")
    .sort((left, right) => left.progress - right.progress);

  return (
    <section className={`${reportCardClassName} ${className}`} aria-label={t("behindPace")}>
      <ReportCardHeader
        title={t("behindPace")}
        description={t("behindPaceDescription")}
        icon={AlertTriangle}
        tone="workspace-tone-amber"
      />

      {behind.length > 0 ? (
        <ul className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {behind.slice(0, MAX_ROWS).map((person) => (
            <li key={person.id}>
              <Link
                href={`/${locale}/admin/target-management/${person.id}`}
                className="flex min-h-11 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{person.name || person.email || t("unknownPerson")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(person.role === "super_agent" ? "roleSuperAgent" : "roleAgent")}
                    {person.region ? ` · ${person.region}` : ""}
                  </span>
                  {/* The bar carries a tick at the expected share, so the gap is visible. */}
                  <span className="relative mt-2 block h-1.5 rounded-full bg-secondary">
                    <span className="block h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, person.progress)}%` }} />
                    <span className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-foreground/50" style={{ insetInlineStart: `${expectedProgress}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="block text-sm font-semibold tabular-nums text-foreground">{person.progress}%</span>
                  <span className="block text-[11px] text-muted-foreground">{t("expectedShort", { expected: expectedProgress })}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ReportEmpty>
          {expectedProgress === 0 ? t("nothingDueYet", { year }) : t("nobodyBehind")}
        </ReportEmpty>
      )}

      {behind.length > MAX_ROWS ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("moreBehind", { count: behind.length - MAX_ROWS })}</p>
      ) : null}

      <Link href={`/${locale}/admin/target-management?year=${year}`} className={reportLinkClassName}>
        {t("openTargetManagement")}
        <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </Link>
    </section>
  );
}
