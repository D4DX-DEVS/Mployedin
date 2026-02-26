"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

interface AuditLogEntry {
  _id: string;
  actorId: { name?: string; email?: string; role?: string } | null;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: { before?: unknown; after?: unknown };
  ipAddress: string;
  createdAt: string;
}

const RESOURCE_COLOR: Record<string, string> = {
  users: "bg-blue-100 text-blue-700",
  jobs: "bg-emerald-100 text-emerald-700",
  applications: "bg-purple-100 text-purple-700",
  interviews: "bg-amber-100 text-amber-700",
  settings: "bg-red-100 text-red-700",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  useEffect(() => { document.title = "Audit Logs · MPLOYEDIN"; }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (resource) params.set("resource", resource);
      if (action) params.set("action", action);
      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [resource, action, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Audit Logs"
        description={`${total.toLocaleString()} log entries · read-only`}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={resource} onValueChange={(v) => { setResource(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All resources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All resources</SelectItem>
            {["users", "jobs", "applications", "interviews", "placements", "settings"].map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter by action…"
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="ps-10 w-56"
          />
        </div>
      </div>

      {/* Logs table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="card-base text-center py-16">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No audit log entries found</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-start px-4 py-3">Timestamp</th>
                <th className="text-start px-4 py-3">Actor</th>
                <th className="text-start px-4 py-3">Action</th>
                <th className="text-start px-4 py-3">Resource</th>
                <th className="text-start px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => {
                const dt = new Date(log.createdAt);
                const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                const timeStr = dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <tr key={log._id} className="hover:bg-muted/20 transition-colors font-mono text-xs">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{dateStr} {timeStr}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.actorId ? (
                        <div>
                          <p className="font-medium text-foreground">{log.actorId.name ?? "Unknown"}</p>
                          <p className="text-muted-foreground">{log.actorId.email}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{log.action}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${RESOURCE_COLOR[log.resource] ?? "bg-muted text-muted-foreground"} border-0 text-xs`}>
                        {log.resource}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.ipAddress}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {Math.ceil(total / LIMIT) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(total / LIMIT)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
