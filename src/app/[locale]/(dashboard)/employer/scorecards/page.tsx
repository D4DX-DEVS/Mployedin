"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Fragment } from "react";
import { Calendar, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { RowExpandToggle } from "@/components/shared/RowExpandToggle";
import { ErrorState } from "@/components/shared/ErrorState";
import { useScorecards } from "@/hooks/useScorecards";
import { useTableExport } from "@/hooks/useTableExport";
import { FeedbackTrendsPanel } from "@/components/features/employer/FeedbackTrendsPanel";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";
import { getScoreBadgeColor } from "@/lib/ui/scoreBadge";

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: "bg-emerald-100 text-emerald-700 border-emerald-300",
  yes: "bg-green-100 text-green-700 border-green-300",
  neutral: "bg-amber-100 text-amber-700 border-amber-300",
  no: "bg-orange-100 text-orange-700 border-orange-300",
  strong_no: "bg-red-100 text-red-700 border-red-300",
};

const RECOMMENDATION_LABELS_KEY: Record<string, string> = {
  strong_yes: "strongYes",
  yes: "yes",
  neutral: "neutral",
  no: "no",
  strong_no: "strongNo",
};


export default function ScorecardListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("employerScorecards");
  const tc = useTranslations("employerCommon");
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(window.location.search);
    if (next > 1) params.set("page", String(next)); else params.delete("page");
    router.replace(`?${params.toString()}`, { scroll: false });
  }
  const [limit, setLimit] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading: loading, isError, refetch } = useScorecards({ page, limit });
  const scorecards = data?.scorecards ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function candidateNameOf(sc: (typeof scorecards)[number]): string {
    const js = sc.jobSeekerId as { fullName?: string; userId?: string | { name?: string } };
    if (typeof js?.userId === "object" && js.userId?.name) return js.userId.name;
    if (js?.fullName) return js.fullName;
    return `Candidate #${sc._id.slice(-4)}`;
  }

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Candidate", key: "_id", formatter: (_v, r) => candidateNameOf(r as unknown as (typeof scorecards)[number]) },
    { header: "Interview Date", key: "interviewId", formatter: (_v, r) => formatDate(new Date((r as Record<string, any>).interviewId?.scheduledAt), { day: "2-digit", month: "short", year: "numeric" }) },
    { header: "Overall Score", key: "overallScore", formatter: (v) => `${Number(v).toFixed(1)}/5` },
    { header: "Recommendation", key: "recommendation", formatter: (v) => RECOMMENDATION_LABELS_KEY[String(v)] ?? String(v) },
    { header: "Evaluated", key: "createdAt", formatter: (v) => formatDate(new Date(String(v)), { day: "2-digit", month: "short", year: "numeric" }) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: scorecards as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "scorecards",
    title: t("title"),
  });

  useEffect(() => {
    document.title = "Interview Scorecards · MPLOYEDIN";
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <WorkspaceHeader title={t("title")} context={tc("loading")} />
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-base h-16 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Pattern A (compact workspace): title, the total, Export on the title
          row (no search or filters here, so no toolbar row). */}
      <WorkspaceHeader
        title={t("title")}
        context={t("totalScorecards", { count: total })}
        actions={
          <TableToolbar
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        }
      />

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
      <>
      {/* Aggregate Feedback Trends */}
      <FeedbackTrendsPanel />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {/* Privacy info at the point candidate data is shown, compacted to
            an icon + popover to keep the list above the fold. */}
        <div className="flex items-center gap-1.5 border-b border-border px-4 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("scorecardList")}
          </p>
          <CandidateDataNotice variant="candidateList" compact />
        </div>

      {scorecards.length === 0 ? (
        <div className="py-12 text-center">
          <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h2 className="font-semibold mb-1">{t("noScorecards")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("noScorecardsDesc")}
          </p>
          {/* Scorecards are written from the interview, so an empty list needs
              to point at the interviews board — without this the page was the
              only employer list that ended in a dead stop. */}
          <Button asChild className="mt-5 rounded-xl">
            <Link href={`/${locale}/employer/interviews`}>{t("reviewInterviews")}</Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10" />
                <TableHead>{t("candidate")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("overallRating")}</TableHead>
                <TableHead>{t("recommendation")}</TableHead>
                <TableHead>{t("evaluated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecards.map((scorecard) => {
                const name = candidateNameOf(scorecard);
                const isOpen = expandedId === scorecard._id;
                return (
                <Fragment key={scorecard._id}>
                <TableRow
                  className="group cursor-pointer"
                  onClick={() => setExpandedId(isOpen ? null : scorecard._id)}
                >
                  <TableCell className="w-10">
                    <RowExpandToggle
                      expanded={isOpen}
                      onToggle={() => setExpandedId(isOpen ? null : scorecard._id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={name} className="h-9 w-9" colorful />
                      <span className="font-medium">
                        {name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(new Date(
                        scorecard.interviewId.scheduledAt
                      ), { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={getScoreBadgeColor(scorecard.overallScore)}>
                      {scorecard.overallScore.toFixed(1)}/5
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        RECOMMENDATION_COLORS[scorecard.recommendation] || ""
                      }
                    >
                      {t(RECOMMENDATION_LABELS_KEY[scorecard.recommendation])}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(new Date(scorecard.createdAt), { day: "2-digit", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell />
                    <TableCell colSpan={5} className="bg-muted/20">
                      <div className="space-y-3 py-1">
                        {scorecard.scores && (
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                            {(
                              Object.entries(scorecard.scores) as [string, number][]
                            ).map(([dim, value]) => (
                              <div key={dim} className="flex items-center justify-between gap-2 text-sm">
                                <dt className="capitalize text-muted-foreground">
                                  {dim.replace(/([A-Z])/g, " $1").trim()}
                                </dt>
                                <dd className="font-semibold tabular-nums text-foreground">
                                  {Number(value).toFixed(1)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {scorecard.strengths && (
                          <p className="text-sm leading-6 text-foreground/85">
                            <span className="font-semibold">{t("strengths")}: </span>
                            {scorecard.strengths}
                          </p>
                        )}
                        {scorecard.concerns && (
                          <p className="text-sm leading-6 text-foreground/85">
                            <span className="font-semibold">{t("concerns")}: </span>
                            {scorecard.concerns}
                          </p>
                        )}
                        {scorecard.notes && (
                          <p className="text-sm leading-6 text-muted-foreground">{scorecard.notes}</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      </section>

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
      </>
      )}
    </div>
  );
}
