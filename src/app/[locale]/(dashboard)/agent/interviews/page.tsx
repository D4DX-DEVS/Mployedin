"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Edit2, CheckCircle, XCircle, Inbox } from "lucide-react";

interface Interview {
  _id: string;
  jobSeekerId?: { fullName?: string };
  jobId?: { title?: string };
  employerId?: { companyName?: string };
  scheduledAt: string;
  type?: string;
  status: string;
  notes?: string;
}

const INTERVIEW_FIELDS: CrudField[] = [
  { name: "scheduledAt", label: "Scheduled At", type: "date", required: true },
  { name: "type", label: "Type", type: "select", options: [
    { value: "video", label: "Video" }, { value: "in-person", label: "In-Person" }, { value: "phone", label: "Phone" },
  ]},
  { name: "notes", label: "Notes", type: "textarea" },
];

export default function AgentInterviewsPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editInterview, setEditInterview] = useState<Interview | null>(null);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (status) params.set("status", status);
    const res = await fetch(`/api/interviews?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInterviews(data.items ?? data.interviews ?? []);
      pagination.updateTotal(data.total ?? data.totalCount ?? 0);
    }
    setLoading(false);
  }, [status, pagination.page, pagination.limit]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  useEffect(() => { pagination.resetPage(); }, [status]);

  const updateInterviewStatus = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/interviews/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) fetchInterviews();
  };

  const handleSave = async (values: Record<string, string>) => {
    if (!editInterview) return;
    const res = await fetch(`/api/interviews/${editInterview._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error("Failed to update interview");
    setEditInterview(null);
    fetchInterviews();
  };

  return (
    <div className="page-container">
      <PageHeader title="Interviews" description="Manage interviews scheduled for your candidates" />

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <TableHead>Job</TableHead>
              <TableHead>Employer</TableHead>
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
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : interviews.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No interviews found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : interviews.map((iv) => (
              <TableRow key={iv._id}>
                <TableCell className="font-medium">{iv.jobSeekerId?.fullName ?? "—"}</TableCell>
                <TableCell className="text-foreground/80">{iv.jobId?.title ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{iv.employerId?.companyName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground capitalize">{iv.type ?? "in-person"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(iv.scheduledAt).toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={iv.status} /></TableCell>
                {can("interviews", "update") && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="xs" onClick={() => { setEditInterview(iv); setModalOpen(true); }} title="Edit">
                        <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                      </Button>
                      {iv.status === "scheduled" && (
                        <>
                          <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "completed")} title="Mark completed">
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => updateInterviewStatus(iv._id, "cancelled")} title="Cancel">
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
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

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditInterview(null); }}
        title="Edit Interview"
        fields={INTERVIEW_FIELDS}
        initialValues={editInterview ? {
          scheduledAt: editInterview.scheduledAt?.slice(0, 10) ?? "",
          type: editInterview.type ?? "video",
          notes: editInterview.notes ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
