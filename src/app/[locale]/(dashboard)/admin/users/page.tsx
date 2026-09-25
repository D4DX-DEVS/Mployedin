"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { formErrorFromResponse } from "@/lib/errors/form-error";
import { validatePasswordForForm, PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { Search, UserCheck, Ban, Shield, ChevronDown, Inbox, Plus, Check, Users, MoreHorizontal, Pencil, KeyRound, Trash2 } from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
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

/* The scrolling region inside a dialog whose header and footer stay put. The
   negative inline margins let rows run to the card's edge while the padding
   keeps their content clear of it. */
const SCROLL_BODY = "-mx-4 min-h-0 flex-1 overflow-y-auto px-4 scrollbar-none sm:-mx-6 sm:px-6";
/* Rules against the pinned header and footer, so a half-scrolled row reads as
   scrolled-under rather than cut off. */
const DIALOG_HEAD = "-mx-4 border-b border-border/60 px-4 pb-3 sm:-mx-6 sm:px-6";
const DIALOG_FOOT = "-mx-4 border-t border-border/60 px-4 pt-3 sm:-mx-6 sm:px-6";

export default function AdminUsersPage() {
  const t = useTranslations("adminUsers");
  const tf = useTranslations("formErrors");
  const locale = useLocale();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* The search term addresses the view: an admin notification, a ⌘K people
     hit and the system-health panel all link here with `?search=<name>`,
     and a filter kept only in component state would silently ignore it. */
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  // The admin dashboard's "Users by role" rows link here with `?role=`.
  const [roleFilter, setRoleFilter] = useUrlFilter("role", "all", { allow: [...ROLES, "unknown"] });
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

  // Edit user modal state
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Permissions editor modal state
  const [permUser, setPermUser] = useState<User | null>(null);
  const [editPermMode, setEditPermMode] = useState<PermissionMode>("role_default");
  const [editPerms, setEditPerms] = useState<CustomPermissions>({});
  const [permSaving, setPermSaving] = useState(false);
  /* What the dialog was opened with, so that closing it can tell an abandoned
     edit from a look-and-leave. Losing a hand-tuned permission map to a stray
     click on the backdrop is not recoverable — nothing is persisted until save. */
  const permSnapshot = useRef<string>("");

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
    setError(null);
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
        setError(t("toastFailedLoadUsers"));
        toast.error(t("toastFailedLoadUsers"));
      }
    } catch {
      setError(t("toastFailedLoadUsers"));
      toast.error(t("toastFailedLoadUsers"));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, activeFilter, page, limit, t]);

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
    // Only claim success once the request actually succeeded — this used to
    // toast "deactivated" even when the PATCH had just failed and toasted an
    // error one line above.
    const changed = await updateUser(user._id, { isActive: !user.isActive });
    if (!changed) return;
    toast.success(
      user.isActive
        ? t("toastUserDeactivated", { name: user.name || user.email })
        : t("toastUserActivated", { name: user.name || user.email }),
    );
  }

  function openEdit(user: User) {
    setEditTarget(user);
    setEditForm({ name: user.name ?? "", email: user.email });
    setEditError("");
  }

  /** Name and email only — role and status have their own controls in the row. */
  async function handleSaveUser() {
    if (!editTarget) return;
    setEditError("");
    const name = editForm.name.trim();
    const email = editForm.email.trim();
    if (!name || !email) {
      setEditError(t("allFieldsRequired"));
      return;
    }
    const changes: { name?: string; email?: string } = {};
    if (name !== (editTarget.name ?? "")) changes.name = name;
    if (email.toLowerCase() !== editTarget.email.toLowerCase()) changes.email = email;
    // Saving an untouched form should close the dialog, not write an audit row
    // recording a change that did not happen.
    if (Object.keys(changes).length === 0) {
      setEditTarget(null);
      return;
    }

    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editTarget._id, ...changes }),
      });
      if (!res.ok) {
        const { message } = await formErrorFromResponse(res, {
          t: tf,
          locale,
          fieldLabels: { name: t("fullName"), email: t("email") },
          conflict: tf("emailInUse"),
        });
        setEditError(message);
        return;
      }
      setEditTarget(null);
      toast.success(t("toastUserUpdated", { name: name || email }));
      fetchUsers();
    } catch {
      setEditError(t("networkError"));
    } finally {
      setEditSaving(false);
    }
  }

  /**
   * Mails the account a fresh reset link. A deactivated account is refused up
   * front rather than through a disabled menu item that never says why: its
   * token could not be redeemed, because reset-password only accepts a token
   * for an active user.
   */
  async function sendPasswordReset(user: User) {
    if (!user.isActive) {
      toast.error(t("resetInactiveBlocked", { name: user.name || user.email }));
      return;
    }
    const ok = await confirm({
      title: t("sendResetConfirmTitle"),
      message: t("sendResetConfirmMessage", { email: user.email }),
      confirmLabel: t("sendResetConfirmLabel"),
    });
    if (!ok) return;

    const res = await fetch("/api/admin/users/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user._id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || t("toastResetFailed"));
      return;
    }
    toast.success(t("toastResetSent", { email: user.email }));
  }

  /**
   * The single-account twin of the bulk delete, and just as destructive: the
   * cascade takes jobs, applications, interviews, placements and commissions
   * with the account, so it asks first and names what goes with it.
   */
  async function deleteUserAccount(user: User) {
    const name = user.name || user.email;
    const ok = await confirm({
      title: t("deleteUserConfirmTitle"),
      message: t("deleteUserConfirmMessage", { name }),
      confirmLabel: t("deleteUserConfirmLabel"),
      variant: "destructive",
    });
    if (!ok) return;

    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user._id, permanent: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || t("toastFailedDeleteUser"));
      return;
    }
    toast.success(t("toastUserDeleted", { name }));
    // A deleted row must not stay in the bulk selection, or the next bulk
    // action runs against an id that no longer exists.
    setSelected((ids) => ids.filter((id) => id !== user._id));
    fetchUsers();
  }

  /** Roles read as "job seeker" in prose, matching the badges in the table. */
  function roleLabel(role: string) {
    return role.replace("_", " ");
  }

  /**
   * A role change rebuilds the account: different navigation, different
   * permissions, and the outgoing profile gets archived (an employer's live
   * jobs come off the public board with it). It used to fire straight from the
   * dropdown's onClick with no confirmation and no toast, in a table that
   * re-renders under a filter — one mis-aimed click and a real person's
   * workspace changed under them with nothing on screen to say so.
   */
  async function changeUserRole(user: User, newRole: string) {
    if (newRole === user.role) return;

    const name = user.name || user.email;
    const notes = [
      user.role === "employer" ? t("changeRoleEmployerNote") : "",
      user.role === "job_seeker" ? t("changeRoleSeekerNote") : "",
    ].filter(Boolean);

    const ok = await confirm({
      title: t("changeRoleConfirmTitle"),
      message: [
        t("changeRoleConfirmMessage", {
          name,
          fromRole: roleLabel(user.role),
          toRole: roleLabel(newRole),
        }),
        ...notes,
      ].join(" "),
      confirmLabel: t("changeRoleConfirmLabel"),
      variant: "destructive",
    });
    if (!ok) return;

    const changed = await updateUser(user._id, { role: newRole });
    if (changed) toast.success(t("toastRoleChanged", { name, role: roleLabel(newRole) }));
  }

  async function updateUser(userId: string, update: { role?: string; isActive?: boolean }) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...update }),
    });
    if (res.ok) {
      fetchUsers();
      return true;
    }
    const err = await res.json().catch(() => ({}));
    toast.error(err.error || t("toastFailedUpdateUser"));
    return false;
  }

  async function applyBulk() {
    if (!bulkAction || bulkAction === "__none__" || selected.length === 0) return;

    const [action, role] = bulkAction.split(":");

    /**
     * Every destructive bulk action used to run straight off this button.
     * "Delete" cascades — jobs, applications, interviews, placements and
     * commissions all go with the account — and there was nothing between a
     * mis-click and dozens of accounts being erased. Activation is the only
     * action here that takes nothing away, so it is the only one that skips
     * the prompt.
     */
    const count = selected.length;
    const prompts: Record<string, { title: string; message: string; label: string }> = {
      setRole: {
        title: t("bulkConfirmSetRoleTitle", { count }),
        message: t("bulkConfirmSetRoleMessage", { count, role: roleLabel(role ?? "") }),
        label: t("bulkConfirmSetRoleLabel", { count }),
      },
      deactivate: {
        title: t("bulkConfirmDeactivateTitle", { count }),
        message: t("bulkConfirmDeactivateMessage", { count }),
        label: t("bulkConfirmDeactivateLabel", { count }),
      },
      delete: {
        title: t("bulkConfirmDeleteTitle", { count }),
        message: t("bulkConfirmDeleteMessage", { count }),
        label: t("bulkConfirmDeleteLabel", { count }),
      },
    };
    const prompt = prompts[action];
    if (prompt) {
      const ok = await confirm({
        title: prompt.title,
        message: prompt.message,
        confirmLabel: prompt.label,
        variant: "destructive",
      });
      if (!ok) return;
    }

    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected, action, ...(role ? { role } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("toastBulkFailed"));
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
      setBulkAction(""); setSelected([]);
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
    const passwordError = validatePasswordForForm(createForm.password, { locale, t: tf });
    if (passwordError) {
      setCreateError(passwordError);
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
        const { message } = await formErrorFromResponse(res, {
          t: tf,
          locale,
          fieldLabels: { name: t("fullName"), email: t("email"), password: t("password"), role: t("role") },
          conflict: tf("emailInUse"),
        });
        setCreateError(message);
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

  /** Order-independent signature of a permission state, for dirty checks. */
  function permSignature(mode: PermissionMode, perms: CustomPermissions) {
    if (mode !== "custom") return "role_default";
    const normalised = Object.entries(perms)
      .filter(([, actions]) => (actions?.length ?? 0) > 0)
      .map(([resource, actions]) => [resource, [...(actions ?? [])].sort()] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
    return JSON.stringify(normalised);
  }

  function openPermissions(user: User) {
    const mode = user.permissionMode ?? "role_default";
    const perms = user.customPermissions ?? {};
    setPermUser(user);
    setEditPermMode(mode);
    setEditPerms(perms);
    permSnapshot.current = permSignature(mode, perms);
  }

  async function closePermissions() {
    if (permSignature(editPermMode, editPerms) !== permSnapshot.current) {
      const ok = await confirm({
        title: t("discardChangesTitle"),
        message: t("discardChangesMessage"),
        confirmLabel: t("discardChangesLabel"),
        variant: "destructive",
      });
      if (!ok) return;
    }
    setPermUser(null);
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

      <section className="workspace-panel-surface overflow-hidden rounded-2xl">
        {/* data-table-toolbar opts this hand-rolled header into the shared
            mobile toolbar rules, same as pages built on <TableToolbar>. */}
        <div data-table-toolbar="compact-admin" className="flex flex-wrap items-center gap-1.5 border-b border-border/80 sm:gap-2 panel-head">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:flex-none">
              <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label={t("searchPlaceholder")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchPlaceholder")}
                className="h-11 w-full rounded-lg ps-8 text-xs sm:h-9 sm:w-52 sm:text-sm"
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-auto sm:min-w-[130px] sm:flex-none">
              <InlineSearchSelect
                options={[
                  { value: "all", label: t("allRoles") },
                  ...ROLES.map((r) => ({ value: r, label: r.replace("_", " ") })),
                  { value: "unknown", label: t("unknownRole") },
                ]}
                value={roleFilter}
                onValueChange={(v) => { setRoleFilter(v); resetPage(); }}
                placeholder={t("allRoles")}
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-auto sm:min-w-[120px] sm:flex-none">
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
              <SelectTrigger className="flex-1 max-w-xs text-sm h-9" aria-label={t("bulkAction")}>
                <SelectValue placeholder={t("bulkAction")} />
              </SelectTrigger>
              <SelectContent>
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

        {error ? (
          <div className="p-6">
            <ErrorState onRetry={fetchUsers} />
          </div>
        ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>
                <Checkbox
                  aria-label={t("selectAllUsers")}
                  className="tap-target-box"
                  checked={selected.length === users.length && users.length > 0}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>{t("userTableHeader")}</TableHead>
              <TableHead>{t("roleTableHeader")}</TableHead>
              <TableHead>{t("statusTableHeader")}</TableHead>
              <TableHead>{t("exportHeaderLastLogin")}</TableHead>
              <TableHead>{t("joinedTableHeader")}</TableHead>
              <TableHead className="text-end">{t("actionsTableHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableBodySkeleton rows={8} cols={7} />
            ) : users.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-12">
                  <EmptyState title={t("noUsers")} icon={Inbox} />
                </TableCell>
              </TableRow>
            ) : users.map((user) => {
              const initials = (user.name || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              /* formatDate's bare default is numeric (9/17/2026); the medium
                 form this table has always shown stays readable, and passing the
                 active locale is what the hardcoded "en-US" call blocked. */
              const dateOpts = { month: "short", day: "numeric", year: "numeric" } as const;
              const joined = formatDate(new Date(user.createdAt), dateOpts, locale);
              const lastLogin = user.lastLogin ? formatDate(new Date(user.lastLogin), dateOpts, locale) : null;

              return (
                <TableRow key={user._id} className={selected.includes(user._id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox
                      aria-label={t("selectUser", { name: user.name || user.email })}
                      className="tap-target-box"
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
                        {/* Under 640px the table collapses into cards that show
                            only the first two cells until a row is opened, so
                            the Status column is out of sight. Active/inactive is
                            the one thing worth seeing without tapping. */}
                        <Badge className={`mt-1 text-[11px] sm:hidden ${user.isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"}`}>
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
                              onClick={() => changeUserRole(user, r)}
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
                        <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-600">{t("customPermissions")}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[11px] ${user.isActive ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"}`}>
                      {user.isActive ? t("active") : t("inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{lastLogin ?? t("never")}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{joined}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 max-sm:min-h-11 max-sm:min-w-11"
                            aria-label={t("rowActionsFor", { name: user.name || user.email })}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => openEdit(user)}>
                            <Pencil className="h-4 w-4" /> {t("editUser")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPermissions(user)}>
                            <Shield className="h-4 w-4" /> {t("managePermissions")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void sendPasswordReset(user)}>
                            <KeyRound className="h-4 w-4" /> {t("sendPasswordReset")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => void toggleUserActive(user)}
                            className={user.isActive ? "text-destructive focus:text-destructive" : ""}
                          >
                            {user.isActive ? (
                              <><Ban className="h-4 w-4" /> {t("deactivate_user")}</>
                            ) : (
                              <><UserCheck className="h-4 w-4" /> {t("activate_user")}</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void deleteUserAccount(user)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" /> {t("deleteUserAction")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {/* ── Create User Modal ──────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-y-hidden sm:max-w-2xl">
          <DialogHeader className={DIALOG_HEAD}>
            <DialogTitle>{t("createNewUser")}</DialogTitle>
            <DialogDescription>{t("createUserDesc")}</DialogDescription>
          </DialogHeader>

          <div className={`space-y-4 ${SCROLL_BODY}`}>
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
                  placeholder={tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH })}
                  aria-describedby="create-password-hint"
                />
                <p id="create-password-hint" className="text-xs text-muted-foreground">{tf("passwordHint", { min: PASSWORD_MIN_LENGTH })}</p>
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

          <DialogFooter className={DIALOG_FOOT}>
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

      {/* ── Edit User Modal ────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-y-hidden sm:max-w-md">
          <DialogHeader className={DIALOG_HEAD}>
            <DialogTitle>{t("editUser")}</DialogTitle>
            <DialogDescription>{t("editUserDesc")}</DialogDescription>
          </DialogHeader>

          <div className={`space-y-4 ${SCROLL_BODY}`}>
            {editError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 text-sm text-destructive chip-pad">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {editError}
              </div>
            )}

            <div className="field">
              <Label htmlFor="edit-name">{t("fullName")} <span className="text-destructive">*</span></Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("johnDoe")}
              />
            </div>
            <div className="field">
              <Label htmlFor="edit-email">{t("email")} <span className="text-destructive">*</span></Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t("johnAtExample")}
              />
            </div>
          </div>

          <DialogFooter className={DIALOG_FOOT}>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editSaving}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleSaveUser()} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editSaving ? t("saving") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Permissions Editor Modal ──────────────────────── */}
      <Dialog open={!!permUser} onOpenChange={(open) => { if (!open) void closePermissions(); }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-y-hidden sm:max-w-2xl">
          <DialogHeader className={DIALOG_HEAD}>
            <DialogTitle>{t("managePermissionsTitle")}</DialogTitle>
            <DialogDescription>
              {t("managePermissionsDesc", { name: permUser?.name || "", email: permUser?.email || "", role: permUser?.role?.replace("_", " ") || "" })}
            </DialogDescription>
          </DialogHeader>

          <div className={SCROLL_BODY}>
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
          </div>

          <DialogFooter className={DIALOG_FOOT}>
            <Button type="button" variant="outline" onClick={() => void closePermissions()} disabled={permSaving}>
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
