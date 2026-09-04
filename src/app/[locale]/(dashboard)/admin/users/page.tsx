"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search, UserCheck, UserX, Shield, ChevronDown, Inbox, Plus, Settings2, Check, Users } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { InlineSearchSelect } from "@/components/shared/InlineSearchSelect";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_COLORS } from "@/lib/ui/statusColors";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { TableBodySkeleton } from "@/components/ui/loading";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { PermissionEditor } from "@/components/shared/PermissionEditor";
import { useConfirm } from "@/hooks/useConfirm";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import { AlertCircle, Loader2, Download, FileSpreadsheet, FileText } from "lucide-react";
import { formatCount, formatDate } from "@/lib/ui/intlFormat";

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  locale: string;
  permissionMode?: PermissionMode;
  customPermissions?: CustomPermissions;
  createdAt: string;
  lastLogin?: string;
}

const ROLES = ["admin", "super_agent", "agent", "employer", "job_seeker"];

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers");
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  /* The search term addresses the view: an admin notification, a ⌘K people
     hit and the system-health panel all link here with `?search=<name>`,
     and a filter kept only in component state would silently ignore it. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "agent" as string });
  const [createPermMode, setCreatePermMode] = useState<PermissionMode>("role_default");
  const [createPerms, setCreatePerms] = useState<CustomPermissions>({});
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Permissions editor modal state
  const [permUser, setPermUser] = useState<User | null>(null);
  const [editPermMode, setEditPermMode] = useState<PermissionMode>("role_default");
  const [editPerms, setEditPerms] = useState<CustomPermissions>({});
  const [permSaving, setPermSaving] = useState(false);

  useEffect(() => { document.title = `${t("userManagement")} · MPLOYEDIN`; }, [t]);

  const exportColumns: ExportColumn<User>[] = [
    { header: t("userTableHeader"), key: "name" },
    { header: t("email"), key: "email" },
    { header: t("roleTableHeader"), key: "role" },
    { header: t("statusTableHeader"), key: "isActive", formatter: (v) => v ? t("active") : t("inactive") },
    { header: t("localeTableHeader"), key: "locale" },
    { header: t("exportHeaderLastLogin"), key: "lastLogin", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
    { header: t("joinedTableHeader"), key: "createdAt", formatter: (v) => v ? formatDate(new Date(String(v))) : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: users as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "users",
    title: t("exportTitle"),
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (roleFilter && roleFilter !== "all") params.set("role", roleFilter);
      if (activeFilter && activeFilter !== "all") params.set("isActive", activeFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        updateTotal(data.pagination.total);
      } else {
        toast.error(t("toastFailedLoadUsers"));
      }
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter, page, limit]);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  /**
   * Deactivation signs a real person out of the platform, and the control that
   * fires it sits in a table that re-renders under a filter. It used to call
   * `updateUser` straight from onClick with no confirmation, no undo and no
   * toast naming who was affected — the CMS delete on the next page over has
   * always been guarded, this was not.
   */
  async function toggleUserActive(user: User) {
    if (user.isActive) {
      const ok = await confirm({
        title: t("deactivate_user"),
        message: t("deactivateConfirmMessage", { name: user.name || user.email }),
        confirmLabel: t("deactivate_user"),
        variant: "destructive",
      });
      if (!ok) return;
    }
    await updateUser(user._id, { isActive: !user.isActive });
    toast.success(
      user.isActive
        ? t("toastUserDeactivated", { name: user.name || user.email })
        : t("toastUserActivated", { name: user.name || user.email }),
    );
  }

  async function updateUser(userId: string, update: { role?: string; isActive?: boolean }) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...update }),
    });
    if (res.ok) {
      fetchUsers();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || t("toastFailedUpdateUser"));
    }
  }

  async function applyBulk() {
    if (!bulkAction || bulkAction === "__none__" || selected.length === 0) return;
    setBulkLoading(true);
    try {
      const [action, role] = bulkAction.split(":");
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action, ...(role ? { role } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Bulk action failed");
        return;
      }
      const data = await res.json() as {
        affected: number;
        total: number;
        results: Array<{ userId: string; status: "updated" | "skipped" | "error"; reason?: string }>;
      };
      const failed = data.results.filter((r) => r.status !== "updated");
      if (failed.length === 0) {
        toast.success(t("toastBulkUpdated", { affected: data.affected, total: data.total }));
      } else if (data.affected > 0) {
        const reasons = [...new Set(failed.map((r) => r.reason).filter(Boolean))].join("; ");
        toast(t("toastBulkPartialUpdated", { affected: data.affected, total: data.total, failed: failed.length, reasons }));
      } else {
        const reasons = [...new Set(failed.map((r) => r.reason).filter(Boolean))].join("; ");
        toast.error(t("toastBulkNoUpdates", { reasons }));
      }
      setBulkAction("__none__"); setSelected([]);
      fetchUsers();
    } finally { setBulkLoading(false); }
  }

  // ── Create User ──────────────────────────────
  async function handleCreateUser() {
    setCreateError("");
    if (!createForm.name || !createForm.email || !createForm.password || !createForm.role) {
      setCreateError(t("allFieldsRequired"));
      return;
    }
    setCreateLoading(true);
    try {
      const payload: Record<string, unknown> = {
        ...createForm,
        permissionMode: createPermMode,
      };
      if (createPermMode === "custom") {
        payload.customPermissions = createPerms;
      }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const e = await res.json();
        const details = Array.isArray(e.details)
          ? (e.details as { path?: string; message?: string }[])
              .map((d) => (d.path ? `${d.path}: ${d.message}` : d.message))
              .filter(Boolean)
              .join("; ")
          : "";
        setCreateError(details || e.error || t("failedToCreateUser"));
        return;
      }
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", role: "agent" });
      setCreatePermMode("role_default");
      setCreatePerms({});
      fetchUsers();
    } catch {
      setCreateError(t("networkError"));
    } finally {
      setCreateLoading(false);
    }
  }

  // ── Save Permissions ──────────────────────────
  async function handleSavePermissions() {
    if (!permUser) return;
    setPermSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: permUser._id,
          permissionMode: editPermMode,
          customPermissions: editPermMode === "custom" ? editPerms : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastFailedSavePermissions"));
        return;
      }
      toast.success(t("toastPermissionsUpdated"));
      setPermUser(null);
      fetchUsers();
    } finally {
      setPermSaving(false);
    }
  }

  function openPermissions(user: User) {
    setPermUser(user);
    setEditPermMode(user.permissionMode ?? "role_default");
    setEditPerms(user.customPermissions ?? {});
  }

  const toggleSelect = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () =>
    setSelected(s => s.length === users.length ? [] : users.map(u => u._id));

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <PageHero
        compact
        compactOnMobile
        icon={Users}
        title={t("userManagement")}
        description={t("userManagementDesc", { total: formatCount(total) })}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-3xl">
        {/* data-table-toolbar opts this hand-rolled header into the shared
            mobile toolbar rules, same as pages built on <TableToolbar>. */}
        <div data-table-toolbar="compact-admin" className="flex flex-wrap items-center gap-1.5 border-b border-border/80 sm:gap-2 panel-head">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchPlaceholder")}
                className="h-8 w-full rounded-lg pl-8 text-xs sm:w-52 sm:text-sm"
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-[130px] sm:flex-none">
              <InlineSearchSelect
                options={[
                  { value: "all", label: t("allRoles") },
                  ...ROLES.map((r) => ({ value: r, label: r.replace("_", " ") })),
                  { value: "unknown", label: "unknown" },
                ]}
                value={roleFilter}
                onValueChange={(v) => { setRoleFilter(v); resetPage(); }}
                placeholder={t("allRoles")}
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-[120px] sm:flex-none">
              <InlineSearchSelect
                options={[
                  { value: "all", label: t("allStatus") },
                  { value: "true", label: t("active") },
                  { value: "false", label: t("inactive") },
                ]}
                value={activeFilter}
                onValueChange={(v) => { setActiveFilter(v); resetPage(); }}
                placeholder={t("allStatus")}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="dense" aria-label={t("export")} className="shrink-0 rounded-lg border-border/80 px-2 text-xs sm:px-3 sm:text-sm">
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("export")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("export")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />{t("csv")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />{t("excel")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />{t("pdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setShowCreate(true)} size="sm" className="h-8 rounded-lg px-2 text-xs sm:px-3 sm:text-sm">
              <Plus className="h-3.5 w-3.5" /> {t("createUser")}
            </Button>
        </div>

        {/* Bulk Actions Bar */}
        {selected.length > 0 && (
          <div className="flex items-center gap-3 border-b border-border/80 bg-primary/5 panel-head">
            <span className="text-sm font-medium text-primary">{t("selected", { count: selected.length })}</span>
            <Select value={bulkAction} onValueChange={setBulkAction}>
              <SelectTrigger className="flex-1 max-w-xs text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("bulkAction")}</SelectItem>
                <SelectItem value="setRole:agent">{t("setRoleAgent")}</SelectItem>
                <SelectItem value="setRole:employer">{t("setRoleEmployer")}</SelectItem>
                <SelectItem value="setRole:job_seeker">{t("setRoleJobSeeker")}</SelectItem>
                <SelectItem value="activate">{t("activate")}</SelectItem>
                <SelectItem value="deactivate">{t("deactivate")}</SelectItem>
                <SelectItem value="delete">{t("delete")}</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={applyBulk} disabled={!bulkAction || bulkLoading} className="btn-primary">
              {t("apply")}
            </Button>
            <button onClick={() => setSelected([])} className="text-xs text-muted-foreground hover:text-foreground">{t("clear")}</button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <Checkbox
                  checked={selected.length === users.length && users.length > 0}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>{t("userTableHeader")}</TableHead>
              <TableHead>{t("roleTableHeader")}</TableHead>
              <TableHead>{t("localeTableHeader")}</TableHead>
              <TableHead>{t("joinedTableHeader")}</TableHead>
              <TableHead>{t("actionsTableHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={8} cols={6} />
            ) : users.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{t("noUsers")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : users.map((user) => {
              const initials = (user.name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              const joined = new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

              return (
                <TableRow key={user._id} className={selected.includes(user._id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(user._id)}
                      onCheckedChange={() => toggleSelect(user._id)}
                    />
                  </TableCell>
                  <TableCell>
                    {/* items-start: centering floated the avatar beside the
                        email line on phone cards, visually detached from the
                        name it belongs to. */}
                    <div className="flex items-start gap-3">
                      <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium">{user.name || t("unnamed")}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <Badge className={`mt-1 text-[11px] ${user.isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"}`}>
                          {user.isActive ? t("active") : t("inactive")}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted/40 transition-colors">
                            <Badge className={`${ROLE_COLORS[user.role] ?? ""} border text-xs`}>
                              {user.role.replace("_", " ")}
                            </Badge>
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                          <DropdownMenuLabel className="text-xs">{t("changeRole")}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {ROLES.map((r) => (
                            <DropdownMenuItem
                              key={r}
                              onClick={() => updateUser(user._id, { role: r })}
                              className="capitalize text-xs gap-2"
                            >
                              <Badge className={`${ROLE_COLORS[r] ?? ""} border text-[11px] px-1.5 py-0`}>
                                {r.replace("_", " ")}
                              </Badge>
                              {r === user.role && <Check className="h-3 w-3 ml-auto text-primary" />}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {user.permissionMode === "custom" && (
                        <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-600">Custom</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs uppercase">{user.locale}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{joined}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs max-sm:min-h-11"
                        title={t("managePermissions")}
                        aria-label={t("managePermissions")}
                        onClick={() => openPermissions(user)}
                      >
                        <Shield className="w-3.5 h-3.5 text-primary" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs max-sm:min-h-11"
                        title={user.isActive ? t("deactivate_user") : t("activate_user")}
                        aria-label={user.isActive ? t("deactivate_user") : t("activate_user")}
                        onClick={() => void toggleUserActive(user)}
                      >
                        {user.isActive ? (
                          <UserX className="w-3.5 h-3.5 text-destructive" />
                        ) : (
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Create User Modal ──────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{t("createNewUser")}</DialogTitle>
            <DialogDescription>{t("createUserDesc")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {createError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {createError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="field">
                <Label htmlFor="create-name">{t("fullName")} <span className="text-destructive">*</span></Label>
                <Input
                  id="create-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("johnDoe")}
                />
              </div>
              <div className="field">
                <Label htmlFor="create-email">{t("email")} <span className="text-destructive">*</span></Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder={t("johnAtExample")}
                />
              </div>
              <div className="field">
                <Label htmlFor="create-password">{t("password")} <span className="text-destructive">*</span></Label>
                <Input
                  id="create-password"
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t("passwordHint")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">{t("role")} <span className="text-destructive">*</span></Label>
                <InlineSearchSelect
                  options={ROLES.map((r) => ({ value: r, label: r.replace("_", " ") }))}
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}
                  placeholder={t("selectRole")}
                />
              </div>
            </div>

            {/* Permission editor */}
            <PermissionEditor
              baseRole={createForm.role as UserRole}
              permissionMode={createPermMode}
              customPermissions={createPerms}
              onChange={(mode, perms) => {
                setCreatePermMode(mode);
                setCreatePerms(perms);
              }}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={createLoading}>
              {t("cancel")}
            </Button>
            <Button onClick={handleCreateUser} disabled={createLoading}>
              {createLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {createLoading ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Permissions Editor Modal ──────────────────────── */}
      <Dialog open={!!permUser} onOpenChange={(open) => { if (!open) setPermUser(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-none">
          <DialogHeader>
            <DialogTitle>{t("managePermissionsTitle")}</DialogTitle>
            <DialogDescription>
              {t("managePermissionsDesc", { name: permUser?.name || "", email: permUser?.email || "", role: permUser?.role?.replace("_", " ") || "" })}
            </DialogDescription>
          </DialogHeader>

          {permUser && (
            <PermissionEditor
              baseRole={permUser.role as UserRole}
              permissionMode={editPermMode}
              customPermissions={editPerms}
              onChange={(mode, perms) => {
                setEditPermMode(mode);
                setEditPerms(perms);
              }}
            />
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setPermUser(null)} disabled={permSaving}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSavePermissions} disabled={permSaving}>
              {permSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {permSaving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
