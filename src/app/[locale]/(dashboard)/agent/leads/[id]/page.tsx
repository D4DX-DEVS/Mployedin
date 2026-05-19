"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Building2, Calendar, Clock, Edit2, Flame, Gauge,
  Loader2, Mail, MapPin, MessageSquare, Phone, Plus,
  Sparkles, Target, TrendingUp, User, XCircle,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

type LeadStatus = "new" | "contacted" | "interested" | "negotiating" | "converted" | "lost";

interface Lead {
  _id: string;
  companyName: string;
  contactPerson: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  industry?: string;
  score?: number;
  qualificationLevel?: string;
  expectedRevenue?: number;
  expectedRevenueCurrency?: string;
  source?: string;
  lostReason?: string;
  status: LeadStatus;
  notes?: string;
  followUpAt?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
  activityLog: Activity[];
}

interface Activity {
  action: string;
  note?: string;
  timestamp: string;
  by?: string;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const STAGES: LeadStatus[] = ["new", "contacted", "interested", "negotiating", "converted", "lost"];

const STAGE_CONFIG: Record<LeadStatus, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  new: { label: "New", color: "text-sky-700 dark:text-sky-300", bgColor: "bg-sky-50 dark:bg-sky-500/10", borderColor: "border-sky-200 dark:border-sky-500/30", icon: <Sparkles className="h-4 w-4" /> },
  contacted: { label: "Contacted", color: "text-indigo-700 dark:text-indigo-300", bgColor: "bg-indigo-50 dark:bg-indigo-500/10", borderColor: "border-indigo-200 dark:border-indigo-500/30", icon: <Phone className="h-4 w-4" /> },
  interested: { label: "Interested", color: "text-amber-700 dark:text-amber-300", bgColor: "bg-amber-50 dark:bg-amber-500/10", borderColor: "border-amber-200 dark:border-amber-500/30", icon: <TrendingUp className="h-4 w-4" /> },
  negotiating: { label: "Negotiating", color: "text-purple-700 dark:text-purple-300", bgColor: "bg-purple-50 dark:bg-purple-500/10", borderColor: "border-purple-200 dark:border-purple-500/30", icon: <Target className="h-4 w-4" /> },
  converted: { label: "Won", color: "text-emerald-700 dark:text-emerald-300", bgColor: "bg-emerald-50 dark:bg-emerald-500/10", borderColor: "border-emerald-200 dark:border-emerald-500/30", icon: <Building2 className="h-4 w-4" /> },
  lost: { label: "Lost", color: "text-rose-700 dark:text-rose-300", bgColor: "bg-rose-50 dark:bg-rose-500/10", borderColor: "border-rose-200 dark:border-rose-500/30", icon: <XCircle className="h-4 w-4" /> },
};

const ACTIVITY_TYPES = [
  { value: "call", label: "Phone Call", icon: <Phone className="h-4 w-4" /> },
  { value: "email", label: "Email", icon: <Mail className="h-4 w-4" /> },
  { value: "meeting", label: "Meeting", icon: <User className="h-4 w-4" /> },
  { value: "note", label: "Note", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "follow_up", label: "Follow-up", icon: <Calendar className="h-4 w-4" /> },
  { value: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" /> },
  { value: "site_visit", label: "Site Visit", icon: <MapPin className="h-4 w-4" /> },
];

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <User className="h-3.5 w-3.5" />,
  note: <MessageSquare className="h-3.5 w-3.5" />,
  follow_up: <Calendar className="h-3.5 w-3.5" />,
  whatsapp: <MessageSquare className="h-3.5 w-3.5" />,
  site_visit: <MapPin className="h-3.5 w-3.5" />,
  converted_to_employer: <Building2 className="h-3.5 w-3.5" />,
};

