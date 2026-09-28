"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { InlineFilterBar, InlineFilterSearch, INLINE_FILTER_CONTROL } from "@/components/shared/InlineFilterBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReportCardHeader, ReportEmpty, reportCardClassName } from "@/components/features/admin/reports/ReportCard";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { formatCount } from "@/lib/ui/intlFormat";
import { PACE_CHIP, PACE_LABEL_KEYS, percentOf, type Progress, type TargetPerson } from "./types";

type RoleFilter = "all" | "super_agent" | "agent";

/**
 * Every active plan for the year in one table — super agents and agents used
 * to be two tables capped at 20 and 30 rows. Progress sits in the second
 * column because phones show only the first two cells of a collapsed card.
 */
export function TargetPeopleTable({ people, year, locale }: { people: TargetPerson[]; year: number; locale: string }) {
  const t = useTranslations("adminTargetReport");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const count = (value: number) => formatCount(value, undefined, locale);
  const money = (value: number, currency: string) =>
    formatCount(value, { style: "currency", currency, maximumFractionDigits: 0 }, locale);
  const ratio = (progress: Progress, format: (value: number) => string = count) =>
    progress.target > 0 ? `${format(progress.achieved)} / ${format(progress.target)}` : "—";

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return people.filter((person) =>
      (role === "all" || person.role === role)
      && (!query || person.name.toLowerCase().includes(query) || person.email.toLowerCase().includes(query)));
  }, [people, role, search]);

  const exportRows = useMemo(() => rows.map((person) => ({
    name: person.name || t("unknownPerson"),
    email: person.email,
    role: t(person.role === "super_agent" ? "roleSuperAgent" : "roleAgent"),
    region: person.region ?? "",
    employersTarget: person.employers.target,
    employersAchieved: person.employers.achieved,
    employeesTarget: person.employees.target,
    employeesAchieved: person.employees.achieved,
    currency: person.finance.currency,
    financeTarget: person.finance.target,
    financeAchieved: person.finance.achieved,
    progress: `${person.progress}%`,
    pace: t(PACE_LABEL_KEYS[person.pace]),
  })), [rows, t]);

  const exportColumns: ExportColumn<Record<string, unknown>>[] = useMemo(() => [
    { header: t("exportName"), key: "name" },
    { header: t("exportEmail"), key: "email" },
    { header: t("exportRole"), key: "role" },
    { header: t("exportRegion"), key: "region" },
    { header: t("exportEmployersTarget"), key: "employersTarget" },
    { header: t("exportEmployersAchieved"), key: "employersAchieved" },
    { header: t("exportEmployeesTarget"), key: "employeesTarget" },
    { header: t("exportEmployeesAchieved"), key: "employeesAchieved" },
    { header: t("exportCurrency"), key: "currency" },
    { header: t("exportFinanceTarget"), key: "financeTarget" },
    { header: t("exportFinanceAchieved"), key: "financeAchieved" },
    { header: t("exportProgress"), key: "progress" },
    { header: t("exportPace"), key: "pace" },
  ], [t]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: exportRows,
    columns: exportColumns,
    filename: `target-report-${year}`,
    title: t("exportTitle", { year }),
  });

  const filtered = role !== "all" || search.trim() !== "";

  return (
    <section className={reportCardClassName} aria-label={t("people")}>
      <ReportCardHeader title={t("people")} description={t("peopleDescription", { year })} icon={Users} tone="workspace-tone-violet" />

      {people.length === 0 ? (
        <ReportEmpty>{t("noPeople", { year })}</ReportEmpty>
      ) : (
        <>
          <InlineFilterBar
            className="mt-4 px-0"
            onClear={filtered ? () => { setSearch(""); setRole("all"); } : undefined}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          >
            <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPeople")} />
            <Select value={role} onValueChange={(value) => setRole(value as RoleFilter)}>
              <SelectTrigger aria-label={t("roleFilterLabel")} className={INLINE_FILTER_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("roleAll")}</SelectItem>
                <SelectItem value="super_agent">{t("roleSuperAgents")}</SelectItem>
                <SelectItem value="agent">{t("roleAgents")}</SelectItem>
              </SelectContent>
            </Select>
          </InlineFilterBar>

          {rows.length === 0 ? (
            <ReportEmpty>{t("noPeopleMatch")}</ReportEmpty>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>{t("columnPerson")}</TableHead>
                    <TableHead>{t("columnProgress")}</TableHead>
                    <TableHead className="text-end">{t("columnEmployers")}</TableHead>
                    <TableHead className="text-end">{t("columnEmployees")}</TableHead>
                    <TableHead className="text-end">{t("columnFinance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((person) => {
                    const financeShare = percentOf(person.finance);
                    return (
                      <TableRow key={person.id}>
                        <TableCell className="min-w-44">
                          <Link href={`/${locale}/admin/target-management/${person.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                            {person.name || person.email || t("unknownPerson")}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {t(person.role === "super_agent" ? "roleSuperAgent" : "roleAgent")}
                            {person.region ? ` · ${person.region}` : ""}
                          </p>
                        </TableCell>
                        <TableCell className="min-w-40">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                              <span
                                className={`block h-full rounded-full ${person.pace === "behind" ? "bg-rose-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(100, person.progress)}%` }}
                              />
                            </span>
                            <span className="text-sm font-semibold tabular-nums">{person.progress}%</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PACE_CHIP[person.pace]}`}>
                              {t(PACE_LABEL_KEYS[person.pace])}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{ratio(person.employers)}</TableCell>
                        <TableCell className="text-end tabular-nums">{ratio(person.employees)}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          {ratio(person.finance, (value) => money(value, person.finance.currency))}
                          {financeShare !== null ? <p className="text-xs text-muted-foreground">{financeShare}%</p> : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
