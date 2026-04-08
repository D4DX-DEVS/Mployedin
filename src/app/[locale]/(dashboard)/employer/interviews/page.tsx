"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { AIInterviewQuestionsPanel } from "@/components/features/employer/AIInterviewQuestionsPanel";
import { useInterviews, useUpdateInterview } from "@/hooks/useInterviews";
import type { Interview } from "@/hooks/useInterviews";

interface AIQuestionsTarget {
  jobTitle: string;
  candidateName: string;
  skills: string[];
  experienceYears: number;
}

export default function EmployerInterviewsPage() {
  const { locale } = useParams<{ locale: string }>();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { can } = usePermissions();
  const [status, setStatus] = useState("");
  const [aiTarget, setAiTarget] = useState<AIQuestionsTarget | null>(null);

  const { data, isLoading: loading } = useInterviews({ page, limit, status: status || undefined });
  const updateMutation = useUpdateInterview();

  const interviews = data?.interviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => { setPage(1); }, [status]);

  function openAIQuestions(iv: Interview) {
    const skills = [
      ...(iv.jobId?.requirements?.skills ?? []),
      ...(iv.jobSeekerId?.skills ?? []),
    ].filter((s, i, a) => a.indexOf(s) === i).slice(0, 15);

    const expYears = iv.jobSeekerId?.experience?.length
      ? iv.jobSeekerId.experience.reduce((acc, e) => {
          if (!e.startDate) return acc;
          const years = (Date.now() - new Date(e.startDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
          return acc + Math.min(years, 30);
        }, 0)
      : (iv.jobId?.requirements?.experienceMin ?? 3);

    setAiTarget({
      jobTitle: iv.jobId?.title ?? "Unknown Role",
      candidateName: iv.jobSeekerId?.fullName ?? "Candidate",
      skills,
      experienceYears: Math.round(expYears),
    });
  }

  async function updateInterviewStatus(id: string, newStatus: string) {
    await updateMutation.mutateAsync({ id, status: newStatus });
  }

  return (
    <div className="page-container">
      {aiTarget && (
        <AIInterviewQuestionsPanel
          jobTitle={aiTarget.jobTitle}
          candidateName={aiTarget.candidateName}
          skills={aiTarget.skills}
          experienceYears={aiTarget.experienceYears}
          onClose={() => setAiTarget(null)}
        />
      )}
      <PageHeader
        title="Interviews"
        description="Manage and track candidate interviews"
        actions={
          can("interviews", "create") ? (
            <Button size="sm" asChild>
              <Link href={`/${locale}/employer/interviews/bulk`}>+ Bulk Schedule</Link>
            </Button>
          ) : null
        }
      />

      <div className="flex gap-3">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="no-show">No Show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Candidate</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI</TableHead>
              {can("interviews", "update") && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 w-3/4 rounded bg-muted animate-pulse" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : interviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No interviews scheduled yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : interviews.map((iv) => (
              <TableRow key={iv._id}>
                <TableCell>
                  <div className="font-medium">{iv.jobSeekerId?.fullName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground/60">{iv.jobSeekerId?.email ?? ""}</div>
                </TableCell>
                <TableCell className="text-foreground/80">{iv.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{iv.type ?? "in-person"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(iv.scheduledAt).toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={iv.status} /></TableCell>
                <TableCell>
                  <Button
                    variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary"
                    onClick={() => openAIQuestions(iv)}
                    title="Generate AI interview questions"
                  >
                    <Sparkles className="h-3 w-3" /> Questions
                  </Button>
                </TableCell>
                {can("interviews", "update") && (
                  <TableCell>
                    <div className="flex gap-1">
                      {iv.status === "scheduled" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-700"
                            onClick={() => updateInterviewStatus(iv._id, "completed")}>
                            Complete
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-700"
                            onClick={() => updateInterviewStatus(iv._id, "cancelled")}>
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

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
