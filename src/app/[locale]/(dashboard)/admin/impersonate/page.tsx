"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { RowActions } from "@/components/shared/RowActions";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { TableBodySkeleton } from "@/components/ui/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserCog, Eye, Inbox } from "lucide-react";
import { formatListDate } from "@/lib/ui/intlFormat";

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
  /** Session found on load rather than started from this page */
  restored?: boolean;
}

export default function AdminUserImpersonatePage() {
  const t = useTranslations("adminImpersonate");
  const locale = useLocale();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [impersonateResult, setImpersonateResult] = useState<ImpersonateResult | null>(null);
  const roleLabel = (role: string) => (t.has(`roles.${role}`) ? t(`roles.${role}`) : role);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}&limit=30`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastFailedLoadUsers"));
      }
    } catch (error) {
      toast.error(t("toastFailedLoadUsers"));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [loadUsers]);

  // A session outlives this page (the admin works inside the employer workspace,
  // then comes back), so restore its banner and exit button from the server.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/impersonate")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.active || !data.target) return;
        setImpersonateResult((current) => current ?? {
          success: true,
          target: data.target,
          companyName: data.companyName,
          restored: true,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
            ? t("toastNowWorkingInside", { companyName: data.companyName })
            : t("toastImpersonationSessionStarted")
        );
        // The session only takes effect once we navigate into the employer
        // workspace — withAuth swaps identity per request from the signed cookie.
        // A full document load (not the client router) so the cookie is sent and
        // the server re-resolves identity instead of reusing admin-rendered RSC.
        if (data.redirectTo) window.location.href = data.redirectTo;
      } else {
        toast.error(data.error || t("toastFailedStartImpersonation"));
      }
    } catch (error) {
      toast.error(t("toastFailedStartImpersonation"));
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
              {impersonateResult.restored
                ? t("sessionActiveFor", { name: impersonateResult.target.name })
                : t("sessionStartedFor", { name: impersonateResult.target.name })}
            </p>
            <p className="mt-0.5 text-xs text-amber-600">
              {t("roleAndEmail", { role: roleLabel(impersonateResult.target.role), email: impersonateResult.target.email })}
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
                  toast.success(t("toastImpersonationSessionEnded"));
                } else {
                  const err = await res.json().catch(() => ({}));
                  toast.error(err.error || t("toastFailedExitImpersonation"));
                }
              } catch (error) {
                toast.error(t("toastFailedExitImpersonation"));
              }
            }}
            className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          >
            {t("exitImpersonation")}
          </Button>
        </div>
      )}

      {/* Page Header */}
      <DashboardPageHeader
        compact
        title={t("title")}
        description={t("description")}
        compactOnMobile
      />

      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search ? () => setSearch("") : undefined}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchPlaceholder")} />
      </InlineFilterBar>

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/80 bg-muted/30 hover:bg-muted/30">
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("joined")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableBodySkeleton rows={5} cols={5} />
              ) : users.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-12">
                    <EmptyState title={t("noUsersFound")} description={t("adjustSearch")} icon={Inbox} />
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user._id} className="border-border/70">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={user.name} email={user.email} className="h-9 w-9" colorful />
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs font-medium">{roleLabel(user.role)}</Badge></TableCell>
                    <TableCell><StatusBadge status={user.isActive ? "active" : "inactive"} /></TableCell>
                    <TableCell className="text-muted-foreground">{formatListDate(new Date(user.createdAt), locale)}</TableCell>
                    <TableCell>
                      <RowActions
                        name={user.name}
                        quick={[
                          {
                            key: "impersonate",
                            label: t("impersonate"),
                            icon: UserCog,
                            iconClassName: "text-amber-700",
                            onSelect: () => impersonate(user._id),
                            pending: impersonating === user._id,
                            disabled: impersonating !== null,
                          },
                          {
                            key: "view",
                            label: t("viewProfileTitle"),
                            icon: Eye,
                            href: `/${locale}/admin/users?search=${encodeURIComponent(user.email)}`,
                            iconOnly: true,
                          },
                        ]}
                      />
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
