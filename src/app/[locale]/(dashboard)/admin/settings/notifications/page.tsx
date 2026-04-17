"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bell, Mail, Clock, Users, Send, BarChart3, Shield, Loader2,
  CheckCircle2, AlertTriangle, Save, PowerOff, UserX, Pause, Zap,
  Activity, TrendingUp, ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CronJobState {
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error";
  lastRunMessage?: string;
}

interface SystemConfigData {
  cronJobs: Record<string, CronJobState>;
  globalDefaults: {
    defaultFrequency: string;
    maxEmailsPerUserPerDay: number;
    maintenanceMode: boolean;
    maintenanceMessage?: string;
  };
  userOverrides: Array<{
    userId: string;
    action: string;
    reason: string;
    createdAt: string;
    createdBy: string;
  }>;
}

interface NotifStats {
  totalUsers: number;
  emailEnabled: number;
  unsubscribed: number;
  dailyFrequency: number;
  weeklyFrequency: number;
  instantFrequency: number;
  delivery24h: Record<string, number>;
  bySource7d: Record<string, number>;
}

interface EmailLogEntry {
  _id: string;
  to: string;
  subject: string;
  source: string;
  status: string;
  errorMessage?: string;
  sentAt: string;
}

const CRON_META: Record<string, { label: string; schedule: string; desc: string }> = {
  dailyRecommendations: { label: "Daily Job Recommendations", schedule: "9:00 AM UTC", desc: "Top 5 matching jobs to seekers" },
  dailyDigestWorker: { label: "Daily Digest Worker", schedule: "Triggered by cron", desc: "Builds & sends combined digest emails" },
  reEngagement: { label: "Re-engagement Emails", schedule: "10:00 AM UTC", desc: "Nudges 7+ day inactive seekers" },
  profileCompletion: { label: "Profile Completion", schedule: "10:30 AM UTC", desc: "Reminds seekers < 70% completeness" },
  weeklyDigest: { label: "Weekly Digest", schedule: "Sunday 9:00 AM", desc: "Weekly activity summary" },
  jobExpiryAlerts: { label: "Job Expiry Alerts", schedule: "8:00 AM UTC", desc: "Alerts seekers about saved jobs expiring" },
};

