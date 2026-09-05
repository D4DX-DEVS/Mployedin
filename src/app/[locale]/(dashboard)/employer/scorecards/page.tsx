"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { User, Calendar, Award } from "lucide-react";
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
import { useScorecards } from "@/hooks/useScorecards";
import { useTableExport } from "@/hooks/useTableExport";
import { FeedbackTrendsPanel } from "@/components/features/employer/FeedbackTrendsPanel";
import type { ExportColumn } from "@/lib/export";
import { formatDate } from "@/lib/ui/intlFormat";

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

function getScoreBadgeColor(score: number) {
  if (score >= 4.5) return "bg-emerald-100 text-emerald-700";
  if (score >= 3.5) return "bg-green-100 text-green-700";
  if (score >= 2.5) return "bg-amber-100 text-amber-700";
  if (score >= 1.5) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

export default function ScorecardListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const { data, isLoading: loading, isError, refetch } = useScorecards({ page, limit });
  const scorecards = data?.scorecards ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: "Candidate", key: "_id", formatter: (v) => `Candidate #${String(v).slice(-4)}` },
    { header: "Interview Date", key: "interviewId", formatter: (_v, r) => formatDate(new Date((r as Record<string, any>).interviewId?.scheduledAt)) },
    { header: "Overall Score", key: "overallScore", formatter: (v) => `${Number(v).toFixed(1)}/5` },
    { header: "Recommendation", key: "recommendation", formatter: (v) => RECOMMENDATION_LABELS_KEY[String(v)] ?? String(v) },
    { header: "Evaluated", key: "createdAt", formatter: (v) => formatDate(new Date(String(v))) },
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
        <div className="card-base text-center py-16">
          <p className="text-sm font-semibold text-destructive">{tc("somethingWentWrong")}</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4">
            {tc("tryAgain")}
          </Button>
        </div>
      ) : (
      <>
      {/* Aggregate Feedback Trends */}
      <FeedbackTrendsPanel />

      <section className="workspace-panel-surface rounded-2xl panel-body">
        {/* Privacy info at the point candidate data is shown, compacted to
            an icon + popover to keep the list above the fold. */}
        <div className="flex items-center gap-1.5 border-b border-border pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("scorecardList")}
          </p>
          <CandidateDataNotice variant="candidateList" compact />
        </div>

      {scorecards.length === 0 ? (
        <div className="py-12 text-center">
          <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold mb-1">{t("noScorecards")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("noScorecardsDesc")}
          </p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("candidate")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("overallRating")}</TableHead>
                <TableHead>{t("notes")}</TableHead>
                <TableHead>{t("evaluatedBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scorecards.map((scorecard) => (
                <TableRow key={scorecard._id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-medium">
                        Candidate #{scorecard._id.slice(-4)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(new Date(
                        scorecard.interviewId.scheduledAt
                      ))}
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
                    {formatDate(new Date(scorecard.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
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
