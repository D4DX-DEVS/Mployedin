"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Inbox, ShieldCheck, ShieldOff, FileText, ExternalLink, Ban, Download, FileSpreadsheet, LogIn, Loader2 } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

interface Employer {
  _id: string;
  name?: string;
  companyName: string;
  email?: string;
  contactEmail?: string;
  industry?: string;
  location?: string;
  phone?: string;
  status?: string;
  isActive?: boolean;
  createdAt: string;
  verificationLevel?: "basic" | "company" | "premium";
  domainVerified?: boolean;
  verificationDocs?: string[];
  employerProfileId?: string;
}

export default function AdminEmployersPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const t = useTranslations("adminEmployers");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<Employer | null>(null);
  const [verifyItem, setVerifyItem] = useState<Employer | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyOverride, setVerifyOverride] = useState(false);
  const [verifyReason, setVerifyReason] = useState("");
  const [switchingEmployerId, setSwitchingEmployerId] = useState<string | null>(null);

  const getLocalePrefix = () => {
    const pathParts = window.location.pathname.split('/');
    return `/${pathParts[1] || 'en'}`;
  };

  const handleSwitchToEmployerView = async (employerId: string) => {
    setSwitchingEmployerId(employerId);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (res.ok) {
        const localePrefix = getLocalePrefix();
        router.push(`${localePrefix}/employer`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t("switchViewErrorFallback"));
      }
    } catch {
      toast.error(t("switchViewNetworkError"));
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  const exportColumns: ExportColumn<Employer>[] = [
    { header: t("exportColumnCompany"), key: "companyName" },
    { header: t("exportColumnEmail"), key: "email" },
    { header: t("exportColumnIndustry"), key: "industry" },
    { header: t("exportColumnStatus"), key: "status", formatter: (v, r) => r.status ?? (r.isActive !== false ? "active" : "inactive") },
    { header: t("exportColumnJoined"), key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "employers",
    title: "Employers",
  });

  const fetchEmployers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    params.set("status", "all");
    const res = await fetch(`/api/employers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEmployers(data.items ?? data.employers ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, page, limit]);

  useEffect(() => { fetchEmployers(); }, [fetchEmployers]);

  const parseApiError = async (res: Response) => {
    let body: any;
    try {
      body = await res.json();
    } catch {
      return res.statusText || "Failed";
    }

    if (body?.details?.length) {
      return `${body.error}: ${body.details.map((issue: { path?: string; message: string }) =>
        issue.path ? `${issue.path}: ${issue.message}` : issue.message
      ).join("; ")}`;
    }

    return body?.error || res.statusText || "Failed";
  };

  const validateAdminPassword = (password: string) => {
    const trimmed = password.trim();
    if (trimmed.length < 12) return "Password must be at least 12 characters long.";
    if (!/[a-z]/.test(trimmed)) return "Password must include a lowercase letter.";
    if (!/[A-Z]/.test(trimmed)) return "Password must include an uppercase letter.";
    if (!/[0-9]/.test(trimmed)) return "Password must include a number.";
    if (!/[^A-Za-z0-9]/.test(trimmed)) return "Password must include a special character.";
    const commonPasswords = ["password123!", "admin@1234", "qwerty123!", "welcome123!", "letmein123!"];
    if (commonPasswords.includes(trimmed.toLowerCase())) return "Choose a less common password.";
    return null;
  };

  const handleCreate = async (values: Record<string, string>) => {
    const passwordError = values.password ? validateAdminPassword(values.password) : "Password is required.";
    if (passwordError) {
      throw new Error(passwordError);
    }

    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const message = await parseApiError(res);
      throw new Error(message);
    }
    fetchEmployers();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/employers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const message = await parseApiError(res);
      throw new Error(message);
    }
    setEditItem(null);
    fetchEmployers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: t("deactivateConfirmMessage"), confirmLabel: t("deactivateConfirmLabel") });
    if (!ok) return;
    await fetch(`/api/employers/${id}`, { method: "DELETE" });
    fetchEmployers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: t("permanentDeleteTitle"), message: t("permanentDeleteMessage"), confirmLabel: t("permanentDeleteLabel") });
    if (!ok) return;
    await fetch(`/api/employers/${id}?permanent=true`, { method: "DELETE" });
    fetchEmployers();
  };

  const handleVerify = async () => {
    if (!verifyItem) return;
    setVerifyLoading(true);
    setVerifyError(null);
    const res = await fetch(`/api/employers/${verifyItem._id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: verifyOverride, reason: verifyReason || undefined }),
    });
    if (res.ok) {
      await res.json();
      setVerifyItem((prev) => prev ? { ...prev, domainVerified: true, verificationLevel: "company" } : prev);
      setEmployers((prev) => prev.map((e) => e._id === verifyItem._id
        ? { ...e, domainVerified: true, verificationLevel: "company" }
        : e));
      setVerifyOverride(false);
      setVerifyReason("");
    } else {
      const data = await res.json();
      setVerifyError(data.error ?? "Verification failed");
    }
    setVerifyLoading(false);
  };

  const handleRevoke = async () => {
    if (!verifyItem) return;
    setVerifyLoading(true);
    const res = await fetch(`/api/employers/${verifyItem._id}/verify`, { method: "DELETE" });
    if (res.ok) {
      setVerifyItem((prev) => prev ? { ...prev, domainVerified: false, verificationLevel: "basic" } : prev);
      setEmployers((prev) => prev.map((e) => e._id === verifyItem._id
        ? { ...e, domainVerified: false, verificationLevel: "basic" }
        : e));
    }
    setVerifyLoading(false);
  };

  return (
    <div className="page-container space-y-3 sm:space-y-4">
      {ConfirmDialogNode}

      <PageHero
        title={t("pageTitle")}
        description={t("pageDescription")}
        eyebrow={t("adminWorkspace")}
      />

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* data-table-toolbar opts this hand-rolled header into the shared
            mobile toolbar rules, same as pages built on <TableToolbar>. */}
        <div data-table-toolbar="compact-admin" className="flex flex-wrap items-center gap-2 border-b border-border/80 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="relative toolbar-search-field">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder={t("searchPlaceholder")}
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> {t("exportLabel")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t("exportLabel")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />{t("exportCsv")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />{t("exportExcel")}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />{t("exportPdf")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {can("employers", "create") && (
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-8 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> {t("addEmployerButton")}
              </Button>
            )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>{t("tableHeaderCompany")}</TableHead>
              <TableHead>{t("tableHeaderEmail")}</TableHead>
              <TableHead>{t("tableHeaderIndustry")}</TableHead>
              <TableHead>{t("tableHeaderJoined")}</TableHead>
              {(can("employers", "update") || can("employers", "delete") || can("employers", "approve")) && (
                <TableHead>{t("tableHeaderActions")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : employers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">{t("noEmployersFound")}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : employers.map((emp) => (
              <TableRow key={emp._id}>
                <TableCell>
                  <div className="flex flex-col items-start gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{emp.companyName || emp.name}</span>
                      {emp.domainVerified && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">{t("verifiedBadge")}</Badge>
                      )}
                    </div>
                    <StatusBadge status={emp.status ?? (emp.isActive !== false ? "active" : "inactive")} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{emp.email ?? emp.contactEmail ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{emp.industry ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(emp.createdAt).toLocaleDateString()}</TableCell>
                {(can("employers", "update") || can("employers", "delete") || can("employers", "approve")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("employers", "approve") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setVerifyItem(emp)}
                          title={emp.domainVerified ? t("verifiedButtonTitle") : t("verifyButtonTitle")}
                        >
                          <ShieldCheck className={`h-3.5 w-3.5 ${emp.domainVerified ? "text-emerald-600" : "text-muted-foreground"}`} />
                        </Button>
                      )}
                      {can("employers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(emp)} title={t("editButtonTitle")}>
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("employers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(emp._id)} title={t("deactivateButtonTitle")}>
                          <Ban className="h-3.5 w-3.5 text-amber-500" />
                        </Button>
                      )}
                      {can("employers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(emp._id)} title={t("deleteButtonTitle")}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleSwitchToEmployerView(emp.employerProfileId ?? emp._id)}
                        disabled={switchingEmployerId === (emp.employerProfileId ?? emp._id) || emp.isActive === false}
                        title={t("switchViewTitle")}
                      >
                        {switchingEmployerId === (emp.employerProfileId ?? emp._id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                        ) : (
                          <LogIn className="h-3.5 w-3.5 text-sky-600" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />

      {(() => {
        const fields: CrudField[] = [
          { name: "name", label: t("fieldContactName"), type: "text", required: true },
          { name: "email", label: t("fieldEmail"), type: "email", required: true },
          { name: "password", label: t("fieldPassword"), type: "text", required: true, placeholder: t("fieldPasswordPlaceholder") },
          { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
          { name: "industry", label: t("fieldIndustry"), type: "text" },
          { name: "location", label: t("fieldLocation"), type: "text" },
          { name: "phone", label: t("fieldPhone"), type: "text" },
        ];
        const editFields: CrudField[] = fields.filter(f => f.name !== "password");

        return (
          <>
            <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title={t("addEmployerTitle")} fields={fields} onSubmit={handleCreate} />
            <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title={t("editEmployerTitle")} fields={editFields}
              initialValues={editItem ? { name: editItem.name ?? "", email: editItem.email ?? editItem.contactEmail ?? "", companyName: editItem.companyName ?? "", industry: editItem.industry ?? "", location: editItem.location ?? "", phone: editItem.phone ?? "" } : undefined}
              onSubmit={handleEdit} />
          </>
        );
      })()}

      {/* Verification Modal */}
      <Dialog open={!!verifyItem} onOpenChange={(open) => { if (!open) { setVerifyItem(null); setVerifyError(null); setVerifyOverride(false); setVerifyReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("verificationDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("verificationDialogDescription", { companyName: verifyItem?.companyName || "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current status */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("verificationStatusLabel")}</span>
              {verifyItem?.domainVerified ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t("verifiedBadge")}</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">{t("verificationUnverified")}</Badge>
              )}
              {verifyItem?.verificationLevel && verifyItem.verificationLevel !== "basic" && (
                <Badge variant="secondary" className="capitalize">{t("verificationLevel", { level: verifyItem.verificationLevel })}</Badge>
              )}
            </div>

            {/* Documents */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t("uploadedDocumentsLabel")}</p>
              {(verifyItem?.verificationDocs?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                  <FileText className="w-4 h-4" />
                  {t("noDocumentsUploaded")}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {verifyItem?.verificationDocs?.map((url) => {
                    const name = url.split("/").pop() ?? url;
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-primary p-2.5 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate flex-1">{name}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Error message */}
            {verifyError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <ShieldOff className="w-4 h-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {/* KYC override (only when no documents and not yet verified) */}
            {!verifyItem?.domainVerified && (verifyItem?.verificationDocs?.length ?? 0) === 0 && (
              <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={verifyOverride}
                    onChange={(e) => setVerifyOverride(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("noDocumentsOverrideLabel")}
                    <span className="text-muted-foreground"> {t("overrideAuditNote")}</span>
                  </span>
                </label>
                {verifyOverride && (
                  <Input
                    value={verifyReason}
                    onChange={(e) => setVerifyReason(e.target.value)}
                    placeholder={t("overridePlaceholder")}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {verifyItem?.domainVerified ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={verifyLoading}
                  onClick={handleRevoke}
                  className="flex-1"
                >
                  <ShieldOff className="w-3.5 h-3.5 me-1.5" />
                  {verifyLoading ? t("revokeButtonLoading") : t("revokeButtonLabel")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={verifyLoading || ((verifyItem?.verificationDocs?.length ?? 0) === 0 && !verifyOverride)}
                  onClick={handleVerify}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ShieldCheck className="w-3.5 h-3.5 me-1.5" />
                  {verifyLoading ? t("verifyButtonLoading") : t("verifyButtonLabel")}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setVerifyItem(null)}>
                {t("closeButtonLabel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
