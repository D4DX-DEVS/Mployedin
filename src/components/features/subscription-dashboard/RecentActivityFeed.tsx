"use client";

import { useState } from "react";
import {
  Activity, CheckCircle, ArrowUpRight, ArrowDownRight,
  RotateCcw, XCircle, AlertTriangle,
} from "lucide-react";
import type { ActivityItem } from "./useSubscriptionDashboard";

interface RecentActivityFeedProps {
  data: ActivityItem[];
}

const ACTION_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  assigned: { icon: CheckCircle, color: "text-emerald-400", label: "New subscription" },
  upgraded: { icon: ArrowUpRight, color: "text-sky-400", label: "Upgraded" },
  downgraded: { icon: ArrowDownRight, color: "text-amber-400", label: "Downgraded" },
  renewed: { icon: RotateCcw, color: "text-emerald-400", label: "Renewed" },
  cancelled: { icon: XCircle, color: "text-red-400", label: "Cancelled" },
  expired: { icon: AlertTriangle, color: "text-amber-400", label: "Expired" },
  suspended: { icon: AlertTriangle, color: "text-orange-400", label: "Suspended" },
  reactivated: { icon: CheckCircle, color: "text-emerald-400", label: "Reactivated" },
};

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "assigned", label: "New" },
  { key: "upgraded", label: "Upgrade" },
  { key: "downgraded", label: "Downgrade" },
  { key: "renewed", label: "Renewal" },
  { key: "cancelled", label: "Cancel" },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 36e5);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function RecentActivityFeed({ data }: RecentActivityFeedProps) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? data : data.filter((a) => a.action === filter);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Activity className="h-4 w-4" /> Recent Activity
        </h4>
        <span className="text-xs text-primary cursor-pointer hover:underline">View all</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1 mb-4">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              filter === f.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No activity</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.slice(0, 10).map((a) => {
            const cfg = ACTION_CONFIG[a.action] ?? ACTION_CONFIG.assigned;
            const Icon = cfg.icon;
            return (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-border/40 p-3"
              >
                <div className={`mt-0.5 ${cfg.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{a.userName}</span>{" "}
                    <span className="text-muted-foreground">{cfg.label.toLowerCase()}</span>
                    {a.toPlanName && (
                      <span className="text-muted-foreground"> → {a.toPlanName}</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{timeAgo(a.createdAt)}</span>
                    {a.performedByName && <span>by {a.performedByName}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
