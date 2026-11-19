"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDateTime } from "@/lib/ui/intlFormat";

interface HistoryEntry {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  createdAt: string;
  changes?: { before: Record<string, unknown>; after: Record<string, unknown> };
  reason?: string;
}

interface HistoryResponse {
  history: HistoryEntry[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface HistoryCardProps {
  profileId: string;
  currency: string;
}

export function HistoryCard({ profileId, currency }: HistoryCardProps) {
  const t = useTranslations("profitTargets");
  const locale = useLocale();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery<HistoryResponse>({
    queryKey: ["target-history", profileId, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/target-profiles/${profileId}/history?page=${page}&limit=20`);
      if (!res.ok) throw new Error(t("historyLoadError"));
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold tracking-tight">{t("historyTitle")}</h3>
        </div>
        <div className="space-y-3 px-6 py-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold tracking-tight">{t("historyTitle")}</h3>
        </div>
        <div className="p-6">
          <ErrorState
            title={t("historyError")}
            onRetry={() => void refetch()}
            retryLabel={t("retry")}
          />
        </div>
      </div>
    );
  }

  if (data.history.length === 0) {
    return (
      <div className="rounded-2xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold tracking-tight">{t("historyTitle")}</h3>
        </div>
        <div className="flex items-center justify-center px-6 py-12">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
          </div>
        </div>
      </div>
    );
  }

  const formatFieldName = (field: string): string => {
    const fieldMap: Record<string, string> = {
      profitTarget: t("profitTarget"),
      jobTarget: t("jobTarget"),
      conversionTarget: t("conversionTarget"),
      revenueTarget: t("revenueTarget"),
      currency: t("currency"),
      region: t("regionLabel"),
      status: t("status"),
      periods: t("periods"),
    };
    return fieldMap[field] || field;
  };

  const formatValue = (value: unknown, field: string): string => {
    if (value === null || value === undefined) return "—";
    if (field === "revenueTarget" || field === "profitTarget") {
      return formatCurrency(Number(value), currency);
    }
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b px-6 py-4">
        <h3 className="font-semibold tracking-tight">{t("historyTitle")}</h3>
      </div>
      <div className="divide-y">
        {data.history.map((entry) => {
          const dateTime = formatDateTime(entry.createdAt, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }, locale);
          
          return (
            <div key={entry.id} className="p-6">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-sm text-muted-foreground">{dateTime}</div>
                <div className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                  {entry.actorName} · {entry.actorRole}
                </div>
              </div>
              
              {entry.changes && Object.keys(entry.changes.before).length > 0 && (
                <div className="mb-3 space-y-2">
                  {Object.entries(entry.changes.before).map(([field, before]) => {
                    const after = entry.changes?.after[field];
                    if (before === after) return null;
                    return (
                      <div key={field} className="text-sm">
                        <span className="font-medium">{formatFieldName(field)}:</span>{" "}
                        <span className="text-muted-foreground">
                          {formatValue(before, field)} →{" "}
                          <span className="text-foreground">{formatValue(after, field)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {entry.reason && (
                <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <span className="font-medium">{t("changeReason")}:</span>{" "}
                  <span className="text-muted-foreground">{entry.reason}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.pagination.pages > 1 && (
        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="text-sm text-muted-foreground">
            {t("page")} {data.pagination.page} {t("of")} {data.pagination.pages}
            {data.pagination.total > 0 && (
              <span className="ml-2">
                ({data.pagination.total} {t("total")})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
              disabled={page === data.pagination.pages}
              className="gap-1"
            >
              {t("next")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
