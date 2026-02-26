"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, UserCheck, UserX, Shield, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/PageHeader";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  locale: string;
  createdAt: string;
  lastLoginAt?: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-200",
  super_agent: "bg-purple-100 text-purple-700 border-purple-200",
  agent: "bg-blue-100 text-blue-700 border-blue-200",
  employer: "bg-amber-100 text-amber-700 border-amber-200",
  job_seeker: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const LIMIT = 25;

  useEffect(() => { document.title = "User Management · MPLOYEDIN"; }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (activeFilter) params.set("isActive", activeFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter, page]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  async function updateUser(userId: string, update: { role?: string; isActive?: boolean }) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...update }),
    });
    if (res.ok) fetchUsers();
  }

  async function applyBulk() {
    if (!bulkAction || selected.length === 0) return;
    setBulkLoading(true);
    try {
      const [action, role] = bulkAction.split(":");
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action, ...(role ? { role } : {}) }),
      });
      setBulkAction(""); setSelected([]);
      fetchUsers();
    } finally { setBulkLoading(false); }
  }

  const toggleSelect = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () =>
    setSelected(s => s.length === users.length ? [] : users.map(u => u._id));

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="User Management"
        description={`${total.toLocaleString()} total users`}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="ps-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions Bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium text-primary">{selected.length} selected</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} className="input-field flex-1 max-w-xs text-sm">
            <option value="">Bulk action…</option>
            <option value="setRole:agent">Set Role → Agent</option>
            <option value="setRole:employer">Set Role → Employer</option>
            <option value="setRole:job_seeker">Set Role → Job Seeker</option>
            <option value="activate">Activate selected</option>
            <option value="deactivate">Deactivate selected</option>
            <option value="delete">Delete selected</option>
          </select>
          <Button size="sm" onClick={applyBulk} disabled={!bulkAction || bulkLoading} className="btn-primary">
            Apply
          </Button>
          <button onClick={() => setSelected([])} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="rounded-xl border overflow-x-auto">
          <div className="bg-muted/50 px-4 py-3 h-10 animate-pulse" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-t px-4 py-3 h-14 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="card-base text-center py-16">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No users found matching your filters</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-start px-4 py-3">
                  <input type="checkbox" checked={selected.length === users.length && users.length > 0}
                    onChange={toggleAll} className="accent-primary" />
                </th>
                <th className="text-start px-4 py-3">User</th>
                <th className="text-start px-4 py-3">Role</th>
                <th className="text-start px-4 py-3">Status</th>
                <th className="text-start px-4 py-3">Locale</th>
                <th className="text-start px-4 py-3">Joined</th>
                <th className="text-start px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => {
                const initials = (user.name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                const joined = new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

                return (
                  <tr key={user._id} className={`hover:bg-muted/20 transition-colors ${selected.includes(user._id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(user._id)}
                        onChange={() => toggleSelect(user._id)} className="accent-primary" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name || "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={user.role}
                        onValueChange={(v) => updateUser(user._id, { role: v })}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <Badge className={`${ROLE_COLORS[user.role] ?? ""} border text-xs`}>
                            {user.role.replace("_", " ")}
                          </Badge>
                          <ChevronDown className="w-3 h-3 ms-auto" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize text-xs">
                              {r.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={user.isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs uppercase">{user.locale}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{joined}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          title={user.isActive ? "Deactivate" : "Activate"}
                          onClick={() => updateUser(user._id, { isActive: !user.isActive })}
                        >
                          {user.isActive ? (
                            <UserX className="w-3.5 h-3.5 text-destructive" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                        </Button>
                      </div>
                    </td>
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
          <span className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / LIMIT)} · {total} users
          </span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
