"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileCheck2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatListDate } from "@/lib/ui/intlFormat";
import type { CvExportHistoryRow } from "@/lib/cv/cvExportHistory";

interface SeekerCvExportsCardProps {
  seekerId: string;
  className?: string;
}

/**
 * Every bulk export that included this seeker's CV: when, by whom, for which
 * job, and which version. Answers "did we already send this CV to the client?".
 */
export function SeekerCvExportsCard({ seekerId, className }: SeekerCvExportsCardProps) {
  const tr = useTranslations("adminJobSeekers");
  const locale = useLocale();
  const [rows, setRows] = useState<CvExportHistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setRows(null);
    try {
      const res = await fetch(`/api/job-seekers/${seekerId}/cv-exports`);
      if (!res.ok) throw new Error("history");
      const data = (await res.json()) as { items?: CvExportHistoryRow[] };
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch {
      setFailed(true);
    }
  }, [seekerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const versionText = (row: CvExportHistoryRow): string | null => {
    if (row.versions.length === 2) return tr("cvExportsVersionBoth");
    if (row.versions[0] === "standardised") return tr("cvExportsVersionStandardised");
    if (row.versions[0] === "original") return tr("cvExportsVersionOriginal");
    return null;
  };

  return (
    <section className={className ?? "rounded-xl border border-border bg-card p-4"}>
      <h3 className="text-sm font-semibold text-foreground">{tr("cvExportsTitle")}</h3>
      {failed ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{tr("cvExportsError")}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{tr("cvExportsRetry")}</Button>
        </div>
      ) : rows === null ? (
        <div className="mt-2 space-y-2" aria-busy="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{tr("cvExportsEmpty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
              <FileCheck2 className="mt-0.5 size-4 shrink-0 text-violet-700" aria-hidden="true" />
              <div className="min-w-0">
                <p dir="auto" className="break-words text-sm font-medium text-foreground">
                  {row.job
                    ? tr("cvExportsForJob", { job: [row.job.title, row.job.company].filter(Boolean).join(" · ") })
                    : tr("cvExportsNoJob")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    formatListDate(row.at, locale),
                    row.by ? tr("cvExportsBy", { name: row.by }) : null,
                    versionText(row),
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
