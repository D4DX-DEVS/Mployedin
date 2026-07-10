"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableToolbar } from "@/components/shared/TableToolbar";
import {
  Clock, RotateCcw, User, FileText, Briefcase, Shield,
  LogIn, LogOut, Edit, Trash2, Plus, Eye, Check, X, Send,
  Upload, Download, UserPlus, Settings, Activity,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TimelineEvent {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create: <Plus className="h-3.5 w-3.5" />,
  read: <Eye className="h-3.5 w-3.5" />,
  update: <Edit className="h-3.5 w-3.5" />,
  delete: <Trash2 className="h-3.5 w-3.5" />,
  login: <LogIn className="h-3.5 w-3.5" />,
  logout: <LogOut className="h-3.5 w-3.5" />,
  approve: <Check className="h-3.5 w-3.5" />,
  reject: <X className="h-3.5 w-3.5" />,
  export: <Download className="h-3.5 w-3.5" />,
  import: <Upload className="h-3.5 w-3.5" />,
  send: <Send className="h-3.5 w-3.5" />,
  register: <UserPlus className="h-3.5 w-3.5" />,
  settings: <Settings className="h-3.5 w-3.5" />,
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  update: "bg-sky-100 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400",
  delete: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  login: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
  approve: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  reject: "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
  export: "bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
};

type TimelineTranslator = (key: string, values?: Record<string, string | number>) => string;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(dateStr: string, locale: string, t: TimelineTranslator): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { count: days });
  return new Date(dateStr).toLocaleDateString(locale);
}

