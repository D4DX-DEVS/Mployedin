"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/ui/intlFormat";
import type { AgentTaskStatus } from "./TaskStatusDialog";

interface HistoryItem {
  action: "created" | "assigned" | "status" | "submitted" | "approved" | "returned";
  from?: AgentTaskStatus;
  to?: AgentTaskStatus;
  note?: string;
  byName: string;
  at: string;
}

const DOT: Record<HistoryItem["action"], string> = {
  created: "bg-slate-400",
  assigned: "bg-slate-400",
  status: "bg-blue-500",
  submitted: "bg-amber-500",
  approved: "bg-emerald-500",
  returned: "bg-amber-600",
};

/**
 * A task's activity, newest first: every status change with who made it, when,
 * and their note. `url` is the caller's own history endpoint (agent, super
 * agent or admin), which does the access check.
 */
export function TaskHistoryTimeline({ url }: { url: string }) {
  const t = useTranslations("agentTasks");
  const locale = useLocale();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(false);
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setItems(data.history ?? []);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [url, attempt]);

  const statusLabel = (s?: AgentTaskStatus) =>
    s === "in_progress" ? t("statusInProgress")
    : s === "completed" ? t("statusCompleted")
    : s === "failed" ? t("statusFailed")
    : t("statusPending");

  const line = (item: HistoryItem) => {
    switch (item.action) {
      case "created": return t("historyCreated");
      case "assigned": return t("historyAssigned");
      case "status": return t("historyStatus", { from: statusLabel(item.from), to: statusLabel(item.to) });
      case "submitted": return t("historySubmitted", { to: statusLabel(item.to) });
      case "approved": return t("historyApproved", { to: statusLabel(item.to) });
      case "returned": return t("historyReturned");
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
        <p>{t("historyLoadError")}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("historyRetry")}
        </Button>
      </div>
    );
  }
  if (items === null) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-1 size-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t("historyEmpty")}</p>;
  return (
    <ol className="relative ms-1 space-y-4 border-s border-border/70 ps-4">
      {items.map((item, i) => (
        <li key={`${item.at}-${i}`} className="relative">
          <span className={`absolute -start-[21px] top-1.5 size-2.5 rounded-full ring-4 ring-background ${DOT[item.action]}`} aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{line(item)}</p>
          {item.note && <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground/80">{item.note}</p>}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(item.at, { dateStyle: "medium", timeStyle: "short" }, locale)}
            {item.byName && <> · {t("historyBy", { name: item.byName })}</>}
          </p>
        </li>
      ))}
    </ol>
  );
}
