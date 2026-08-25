"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, UserCog, Loader2, Eye, Inbox } from "lucide-react";
import { formatDate } from "@/lib/ui/intlFormat";

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
  /** Employer whose workspace the admin has entered */
  companyName?: string;
  /** Where to go to actually work inside that account */
  redirectTo?: string;
  error?: string;
}

export default function AdminUserImpersonatePage() {
  const t = useTranslations("adminImpersonate");
  const locale = useLocale();
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
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to load users");
      }
    } catch (error) {
      toast.error("Failed to load users");
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
      if (res.ok && data.success) {
        setImpersonateResult(data);
        toast.success(
          data.companyName
            ? `Now working inside ${data.companyName}`
            : "Impersonation session started"
        );
        // The session only takes effect once we navigate into the employer
        // workspace — withAuth swaps identity per request from the signed cookie.
        // A full document load (not the client router) so the cookie is sent and
        // the server re-resolves identity instead of reusing admin-rendered RSC.
        if (data.redirectTo) window.location.href = data.redirectTo;
      } else {
        toast.error(data.error || "Failed to start impersonation");
      }
    } catch (error) {
      toast.error("Failed to start impersonation");
    } finally {
      setImpersonating(null);
    }
  };

  return (
    <div className="page-container">
      {impersonateResult?.success && impersonateResult.target && (
        <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {t("sessionStartedFor", { name: impersonateResult.target.name })}
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              {t("roleAndEmail", { role: impersonateResult.target.role, email: impersonateResult.target.email })}
            </p>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              try {
                const res = await fetch("/api/admin/impersonate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ exit: true }),
                });
                if (res.ok) {
                  setImpersonateResult(null);
                  toast.success("Impersonation session ended");
                } else {
                  const err = await res.json().catch(() => ({}));
                  toast.error(err.error || "Failed to exit impersonation");
                }
              } catch (error) {
                toast.error("Failed to exit impersonation");
              }
            }}
            className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          >
            {t("exitImpersonation")}
          </Button>
        </div>
      )}

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* Compact header row */}
        <div className="flex flex-col gap-3 border-b border-border/80 sm:flex-row sm:items-center sm:justify-between panel-head">
          <PageHeader title={t("title")} description={t("description")} />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-48 rounded-lg border-border bg-secondary/65 pl-8 text-sm shadow-none sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-secondary/72 hover:bg-secondary/72">
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("joined")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/70 hover:bg-transparent">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow className="border-border/70 hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Inbox className="h-6 w-6 text-muted-foreground/50" />
                      <p className="text-sm font-medium text-foreground">{t("noUsersFound")}</p>
                      <p className="text-xs text-muted-foreground">{t("adjustSearch")}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user._id} className="border-border/70">
                    <TableCell className="font-medium text-foreground">{user.name}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell><StatusBadge status={user.role} /></TableCell>
                    <TableCell><StatusBadge status={user.isActive ? "active" : "inactive"} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(new Date(user.createdAt))}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="xs" asChild title={t("viewProfileTitle")}>
                          <a href={`/${locale}/admin/users?search=${encodeURIComponent(user.email)}`}>
                            <Eye className="h-3.5 w-3.5 text-primary" />
                          </a>
                        </Button>
                        <Button
                          size="xs"
                          onClick={() => impersonate(user._id)}
                          disabled={impersonating === user._id}
                          className="h-7 gap-1 px-2.5 text-xs text-amber-700 border border-amber-200 bg-amber-50 hover:bg-amber-100"
                          variant="ghost"
                          title={t("viewAsUserTitle")}
                        >
                          {impersonating === user._id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <UserCog className="h-3 w-3" />}
                          {t("impersonate")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
