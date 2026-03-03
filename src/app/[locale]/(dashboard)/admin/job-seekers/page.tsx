"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Inbox } from "lucide-react";

interface JobSeeker {
  _id: string;
  fullName: string;
  email?: string;
  nationality?: string;
  currentLocation?: string;
  status?: string;
  userId?: { name?: string; email?: string };
  createdAt: string;
}

const EDIT_FIELDS: CrudField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email" },
  { name: "nationality", label: "Nationality", type: "text" },
  { name: "currentLocation", label: "Location", type: "text" },
  { name: "summary", label: "Summary", type: "textarea" },
];

export default function AdminJobSeekersPage() {
  const { can } = usePermissions();
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);

  const fetchJobSeekers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setJobSeekers(data.items ?? data.jobSeekers ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, page, limit]);

  useEffect(() => { fetchJobSeekers(); }, [fetchJobSeekers]);

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/job-seekers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    fetchJobSeekers();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this job seeker?")) return;
    await fetch(`/api/job-seekers/${id}`, { method: "DELETE" });
    fetchJobSeekers();
  };

  return (
    <div className="page-container">
      <PageHeader title="Job Seekers" description="Browse and manage all candidate profiles" />

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <Input
          placeholder="Search …"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobSeekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No job seekers found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : jobSeekers.map((js) => (
              <TableRow key={js._id}>
                <TableCell className="font-medium">{js.fullName || js.userId?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{js.nationality ?? "—"}</TableCell>
                <TableCell><StatusBadge status={js.status ?? "active"} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(js.createdAt).toLocaleDateString()}</TableCell>
                {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("job_seekers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(js)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("job_seekers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(js._id)} title="Deactivate">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Job Seeker" fields={EDIT_FIELDS}
        initialValues={editItem ? { name: editItem.fullName || editItem.userId?.name || "", email: editItem.email ?? editItem.userId?.email ?? "", nationality: editItem.nationality ?? "", currentLocation: editItem.currentLocation ?? "", summary: "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
