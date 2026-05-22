"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { usePermissions } from "@/hooks/usePermissions";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import type { ExportColumn } from "@/lib/export";
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
import { Plus, Pencil, Trash2, Search, Inbox, ShieldCheck, ShieldOff, FileText, ExternalLink, Ban, Download, FileSpreadsheet, LogIn, Loader2, Sparkles } from "lucide-react";
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

const FIELDS: CrudField[] = [
  { name: "name", label: "Contact Name", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "password", label: "Password", type: "text", required: true, placeholder: "Min 8 characters" },
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "industry", label: "Industry", type: "text" },
  { name: "location", label: "Location", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
];
const EDIT_FIELDS: CrudField[] = FIELDS.filter(f => f.name !== "password");

export default function AdminEmployersPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const locale = useLocale();
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
  const [switchingEmployerId, setSwitchingEmployerId] = useState<string | null>(null);

  const handleSwitchToEmployerView = async (employerId: string) => {
    setSwitchingEmployerId(employerId);
    try {
      const res = await fetch("/api/tenant/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employerId }),
      });
      if (res.ok) {
        router.push(`/${locale}/employer`);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to switch to employer view");
      }
    } catch {
      alert("Network error — please try again");
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  const exportColumns: ExportColumn<Employer>[] = [
    { header: "Company", key: "companyName" },
    { header: "Email", key: "email" },
    { header: "Industry", key: "industry" },
    { header: "Status", key: "status", formatter: (v, r) => r.status ?? (r.isActive !== false ? "active" : "inactive") },
    { header: "Joined", key: "createdAt", formatter: (v) => v ? new Date(String(v)).toLocaleDateString() : "—" },
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
    const res = await fetch(`/api/employers?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEmployers(data.items ?? data.employers ?? []);
      updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? ((data.totalPages ?? data.pagination?.pages ?? 1) * limit));
    }
    setLoading(false);
  }, [search, page, limit]);

  useEffect(() => { fetchEmployers(); }, [fetchEmployers]);

  const handleCreate = async (values: Record<string, string>) => {
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    fetchEmployers();
  };

  const handleEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/employers/${editItem!._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
    setEditItem(null);
    fetchEmployers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: "Deactivate this employer? They won't be able to log in.", confirmLabel: "Deactivate" });
    if (!ok) return;
    await fetch(`/api/employers/${id}`, { method: "DELETE" });
    fetchEmployers();
  };

  const handlePermanentDelete = async (id: string) => {
    const ok = await confirmDialog({ title: "Permanently Delete Employer", message: "This will permanently delete the employer and all their data. This cannot be undone.", confirmLabel: "Delete Forever" });
    if (!ok) return;
    await fetch(`/api/employers/${id}?permanent=true`, { method: "DELETE" });
    fetchEmployers();
  };

  const handleVerify = async () => {
    if (!verifyItem) return;
    setVerifyLoading(true);
    setVerifyError(null);
    const res = await fetch(`/api/employers/${verifyItem._id}/verify`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setVerifyItem((prev) => prev ? { ...prev, domainVerified: true, verificationLevel: "company" } : prev);
      setEmployers((prev) => prev.map((e) => e._id === verifyItem._id
        ? { ...e, domainVerified: true, verificationLevel: "company" }
        : e));
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
    <div className="page-container space-y-4">
      {ConfirmDialogNode}

      {/* ── Hero Section ── */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Admin workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">Employers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage all employer accounts and company profiles.
            </p>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-5 py-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetPage(); }}
                placeholder="Search employer…"
                className="h-8 w-52 rounded-lg pl-8 text-sm"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg border-border/80">
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Export</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCsv}><FileText className="h-4 w-4" />CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}><FileSpreadsheet className="h-4 w-4" />Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}><FileText className="h-4 w-4" />PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {can("employers", "create") && (
              <Button onClick={() => setShowAdd(true)} size="sm" className="h-8 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> Add Employer
              </Button>
            )}
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              {(can("employers", "update") || can("employers", "delete") || can("employers", "approve")) && (
                <TableHead>Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-shimmer rounded-md bg-gradient-to-r from-muted/40 via-muted/70 to-muted/40 bg-[length:200%_100%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : employers.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-8 w-8 opacity-40" />
                    <span className="text-sm">No employers found</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : employers.map((emp) => (
              <TableRow key={emp._id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{emp.companyName || emp.name}</span>
                    {emp.domainVerified && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">Verified</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{emp.email ?? emp.contactEmail ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{emp.industry ?? "—"}</TableCell>
                <TableCell><StatusBadge status={emp.status ?? (emp.isActive !== false ? "active" : "inactive")} /></TableCell>
                <TableCell className="text-muted-foreground">{new Date(emp.createdAt).toLocaleDateString()}</TableCell>
                {(can("employers", "update") || can("employers", "delete") || can("employers", "approve")) && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {can("employers", "approve") && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setVerifyItem(emp)}
                          title={emp.domainVerified ? "Verified — click to manage" : "Verify employer"}
                        >
                          <ShieldCheck className={`h-3.5 w-3.5 ${emp.domainVerified ? "text-emerald-600" : "text-muted-foreground"}`} />
                        </Button>
                      )}
                      {can("employers", "update") && (
                        <Button variant="ghost" size="xs" onClick={() => setEditItem(emp)} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      {can("employers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handleDelete(emp._id)} title="Deactivate">
                          <Ban className="h-3.5 w-3.5 text-amber-500" />
                        </Button>
                      )}
                      {can("employers", "delete") && (
                        <Button variant="ghost" size="xs" onClick={() => handlePermanentDelete(emp._id)} title="Delete permanently">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleSwitchToEmployerView(emp.employerProfileId ?? emp._id)}
                        disabled={switchingEmployerId === (emp.employerProfileId ?? emp._id) || emp.isActive === false}
                        title="Switch to employer workspace"
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

      <CrudModal open={showAdd} onClose={() => setShowAdd(false)} title="Add Employer" fields={FIELDS} onSubmit={handleCreate} />
      <CrudModal open={!!editItem} onClose={() => setEditItem(null)} title="Edit Employer" fields={EDIT_FIELDS}
        initialValues={editItem ? { name: editItem.name ?? "", email: editItem.email ?? editItem.contactEmail ?? "", companyName: editItem.companyName ?? "", industry: editItem.industry ?? "", location: editItem.location ?? "", phone: editItem.phone ?? "" } : undefined}
        onSubmit={handleEdit} />

      {/* Verification Modal */}
      <Dialog open={!!verifyItem} onOpenChange={(open) => { if (!open) { setVerifyItem(null); setVerifyError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Employer Verification</DialogTitle>
            <DialogDescription>
              {verifyItem?.companyName} — review documents and manage verification status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current status */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status:</span>
              {verifyItem?.domainVerified ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Verified</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Unverified</Badge>
              )}
              {verifyItem?.verificationLevel && verifyItem.verificationLevel !== "basic" && (
                <Badge variant="secondary" className="capitalize">{verifyItem.verificationLevel}</Badge>
              )}
            </div>

            {/* Documents */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Uploaded Documents</p>
              {(verifyItem?.verificationDocs?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg bg-muted/30">
                  <FileText className="w-4 h-4" />
                  No documents uploaded yet
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
                  {verifyLoading ? "Revoking…" : "Revoke Verification"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={verifyLoading}
                  onClick={handleVerify}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <ShieldCheck className="w-3.5 h-3.5 me-1.5" />
                  {verifyLoading ? "Verifying…" : "Verify Employer"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setVerifyItem(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
