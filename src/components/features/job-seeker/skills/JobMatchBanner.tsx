"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight, Gauge } from "lucide-react";
import { formatCount } from "@/lib/ui/intlFormat";

interface JobMatch {
  score: number | null;
}

/**
 * Phones only: the job's match as one green line near the top of the job
 * page, linking down to the full breakdown in JobMatchCard. Reads the same
 * query (same key), so it costs no extra request. Renders nothing until a
 * score exists — never a placeholder number.
 */
export function JobMatchBanner({ jobId }: { jobId: string }) {
  const t = useTranslations("jobSeekerJobDetail.match");
  const locale = useLocale();
  const { data } = useQuery<JobMatch>({
    queryKey: ["job-seeker-match", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/job-seeker/match?jobId=${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error(`match ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  if (!data || data.score === null || data.score === undefined) return null;

  return (
    <a
      href="#job-match"
      className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 sm:hidden"
    >
      <Gauge className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{t("score", { score: formatCount(data.score, undefined, locale) })}</span>
      <span aria-hidden="true">·</span>
      <span className="min-w-0 flex-1 truncate underline-offset-2">
        {t.has("whyThisMatch") ? t("whyThisMatch") : t("howItWorks")}
      </span>
      <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
    </a>
  );
}
