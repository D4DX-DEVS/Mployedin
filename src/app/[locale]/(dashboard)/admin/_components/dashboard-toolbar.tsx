"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DASHBOARD_PERIODS, DEFAULT_DASHBOARD_PERIOD, isDashboardPeriod } from "@/lib/admin/dashboard/period";
import { readQuery, writeQuery } from "@/lib/ui/urlQuery";

interface DashboardToolbarProps {
  /** Server-formatted, so the server and client render the same text. */
  updatedLabel: string;
  updatedAt: string;
  labels: { refresh: string; refreshing: string; period: string; periods: Record<(typeof DASHBOARD_PERIODS)[number], string> };
}

/**
 * Freshness, a re-query, and the reporting window. The period lives in the URL
 * (`?period=7d`) so a refresh, back/forward or a shared link shows the same
 * numbers; the server page reads it and every "in period" figure follows.
 */
export function DashboardToolbar({ updatedLabel, updatedAt, labels }: DashboardToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const raw = searchParams.get("period");
  const period = isDashboardPeriod(raw) ? raw : DEFAULT_DASHBOARD_PERIOD;

  const changePeriod = (next: string) => {
    startTransition(() => {
      const params = readQuery();
      if (next === DEFAULT_DASHBOARD_PERIOD) params.delete("period");
      else params.set("period", next);
      writeQuery(params, (href) => router.replace(href, { scroll: false }));
    });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto" data-dashboard-toolbar>
      <time dateTime={updatedAt} className="me-1 basis-full text-xs text-muted-foreground sm:basis-auto" aria-live="polite">
        {pending ? labels.refreshing : updatedLabel}
      </time>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9 gap-1.5"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        {labels.refresh}
      </Button>
      <Select value={period} onValueChange={changePeriod} disabled={pending}>
        <SelectTrigger className="h-9 w-[10.5rem] flex-1 gap-1.5 text-sm sm:flex-none" aria-label={labels.period}>
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {DASHBOARD_PERIODS.map((value) => (
            <SelectItem key={value} value={value}>
              {labels.periods[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
