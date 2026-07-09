"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, BriefcaseBusiness, Building2, Calendar, Check, ChevronDown, ChevronUp, Copy, Edit2, ExternalLink, Globe2, Link2, Loader2, MapPin, Power, PowerOff, Search, Sparkles, Tag, Trash2, UserPlus, Users, LogIn } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  isAgentVerified?: boolean;
}

const getEmployerFields = (t: ReturnType<typeof useTranslations>): CrudField[] => [
  { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
  { name: "industry", label: t("fieldIndustry"), type: "text" },
  { name: "location", label: t("fieldLocation"), type: "text" },
];

const getOnboardFields = (t: ReturnType<typeof useTranslations>): CrudField[] => [
  { name: "name", label: t("fieldContactName"), type: "text", required: true },
  { name: "email", label: t("fieldEmail"), type: "text", required: true },
  { name: "password", label: t("fieldTemporaryPassword"), type: "password", required: true },
  { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
  { name: "industry", label: t("fieldIndustry"), type: "text" },
  { name: "phone", label: t("fieldPhone"), type: "text" },
];

export default function AgentEmployersPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("agentEmployers");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editEmployer, setEditEmployer] = useState<Employer | null>(null);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [referralLink, setReferralLink] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState("");
  const [referralData, setReferralData] = useState<{
    linkId: string;
    referralCode: string;
    isActive: boolean;
    usedCount: number;
    maxUses: number;
    label: string;
    registrations: Array<{ companyName: string; email: string; country?: string; city?: string; registeredAt: string }>;
    expiresAt: string | null;
    createdAt: string;
  } | null>(null);
  const [referralExpanded, setReferralExpanded] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
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
        toast.error(data.error ?? t("switchEmployerViewError"));
      }
    } catch {
      toast.error(t("switchEmployerNetworkError"));
    } finally {
      setSwitchingEmployerId(null);
    }
  };

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        pagination.updateTotal(data.pagination?.total ?? data.total ?? data.employers?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, pagination.page, pagination.limit]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  useEffect(() => { pagination.resetPage(); }, [search]);

  const handleSave = async (values: Record<string, string>) => {
    if (editEmployer) {
      const res = await fetch(`/api/employers/${editEmployer._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to update employer");
    }
    setEditEmployer(null);
    loadEmployers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteEmployerConfirm"));
    if (!ok) return;
    await fetch(`/api/employers/${id}`, { method: "DELETE" });
    loadEmployers();
  };

  const handleOnboard = async (values: Record<string, string>) => {
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to onboard employer");
    }
    setOnboardOpen(false);
    loadEmployers();
  };

  const handleGetReferralLink = async () => {
    setReferralLoading(true);
    setReferralError("");
    try {
      const res = await fetch("/api/referral");
      if (res.ok) {
        const data = await res.json();
        setReferralLink(data.referralLink);
        setReferralData({
          linkId: data.linkId,
          referralCode: data.referralCode,
          isActive: data.isActive,
          usedCount: data.usedCount,
          maxUses: data.maxUses,
          label: data.label,
          registrations: data.registrations ?? [],
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setReferralError(data.error || t("referralLinkFetchFailed"));
      }
    } catch {
      setReferralError(t("referralLinkNetworkError"));
    } finally {
      setReferralLoading(false);
    }
  };

  const handleToggleReferralActive = async () => {
    if (!referralData) return;
    setTogglingActive(true);
    try {
      if (!referralData.isActive) {
        // Re-enabling: fetch a fresh referral link (new code generated on backend)
        await handleGetReferralLink();
      } else {
        // Disabling: just toggle isActive to false
        const res = await fetch(`/api/referral-links/${referralData.linkId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: false }),
        });
        if (res.ok) {
          setReferralData((prev) => prev ? { ...prev, isActive: false } : prev);
        }
      }
    } finally {
      setTogglingActive(false);
    }
  };

  const handleCopyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  };

  const activeEmployers = employers.filter((employer) => employer.isActive).length;
  const inactiveEmployers = employers.filter((employer) => !employer.isActive).length;
  const industriesCount = new Set(employers.map((employer) => employer.industry).filter(Boolean)).size;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportColumnCompany"), key: "companyName", formatter: (_v, row) => String((row as unknown as Employer).companyName ?? (row as unknown as Employer).name ?? "") },
    { header: tc("email"), key: "email" },
    { header: t("exportColumnIndustry"), key: "industry" },
    { header: t("exportColumnLocation"), key: "location" },
    { header: tc("active"), key: "isActive", formatter: (v) => v ? tc("yes") : tc("no") },
  ];

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-employers",
    title: t("exportTitle"),
  });

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {t("heroWorkspace")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("heroTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("heroDescription")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("portfolioLabel")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} {t("employerAccounts")}</p>
              <p className="text-xs text-muted-foreground">{t("portfolioDescription")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setOnboardOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <UserPlus className="h-4 w-4" />
                {t("onboardEmployerButton")}
              </button>
              <button
                onClick={handleGetReferralLink}
                disabled={referralLoading}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary disabled:opacity-50"
              >
                {referralLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {referralLoading ? tc("loading") : t("getReferralLinkButton")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tc("active")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeEmployers}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statsActiveDescription")}</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{tc("inactive")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{inactiveEmployers}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statsInactiveDescription")}</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statsIndustriesLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{industriesCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statsIndustriesDescription")}</p>
              </div>
              <div className="workspace-tone-indigo rounded-2xl p-2.5">
                <Globe2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("statsSearchReadyLabel")}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{search ? 1 : 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("statsSearchReadyDescription")}</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Referral link display — immediately visible after clicking "Get Referral Link" */}
      {referralError && (
        <section className="rounded-[28px] border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-950/20">
          <p className="text-sm text-red-600 dark:text-red-400">{referralError}</p>
        </section>
      )}

      {referralData && (
        <section className="workspace-panel-surface rounded-[28px] p-5 space-y-4">
          {/* Link URL + Copy */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
              <Link2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{t("referralLinkTitle")}</p>
                {referralData.label && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Tag className="h-2.5 w-2.5" />{referralData.label}
                  </span>
                )}
                {referralData.isActive ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">{tc("active")}</span>
                ) : (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-400">{t("referralDisabledStatus")}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground break-all font-mono">{referralLink}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyReferral}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {referralCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {referralCopied ? t("referralCopied") : tc("copy")}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{referralData.usedCount}</p>
              <p className="text-[10px] text-muted-foreground">{t("referralStatsRegistrations")}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{referralData.maxUses || "∞"}</p>
              <p className="text-[10px] text-muted-foreground">{t("referralStatsMaxUses")}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-secondary/30 p-3 text-center">
              <p className="text-lg font-semibold text-foreground font-mono">{referralData.referralCode}</p>
              <p className="text-[10px] text-muted-foreground">{t("referralStatsCode")}</p>
            </div>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToggleReferralActive}
              disabled={togglingActive}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
                referralData.isActive
                  ? "border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/20"
                  : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/20"
              }`}
            >
              {referralData.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
              {togglingActive ? t("referralUpdating") : referralData.isActive ? t("referralDisableLink") : t("referralEnableLink")}
            </button>
            <button
              onClick={() => setReferralExpanded(!referralExpanded)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
              {referralData.usedCount} {t("referralRegistrationLabel", { count: referralData.usedCount })}
              {referralExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <Link
              href="./referral-links"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("referralManageAllLinks")}
            </Link>
          </div>

          {/* Registrations expandable */}
          {referralExpanded && (
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("referralRegistrationsHeader", { count: referralData.registrations.length })}
              </p>
              {referralData.registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("referralNoRegistrations")}</p>
              ) : (
                <div className="space-y-2">
                  {referralData.registrations.map((reg, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{reg.companyName}</p>
                        <p className="text-xs text-muted-foreground">{reg.email}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {reg.country && <p>{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>}
                        <p>{new Date(reg.registeredAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("browseEmployersLabel")}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{t("browseEmployersTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("browseEmployersDescription")}</p>
          </div>
        </div>

        <div className="mt-5 max-w-xl">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("searchEmployersPlaceholder")}
            onExportCsv={handleExportCsv}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </div>
      </section>

      {loading ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="workspace-panel-surface space-y-4 overflow-hidden rounded-[28px] p-5">
              <div className="flex items-start gap-2">
                <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-9 flex-1 rounded-xl" />
                <Skeleton className="h-9 w-12 rounded-xl" />
              </div>
            </div>
          ))}
        </section>
      ) : employers.length === 0 ? (
        <section className="workspace-empty-state rounded-[28px] p-10 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-sm font-medium text-foreground">{t("emptyStateTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyStateDescription")}</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employers.map((em) => (
            <div key={em._id} className="workspace-panel-surface space-y-4 overflow-hidden rounded-[28px] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_64px_-42px_rgba(2,132,199,0.32)]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="workspace-tone-sky flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{em.companyName ?? em.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{em.email}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {em.isAgentVerified && (
                    <span className="whitespace-nowrap text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">{t("common.verified")}</span>
                  )}
                  <StatusBadge status={em.isActive ? "active" : "inactive"} />
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                {em.industry && <p className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> {t("cardFieldIndustry")}: {em.industry}</p>}
                {em.location && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {t("cardFieldLocation")}: {em.location}</p>}
              </div>

              <TooltipProvider delayDuration={200}>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`./jobs/new?employer=${em._id}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                  >
                    <BriefcaseBusiness className="h-3.5 w-3.5" /> {t("cardPostJobButton")}
                  </Link>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={`./jobs?employer=${em._id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/20 hover:text-primary"
                        aria-label={t("cardViewJobsAriaLabel", { company: em.companyName ?? em.name })}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>{t("cardViewJobsTooltip")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSwitchToEmployerView(em._id)}
                        disabled={switchingEmployerId === em._id || !em.isActive}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-sky-400/50 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
                        aria-label={t("cardSwitchWorkspaceAriaLabel", { company: em.companyName ?? em.name })}
                      >
                        {switchingEmployerId === em._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("cardSwitchWorkspaceTooltip")}</TooltipContent>
                  </Tooltip>
                  {can("employers", "update") && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => { setEditEmployer(em); setModalOpen(true); }}
                          className="rounded-xl p-2 transition-colors hover:bg-secondary/80"
                          aria-label={t("cardEditAriaLabel", { company: em.companyName ?? em.name })}
                        >
                          <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{tc("edit")}</TooltipContent>
                    </Tooltip>
                  )}
                  {can("employers", "delete") && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleDelete(em._id)}
                          className="rounded-xl p-2 transition-colors hover:bg-secondary/80"
                          aria-label={t("cardDeleteAriaLabel", { company: em.companyName ?? em.name })}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{tc("delete")}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TooltipProvider>
            </div>
          ))}
        </section>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEmployer(null); }}
        title={t("modalEditEmployerTitle")}
        fields={getEmployerFields(t)}
        initialValues={editEmployer ? {
          companyName: editEmployer.companyName ?? "",
          industry: editEmployer.industry ?? "",
          location: editEmployer.location ?? "",
        } : undefined}
        onSubmit={handleSave}
      />

      <CrudModal
        open={onboardOpen}
        onClose={() => setOnboardOpen(false)}
        title={t("modalOnboardEmployerTitle")}
        fields={getOnboardFields(t)}
        onSubmit={handleOnboard}
      />
    </div>
  );
}
