"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Clock, Search, RotateCcw, User, FileText, Briefcase, Shield,
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

const RESOURCE_OPTIONS = [
  { value: "all", label: "All resources" },
  { value: "users", label: "Users" },
  { value: "jobs", label: "Jobs" },
  { value: "applications", label: "Applications" },
  { value: "interviews", label: "Interviews" },
  { value: "employers", label: "Employers" },
  { value: "commissions", label: "Commissions" },
  { value: "gdpr", label: "GDPR" },
];

const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "super_agent", label: "Super Agent" },
  { value: "agent", label: "Agent" },
  { value: "employer", label: "Employer" },
  { value: "job_seeker", label: "Job Seeker" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function groupByDate(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  const groups: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    const date = new Date(e.createdAt).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(e);
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminActivityTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const pagination = usePagination(20);

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
      toast.error("Failed to load activity timeline");
    } finally {
      setLoading(false);
    }
  }, [search, resourceFilter, roleFilter, pagination.page, pagination.limit]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const grouped = groupByDate(events);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Activity Timeline</h1>
            <p className="text-sm text-muted-foreground">Visual timeline of all user actions across the platform</p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user name or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.resetPage(); }}
              className="pl-9"
            />
          </div>
          <SearchableSelect
            options={RESOURCE_OPTIONS}
            value={resourceFilter}
            onValueChange={(v) => { setResourceFilter(v); pagination.resetPage(); }}
            placeholder="Resource"
            className="w-40"
          />
          <SearchableSelect
            options={ROLE_OPTIONS}
            value={roleFilter}
            onValueChange={(v) => { setRoleFilter(v); pagination.resetPage(); }}
            placeholder="Role"
            className="w-40"
          />
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setResourceFilter("all"); setRoleFilter("all"); pagination.resetPage(); }}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reset
          </Button>
        </div>
      </section>

      {/* Timeline */}
      <section className="workspace-panel-surface rounded-[28px] p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/40" />
            <p className="mt-4 text-sm font-medium text-muted-foreground">No activity found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Try adjusting your filters</p>
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
                              {event.userRole?.replace("_", " ")}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatTimeAgo(event.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <span className="font-medium capitalize text-foreground">{event.action}</span>{" "}
                          <span className="capitalize">{event.resource?.replace(/_/g, " ")}</span>
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
