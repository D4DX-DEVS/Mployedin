"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { parseRange, rangeQuery } from "@/lib/admin/staffReport/range";
import type { ReportRange, StaffKind, StaffReport } from "@/lib/admin/staffReport/types";
import { RangePicker } from "./RangePicker";
import { ReportHeader, reportBasePath } from "./ReportHeader";
import { AttentionStrip, OverviewTab, ReportTiles } from "./ReportOverview";
import {
  AgentsTab, CandidatesTab, CommissionTab, EmployersTab, ExhibitionsTab, InvoicesTab, JobsTab, TasksTab,
} from "./ReportTables";

type LoadState = "loading" | "ready" | "notFound" | "error";

const TABS: Record<StaffKind, string[]> = {
  super_agent: ["overview", "agents", "employers", "jobs", "invoices", "exhibitions", "commission", "tasks"],
  agent: ["overview", "employers", "jobs", "candidates", "invoices", "exhibitions", "commission", "tasks"],
};

/**
 * Admin's read-only performance page for one super agent or agent (plan v2,
 * owner 2026-11-24). Range and tab live in the address, so Back, refresh and
 * a shared link reopen the same view.
 */
export function StaffReportPage({ kind }: { kind: StaffKind }) {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("adminStaffReport");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const range = useMemo(() => parseRange({ range: sp.get("range"), from: sp.get("from"), to: sp.get("to") }), [sp]);
  const tab = TABS[kind].includes(sp.get("tab") ?? "") ? (sp.get("tab") as string) : "overview";
  const [report, setReport] = useState<StaffReport | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const query = rangeQuery(range);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/admin/${reportBasePath(kind)}/${id}/report?${query}&locale=${locale}`);
      if (res.status === 404 || res.status === 400) { setState("notFound"); return; }
      if (!res.ok) { setState("error"); return; }
      const data = (await res.json()) as { report: StaffReport };
      setReport(data.report);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [kind, id, query, locale]);

  useEffect(() => { void load(); }, [load]);

  const write = (next: { range?: ReportRange; tab?: string }) => {
    const p = new URLSearchParams(next.range ? rangeQuery(next.range) : query);
    const nextTab = next.tab ?? tab;
    if (nextTab !== "overview") p.set("tab", nextTab);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  /** A tile or the warnings strip: switch tab, then bring the tab into view. */
  const openTab = (next: string) => {
    write({ tab: next });
    requestAnimationFrame(() => document.getElementById("report-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="page-container space-y-4 sm:space-y-6">
      <Link
        href={`/${locale}/admin/${reportBasePath(kind)}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {kind === "super_agent" ? t("backToSuperAgents") : t("backToAgents")}
      </Link>

      {state === "error" && <ErrorState onRetry={() => void load()} />}
      {state === "notFound" && <EmptyState title={t("notFound")} />}
      {state === "loading" && !report && <ReportSkeleton />}

      {report && state !== "notFound" && state !== "error" && (
        <>
          <ReportHeader report={report} onChanged={() => void load()} />
          <AttentionStrip report={report} onSeeAll={() => openTab("overview")} />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <RangePicker value={range} onChange={(r) => write({ range: r })} />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {state === "loading" ? t("updating") : t("generatedAt", { at: formatDateTime(new Date(report.generatedAt), { dateStyle: "medium", timeStyle: "short" }, locale) })}
            </p>
          </div>
          <div className={state === "loading" ? "opacity-60 transition-opacity" : undefined}>
            <ReportTiles report={report} onOpenTab={openTab} />
          </div>
          <Tabs id="report-tabs" value={tab} onValueChange={(v) => write({ tab: v })} className="scroll-mt-20">
            <div className="overflow-x-auto pb-1">
              <TabsList className="h-auto w-max">
                {TABS[kind].map((k) => <TabsTrigger key={k} value={k} className="min-h-11 sm:min-h-9">{t(`tab.${k}`)}</TabsTrigger>)}
              </TabsList>
            </div>
            <TabsContent value="overview" className="mt-4"><OverviewTab report={report} /></TabsContent>
            {kind === "super_agent" && <TabsContent value="agents" className="mt-4"><AgentsTab report={report} onChanged={() => void load()} /></TabsContent>}
            <TabsContent value="employers" className="mt-4"><EmployersTab report={report} /></TabsContent>
            <TabsContent value="jobs" className="mt-4"><JobsTab report={report} /></TabsContent>
            {kind === "agent" && <TabsContent value="candidates" className="mt-4"><CandidatesTab report={report} /></TabsContent>}
            <TabsContent value="invoices" className="mt-4"><InvoicesTab report={report} /></TabsContent>
            <TabsContent value="exhibitions" className="mt-4"><ExhibitionsTab report={report} /></TabsContent>
            <TabsContent value="commission" className="mt-4"><CommissionTab report={report} /></TabsContent>
            <TabsContent value="tasks" className="mt-4"><TasksTab report={report} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-hidden="true">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-9 w-56 rounded-lg" />
      {[3, 4, 3].map((n, g) => (
        <div key={g} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ))}
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
