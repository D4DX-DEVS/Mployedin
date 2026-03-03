"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Search, UserCog, Loader2, Eye } from "lucide-react";

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface ImpersonateResult {
  success: boolean;
  target?: { id: string; name: string; email: string; role: string };
  error?: string;
}

export default function AdminUserImpersonatePage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [impersonateResult, setImpersonateResult] = useState<ImpersonateResult | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const impersonate = async (userId: string) => {
    setImpersonating(userId);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      setImpersonateResult(data);
    } finally {
      setImpersonating(null);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="User Impersonation"
        description="View the platform as any user for support and debugging"
      />

      {impersonateResult?.success && impersonateResult.target && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Impersonation session started for {impersonateResult.target.name}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Role: {impersonateResult.target.role} · {impersonateResult.target.email}
            </p>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/admin/impersonate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ exit: true }),
              });
              setImpersonateResult(null);
            }}
            className="btn-primary h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
          >
            Exit Impersonation
          </button>
        </div>
      )}

      <div className="card-base space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email…"
            className="input-field pl-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/20">
                <tr>
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Joined</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-medium">{user.name}</td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3"><StatusBadge status={user.role} /></td>
                    <td className="p-3"><StatusBadge status={user.isActive ? "active" : "inactive"} /></td>
                    <td className="p-3 text-muted-foreground">{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`../users/${user._id}`} className="btn-ghost h-8 w-8 p-0" title="View profile">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </a>
                        <button
                          onClick={() => impersonate(user._id)}
                          disabled={impersonating === user._id}
                          className="btn-outline h-7 px-2.5 text-xs text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100 flex items-center gap-1.5"
                          title="View as this user"
                        >
                          {impersonating === user._id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <UserCog className="h-3 w-3" />}
                          Impersonate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
