"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface JobSeeker {
  _id: string;
  userId: { name: string; email: string };
  currentJobTitle?: string;
  location?: string;
  profileCompleteness: number;
  skills: string[];
  createdAt: string;
}

export default function AgentJobSeekersPage() {
  const [seekers, setSeekers] = useState<JobSeeker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchSeekers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (search) params.set("search", search);
    const res = await fetch(`/api/job-seekers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setSeekers(data.items ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchSeekers(); }, [fetchSeekers]);

  const completenessColor = (pct: number) =>
    pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400";

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Job Seekers" description="Manage and track job seekers in your pipeline" />

      <div className="flex gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or skill…"
          className="h-9 rounded-lg border px-3 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="card-base overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Top Skills</th>
                <th className="px-4 py-3">Profile</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {seekers.map((s) => (
                <tr key={s._id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{s.userId?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{s.userId?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.currentJobTitle ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(s.skills ?? []).slice(0, 3).map((skill) => (
                        <span key={skill} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{skill}</span>
                      ))}
                      {(s.skills ?? []).length > 3 && (
                        <span className="text-xs text-muted-foreground">+{s.skills.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${completenessColor(s.profileCompleteness ?? 0)}`}
                          style={{ width: `${s.profileCompleteness ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{s.profileCompleteness ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {seekers.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No job seekers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
