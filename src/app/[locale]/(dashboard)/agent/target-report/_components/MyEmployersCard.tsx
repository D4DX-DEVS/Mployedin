"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { formatCurrency } from "@/lib/currency";

interface EmployerMoney {
  currency: string;
  revenue: number;
  commission: number;
  commissionPaid: number;
}

interface EmployerRow {
  employerUserId: string;
  companyName: string;
  rate: number;
  rateSource: "employer_rate" | "agent_default";
  money: EmployerMoney[];
}

interface EmployersResponse {
  data: EmployerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZES = ["10", "25", "50", "100"];

/** "My employers and commission": rate in effect, invoiced revenue and own commission per employer. */
export function MyEmployersCard({ year }: { year: string }) {
  const t = useTranslations("profitTargets");
  const [page, setPage] = useUrlFilter("empPage", "1");
  const [pageSize, setPageSize] = useUrlFilter("empPageSize", "10", { allow: PAGE_SIZES });

  const { data, isLoading, isError, refetch } = useQuery<EmployersResponse>({
    queryKey: ["agent", "target-report", "employers", year, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({ year, page, pageSize });
      const res = await fetch(`/api/agent/target-report/employers?${params}`);
      if (!res.ok) throw new Error(`employers ${res.status}`);
      return res.json();
    },
  });

  const money = (rows: EmployerMoney[], pick: (m: EmployerMoney) => number) =>
    rows.length === 0 ? "—" : rows.map((m) => formatCurrency(pick(m), m.currency)).join(" · ");

  return (
    <section className="rounded-2xl border bg-card" aria-labelledby="my-employers-title">
      <div className="border-b px-4 py-4 sm:px-6">
        <h2 id="my-employers-title" className="font-semibold tracking-tight">{t("myEmployersTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("myEmployersDescription", { year })}</p>
      </div>
      <div className="p-4 sm:p-6">
        {isError ? (
          <ErrorState title={t("myEmployersError")} onRetry={() => { void refetch(); }} retryLabel={t("retry")} />
        ) : isLoading || !data ? (
          <div className="space-y-2" role="status" aria-label={t("loading")}>
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : data.total === 0 ? (
          <EmptyState icon={Building2} title={t("myEmployersEmpty")} description={t("myEmployersEmptyHint")} />
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("myEmployersEmployer")}</TableHead>
                    <TableHead className="text-end">{t("myEmployersRate")}</TableHead>
                    <TableHead className="text-end">{t("kpiInvoicedRevenue")}</TableHead>
                    <TableHead className="text-end">{t("myEmployersCommission")}</TableHead>
                    <TableHead className="hidden text-end md:table-cell">{t("myEmployersPaid")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
                    <TableRow key={row.employerUserId}>
                      <TableCell className="font-medium">{row.companyName || "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        <span>{row.rate}%</span>
                        {row.rateSource === "agent_default" && (
                          <Badge variant="outline" className="ms-2 hidden sm:inline-flex">{t("myEmployersDefaultRate")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{money(row.money, (m) => m.revenue)}</TableCell>
                      <TableCell className="text-end tabular-nums">{money(row.money, (m) => m.commission)}</TableCell>
                      <TableCell className="hidden text-end tabular-nums md:table-cell">{money(row.money, (m) => m.commissionPaid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationControls
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              limit={data.pageSize}
              onPageChange={(p) => setPage(String(p))}
              onLimitChange={(l) => { setPageSize(String(l)); setPage("1"); }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