type TabKey = "overview" | "cron-jobs" | "email-logs" | "user-overrides" | "test";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [stats, setStats] = useState<NotifStats | null>(null);
  const [config, setConfig] = useState<SystemConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, configRes] = await Promise.all([
        fetch("/api/admin/notification-stats").then((r) => r.json()),
        fetch("/api/admin/notification-config").then((r) => r.json()),
      ]);
      if (statsRes.success) setStats(statsRes.stats);
      if (configRes.success) setConfig(configRes.config);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Notification System · Admin · MPLOYEDIN";
    fetchAll();
  }, [fetchAll]);

  const saveConfig = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/notification-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleCron = (key: string, enabled: boolean) => {
    saveConfig({ cronJobs: { [key]: { enabled } } });
    setConfig((prev) =>
      prev ? { ...prev, cronJobs: { ...prev.cronJobs, [key]: { ...prev.cronJobs[key], enabled } } } : prev,
    );
  };

  const toggleMaintenance = (on: boolean) => {
    saveConfig({ globalDefaults: { maintenanceMode: on } });
    setConfig((prev) =>
      prev ? { ...prev, globalDefaults: { ...prev.globalDefaults, maintenanceMode: on } } : prev,
    );
  };

  const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "cron-jobs", label: "Cron Jobs", icon: Clock },
    { key: "email-logs", label: "Email Logs", icon: Mail },
    { key: "user-overrides", label: "User Controls", icon: UserX },
    { key: "test", label: "Test Email", icon: Send },
  ];

  return (
    <div className="page-container max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notification Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Full control over the platform email automation system</p>
        </div>
        <div className="flex items-center gap-2">
          {config?.globalDefaults.maintenanceMode && (
            <Badge variant="destructive" className="gap-1"><PowerOff className="w-3 h-3" /> Maintenance</Badge>
          )}
          {saved && (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Saved
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/50 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab stats={stats} loading={loading} />}
      {tab === "cron-jobs" && <CronJobsTab config={config} saving={saving} onToggleCron={toggleCron} onToggleMaintenance={toggleMaintenance} />}
      {tab === "email-logs" && <EmailLogsTab />}
      {tab === "user-overrides" && <UserOverridesTab config={config} onRefresh={fetchAll} />}
      {tab === "test" && <TestEmailTab />}
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ stats, loading }: { stats: NotifStats | null; loading: boolean }) {
  const d = stats?.delivery24h ?? {};
  const totalSent = (d.sent ?? 0) + (d.delivered ?? 0);
  const totalFailed = (d.failed ?? 0) + (d.bounced ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? "—"} loading={loading} />
        <StatCard icon={Mail} label="Email Enabled" value={stats?.emailEnabled ?? "—"} loading={loading} color="text-green-600" />
        <StatCard icon={Send} label="Sent (24h)" value={totalSent} loading={loading} color="text-blue-600" />
        <StatCard icon={AlertTriangle} label="Failed (24h)" value={totalFailed} loading={loading} color="text-red-600" />
      </div>

      <SectionCard title="Frequency Distribution" icon={TrendingUp}>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat label="Instant" value={stats?.instantFrequency ?? 0} color="bg-blue-100 text-blue-700" />
          <MiniStat label="Daily" value={stats?.dailyFrequency ?? 0} color="bg-green-100 text-green-700" />
          <MiniStat label="Weekly" value={stats?.weeklyFrequency ?? 0} color="bg-purple-100 text-purple-700" />
          <MiniStat label="Unsubscribed" value={stats?.unsubscribed ?? 0} color="bg-red-100 text-red-700" />
        </div>
      </SectionCard>

      {stats?.bySource7d && Object.keys(stats.bySource7d).length > 0 && (
        <SectionCard title="Emails by Source (7d)" icon={Activity}>
          <div className="p-5 flex flex-wrap gap-2">
            {Object.entries(stats.bySource7d).sort(([, a], [, b]) => b - a).map(([src, cnt]) => (
              <div key={src} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/30">
                <span className="text-xs font-medium">{src}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5">{cnt}</Badge>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="System Pipeline" icon={BarChart3}>
        <div className="p-5 space-y-3 text-sm">
          <FlowStep n={1} title="Event Trigger" desc="API routes call notify() → emits Inngest event" />
          <FlowStep n={2} title="Orchestrator" desc="Maintenance check → admin overrides → user prefs → dedup (5 min) → channel routing" />
          <FlowStep n={3} title="Cron Jobs" desc="6 admin-controlled jobs: daily/weekly digest, re-engagement, profile, job expiry" />
          <FlowStep n={4} title="Delivery" desc="Email (Gmail OAuth2/SMTP) + WhatsApp + In-app — all logged to EmailLog" />
          <FlowStep n={5} title="User Control" desc="Each user sets frequency + categories. Admin can override per-user." />
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Cron Jobs ────────────────────────────────────────────────────────────────

function CronJobsTab({
  config, saving, onToggleCron, onToggleMaintenance,
}: {
  config: SystemConfigData | null; saving: boolean;
  onToggleCron: (key: string, enabled: boolean) => void;
  onToggleMaintenance: (on: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      <div className={`rounded-xl border-2 p-5 ${config?.globalDefaults.maintenanceMode ? "border-red-300 bg-red-50/50" : "border-border/50 bg-card"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${config?.globalDefaults.maintenanceMode ? "bg-red-100" : "bg-muted/60"}`}>
              <PowerOff className={`w-5 h-5 ${config?.globalDefaults.maintenanceMode ? "text-red-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold">Maintenance Mode (Kill Switch)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">All outbound emails paused, all cron jobs skip</p>
            </div>
          </div>
          <Switch checked={config?.globalDefaults.maintenanceMode ?? false} onCheckedChange={onToggleMaintenance} />
        </div>
      </div>

      <SectionCard title="Scheduled Email Jobs" icon={Clock}>
        <div className="divide-y divide-border/30">
          {Object.entries(CRON_META).map(([key, meta]) => {
            const state = config?.cronJobs?.[key];
            const isEnabled = state?.enabled !== false;
            return (
              <div key={key} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{meta.schedule}</Badge>
                    {state?.lastRunStatus && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${state.lastRunStatus === "success" ? "text-green-600 border-green-200" : "text-red-600 border-red-200"}`}>
                        Last: {state.lastRunStatus}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
                  {state?.lastRunAt && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      Last run: {new Date(state.lastRunAt).toLocaleString()}{state.lastRunMessage ? ` — ${state.lastRunMessage}` : ""}
                    </p>
                  )}
                </div>
                <Switch checked={isEnabled} onCheckedChange={(c) => onToggleCron(key, c)} disabled={saving} />
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Email Logs ───────────────────────────────────────────────────────────────

function EmailLogsTab() {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [stats24h, setStats24h] = useState<Record<string, number>>({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "30" });
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    try {
      const res = await fetch(`/api/admin/email-logs?${params}`);
      const data = await res.json();
      if (data.success) { setLogs(data.logs); setTotalPages(data.pagination.totalPages); setStats24h(data.stats24h); }
    } catch {}
    setLoading(false);
  }, [page, statusFilter, sourceFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {(["sent", "delivered", "failed", "bounced"] as const).map((s) => (
          <div key={s} className={`text-center py-2 rounded-lg border ${s === "failed" || s === "bounced" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
            <div className={`text-lg font-bold ${s === "failed" || s === "bounced" ? "text-red-600" : "text-green-600"}`}>{stats24h[s] ?? 0}</div>
            <div className="text-[10px] text-muted-foreground uppercase">{s} (24h)</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="text-xs border rounded-md px-2 py-1.5 bg-background">
          <option value="">All statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="text-xs border rounded-md px-2 py-1.5 bg-background">
          <option value="">All sources</option>
          <option value="orchestrator">Orchestrator</option>
          <option value="daily-digest">Daily Digest</option>
          <option value="weekly-digest">Weekly Digest</option>
          <option value="re-engagement">Re-engagement</option>
          <option value="broadcast">Broadcast</option>
          <option value="direct">Direct</option>
          <option value="test">Test</option>
        </select>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading} className="gap-1 ml-auto">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">To</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Subject</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8"><Loader2 className="w-4 h-4 animate-spin inline-block" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No email logs found</td></tr>
              ) : logs.map((log) => (
                <tr key={log._id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{new Date(log.sentAt).toLocaleString()}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{log.to}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">{log.subject}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-[10px] px-1.5 py-0">{log.source}</Badge></td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${log.status === "sent" || log.status === "delivered" ? "text-green-600 border-green-200" : "text-red-600 border-red-200"}`}>
                      {log.status}
                    </Badge>
                    {log.errorMessage && <span className="ml-1 text-red-500" title={log.errorMessage}>⚠</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/20">
            <span className="text-xs text-muted-foreground">Page {page}/{totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-3 h-3" /></Button>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="w-3 h-3" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User Overrides ───────────────────────────────────────────────────────────

function UserOverridesTab({ config, onRefresh }: { config: SystemConfigData | null; onRefresh: () => void }) {
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("force_unsubscribe");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const overrides = config?.userOverrides ?? [];

  const addOverride = async () => {
    if (!userId || !reason) return;
    setSubmitting(true);
    try {
      await fetch("/api/admin/notification-config/user-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, reason }),
      });
      setUserId(""); setReason(""); onRefresh();
    } finally { setSubmitting(false); }
  };

  const removeOverride = async (uid: string) => {
    await fetch("/api/admin/notification-config/user-override", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid }),
    });
    onRefresh();
  };

  const labels: Record<string, { label: string; icon: typeof UserX; color: string }> = {
    force_unsubscribe: { label: "Force Unsubscribe", icon: UserX, color: "text-red-600" },
    pause_emails: { label: "Pause Emails", icon: Pause, color: "text-amber-600" },
    force_instant: { label: "Force Instant", icon: Zap, color: "text-blue-600" },
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Add User Override" icon={UserX}>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">Override a specific user&apos;s notification behavior. Takes priority over their own settings.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder="User ID (ObjectId)" value={userId} onChange={(e) => setUserId(e.target.value)} className="text-sm" />
            <select value={action} onChange={(e) => setAction(e.target.value)} className="text-sm border rounded-md px-3 py-2 bg-background">
              <option value="force_unsubscribe">Force Unsubscribe</option>
              <option value="pause_emails">Pause Emails</option>
              <option value="force_instant">Force Instant</option>
            </select>
            <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm" />
          </div>
          <Button onClick={addOverride} disabled={submitting || !userId || !reason} size="sm" className="gap-2">
            <Shield className="w-3.5 h-3.5" /> Add Override
          </Button>
        </div>
      </SectionCard>

      <SectionCard title={`Active Overrides (${overrides.length})`} icon={Shield}>
        {overrides.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No user overrides active.</p>
        ) : (
          <div className="divide-y divide-border/30">
            {overrides.map((o, i) => {
              const m = labels[o.action] ?? labels.force_unsubscribe;
              return (
                <div key={`${o.userId}-${i}`} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{o.userId}</code>
                      <Badge variant="outline" className={`text-[10px] ${m.color}`}>{m.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{o.reason}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeOverride(o.userId)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Remove</Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Test Email ───────────────────────────────────────────────────────────────

function TestEmailTab() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const send = async () => {
    if (!email) return;
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/admin/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: email }) });
      const data = await res.json();
      setResult({ ok: res.ok, msg: data.message ?? (res.ok ? "Sent!" : "Failed") });
    } catch { setResult({ ok: false, msg: "Network error" }); }
    finally { setSending(false); }
  };

  return (
    <SectionCard title="Send Test Email" icon={Send}>
      <div className="p-5 space-y-4">
        <p className="text-xs text-muted-foreground">Verify the email pipeline. Creates an entry in Email Logs.</p>
        <div className="flex items-center gap-3">
          <Input type="email" placeholder="admin@mployedin.com" value={email} onChange={(e) => setEmail(e.target.value)} className="max-w-sm" />
          <Button onClick={send} disabled={sending || !email} size="sm" className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send Test
          </Button>
        </div>
        {result && (
          <p className={`text-sm flex items-center gap-1 ${result.ok ? "text-green-600" : "text-red-600"}`}>
            {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />} {result.msg}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10"><Icon className="w-3.5 h-3.5 text-primary" /></div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, loading, color = "text-foreground" }: { icon: typeof Users; label: string; value: string | number; loading: boolean; color?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground mb-2"><Icon className="w-4 h-4" /><span className="text-xs font-medium">{label}</span></div>
      {loading ? <div className="h-7 w-16 bg-muted animate-pulse rounded" /> : <p className={`text-2xl font-bold ${color}`}>{value}</p>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg px-4 py-3 text-center ${color}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[11px] font-medium mt-0.5">{label}</div>
    </div>
  );
}

function FlowStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">{n}</div>
      <div><p className="font-medium text-sm">{title}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
    </div>
  );
}
