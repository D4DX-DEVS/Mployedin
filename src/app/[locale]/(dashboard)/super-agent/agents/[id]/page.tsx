"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Briefcase, Calendar, Clock, Copy, ExternalLink,
  Globe, Link2, Loader2, Mail, MapPin, Pencil, Phone, Target, TrendingUp,
  User, Users2, Activity, CheckCircle2, XCircle, AlertCircle, Save,
} from "lucide-react";
import {
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CascadingLocationPicker } from "@/components/shared/CascadingLocationPicker";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface AgentUser {
  name: string;
  email: string;
  isActive: boolean;
  joinedAt: string;
}

interface AgentProfile {
  _id: string;
  referralCode: string;
  country: string;
  currencyCode: string;
  timezone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string[];
  commissionRate: number;
  createdAt: string;
}

interface Performance {
  leadsGenerated: number;
  employersCreated: number;
  vacanciesPosted: number;
  jobSeekersSubmitted: number;
  interviewsScheduled: number;
  placementsCompleted: number;
}

interface LeadItem {
  _id: string;
  companyName: string;
  contactPerson: string;
  status: string;
  source: string;
  country: string;
  industry: string;
  createdAt: string;
  followUpAt?: string;
}

interface ReferralLinkItem {
  _id: string;
  code: string;
  label: string;
  isActive: boolean;
  usedCount: number;
  maxUses: number;
  registrations: { companyName: string; email: string; registeredAt: string }[];
  createdAt: string;
}

interface ActivityItem {
  action: string;
  targetType?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

interface AgentDetail {
  agent: AgentProfile;
  user: AgentUser;
  performance: Performance;
  leads: { items: LeadItem[]; total: number; statusBreakdown: Record<string, number> };
  referralLinks: { items: ReferralLinkItem[]; total: number; totalRegistrations: number };
  stats: { avgResponseHours: number; conversionRate: number };
  recentActivity: ActivityItem[];
}

/* ── Status helpers ── */

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  new: { label: "New", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300", icon: AlertCircle },
  contacted: { label: "Contacted", className: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300", icon: Phone },
  interested: { label: "Interested", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300", icon: Target },
  negotiating: { label: "Negotiating", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300", icon: TrendingUp },
  converted: { label: "Converted", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300", icon: CheckCircle2 },
  lost: { label: "Lost", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-600", icon: AlertCircle };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", config.className)}>
      <config.icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

/* ── Detail field helper ── */

function DetailRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-foreground break-all">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/* ── Page ── */

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/super-agent/agents/${agentId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || `Error ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch {
      setError("Failed to load agent details");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  /* ── Edit state ── */
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    commissionRate: "",
    workingHoursStart: "",
    workingHoursEnd: "",
    workingDays: [] as string[],
    isActive: true,
  });
  const [editCityIds, setEditCityIds] = useState<string[]>([]);
  const [editStateIds, setEditStateIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const openEditDialog = useCallback(() => {
    if (!data) return;
    setEditForm({
      commissionRate: String(data.agent.commissionRate ?? 0),
      workingHoursStart: data.agent.workingHoursStart ?? "",
      workingHoursEnd: data.agent.workingHoursEnd ?? "",
      workingDays: data.agent.workingDays ?? [],
      isActive: data.user.isActive,
    });
    setEditCityIds([]);
    setEditStateIds([]);
    setEditError("");
    setShowEdit(true);
  }, [data]);

  const handleEdit = async () => {
    setEditError("");
    setEditLoading(true);
    try {
      const payload: Record<string, unknown> = {};
      // commissionRate is admin-only, not sent from SA edit form
      if (editForm.workingHoursStart && editForm.workingHoursStart !== data?.agent.workingHoursStart) payload.workingHoursStart = editForm.workingHoursStart;
      if (editForm.workingHoursEnd && editForm.workingHoursEnd !== data?.agent.workingHoursEnd) payload.workingHoursEnd = editForm.workingHoursEnd;
      if (editForm.workingDays.length > 0) payload.workingDays = editForm.workingDays;
      if (editForm.isActive !== data?.user.isActive) payload.isActive = editForm.isActive;
      if (editCityIds.length > 0) payload.assignedCityIds = editCityIds;
      if (editStateIds.length > 0) payload.assignedStateIds = editStateIds;

      if (Object.keys(payload).length === 0) {
        setShowEdit(false);
        return;
      }

      const res = await fetch(`/api/super-agent/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setEditError(e.error ?? "Failed to update agent");
        return;
      }
      setShowEdit(false);
      fetchDetail();
    } catch {
      setEditError("Network error");
    } finally {
      setEditLoading(false);
    }
  };

  const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Agents
        </button>
        <div className="flex flex-col items-center gap-3 py-20">
          <XCircle className="h-10 w-10 text-rose-400" />
          <p className="text-lg font-semibold">{error || "Agent not found"}</p>
        </div>
      </div>
    );
  }

