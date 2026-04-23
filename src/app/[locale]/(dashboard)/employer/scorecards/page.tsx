"use client";

import { useEffect, useState } from "react";
import { User, Calendar, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useScorecards } from "@/hooks/useScorecards";
import { FeedbackTrendsPanel } from "@/components/features/employer/FeedbackTrendsPanel";

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: "bg-emerald-100 text-emerald-700 border-emerald-300",
  yes: "bg-green-100 text-green-700 border-green-300",
  neutral: "bg-amber-100 text-amber-700 border-amber-300",
  no: "bg-orange-100 text-orange-700 border-orange-300",
  strong_no: "bg-red-100 text-red-700 border-red-300",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_yes: "Strong Yes",
  yes: "Yes",
  neutral: "Neutral",
  no: "No",
  strong_no: "Strong No",
};

function getScoreBadgeColor(score: number) {
  if (score >= 4.5) return "bg-emerald-100 text-emerald-700";
  if (score >= 3.5) return "bg-green-100 text-green-700";
  if (score >= 2.5) return "bg-amber-100 text-amber-700";
  if (score >= 1.5) return "bg-orange-100 text-orange-700";
  return "bg-red-100 text-red-700";
}

export default function ScorecardListPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data, isLoading: loading } = useScorecards({ page, limit });
  const scorecards = data?.scorecards ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    document.title = "Interview Scorecards · MPLOYEDIN";
  }, []);

  if (loading) {
    return (
      <div className="page-container">
        <PageHeader
          title="Interview Scorecards"
          description="Loading scorecards..."
        />
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
      <PageHeader
        title="Interview Scorecards"
        description={`${total} total scorecards`}
      />

      {/* Aggregate Feedback Trends */}
      <FeedbackTrendsPanel />

      {scorecards.length === 0 ? (
        <div className="card-base text-center py-16">
          <Award className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No scorecards yet</h3>
          <p className="text-sm text-muted-foreground">
            Scorecards will appear here once you evaluate candidates
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Candidate</TableHead>
                <TableHead>Interview Date</TableHead>
                <TableHead>Overall Score</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>Evaluated</TableHead>
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
                      {new Date(
                        scorecard.interviewId.scheduledAt
                      ).toLocaleDateString()}
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
                      {RECOMMENDATION_LABELS[scorecard.recommendation]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(scorecard.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={totalPages}
        total={total}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
}
