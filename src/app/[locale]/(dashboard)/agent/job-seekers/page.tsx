"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Edit2, Search, Inbox } from "lucide-react";

interface JobSeeker {
  _id: string;
  userId: { name: string; email: string };
  currentJobTitle?: string;
  location?: string;
  profileCompleteness: number;
  skills: string[];
  createdAt: string;
}

const EDIT_FIELDS: CrudField[] = [
  { name: "currentJobTitle", label: "Job Title", type: "text" },
  { name: "location", label: "Location", type: "text" },
];

export default function AgentJobSeekersPage() {
  const { can } = usePermissions();
  const pagination = usePagination();
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editSeeker, setEditSeeker] = useState<JobSeeker | null>(null);

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    const params = pagination.paginationParams();
    if (search) params.set("search", search);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSeekers(data.items ?? []);
      pagination.updateTotal(data.total ?? data.items?.length ?? 0);
    }
    setLoading(false);
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  useEffect(() => { pagination.resetPage(); }, [search]);

  const handleSave = async (values: Record<string, string>) => {
    if (!editSeeker) return;
    const res = await fetch(`/api/job-seekers/${editSeeker._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw new Error("Failed to update");
    setEditSeeker(null);
    fetchSeekers();
  };

  const completenessColor = (pct: number) =>
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400";

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader title="Job Seekers" description="Manage and track job seekers in your pipeline" />

      <div className="flex gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input placeholder="Search by name, email or skill…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm shadow-black/[0.03]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Top Skills</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Joined</TableHead>
              {can("job_seekers", "update") && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : seekers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No job seekers found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => (
              <TableRow key={s._id}>
                <TableCell className="font-medium">{s.userId?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{s.userId?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.currentJobTitle ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.location ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(s.skills ?? []).slice(0, 3).map((skill) => (
                      <span key={skill} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{skill}</span>
                    ))}
                    {(s.skills ?? []).length > 3 && (
                      <span className="text-xs text-muted-foreground">+{s.skills.length - 3}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${completenessColor(s.profileCompleteness ?? 0)}`}
                        style={{ width: `${s.profileCompleteness ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{s.profileCompleteness ?? 0}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleDateString()}
                </TableCell>
                {can("job_seekers", "update") && (
                  <TableCell>
                    <Button variant="ghost" size="xs" onClick={() => { setEditSeeker(s); setModalOpen(true); }} title="Edit">
                      <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
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
        onClose={() => { setModalOpen(false); setEditSeeker(null); }}
        title="Edit Job Seeker"
        fields={EDIT_FIELDS}
        initialValues={editSeeker ? {
          currentJobTitle: editSeeker.currentJobTitle ?? "",
          location: editSeeker.location ?? "",
        } : undefined}
        onSubmit={handleSave}
      />
    </div>
  );
}