  const { agent, user, performance: perf, leads, referralLinks, stats, recentActivity } = data;

  const kpis = [
    { label: "Total Leads", value: leads.total, helper: "Leads generated by this agent", icon: <Target className="h-5 w-5" />, toneClassName: "workspace-tone-sky" },
    { label: "Conversions", value: leads.statusBreakdown.converted ?? 0, helper: `${stats.conversionRate}% conversion rate`, icon: <TrendingUp className="h-5 w-5" />, toneClassName: "workspace-tone-emerald" },
    { label: "Placements", value: perf.placementsCompleted ?? 0, helper: "Confirmed job placements", icon: <Briefcase className="h-5 w-5" />, toneClassName: "workspace-tone-indigo" },
    { label: "Referral Signups", value: referralLinks.totalRegistrations, helper: `${referralLinks.total} active link(s)`, icon: <Link2 className="h-5 w-5" />, toneClassName: "workspace-tone-amber" },
  ];

  return (
    <div className="page-container space-y-6">
      {/* Back nav */}
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Agents
      </button>

      {/* Hero */}
      <SuperAgentPageIntro
        title={user.name}
        description={`${user.email} · Joined ${new Date(user.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        eyebrow="Agent profile"
      >
        <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[180px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", user.isActive ? "bg-emerald-500" : "bg-rose-400")} />
            <span className="text-sm font-semibold text-foreground">{user.isActive ? "Active" : "Inactive"}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Commission: {agent.commissionRate ?? 0}%</p>
        </div>
        <Button variant="outline" size="sm" onClick={openEditDialog} className="gap-2">
          <Pencil className="h-3.5 w-3.5" />
          Edit Agent
        </Button>
      </SuperAgentPageIntro>

      {/* KPIs */}
      <SuperAgentMetricsGrid items={kpis} />

      {/* Two column: Profile + Performance */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profile */}
        <SuperAgentSection eyebrow="Profile" title="Agent Information">
          <div className="grid gap-0 sm:grid-cols-2">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow icon={User} label="Name" value={user.name} />
            <DetailRow icon={Globe} label="Country" value={agent.country || "—"} />
            <DetailRow icon={MapPin} label="Timezone" value={agent.timezone} />
            <DetailRow icon={Clock} label="Working Hours" value={`${agent.workingHoursStart} – ${agent.workingHoursEnd}`} />
            <DetailRow icon={Calendar} label="Working Days" value={agent.workingDays?.join(", ") || "—"} />
            <DetailRow
              icon={Link2}
              label="Referral Code"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{agent.referralCode}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(agent.referralCode)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Copy"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </span>
              }
            />
            <DetailRow icon={Briefcase} label="Commission Rate" value={`${agent.commissionRate ?? 0}%`} />
          </div>
        </SuperAgentSection>

        {/* Performance */}
        <SuperAgentSection eyebrow="Metrics" title="Performance Breakdown">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([
              ["Leads Generated", perf.leadsGenerated, "workspace-tone-sky"],
              ["Employers Created", perf.employersCreated, "workspace-tone-emerald"],
              ["Vacancies Posted", perf.vacanciesPosted, "workspace-tone-indigo"],
              ["Job Seekers", perf.jobSeekersSubmitted, "workspace-tone-violet"],
              ["Interviews", perf.interviewsScheduled, "workspace-tone-amber"],
              ["Placements", perf.placementsCompleted, "workspace-tone-rose"],
            ] as [string, number, string][]).map(([label, value, tone]) => (
              <div key={label} className="rounded-2xl border border-border/40 p-3 text-center">
                <p className="text-2xl font-semibold text-foreground">{value ?? 0}</p>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {stats.avgResponseHours > 0 && (
            <div className="mt-4 rounded-xl bg-muted/40 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Avg. Response Time</p>
              <p className={cn("text-lg font-semibold", stats.avgResponseHours > 48 ? "text-amber-600" : "text-emerald-600")}>
                {stats.avgResponseHours}h
              </p>
            </div>
          )}
        </SuperAgentSection>
      </div>

      {/* Lead Pipeline */}
      <SuperAgentSection
        eyebrow="Pipeline"
        title="Lead Pipeline"
        description={`${leads.total} leads across all stages`}
      >
        {/* Status pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(["new", "contacted", "interested", "negotiating", "converted", "lost"] as const).map((s) => (
            <div key={s} className="rounded-xl border border-border/40 px-3 py-2 text-center min-w-[100px]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {STATUS_CONFIG[s]?.label ?? s}
              </p>
              <p className="mt-0.5 text-xl font-semibold text-foreground">{leads.statusBreakdown[s] ?? 0}</p>
            </div>
          ))}
        </div>

        {leads.items.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.items.map((l) => (
                  <TableRow key={l._id}>
                    <TableCell className="font-medium">{l.companyName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.contactPerson}</TableCell>
                    <TableCell className="text-sm">{l.country || "—"}</TableCell>
                    <TableCell className="text-sm">{l.industry || "—"}</TableCell>
                    <TableCell className="text-sm">{l.source || "—"}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No leads yet.</p>
        )}
      </SuperAgentSection>

      {/* Referral Links */}
      <SuperAgentSection
        eyebrow="Referrals"
        title="Referral Links"
        description={`${referralLinks.totalRegistrations} employer signups from ${referralLinks.total} link(s)`}
      >
        {referralLinks.items.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <Table>
              <TableHeader>
                <TableRow className="bg-background/60 hover:bg-background/60">
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Registrations</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referralLinks.items.map((rl) => (
                  <TableRow key={rl._id}>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{rl.code}</code>
                    </TableCell>
                    <TableCell className="text-sm">{rl.label || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{rl.usedCount}</TableCell>
                    <TableCell className="text-center text-sm font-medium">{rl.registrations?.length ?? 0}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                        rl.isActive
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300"
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", rl.isActive ? "bg-emerald-500" : "bg-gray-400")} />
                        {rl.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(rl.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No referral links created yet.</p>
        )}
      </SuperAgentSection>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <SuperAgentSection eyebrow="Activity" title="Recent Activity">
          <div className="space-y-0">
            {recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-border/30 py-3 last:border-0">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground capitalize">{act.action.replace(/_/g, " ")}</p>
                  {act.targetType && (
                    <p className="text-xs text-muted-foreground">Target: {act.targetType}</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(act.timestamp).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SuperAgentSection>
      )}

      {/* ── Edit Agent Dialog ── */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
            <DialogDescription>Update agent settings. Region changes must stay within your territory.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />{editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Commission Rate</Label>
                <div className="flex items-center gap-2 h-10 rounded-lg border border-border bg-muted/30 px-3">
                  <span className="text-sm font-semibold">{editForm.commissionRate || 0}%</span>
                  <span className="ml-auto text-[9px] text-muted-foreground uppercase tracking-wide">Set by Admin</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => ({ ...f, isActive: !f.isActive }))}
                    className={cn(
                      "relative h-6 w-11 rounded-full transition-colors",
                      editForm.isActive ? "bg-emerald-500" : "bg-gray-300"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm",
                        editForm.isActive && "translate-x-5"
                      )}
                    />
                  </button>
                  <span className="text-sm">{editForm.isActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Working Hours Start</Label>
                <Input
                  type="time"
                  value={editForm.workingHoursStart}
                  onChange={(e) => setEditForm((f) => ({ ...f, workingHoursStart: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Working Hours End</Label>
                <Input
                  type="time"
                  value={editForm.workingHoursEnd}
                  onChange={(e) => setEditForm((f) => ({ ...f, workingHoursEnd: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Working Days</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setEditForm((f) => ({
                        ...f,
                        workingDays: f.workingDays.includes(d)
                          ? f.workingDays.filter((x) => x !== d)
                          : [...f.workingDays, d],
                      }))
                    }
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                      editForm.workingDays.includes(d)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <CascadingLocationPicker
              selectedCityIds={editCityIds}
              selectedStateIds={editStateIds}
              onChange={(cities, states) => { setEditCityIds(cities); setEditStateIds(states); }}
              label="Update Assigned Region (optional)"
            />

            <p className="text-xs text-muted-foreground">
              Leave region empty to keep current assignments. New regions must fall within your territory.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setShowEdit(false)} disabled={editLoading}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editLoading}>
              {editLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLoading ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
