"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";

interface Interview {
  _id: string;
  jobSeekerId?: { fullName?: string; email?: string };
  jobId?: { title?: string };
  scheduledAt: string;
  type?: string;
  status: string;
  notes?: string;
}

export default function EmployerInterviewsPage() {
  const { locale } = useParams<{ locale: string }>();
  const pagination = usePagination();
  const { can } = usePermissions();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/interviews?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInterviews(data.items ?? data.interviews ?? []);
      pagination.updateTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [status, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  useEffect(() => { pagination.resetPage(); }, [status]);

  async function updateInterviewStatus(id: string, newStatus: string) {
    const res = await fetch(`/api/interviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchInterviews();
  }

  return (
    <div className="page-container">
      <div className="flex items-start justify-between">
        <PageHeader title="Interviews" description="Manage and track candidate interviews" />
        {can("interviews", "create") && (
          <Button size="sm" asChild>
            <Link href={`/${locale}/employer/interviews/bulk`}>+ Bulk Schedule</Link>
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no-show">No Show</option>
        </select>
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
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