const TEMP_STYLES: Record<string, string> = {
  hot: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
  warm: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  cold: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300",
  qualified: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
};

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params?.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityForm, setActivityForm] = useState({ action: "note", note: "" });
  const [addingActivity, setAddingActivity] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) {
      const data = await res.json();
      setLead(data);
    } else {
      toast.error("Failed to load lead");
      router.back();
    }
    setLoading(false);
  }, [leadId, router]);

  useEffect(() => { fetchLead(); }, [fetchLead]);

  const updateStatus = async (status: LeadStatus) => {
    setUpdatingStatus(true);
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setLead(data);
      toast.success(`Moved to ${STAGE_CONFIG[status].label}`);
    } else {
      toast.error("Failed to update status");
    }
    setUpdatingStatus(false);
  };

  const addActivity = async () => {
    if (!activityForm.action) return;
    setAddingActivity(true);
    const res = await fetch(`/api/leads/${leadId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activityForm),
    });
    if (res.ok) {
      setActivityForm({ action: "note", note: "" });
      setShowActivityForm(false);
      await fetchLead();
      toast.success("Activity logged");
    } else {
      toast.error("Failed to add activity");
    }
    setAddingActivity(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading lead...</span>
      </div>
    );
  }

  if (!lead) return null;

  const config = STAGE_CONFIG[lead.status];
  const isOverdue = lead.followUpAt && new Date(lead.followUpAt) < new Date();
  const daysSinceCreated = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const lastActivity = lead.activityLog?.[lead.activityLog.length - 1];
  const daysSinceLastActivity = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity.timestamp).getTime()) / (1000 * 60 * 60 * 24))
    : daysSinceCreated;

  return (
    <div className="page-container agent-legacy-surface space-y-5">
      {/* Header */}
      <section className="workspace-hero-surface agent-legacy-hero overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <Link href="../leads" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />Back to Pipeline
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {lead.companyName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{lead.contactPerson}</span>
              {lead.country && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{lead.country}</span>}
              {lead.industry && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{lead.industry}</span>}
            </div>
          </div>

          {/* Status badge + KPIs */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${config.bgColor} ${config.borderColor} ${config.color}`}>
              {config.icon}{config.label}
            </span>
            {lead.score != null && (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${TEMP_STYLES[lead.qualificationLevel ?? "cold"]}`}>
                <Gauge className="h-3 w-3" />{lead.score}
              </span>
            )}
            <div className="workspace-glass-panel rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Age</p>
              <p className="text-sm font-bold text-foreground">{daysSinceCreated}d</p>
            </div>
            <div className="workspace-glass-panel rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Touch</p>
              <p className={`text-sm font-bold ${daysSinceLastActivity > 7 ? "text-rose-600" : "text-foreground"}`}>{daysSinceLastActivity}d ago</p>
            </div>
          </div>
        </div>

        {/* Pipeline progression */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {STAGES.filter((s) => s !== "lost").map((s, i) => {
            const sConfig = STAGE_CONFIG[s];
            const isActive = s === lead.status;
            const isPast = STAGES.indexOf(s) < STAGES.indexOf(lead.status);
            return (
              <div key={s} className="flex items-center gap-1.5">
                <button
                  onClick={() => !isActive && updateStatus(s)}
                  disabled={isActive || updatingStatus}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                    isActive
                      ? `${sConfig.bgColor} ${sConfig.borderColor} ${sConfig.color} border shadow-sm`
                      : isPast
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "border border-border/50 text-muted-foreground/50 hover:border-border hover:text-muted-foreground"
                  }`}
                >
                  {sConfig.icon}{sConfig.label}
                </button>
                {i < 4 && <div className={`h-px w-3 ${isPast ? "bg-emerald-300" : "bg-border/40"}`} />}
              </div>
            );
          })}
          {lead.status !== "lost" && (
            <button
              onClick={() => updateStatus("lost")}
              disabled={updatingStatus}
              className="ml-2 inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400"
            >
              <XCircle className="h-3.5 w-3.5" />Mark Lost
            </button>
          )}
          {lead.status === "lost" && (
            <button
              onClick={() => updateStatus("new")}
              disabled={updatingStatus}
              className="ml-2 inline-flex items-center gap-1 rounded-lg border border-sky-200 px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 transition hover:bg-sky-50 dark:border-sky-500/30 dark:text-sky-400"
            >
              <Sparkles className="h-3.5 w-3.5" />Re-open
            </button>
          )}
        </div>
      </section>

      {/* Main content: 2-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: Contact & Details */}
        <section className="workspace-panel-surface space-y-5 rounded-[28px] p-5 sm:p-6 lg:col-span-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Contact Details</h2>
          <div className="space-y-3 text-sm">
            <InfoRow icon={<User className="h-4 w-4" />} label="Contact" value={lead.contactPerson} />
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={lead.contactEmail} isLink />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={lead.contactPhone} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={[lead.city, lead.country].filter(Boolean).join(", ")} />
            <InfoRow icon={<Building2 className="h-4 w-4" />} label="Industry" value={lead.industry} />
            <InfoRow icon={<Target className="h-4 w-4" />} label="Source" value={lead.source} />
            <InfoRow
              icon={<Flame className="h-4 w-4" />}
              label="Expected Revenue"
              value={lead.expectedRevenue ? `${lead.expectedRevenueCurrency ?? "AED"} ${lead.expectedRevenue.toLocaleString()}` : undefined}
            />
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Follow-up"
              value={lead.followUpAt ? new Date(lead.followUpAt).toLocaleDateString() : undefined}
              highlight={!!isOverdue}
            />
          </div>

          {/* Notes */}
          {lead.notes && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes</h3>
              <p className="mt-2 rounded-xl bg-muted/50 p-3 text-sm text-foreground">{lead.notes}</p>
            </div>
          )}

          {/* Lost reason */}
          {lead.lostReason && lead.status === "lost" && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Lost Reason</h3>
              <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{lead.lostReason}</p>
            </div>
          )}
        </section>

        {/* Right: Activity Timeline */}
        <section className="workspace-panel-surface space-y-5 rounded-[28px] p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Activity Timeline</h2>
            <Button
              size="sm"
              onClick={() => setShowActivityForm(!showActivityForm)}
              className="h-8 rounded-lg px-3 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />Log Activity
            </Button>
          </div>

          {/* Add Activity Form */}
          {showActivityForm && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setActivityForm((f) => ({ ...f, action: t.value }))}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                      activityForm.action === t.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-background border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Add notes about this activity..."
                value={activityForm.note}
                onChange={(e) => setActivityForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
                className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={addActivity} disabled={addingActivity} className="h-8 rounded-lg px-4 text-xs">
                  {addingActivity ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Save Activity
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowActivityForm(false)} className="h-8 rounded-lg px-3 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border/60" />

            {lead.activityLog.length === 0 ? (
              <div className="py-10 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">No activities yet. Log your first interaction above.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {[...lead.activityLog].reverse().map((activity, i) => {
                  const icon = ACTIVITY_ICONS[activity.action] ?? <MessageSquare className="h-3.5 w-3.5" />;
                  const timeAgo = getTimeAgo(activity.timestamp);
                  return (
                    <div key={i} className="relative flex gap-3 pl-2">
                      <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl border border-border/50 bg-background p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold capitalize text-foreground">
                            {activity.action.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                        </div>
                        {activity.note && (
                          <p className="mt-1 text-sm text-muted-foreground">{activity.note}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function InfoRow({ icon, label, value, isLink, highlight }: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  isLink?: boolean;
  highlight?: boolean;
}) {
  if (!value) return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground/40">{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground/40">&mdash;</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2.5">
      <span className={highlight ? "text-rose-500" : "text-muted-foreground"}>{icon}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {isLink ? (
        <a href={`mailto:${value}`} className="ml-auto truncate text-xs font-medium text-primary hover:underline">{value}</a>
      ) : (
        <span className={`ml-auto truncate text-xs font-medium ${highlight ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{value}</span>
      )}
    </div>
  );
}

function getTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