function groupByDate(events: TimelineEvent[], locale: string): Record<string, TimelineEvent[]> {
  const groups: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    const date = new Date(e.createdAt).toLocaleDateString(locale, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return groups;
}

function getRoleLabel(role: string | undefined, t: TimelineTranslator): string {
  switch (role) {
    case "admin":
      return t("roles.admin");
    case "super_agent":
      return t("roles.superAgent");
    case "agent":
      return t("roles.agent");
    case "employer":
      return t("roles.employer");
    case "job_seeker":
      return t("roles.jobSeeker");
    default:
      return t("roles.unknown");
  }
}

function getActionLabel(action: string | undefined, t: TimelineTranslator): string {
  const normalizedAction = action?.toLowerCase() ?? "";
  const actionTokens = normalizedAction.split(/[._-]/).filter(Boolean);
  const hasActionToken = (...tokens: string[]) => actionTokens.some((token) => tokens.includes(token));
  switch (normalizedAction) {
    case "create":
    case "created":
      return t("actions.create");
    case "read":
      return t("actions.read");
    case "update":
    case "updated":
      return t("actions.update");
    case "delete":
    case "deleted":
      return t("actions.delete");
    case "login":
    case "login.success":
      return t("actions.login");
    case "logout":
      return t("actions.logout");
    case "approve":
      return t("actions.approve");
    case "reject":
      return t("actions.reject");
    case "export":
      return t("actions.export");
    case "import":
      return t("actions.import");
    case "send":
      return t("actions.send");
    case "register":
      return t("actions.register");
    case "settings":
      return t("actions.settings");
    default:
      if (hasActionToken("create", "created")) return t("actions.create");
      if (hasActionToken("update", "updated")) return t("actions.update");
      if (hasActionToken("delete", "deleted")) return t("actions.delete");
      if (hasActionToken("reject", "rejected", "revoke", "revoked", "denied")) return t("actions.reject");
      if (hasActionToken("approve", "approved", "verify", "verified")) return t("actions.approve");
      if (hasActionToken("export", "exported")) return t("actions.export");
      if (hasActionToken("import", "imported")) return t("actions.import");
      if (hasActionToken("send", "sent")) return t("actions.send");
      if (hasActionToken("register", "registered")) return t("actions.register");
      if (hasActionToken("login")) return t("actions.login");
      if (hasActionToken("logout")) return t("actions.logout");
      return t("actions.other");
  }
}

function getResourceLabel(resource: string | undefined, t: TimelineTranslator): string {
  const normalizedResource = resource?.toLowerCase() ?? "";
  switch (normalizedResource) {
    case "auth":
      return t("resources.auth");
    case "users":
      return t("resources.users");
    case "agent":
    case "agents":
      return t("resources.agents");
    case "jobs":
      return t("resources.jobs");
    case "applications":
      return t("resources.applications");
    case "interviews":
      return t("resources.interviews");
    case "employers":
      return t("resources.employers");
    case "commissions":
      return t("resources.commissions");
    case "gdpr":
      return t("resources.gdpr");
    case "offers":
      return t("resources.offers");
    case "placements":
      return t("resources.placements");
    case "leads":
      return t("resources.leads");
    case "reports":
      return t("resources.reports");
    case "subscriptions":
      return t("resources.subscriptions");
    case "targets":
      return t("resources.targets");
    case "ai":
      return t("resources.ai");
    case "hiring_decisions":
      return t("resources.hiringDecisions");
    case "notification_preferences":
      return t("resources.notificationPreferences");
    case "careerpage":
    case "career_page":
      return t("resources.careerPages");
    case "apikey":
    case "api_key":
      return t("resources.apiKeys");
    case "webhook":
    case "webhooks":
      return t("resources.webhooks");
    case "talentpool":
    case "talent_pool":
      return t("resources.talentPools");
    case "surveytemplate":
    case "survey_template":
      return t("resources.surveys");
    case "workflow_templates":
      return t("resources.workflowTemplates");
    default:
      return t("resources.unknown");
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminActivityTimelinePage() {
  const t = useTranslations("adminActivityTimeline");
  const locale = useLocale();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const pagination = usePagination(20);

  const resourceOptions = [
    { value: "all", label: t("resources.all") },
    { value: "users", label: t("resources.users") },
    { value: "jobs", label: t("resources.jobs") },
    { value: "applications", label: t("resources.applications") },
    { value: "interviews", label: t("resources.interviews") },
    { value: "employers", label: t("resources.employers") },
    { value: "commissions", label: t("resources.commissions") },
    { value: "gdpr", label: t("resources.gdpr") },
  ];

  const roleOptions = [
    { value: "all", label: t("roles.all") },
    { value: "admin", label: t("roles.admin") },
    { value: "super_agent", label: t("roles.superAgent") },
    { value: "agent", label: t("roles.agent") },
    { value: "employer", label: t("roles.employer") },
    { value: "job_seeker", label: t("roles.jobSeeker") },
  ];

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      if (resourceFilter !== "all") params.set("resource", resourceFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const res = await fetch(`/api/admin/activity-timeline?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.items ?? []);
        pagination.updateTotal(data.total ?? 0);
      }
    } catch {
      toast.error(t("errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [search, resourceFilter, roleFilter, pagination.page, pagination.limit, t]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const grouped = groupByDate(events, locale);

  return (
    <div className="page-container space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <PageHeader title={t("title")} description={t("description")} />
          </div>
        </div>
      </section>

      {/* Filters */}
      <TableToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); pagination.resetPage(); }}
        searchPlaceholder={t("searchPlaceholder")}
        hasActiveFilters={resourceFilter !== "all" || roleFilter !== "all"}
        actions={
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setResourceFilter("all"); setRoleFilter("all"); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> {t("reset")}
          </Button>
        }
        filterContent={
          <div className="flex flex-wrap items-center gap-3">
            <SearchableSelect
              options={resourceOptions}
              value={resourceFilter}
              onValueChange={(v) => { setResourceFilter(v); pagination.resetPage(); }}
              placeholder={t("resourcePlaceholder")}
              className="h-11 w-44 rounded-xl border-border bg-card"
            />
            <SearchableSelect
              options={roleOptions}
              value={roleFilter}
              onValueChange={(v) => { setRoleFilter(v); pagination.resetPage(); }}
              placeholder={t("rolePlaceholder")}
              className="h-11 w-44 rounded-xl border-border bg-card"
            />
          </div>
        }
      />

      {/* Timeline */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="relative ml-4 space-y-6 border-l-2 border-muted pl-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="relative">
                <Skeleton className="absolute -left-[31px] h-6 w-6 rounded-full" />
                <div className="workspace-glass-panel space-y-2 rounded-xl p-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">{t("empty.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{t("empty.description")}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([date, dayEvents]) => (
              <div key={date}>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{date}</h3>
                <div className="relative ml-4 space-y-0 border-l-2 border-muted pl-6">
                  {dayEvents.map((event) => (
                    <div key={event._id} className="relative pb-6 last:pb-0">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full ${
                        ACTION_COLORS[event.action] ?? "bg-muted text-muted-foreground"
                      }`}>
                        {ACTION_ICONS[event.action] ?? <FileText className="h-3.5 w-3.5" />}
                      </div>

                      {/* Event card */}
                      <div className="workspace-glass-panel rounded-xl p-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{event.userName}</span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                              {getRoleLabel(event.userRole, t)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(event.createdAt, locale, t)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{getActionLabel(event.action, t)}</span>{" "}
                          <span>{getResourceLabel(event.resource, t)}</span>
                          {event.resourceId && <span className="text-xs"> (#{event.resourceId.slice(-6)})</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        limit={pagination.limit}
        total={pagination.total}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
