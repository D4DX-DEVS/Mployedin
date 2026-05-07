"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { Pencil, Trash2, UserX, ChevronDown, ChevronUp, Briefcase, GraduationCap, Globe, Award } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Inbox, Download, FileSpreadsheet, FileText } from "lucide-react";

interface JobSeeker {
  _id: string;
  fullName: string;
  email?: string;
  nationality?: string;
  currentLocation?: string;
  status?: string;
  userId?: { name?: string; email?: string };
  headline?: string;
  summary?: string;
  skills?: string[];
  education?: { degree?: string; institution?: string; field?: string; startYear?: string; passingYear?: string }[];
  experience?: { jobTitle?: string; company?: string; location?: string; isCurrent?: boolean; startDate?: string; endDate?: string }[];
  languages?: { language?: string; proficiency?: string }[];
  certifications?: string[];
  profileCompleteness?: number;
  phone?: string;
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
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [jobSeekers, setJobSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [editItem, setEditItem] = useState<JobSeeker | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const exportColumns: ExportColumn<JobSeeker>[] = [
    { header: "Name", key: "fullName", formatter: (v, r) => String(v || (r as unknown as JobSeeker).userId?.name || "—") },
    { header: "Email", key: "email", formatter: (v, r) => String(v ?? (r as unknown as JobSeeker).userId?.email ?? "—") },
    { header: "Nationality", key: "nationality", formatter: (v) => String(v ?? "—") },
    { header: "Status", key: "status", formatter: (v) => String(v ?? "active") },
    { header: "Joined", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: jobSeekers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "job-seekers",
    title: "Job Seekers",
  });

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
    const ok = await confirmDialog({ message: "Deactivate this job seeker? They won't be able to log in.", confirmLabel: "Deactivate" });
    if (!ok) return;
    await fetch(`/api/job-seekers/${id}`, { method: "DELETE" });
    fetchJobSeekers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Permanently Delete Job Seeker", message: "This will permanently delete the job seeker and all their data. This cannot be undone.", confirmLabel: "Delete Forever" });
    if (!ok) return;
    await fetch(`/api/job-seekers/${id}?permanent=true`, { method: "DELETE" });
    fetchJobSeekers();
  };

  return (
    <div className="page-container space-y-4">
      {ConfirmDialogNode}
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Job Seekers</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Browse and manage all candidate profiles.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search job seeker…"
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Profession</TableHead>
              <TableHead>Education</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Profile %</TableHead>
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
              <><TableRow key={js._id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expandedId === js._id ? null : js._id)}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {expandedId === js._id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    {js.fullName || js.userId?.name || "—"}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.headline || js.experience?.[0]?.jobTitle || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.education?.[0]?.degree ? `${js.education[0].degree}${js.education[0].field ? ` - ${js.education[0].field}` : ""}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{js.nationality ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{js.skills?.length ? `${js.skills.slice(0, 3).join(", ")}${js.skills.length > 3 ? ` +${js.skills.length - 3}` : ""}` : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{js.profileCompleteness != null ? `${js.profileCompleteness}%` : "—"}</TableCell>
                <TableCell><StatusBadge status={js.status ?? "active"} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(js.createdAt).toLocaleDateString()}</TableCell>
                {(can("job_seekers", "update") || can("job_seekers", "delete")) && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                      {can("job_seekers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(js._id)} title="Delete permanently">
                          <UserX className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
              {expandedId === js._id && (
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableCell colSpan={10} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      {/* Summary */}
                      {js.summary && (
                        <div className="md:col-span-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Summary</p>
                          <p className="text-muted-foreground">{js.summary}</p>
                        </div>
                      )}
                      {/* Contact */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">Contact</p>
                        <p className="text-muted-foreground">{js.email ?? js.userId?.email ?? "—"}</p>
                        {js.phone && <p className="text-muted-foreground">{js.phone}</p>}
                        {js.currentLocation && <p className="text-muted-foreground">{js.currentLocation}</p>}
                      </div>
                      {/* Experience */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Experience</p>
                        {js.experience?.length ? js.experience.slice(0, 3).map((exp, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{exp.jobTitle || "—"}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}{exp.isCurrent ? " · Current" : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">No experience</p>}
                      </div>
                      {/* Education */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><GraduationCap className="h-3 w-3" /> Education</p>
                        {js.education?.length ? js.education.slice(0, 3).map((edu, i) => (
                          <div key={i} className="mb-1.5">
                            <p className="font-medium text-foreground text-xs">{edu.degree || "—"}{edu.field ? ` — ${edu.field}` : ""}</p>
                            <p className="text-xs text-muted-foreground">{edu.institution}{edu.passingYear ? ` · ${edu.passingYear}` : ""}</p>
                          </div>
                        )) : <p className="text-xs text-muted-foreground">No education</p>}
                      </div>
                      {/* Skills */}
                      {js.skills?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Award className="h-3 w-3" /> Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {js.skills.slice(0, 8).map((s) => (
                              <span key={s} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{s}</span>
                            ))}
                            {js.skills.length > 8 && <span className="text-xs text-muted-foreground">+{js.skills.length - 8} more</span>}
                          </div>
                        </div>
                      ) : null}
                      {/* Languages */}
                      {js.languages?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> Languages</p>
                          <div className="flex flex-wrap gap-1">
                            {js.languages.map((l, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{l.language} ({l.proficiency})</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {/* Certifications */}
                      {js.certifications?.length ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Certifications</p>
                          <div className="flex flex-wrap gap-1">
                            {js.certifications.slice(0, 5).map((c, i) => (
                              <span key={i} className="rounded-full border bg-muted/30 px-2 py-0.5 text-[0.65rem] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              </>
            ))}
          </TableBody>
        </Table>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Job Seeker" fields={EDIT_FIELDS}
        initialValues={editItem ? { name: editItem.fullName || editItem.userId?.name || "", email: editItem.email ?? editItem.userId?.email ?? "", nationality: editItem.nationality ?? "", currentLocation: editItem.currentLocation ?? "", summary: "" } : undefined}
        onSubmit={handleEdit} />
    </div>
  );
}
