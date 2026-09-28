"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, FilePenLine, Inbox, Wand2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "@/components/shared/DashboardKit";
import { AIChatDraftsCard } from "./AIChatDraftsCard";
import { DraftExtractionsCard } from "./DraftExtractionsCard";
import { DraftJobsCard } from "./DraftJobsCard";

type DraftKind = "jobs" | "chats" | "extractions";

interface DraftsCardProps {
  locale: string;
  /** Reports the combined draft count so a parent layout can react. */
  onCountChange?: (count: number) => void;
}

const ORDER: DraftKind[] = ["jobs", "chats", "extractions"];

/**
 * One "Drafts to resume" panel that folds the three draft sources (job drafts,
 * AI chat threads, AI extraction sessions) into tabs.
 *
 * The source cards stay mounted (forceMount) so they keep fetching and
 * reporting counts; inactive panels are just `hidden`. Tabs only appear when
 * more than one source has drafts. Once every source has reported and none
 * has anything, the panel shows an empty state rather than vanishing, so the
 * grid cell beside "Top jobs" never goes dead.
 */
export function DraftsCard({ locale, onCountChange }: DraftsCardProps) {
  const t = useTranslations("employerDashboard.drafts");
  const [counts, setCounts] = useState<Record<DraftKind, number | null>>({ jobs: null, chats: null, extractions: null });
  const [active, setActive] = useState<DraftKind>("jobs");
  // Until the user picks a tab, follow ORDER — the three sources fetch in
  // parallel, so whichever answers first must not win the default slot.
  const userPicked = useRef(false);

  // Stable per-source callbacks: the source cards re-report on every
  // `onCountChange` identity change, so fresh closures each render would churn.
  const setCount = useCallback(
    (kind: DraftKind, count: number) =>
      setCounts((prev) => (prev[kind] === count ? prev : { ...prev, [kind]: count })),
    [],
  );
  const setJobs = useCallback((count: number) => setCount("jobs", count), [setCount]);
  const setChats = useCallback((count: number) => setCount("chats", count), [setCount]);
  const setExtractions = useCallback((count: number) => setCount("extractions", count), [setCount]);

  const nonEmpty = ORDER.filter((k) => (counts[k] ?? 0) > 0);
  const nonEmptyKey = nonEmpty.join(",");
  const total = (counts.jobs ?? 0) + (counts.chats ?? 0) + (counts.extractions ?? 0);
  const settled = ORDER.every((k) => counts[k] !== null);

  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  // Keep the active tab on a source that still has drafts (e.g. after the last
  // job draft is discarded, jump to the next one).
  useEffect(() => {
    const live = nonEmptyKey ? (nonEmptyKey.split(",") as DraftKind[]) : [];
    if (live.length === 0) return;
    if (!userPicked.current) {
      if (active !== live[0]) setActive(live[0]);
    } else if (!live.includes(active)) {
      setActive(live[0]);
    }
  }, [nonEmptyKey, active]);

  const tabs: { kind: DraftKind; label: string; icon: React.ElementType; accent: string }[] = [
    { kind: "jobs", label: t("tabJobs"), icon: FilePenLine, accent: "text-amber-600" },
    { kind: "chats", label: t("tabChats"), icon: Bot, accent: "text-sky-600" },
    { kind: "extractions", label: t("tabExtractions"), icon: Wand2, accent: "text-violet-600" },
  ];

  return (
    <Tabs
      value={active}
      onValueChange={(v) => {
        userPicked.current = true;
        setActive(v as DraftKind);
      }}
      className="contents"
    >
      <Panel
        id="employer-drafts-to-resume"
        icon={FilePenLine}
        iconClassName="bg-amber-100 text-amber-800"
        title={t("title")}
        subtitle={t("subtitle")}
        aside={
          nonEmpty.length > 1 ? (
            <TabsList aria-label={t("tabsLabel")} className="gap-0.5">
              {tabs
                .filter((tab) => (counts[tab.kind] ?? 0) > 0)
                .map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.kind} value={tab.kind} className="gap-1.5">
                      <Icon className={`h-3.5 w-3.5 ${tab.accent}`} aria-hidden="true" />
                      {tab.label}
                      <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums text-foreground">
                        {counts[tab.kind]}
                      </span>
                    </TabsTrigger>
                  );
                })}
            </TabsList>
          ) : undefined
        }
      >
        {settled && total === 0 && (
          <div className="flex flex-1 items-center gap-3 rounded-lg bg-muted/40 px-3 py-4" data-drafts-empty>
            <Inbox className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("emptyTitle")}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("emptyDescription")}</p>
            </div>
          </div>
        )}
        <TabsContent value="jobs" forceMount className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <DraftJobsCard locale={locale} variant="rows" onCountChange={setJobs} />
        </TabsContent>
        <TabsContent value="chats" forceMount className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <AIChatDraftsCard locale={locale} variant="rows" onCountChange={setChats} />
        </TabsContent>
        <TabsContent value="extractions" forceMount className="mt-0 flex flex-1 flex-col data-[state=inactive]:hidden">
          <DraftExtractionsCard locale={locale} variant="rows" onCountChange={setExtractions} />
        </TabsContent>
      </Panel>
    </Tabs>
  );
}
