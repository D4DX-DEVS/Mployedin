"use client";

import { useState, useEffect, useCallback } from "react";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowRight, BriefcaseBusiness, Edit2, Inbox, MapPin, Search, Sparkles, UserRoundSearch } from "lucide-react";

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

  const completeProfiles = seekers.filter((seeker) => (seeker.profileCompleteness ?? 0) >= 80).length;
  const averageCompleteness = seekers.length > 0
    ? Math.round(seekers.reduce((sum, seeker) => sum + (seeker.profileCompleteness ?? 0), 0) / seekers.length)
    : 0;
  const withTitles = seekers.filter((seeker) => Boolean(seeker.currentJobTitle)).length;

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Job Seekers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Review candidate profiles, gauge profile readiness, and update key details before matching them into active roles.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[260px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Talent pool</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} profiles</p>
            <p className="text-xs text-muted-foreground">Candidate accounts currently available in your pipeline scope.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Complete</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{completeProfiles}</p><p className="mt-1 text-xs text-muted-foreground">Profiles at 80% completeness or above.</p></div><div className="workspace-tone-emerald rounded-2xl p-2.5"><UserRoundSearch className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Avg. profile</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{averageCompleteness}%</p><p className="mt-1 text-xs text-muted-foreground">Average readiness across current results.</p></div><div className="workspace-tone-sky rounded-2xl p-2.5"><ArrowRight className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">With titles</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{withTitles}</p><p className="mt-1 text-xs text-muted-foreground">Profiles that already include current job titles.</p></div><div className="workspace-tone-indigo rounded-2xl p-2.5"><BriefcaseBusiness className="h-5 w-5" /></div></div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Search state</p><p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{search ? 1 : 0}</p><p className="mt-1 text-xs text-muted-foreground">Whether the job seeker list is currently filtered.</p></div><div className="workspace-tone-amber rounded-2xl p-2.5"><Search className="h-5 w-5" /></div></div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse profiles</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Search by candidate details or skill context</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find the right subset of job seekers before making profile updates or shortlisting them for roles.</p>
        </div>
        <div className="mt-5 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, email or skill" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl border-border bg-background/70 pl-9 text-sm shadow-none" />
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Current results</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Review profile strength before the next match</h2>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"><ArrowRight className="h-3.5 w-3.5 text-primary" />{pagination.total} profiles across {pagination.totalPages} page{pagination.totalPages === 1 ? "" : "s"}</div>
        </div>

        <div className="workspace-subtle-surface mt-5 overflow-hidden rounded-[24px]">
        <Table>
          <TableHeader>
            <TableRow className="workspace-subtle-surface hover:bg-secondary/70">
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
                    <Inbox className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">No job seekers found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : seekers.map((s) => (
              <TableRow key={s._id} className="hover:bg-secondary/50">
                <TableCell className="font-medium text-foreground">{s.userId?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.userId?.email ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.currentJobTitle ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {s.location ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(s.skills ?? []).slice(0, 3).map((skill) => (
                      <span key={skill} className="workspace-tone-sky rounded-full px-2 py-0.5 text-xs">{skill}</span>
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
                    <Button variant="ghost" size="xs" onClick={() => { setEditSeeker(s); setModalOpen(true); }} title="Edit" aria-label={`Edit ${s.userId?.name ?? "job seeker"}`}>
                      <Edit2 className="h-3.5 w-3.5 text-primary" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </section>

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
