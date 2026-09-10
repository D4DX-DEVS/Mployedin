"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { useParams, useSearchParams } from "next/navigation";
import { JobScopeStrip } from "@/components/features/employer/jobs/JobScopeStrip";
import { ShieldCheck, Plus, Trash2, UserCheck, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { CandidateDataNotice } from "@/components/shared/CandidateDataNotice";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { csrfFetch } from "@/lib/security/csrf-client";

type CheckType = "background" | "reference" | "both";
type CheckStatus = "pending" | "in_progress" | "completed" | "cancelled";
type Outcome = "clear" | "flagged" | "failed" | "unable_to_verify" | "pending";
type RefStatus = "pending" | "requested" | "responded" | "declined";

interface ReferenceContact {
  name: string;
  relationship?: string;
  company?: string;
  email?: string;
  phone?: string;
  status: RefStatus;
  feedback?: string;
  respondedAt?: string;
}

interface BackgroundCheck {
  _id: string;
  checkType: CheckType;
  status: CheckStatus;
  outcome: Outcome;
  references: ReferenceContact[];
  backgroundNotes?: string;
  backgroundResults?: string;
  createdAt: string;
  jobId?: { _id: string; title?: string };
  jobSeekerId?: { _id: string; fullName?: string; userId?: { name?: string } };
  assignedTo?: { _id: string; name?: string; email?: string } | null;
  verifiedBy?: { _id: string; name?: string; email?: string } | null;
  verifiedAt?: string;
}

/** A colleague who may be handed a check, from the team list. */
interface Screener {
  _id: string;
  name: string;
}

interface ApplicationOption {
  _id: string;
  jobId?: { title?: string };
  jobSeekerId?: { fullName?: string; userId?: { name?: string } };
}

interface NewReferenceRow {
  name: string;
  relationship: string;
  company: string;
  email: string;
}

export default function BackgroundChecksPage() {
  const t = useTranslations("employerBackgroundChecks");

  const [checks, setChecks] = useState<BackgroundCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<BackgroundCheck | null>(null);

  // Create form state
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [applicationId, setApplicationId] = useState("");
  const [checkType, setCheckType] = useState<CheckType>("reference");
  const [refs, setRefs] = useState<NewReferenceRow[]>([{ name: "", relationship: "", company: "", email: "" }]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useUrlFilter("q", "", { debounceMs: 400 });
  // `?jobId=` scopes the page to one job (deep links from the job workspace).
  const [jobFilter, setJobFilter] = useUrlFilter("jobId", "");
  const { locale } = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const [dateFrom, setDateFrom] = useUrlFilter("from", "");
  const [dateTo, setDateTo] = useUrlFilter("to", "");
  // A colleague opens their own queue by default; the owner sees everything.
  const [assignedToMe, setAssignedToMe] = useUrlFilter("mine", "");
  const [screeners, setScreeners] = useState<Screener[]>([]);

  useEffect(() => {
    document.title = `${t("title")} · MPLOYEDIN`;
  }, [t]);

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/employer/background-checks?limit=50${jobFilter ? `&jobId=${encodeURIComponent(jobFilter)}` : ""}${assignedToMe === "1" ? "&assignedToMe=true" : ""}`
      );
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setChecks(data.items ?? []);
    } catch {
      setChecks([]);
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, jobFilter, assignedToMe]);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  // Colleagues who may be handed a check. Only those the team list says can
  // run screening appear, so a check is never assigned to someone who would
  // then be refused at the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/employers/team?limit=100");
        if (!res.ok) return; // A member without team access simply gets no picker.
        const data = (await res.json()) as {
          members?: Array<{
            _id: string;
            email: string;
            status: string;
            permissions?: { canRunScreening?: boolean };
            user?: { name?: string } | null;
            userId?: string;
          }>;
        };
        if (cancelled) return;
        setScreeners(
          (data.members ?? [])
            .filter((m) => m.status === "active" && m.permissions?.canRunScreening && m.userId)
            .map((m) => ({ _id: String(m.userId), name: m.user?.name ?? m.email }))
        );
      } catch {
        // Non-blocking: the list still works without the assignment picker.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** `preselectId` comes from `?applicationId=` — a deep link from the
   *  candidate panel, where the employer has already picked the person. That
   *  candidate is injected into the options even if their stage keeps them out
   *  of the general list below, so the link can never land on a form that
   *  cannot select them. */
  async function openCreate(preselectId?: string) {
    setApplicationId(preselectId ?? "");
    setCheckType("reference");
    setRefs([{ name: "", relationship: "", company: "", email: "" }]);
    setNotes("");
    setCreateOpen(true);
    try {
      // Candidates eligible for a background / reference check: anyone who has
      // advanced to the interview stage or beyond. `stageFrom` says exactly
      // that in one request — the five parallel `status=` calls it replaces
      // included "interviewed", which is not an application status and always
      // came back empty, and none of them carried the job scope, so a page
      // headed "Showing this job only" offered candidates from other jobs.
      const params = new URLSearchParams({ limit: "50", stageFrom: "interview_scheduled" });
      if (jobFilter) params.set("jobId", jobFilter);
      const r = await fetch(`/api/applications?${params.toString()}`);
      const d = r.ok ? await r.json() : { applications: [] };
      const merged = (d.applications ?? []) as ApplicationOption[];
      const seen = new Set(merged.map((app) => app._id));
      if (preselectId && !seen.has(preselectId)) {
        try {
          const preselectRes = await fetch(`/api/applications/${preselectId}`);
          const preselectBody = preselectRes.ok ? await preselectRes.json() : null;
          if (preselectBody?.application?._id) merged.unshift(preselectBody.application as ApplicationOption);
        } catch {
          /* the picker simply stays without it */
        }
      }
      setApplications(merged);
    } catch {
      setApplications([]);
    }
  }

  // Open the request form straight away when arrived at by deep link.
  // `?applicationId=` preselects a candidate (from the candidate drawer);
  // `?new=1` just opens the form (from the job's Background Checks tab, which
  // already carries `?jobId=`, so the picker arrives scoped to that job).
  const deepLinkedApplicationId = searchParams.get("applicationId") ?? "";
  const wantsNew = searchParams.get("new") === "1";
  const deepLinkHandledRef = useRef("");
  useEffect(() => {
    const token = deepLinkedApplicationId || (wantsNew ? "new" : "");
    if (!token || deepLinkHandledRef.current === token) return;
    deepLinkHandledRef.current = token;
    void openCreate(deepLinkedApplicationId || undefined);
    // openCreate is a stable component-scoped function; re-running on its
    // identity would reopen the dialog on every render.
     
  }, [deepLinkedApplicationId, wantsNew]);

  // A `checkId` param opens that one check straight into its detail dialog. The job
  // workspace's "Manage" link lands here, so it must open that record rather
  // than dropping the employer on a list to hunt through.
  const deepLinkedCheckId = searchParams.get("checkId") ?? "";
  const detailLinkHandledRef = useRef("");
  useEffect(() => {
    if (!deepLinkedCheckId || detailLinkHandledRef.current === deepLinkedCheckId) return;
    const match = checks.find((c) => c._id === deepLinkedCheckId);
    if (!match) return; // list still loading — retry once it arrives
    detailLinkHandledRef.current = deepLinkedCheckId;
    setDetail(match);
  }, [deepLinkedCheckId, checks]);

  function updateRef(i: number, patch: Partial<NewReferenceRow>) {
    setRefs((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Same rules submitCreate enforces, so the button reflects them rather than
  // letting someone click into a toast.
  const namedRefCount = refs.filter((r) => r.name.trim().length >= 2).length;
  const canSubmitCreate = Boolean(applicationId)
    && (checkType === "background" || namedRefCount > 0);

  async function submitCreate() {
    if (!applicationId) {
      toast.error(t("errors.selectApplication"));
      return;
    }
    const cleanRefs = refs
      .filter((r) => r.name.trim().length >= 2)
      .map((r) => ({
        name: r.name.trim(),
        relationship: r.relationship.trim() || undefined,
        company: r.company.trim() || undefined,
        email: r.email.trim() || undefined,
      }));
    if ((checkType === "reference" || checkType === "both") && cleanRefs.length === 0) {
      toast.error(t("errors.referenceRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await csrfFetch("/api/employer/background-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, checkType, references: cleanRefs, backgroundNotes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "failed");
      }
      toast.success(t("created"));
      setCreateOpen(false);
      fetchChecks();
    } catch (e) {
      toast.error(t("errors.createFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function patchCheck(id: string, body: Record<string, unknown>) {
    const res = await csrfFetch(`/api/employer/background-checks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(t("errors.updateFailed"));
      return null;
    }
    const data = await res.json();
    setChecks((prev) => prev.map((c) => (c._id === id ? data.check : c)));
    setDetail(data.check);
    return data.check as BackgroundCheck;
  }

  const candidateName = (c: BackgroundCheck | ApplicationOption) =>
    c.jobSeekerId?.fullName || c.jobSeekerId?.userId?.name || "Candidate";

  const statusColor = (s: CheckStatus) =>
    s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : s === "in_progress" ? "bg-blue-100 text-blue-700 border-blue-300"
      : s === "cancelled" ? "bg-gray-100 text-gray-600 border-gray-300"
      : "bg-amber-100 text-amber-700 border-amber-300";

  // Hoisted so the list can tell "no checks yet" apart from "filters match
  // nothing" — filtering inline rendered an empty grid with no explanation.
  const filtered = checks.filter((c) => {
    if (search.trim() && !candidateName(c).toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false;
    if (dateTo && new Date(c.createdAt) > new Date(dateTo)) return false;
    return true;
  });

  const outcomeColor = (o: Outcome) =>
    o === "clear" ? "bg-emerald-100 text-emerald-700 border-emerald-300"
      : o === "flagged" ? "bg-amber-100 text-amber-700 border-amber-300"
      : o === "failed" ? "bg-red-100 text-red-700 border-red-300"
      : o === "unable_to_verify" ? "bg-slate-200 text-slate-700 border-slate-300"
      : "bg-gray-100 text-gray-600 border-gray-300";

  return (
    <div className="page-container">
      <WorkspaceHeader
        title={t("title")}
        context={t("description")}
        actions={
          <Button onClick={() => { void openCreate(); }} aria-label={t("newCheck")} className="rounded-xl px-3 sm:px-4">
            <Plus className="h-4 w-4 sm:me-2" aria-hidden="true" />
            <span className="hidden sm:inline">{t("newCheck")}</span>
          </Button>
        }
      />
      {jobFilter && <JobScopeStrip jobId={jobFilter} locale={locale} onClear={() => setJobFilter("")} />}

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card card-pad">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : checks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <>
          {/* List toolbar — search and date range sit with the list, not in a card of their own */}
          <div className="workspace-toolbar">
            <div className="workspace-toolbar-search">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl border-border bg-background ps-9 sm:h-10"
                aria-label={t("searchPlaceholder")}
              />
            </div>
            {/* Whose queue. A colleague usually wants only their own checks,
                and the owner usually wants all of them. */}
            <div className="flex items-center gap-1 rounded-xl border border-border p-1">
              <Button
                type="button"
                size="sm"
                variant={assignedToMe === "1" ? "outline" : "default"}
                className="rounded-lg"
                aria-pressed={assignedToMe !== "1"}
                onClick={() => setAssignedToMe("")}
              >
                {t("allChecks")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={assignedToMe === "1" ? "default" : "outline"}
                className="rounded-lg"
                aria-pressed={assignedToMe === "1"}
                onClick={() => setAssignedToMe("1")}
              >
                {t("assignedToMe")}
              </Button>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <DateTimePicker
                mode="date"
                value={dateFrom}
                onChange={setDateFrom}
                placeholder={t("fromDate")}
              />
              <DateTimePicker
                mode="date"
                value={dateTo}
                onChange={setDateTo}
                placeholder={t("toDate")}
              />
              {/* Privacy info at the point candidate data is shown, compacted
                  to an icon + popover to keep the list above the fold. */}
              <CandidateDataNotice variant="candidateList" compact />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center">
              <Search className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">{t("noResults")}</p>
            </div>
          ) : (
          <div className="grid gap-3">
          {filtered.map((c) => (
            <button
              key={c._id}
              onClick={() => setDetail(c)}
              className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card text-left transition hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between card-pad"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-foreground">{candidateName(c)}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.jobId?.title} · {t(`type.${c.checkType}`)} · {c.references.length} {t("references")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.assignedTo
                      ? `${t("assignedTo")}: ${c.assignedTo.name ?? c.assignedTo.email ?? ""}`
                      : t("unassigned")}
                    {c.verifiedBy
                      ? ` · ${t("verifiedBy", { name: c.verifiedBy.name ?? c.verifiedBy.email ?? "" })}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={statusColor(c.status)}>{t(`status.${c.status}`)}</Badge>
                <Badge variant="outline" className={outcomeColor(c.outcome)}>{t(`outcome.${c.outcome}`)}</Badge>
                {/* The whole row is the control, but two badges alone read as
                    output, not as something to press — name the action. */}
                <span className="ms-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {t("openCheck")}
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
                </span>
              </div>
            </button>
          ))}
          </div>
          )}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("newCheck")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5">
              <Label>{t("fields.candidate")}</Label>
              <SearchableSelect
                value={applicationId}
                onValueChange={setApplicationId}
                placeholder={t("fields.selectCandidate")}
                options={applications.map((a) => ({
                  value: a._id,
                  label: `${candidateName(a)} — ${a.jobId?.title ?? ""}`,
                }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("fields.checkType")}</Label>
              <div className="flex flex-wrap gap-2">
                {(["reference", "background", "both"] as CheckType[]).map((ct) => (
                  <Button
                    key={ct}
                    type="button"
                    size="sm"
                    variant={checkType === ct ? "default" : "outline"}
                    onClick={() => setCheckType(ct)}
                    className="rounded-xl"
                  >
                    {t(`type.${ct}`)}
                  </Button>
                ))}
              </div>
            </div>

            {(checkType === "reference" || checkType === "both") && (
              <div className="field">
                <Label>{t("fields.references")}</Label>
                {refs.map((r, i) => (
                  <div key={i} className="rounded-xl border border-border/60 space-y-2 chip-pad">
                    <div className="flex items-center gap-2">
                      <Input placeholder={t("fields.refName")} value={r.name} onChange={(e) => updateRef(i, { name: e.target.value })} />
                      {refs.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => setRefs((p) => p.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Input placeholder={t("fields.refRelationship")} value={r.relationship} onChange={(e) => updateRef(i, { relationship: e.target.value })} />
                      <Input placeholder={t("fields.refCompany")} value={r.company} onChange={(e) => updateRef(i, { company: e.target.value })} />
                      <Input placeholder={t("fields.refEmail")} value={r.email} onChange={(e) => updateRef(i, { email: e.target.value })} />
                    </div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setRefs((p) => [...p, { name: "", relationship: "", company: "", email: "" }])}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("fields.addReference")}
                </Button>
              </div>
            )}

            <div className="field">
              <Label>{t("fields.notes")}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("fields.notesPlaceholder")} className="min-h-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("cancel")}</Button>
            {/* Live only once the form can actually be sent. It used to be
                enabled from the moment the dialog opened, so the first click on
                an untouched form did nothing but raise a toast. */}
            <Button onClick={submitCreate} disabled={submitting || !canSubmitCreate}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{candidateName(detail)}</DialogTitle>
                <DialogDescription>
                  {detail.jobId?.title} · {t(`type.${detail.checkType}`)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("fields.status")}</Label>
                  {(["pending", "in_progress", "completed", "cancelled"] as CheckStatus[]).map((s) => (
                    <Button key={s} size="sm" variant={detail.status === s ? "default" : "outline"} className="rounded-xl" onClick={() => patchCheck(detail._id, { status: s })}>
                      {t(`status.${s}`)}
                    </Button>
                  ))}
                </div>

                {/* Hand the check to a colleague. Rendered only when there is
                    somebody to hand it to — a disabled picker with no reason
                    is worse than no picker. */}
                {screeners.length > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-assignee" className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("assignTo")}
                    </Label>
                    <SearchableSelect
                      id="bc-assignee"
                      ariaLabel={t("assignTo")}
                      placeholder={t("unassigned")}
                      value={detail.assignedTo?._id ?? ""}
                      onValueChange={(v) => patchCheck(detail._id, { assignedTo: v || null })}
                      options={[
                        { value: "", label: t("unassigned") },
                        ...screeners.map((sc) => ({ value: sc._id, label: sc.name })),
                      ]}
                    />
                    <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("fields.outcome")}</Label>
                  {(["pending", "clear", "flagged", "failed", "unable_to_verify"] as Outcome[]).map((o) => (
                    <Button key={o} size="sm" variant={detail.outcome === o ? "default" : "outline"} className="rounded-xl" onClick={() => patchCheck(detail._id, { outcome: o })}>
                      {t(`outcome.${o}`)}
                    </Button>
                  ))}
                </div>

                {/* Recording the verdict is a separate, deliberate act: it
                    stamps who checked and when, and closes the check. */}
                {detail.outcome !== "pending" && !detail.verifiedBy && (
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={async () => {
                      const updated = await patchCheck(detail._id, { verify: true });
                      if (updated) toast.success(t("verdictSaved"));
                    }}
                  >
                    {t("recordVerdict")}
                  </Button>
                )}
                {detail.verifiedBy && (
                  <p className="text-xs text-muted-foreground">
                    {t("verifiedBy", { name: detail.verifiedBy.name ?? detail.verifiedBy.email ?? "" })}
                    {detail.verifiedAt ? ` · ${new Date(detail.verifiedAt).toLocaleDateString()}` : ""}
                  </p>
                )}

                {detail.references.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t("fields.references")}</Label>
                    {detail.references.map((ref, i) => (
                      <div key={i} className="rounded-xl border border-border/60 space-y-2 chip-pad">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{ref.name}</p>
                            <p className="text-xs text-muted-foreground">{[ref.relationship, ref.company].filter(Boolean).join(" · ")}</p>
                          </div>
                          <Badge variant="outline">{t(`refStatus.${ref.status}`)}</Badge>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(["requested", "responded", "declined"] as RefStatus[]).map((rs) => (
                            <Button key={rs} size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => patchCheck(detail._id, { reference: { index: i, status: rs } })}>
                              {t(`refStatus.${rs}`)}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          defaultValue={ref.feedback}
                          placeholder={t("fields.feedbackPlaceholder")}
                          className="min-h-16 text-sm"
                          onBlur={(e) => {
                            if (e.target.value !== (ref.feedback ?? "")) {
                              patchCheck(detail._id, { reference: { index: i, feedback: e.target.value } });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {(detail.checkType === "background" || detail.checkType === "both") && (
                  <div className="field">
                    <Label>{t("fields.backgroundResults")}</Label>
                    <Textarea
                      defaultValue={detail.backgroundResults}
                      placeholder={t("fields.backgroundResultsPlaceholder")}
                      className="min-h-20"
                      onBlur={(e) => {
                        if (e.target.value !== (detail.backgroundResults ?? "")) {
                          patchCheck(detail._id, { backgroundResults: e.target.value });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>{t("close")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
