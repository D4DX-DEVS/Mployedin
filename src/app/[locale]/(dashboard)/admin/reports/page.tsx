"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";

interface ReportStats {
  totalJobs: number;
  totalApplications: number;
  totalPlacements: number;
  totalRevenue: number;
  jobsByMonth: { month: string; count: number }[];
  applicationsByStatus: { status: string; count: number }[];
}

export default function AdminReportsPage() {
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader title="Reports & Analytics" description="Platform-wide performance metrics and trends" />

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground/60">Loading reports…</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Jobs", value: stats?.totalJobs ?? 0, color: "bg-blue-50 text-blue-700" },
              { label: "Applications", value: stats?.totalApplications ?? 0, color: "bg-purple-50 text-purple-700" },
              { label: "Placements", value: stats?.totalPlacements ?? 0, color: "bg-green-50 text-green-700" },
              { label: "Revenue", value: `$${(stats?.totalRevenue ?? 0).toLocaleString()}`, color: "bg-amber-50 text-amber-700" },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl p-4 ${kpi.color}`}>
                <div className="text-2xl font-bold">{kpi.value}</div>
                <div className="text-sm mt-1 opacity-80">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Applications by Status */}
          <div className="bg-card rounded-xl shadow-sm border p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Applications by Status</h3>
            {stats?.applicationsByStatus?.length ? (
              <div className="space-y-3">
                {stats.applicationsByStatus.map((row) => (
                  <div key={row.status} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground capitalize">{row.status}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min(100, (row.count / Math.max(...(stats.applicationsByStatus?.map((r) => r.count) ?? [1]))) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">{row.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground/60 text-sm">No data available yet</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
