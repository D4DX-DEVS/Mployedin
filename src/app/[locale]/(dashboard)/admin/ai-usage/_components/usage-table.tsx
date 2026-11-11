"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PhoneRecordList } from "@/components/shared/PhoneRecordList";
import { ReportCardHeader, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { AI_USAGE_GROUPS, type AiUsageGroup } from "@/lib/admin/aiUsageConstants";
import type { UsageRow, UsageSummary } from "@/components/features/admin/ai-usage/useAiUsage";
import { changePct, compact, featureColour, usd } from "@/components/features/admin/ai-usage/format";
import { formatCount } from "@/lib/ui/intlFormat";
import { SearchField } from "@/components/shared/SearchField";

interface Props {
  data: UsageSummary;
  group: AiUsageGroup;
  onGroup: (g: AiUsageGroup) => void;
  search: string;
  onSearch: (s: string) => void;
  page: number;
  onPage: (p: number) => void;
  pageSize: number;
  onPageSize: (n: number) => void;
  locale: string;
  month: string;
}

const TAB_KEY: Record<AiUsageGroup, string> = {
  employer: "tabEmployer",
  super_agent: "tabSuperAgent",
  agent: "tabAgent",
  jobseeker: "tabJobseeker",
};

function Change({ row, locale }: { row: UsageRow; locale: string }) {
  const t = useTranslations("adminAiUsage");
  const pct = changePct(row.costUsd, row.prevCostUsd);
  if (pct === "new") return <span className="text-xs font-medium text-muted-foreground">{t("changeNew")}</span>;
  if (pct === 0) return <span className="text-muted-foreground">0%</span>;
  const up = pct > 0;
  // Spend rising is the thing to look at, so it takes the warm tone; the sign carries it too.
  return (
    <span className={`tabular-nums font-medium ${up ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
      {up ? "+" : "−"}
      {formatCount(Math.abs(pct), undefined, locale)}%
    </span>
  );
}

function MixBar({ row }: { row: UsageRow }) {
  const t = useTranslations("adminAiUsage");
  if (row.mix.length === 0) return null;
  return (
    <div className="min-w-[10rem] space-y-1">
      <div className="flex h-2 w-40 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        {row.mix.map((m) => (
          <div key={m.feature} style={{ width: `${m.share}%`, background: featureColour(m.feature) }} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {row.mix.map((m) => `${t(`features.${m.feature}` as never)} ${m.share}%`).join(" · ")}
      </p>
    </div>
  );
}

export function UsageTable(p: Props) {
  const t = useTranslations("adminAiUsage");
  const [draft, setDraft] = useState(p.search);
  // Search is debounced so each keystroke is not a request.
  useEffect(() => {
    const id = setTimeout(() => p.onSearch(draft), 300);
    return () => clearTimeout(id);
     
  }, [draft]);

  const isStaff = p.group === "super_agent" || p.group === "agent";
  const personHead = p.group === "super_agent" ? t("colSuperAgent") : p.group === "agent" ? t("colAgent") : t("colCompany");

  return (
    <section className={reportCardClassName} aria-labelledby="ai-who">
      <ReportCardHeader
        title={t("whoTitle")}
        description={isStaff ? t(p.group === "agent" ? "staffNoteAgent" : "staffNoteSuperAgent") : p.group === "jobseeker" ? t("seekerNote") : t("kpiSpendDetail")}
        icon={Users}
        tone="workspace-tone-emerald"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-1 rounded-xl bg-secondary p-1">
          {AI_USAGE_GROUPS.map((g) => (
            <button
              key={g}
              role="tab"
              type="button"
              aria-selected={p.group === g}
              onClick={() => p.onGroup(g)}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                p.group === g ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t(TAB_KEY[g] as never)}
              <span className="text-xs font-medium text-muted-foreground tabular-nums">{usd(p.data.tabs[g], p.locale)}</span>
            </button>
          ))}
        </div>
        {p.group !== "jobseeker" ? (
          <SearchField className="w-full sm:w-64" value={draft} onValueChange={setDraft} placeholder={t("search")} inputClassName="h-10" />
        ) : null}
      </div>

      {p.group === "jobseeker" ? (
        p.data.seekerFeatures.length === 0 ? (
          <EmptyState icon={Users} title={t("empty")} description={t("emptyHint")} />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table data-mobile-table="scroll">
              <TableHeader>
                <TableRow>
                  <TableHead className="max-sm:sticky max-sm:start-0 max-sm:z-[1] max-sm:bg-card">{t("colFeature")}</TableHead>
                  <TableHead className="text-end">{t("colSeekers")}</TableHead>
                  <TableHead className="text-end">{t("colCalls")}</TableHead>
                  <TableHead className="text-end">{t("colSpend")}</TableHead>
                  <TableHead className="text-end">{t("colAvg")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.data.seekerFeatures.map((f) => (
                  <TableRow key={f.feature}>
                    <TableCell className="max-sm:sticky max-sm:start-0 max-sm:z-[1] max-sm:bg-card">{t(`features.${f.feature}` as never)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatCount(f.users, undefined, p.locale)}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatCount(f.calls, undefined, p.locale)}</TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">{usd(f.costUsd, p.locale)}</TableCell>
                    <TableCell className="text-end tabular-nums">{usd(f.users ? f.costUsd / f.users : 0, p.locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : p.data.rows.length === 0 ? (
        <EmptyState icon={Users} title={p.search ? t("noMatches") : t("empty")} description={p.search ? undefined : t("emptyHint")} />
      ) : (
        <>
          <PhoneRecordList
            className="mt-4 sm:hidden"
            label={t("whoTitle")}
            items={p.data.rows.map((r) => ({
              key: r.id,
              href: p.group === "employer" ? `/${p.locale}/admin/ai-usage/${r.id}?month=${p.month}` : undefined,
              title: r.name,
              subtitle: r.sub || undefined,
              trailing: <Change row={r} locale={p.locale} />,
              meta: isStaff ? (
                <>
                  <p>{t("splitBehalf", { amount: usd(r.behalfCostUsd, p.locale), count: r.employerCount })}</p>
                  <p>{t("splitOwn", { amount: usd(r.ownCostUsd, p.locale) })}</p>
                </>
              ) : undefined,
              stats: [
                { label: t("colCalls"), value: formatCount(r.calls, undefined, p.locale) },
                { label: t("colTokens"), value: compact(r.tokens, p.locale) },
                { label: t("colSpend"), value: usd(r.costUsd, p.locale) },
                // "Share of total" truncated in the quarter-width phone cell.
                ...(isStaff ? [] : [{ label: t.has("colShareShort") ? t("colShareShort") : t("colShare"), value: `${r.share}%` }]),
              ],
            }))}
          />
          <div className="mt-4 overflow-x-auto max-sm:hidden">
            <Table data-mobile-table="scroll">
              <TableHeader>
                <TableRow>
                  <TableHead>{personHead}</TableHead>
                  <TableHead className="text-end">{t("colCalls")}</TableHead>
                  <TableHead className="hidden text-end md:table-cell">{t("colTokens")}</TableHead>
                  <TableHead className="text-end">{t("colSpend")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{isStaff ? t("colMix") : t("colShare")}</TableHead>
                  {isStaff ? <TableHead className="hidden lg:table-cell">{t("colSplit")}</TableHead> : null}
                  <TableHead className="text-end">{t("colChange")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {p.group === "employer" ? (
                        <Link href={`/${p.locale}/admin/ai-usage/${r.id}?month=${p.month}`} className="font-semibold text-primary hover:underline">
                          {r.name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{r.name}</span>
                      )}
                      {r.sub ? <div className="text-xs text-muted-foreground">{r.sub}</div> : null}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatCount(r.calls, undefined, p.locale)}</TableCell>
                    <TableCell className="hidden text-end tabular-nums md:table-cell">{compact(r.tokens, p.locale)}</TableCell>
                    <TableCell className="text-end font-bold tabular-nums">{usd(r.costUsd, p.locale)}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {isStaff ? (
                        <MixBar row={r} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-secondary" aria-hidden="true">
                            <div className="h-2 rounded-full bg-primary" style={{ width: `${r.share}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{r.share}%</span>
                        </div>
                      )}
                    </TableCell>
                    {isStaff ? (
                      <TableCell className="hidden text-sm lg:table-cell">
                        <div className="font-medium">
                          {t("splitBehalf", { amount: usd(r.behalfCostUsd, p.locale), count: r.employerCount })}
                        </div>
                        <div className="text-xs text-muted-foreground">{t("splitOwn", { amount: usd(r.ownCostUsd, p.locale) })}</div>
                      </TableCell>
                    ) : null}
                    <TableCell className="text-end">
                      <Change row={r} locale={p.locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            className="mt-4"
            page={p.page}
            totalPages={p.data.totalPages}
            total={p.data.total}
            limit={p.pageSize}
            onPageChange={p.onPage}
            onLimitChange={p.onPageSize}
          />
        </>
      )}
    </section>
  );
}
