"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { usePagination } from "@/hooks/usePagination";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import {
  useReferralLinks,
  useUpdateReferralLink,
  ReferralLinkItem,
} from "@/hooks/useReferralLinks";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Loader2,
  Search,
  Users,
} from "lucide-react";

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function linkStatus(link: ReferralLinkItem): "active" | "expired" | "maxed" | "inactive" {
  if (!link.isActive) return "inactive";
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  if (link.maxUses > 0 && link.usedCount >= link.maxUses) return "maxed";
  return "active";
}

function statusLabel(s: ReturnType<typeof linkStatus>): string {
  switch (s) {
    case "active": return "Active";
    case "expired": return "Expired";
    case "maxed": return "Limit Reached";
    case "inactive": return "Disabled";
  }
}

function creatorName(link: ReferralLinkItem): string {
  if (typeof link.createdBy === "object" && link.createdBy?.name) return link.createdBy.name;
  return "—";
}

function creatorEmail(link: ReferralLinkItem): string {
  if (typeof link.createdBy === "object" && link.createdBy?.email) return link.createdBy.email;
  return "";
}

export default function AdminReferralLinksPage() {
  const { locale } = useParams<{ locale: string }>();
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});

  const filters = { page, limit, search };

  const { data, isLoading } = useReferralLinks(filters);
  const updateMutation = useUpdateReferralLink();

  const links = data?.links ?? [];
  const serverTotal = data?.total ?? 0;
  const serverPages = data?.totalPages ?? 0;

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale || "en"}/employer-register?ref=`
      : "";

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(`${baseUrl}${code}`);
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [baseUrl]);

  const handleToggleActive = async (link: ReferralLinkItem) => {
    await updateMutation.mutateAsync({ id: link._id, isActive: !link.isActive });
  };

  // Stats
  const activeLinks = links.filter((l) => linkStatus(l) === "active").length;
  const totalRegistrations = links.reduce((s, l) => s + l.usedCount, 0);

  const exportColumns: ExportColumn<ReferralLinkItem>[] = [
    { header: "Code", key: "code" as keyof ReferralLinkItem },
    { header: "Creator", key: "createdBy" as keyof ReferralLinkItem, formatter: (_v, r) => creatorName(r as unknown as ReferralLinkItem) },
    { header: "Role", key: "creatorRole" as keyof ReferralLinkItem, formatter: (v) => v === "super_agent" ? "Super Agent" : "Agent" },
    { header: "Label", key: "label" as keyof ReferralLinkItem, formatter: (v) => String(v || "—") },
    { header: "Used", key: "usedCount" as keyof ReferralLinkItem, formatter: (v, r) => { const l = r as unknown as ReferralLinkItem; return `${v}${l.maxUses > 0 ? ` / ${l.maxUses}` : ""}`; } },
    { header: "Status", key: "isActive" as keyof ReferralLinkItem, formatter: (_v, r) => statusLabel(linkStatus(r as unknown as ReferralLinkItem)) },
    { header: "Expires", key: "expiresAt" as keyof ReferralLinkItem, formatter: (v) => formatDate(v as string) },
    { header: "Created", key: "createdAt" as keyof ReferralLinkItem, formatter: (v) => formatDate(v as string) },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: links as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "referral-links",
    title: "Referral Links",
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Referral Links" description="Overview of all referral links created by agents and super-agents across the platform." />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Links</p>
          <p className="mt-1 text-2xl font-bold">{serverTotal}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Active Links</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{activeLinks}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Registrations</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{totalRegistrations}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Avg Registrations/Link</p>
          <p className="mt-1 text-2xl font-bold">{serverTotal > 0 ? (totalRegistrations / serverTotal).toFixed(1) : "0"}</p>
        </div>
      </div>

      {/* Search */}
      <TableToolbar
        search={search}
        onSearchChange={(v) => { setSearch(v); resetPage(); }}
        searchPlaceholder="Search by code, label, or creator…"
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      />

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium text-foreground">No referral links found</p>
          <p className="text-sm text-muted-foreground">Referral links created by agents and super-agents will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => {
                const status = linkStatus(link);
                const isExpanded = expandedId === link._id;
                return (
                  <>
                    <TableRow
                      key={link._id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setExpandedId(isExpanded ? null : link._id)}
                    >
                      <TableCell className="font-mono text-sm font-medium">{link.code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{creatorName(link)}</p>
                          <p className="text-xs text-muted-foreground">{creatorEmail(link)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${link.creatorRole === "super_agent" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                          {link.creatorRole === "super_agent" ? "Super Agent" : "Agent"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{link.label || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{link.usedCount}{link.maxUses > 0 ? ` / ${link.maxUses}` : ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(link.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(link.createdAt)}</TableCell>
                      <TableCell><StatusBadge status={status === "active" ? "active" : "inactive"} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={(e) => { e.stopPropagation(); handleCopy(link.code); }}
                          >
                            {copyMap[link.code] ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                            {copyMap[link.code] ? "Copied" : "Copy"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 px-2 text-[11px] ${link.isActive ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                            onClick={(e) => { e.stopPropagation(); handleToggleActive(link); }}
                          >
                            {link.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : link._id); }}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${link._id}-detail`}>
                        <TableCell colSpan={9} className="bg-muted/30 px-6 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Registrations ({link.registrations.length})
                          </p>
                          {link.registrations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No registrations yet.</p>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {link.registrations.map((reg, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{reg.companyName}</p>
                                    <p className="truncate text-xs text-muted-foreground">{reg.email}</p>
                                    {reg.country && (
                                      <p className="text-[11px] text-muted-foreground">{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(reg.registeredAt)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls
        page={page}
        totalPages={serverPages}
        total={serverTotal}
        limit={limit}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </div>
  );
}
