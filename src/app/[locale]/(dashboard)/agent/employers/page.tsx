"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FormError, formErrorFromResponse } from "@/lib/errors/form-error";
import { validatePasswordForForm, PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { useUrlFilter } from "@/hooks/useUrlFilter";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, Loader2, Power, PowerOff, UserPlus } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";
import { useTableExport } from "@/hooks/useTableExport";
import { InlineFilterBar, InlineFilterSearch } from "@/components/shared/InlineFilterBar";
import { ErrorState } from "@/components/shared/ErrorState";
import { toast } from "sonner";
import type { ExportColumn } from "@/lib/export";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import { EmployerTable } from "./_components/EmployerTable";
import type { Employer, EmployerListProps } from "./_components/types";

const getEmployerFields = (t: ReturnType<typeof useTranslations>): CrudField[] => [
  { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true },
  { name: "industry", label: t("fieldIndustry"), type: "text" },
  { name: "location", label: t("fieldLocation"), type: "text" },
];

const getOnboardFields = (t: ReturnType<typeof useTranslations>, tf: ReturnType<typeof useTranslations>): CrudField[] => [
  { name: "name", label: t("fieldContactName"), type: "text", required: true, placeholder: t("placeholderContactName") },
  { name: "email", label: t("fieldEmail"), type: "text", required: true, placeholder: t("placeholderEmail") },
  { name: "password", label: t("fieldTemporaryPassword"), type: "password", required: true, placeholder: tf("passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }), hint: tf("passwordHint", { min: PASSWORD_MIN_LENGTH }) },
  { name: "companyName", label: t("fieldCompanyName"), type: "text", required: true, placeholder: t("placeholderCompanyName") },
  { name: "industry", label: t("fieldIndustry"), type: "text", placeholder: t("placeholderIndustry") },
  { name: "phone", label: t("fieldPhone"), type: "phone", placeholder: t("placeholderPhone") },
];

export default function AgentEmployersPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("agentEmployers");
  const tf = useTranslations("formErrors");
  const tc = useTranslations("common");
  const tt = useTranslations("table");
  const tconf = useTranslations("confirm");
  const employerFields = useMemo(() => getEmployerFields(t), [t]);
  const onboardFields = useMemo(() => getOnboardFields(t, tf), [t, tf]);
  const { confirm: confirmDialog, ConfirmDialogNode } = useConfirm();
  const pagination = usePagination();
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  // Filters live in the query string so a filtered view of this list is an
  // address the dashboard, a badge or the palette can link to.
  const [search, setSearch] = useUrlFilter("search", "", { debounceMs: 400 });
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      const params = pagination.paginationParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        pagination.updateTotal(data.pagination?.total ?? data.total ?? data.employers?.length ?? 0);
      } else {
        // Was ignored: a failed load read as "no employers yet".
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
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
      if (!res.ok) throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: employerFields });
    }
    setEditEmployer(null);
    loadEmployers();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog(t("deleteEmployerConfirm"));
    if (!ok) return;
    const res = await fetch(`/api/employers/${id}`, { method: "DELETE" });
    // Unchecked before: a refused delete left the row with no word on why.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? t("deleteEmployerFailed"));
      return;
    }
    loadEmployers();
  };

  const handleOnboard = async (values: Record<string, string>) => {
    const passwordError = validatePasswordForForm(values.password ?? "", { locale, t: tf });
    if (passwordError) throw new FormError(passwordError);
    const res = await fetch("/api/employers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      throw await formErrorFromResponse(res, { t: tf, locale, fieldLabels: onboardFields, conflict: tf("emailInUse") });
    }
    setOnboardOpen(false);
    loadEmployers();
  };

  const handleGetReferralLink = async () => {
    setReferralLoading(true);
    setReferralError("");
    try {
      let res = await fetch("/api/referral");
      // 404 = no link yet; POST creates it (GET is read-only)
      if (res.status === 404) res = await fetch("/api/referral", { method: "POST" });
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
        try {
          const res = await fetch(`/api/referral-links/${referralData.linkId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: false }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setReferralError(data.error || t("referralLinkDisableFailed"));
            return;
          }
          setReferralError("");
          setReferralData((prev) => prev ? { ...prev, isActive: false } : prev);
        } catch {
          setReferralError(t("referralLinkNetworkError"));
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

  // Use pagination.total for accurate count (server-computed, not page-scoped)
  const totalEmployers = pagination.total;

  const exportColumns: ExportColumn<Record<string, unknown>>[] = [
    { header: t("exportColumnCompany"), key: "companyName", formatter: (_v, row) => String((row as unknown as Employer).companyName ?? (row as unknown as Employer).name ?? "") },
    { header: tc("email"), key: "email" },
    { header: t("exportColumnIndustry"), key: "industry" },
    { header: t("exportColumnLocation"), key: "location" },
    { header: tc("active"), key: "isActive", formatter: (v) => v ? tc("yes") : tc("no") },
  ];

  // BUG-06: export the full filtered result set, not just the visible page.
  const fetchAllEmployers = useCallback(async () => {
    const base = new URLSearchParams();
    if (search.trim()) base.set("search", search.trim());
    return fetchAllPaginated<Record<string, unknown>>(
      (page, limit) => `/api/employers?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page), limit: String(limit) })}`,
      (json) => ({
        rows: ((json.employers ?? []) as Record<string, unknown>[]),
        total: Number((json.pagination as { total?: number } | undefined)?.total ?? json.total ?? 0),
      }),
    );
  }, [search]);

  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: employers as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "agent-employers",
    title: t("exportTitle"),
    fetchAll: fetchAllEmployers,
  });

  const listProps: EmployerListProps = {
    employers,
    loading,
    locale,
    canUpdate: can("employers", "update"),
    canDelete: can("employers", "delete"),
    switchingEmployerId,
    hasActiveFilters: search.trim().length > 0,
    onSwitch: handleSwitchToEmployerView,
    onEdit: (em) => { setEditEmployer(em); setModalOpen(true); },
    onDelete: handleDelete,
  };

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <WorkspaceHeader
        title={t("heroTitle")}
        context={`${totalEmployers} ${t("employerAccounts")}`}
        actions={
          <>
            <button
              onClick={handleGetReferralLink}
              disabled={referralLoading}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary disabled:opacity-50"
            >
              {referralLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{referralLoading ? tc("loading") : t("getReferralLinkButton")}</span>
            </button>
            <button
              onClick={() => setOnboardOpen(true)}
              aria-label={t("onboardEmployerButton")}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:px-4"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("onboardEmployerButton")}</span>
            </button>
          </>
        }
      />

      {/* Referral link display — immediately visible after clicking "Get Referral Link" */}
      {referralError && (
        <section className="rounded-3xl border border-status-rejected/20 bg-status-rejected-bg card-pad">
          <p className="text-sm text-status-rejected">{referralError}</p>
        </section>
      )}

      {referralData && (
        /* One row: the link, its state and the actions. Clicking "Get referral
           link" used to inject three stat tiles and an expandable registration
           list here, pushing the employer list itself off the screen — the
           referral-links page already shows all of that. */
        <section className="workspace-panel-surface flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 sm:gap-3">
          <Link2 className="h-4 w-4 shrink-0 text-status-applied" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs text-muted-foreground">{referralLink}</p>
          </div>
          {referralData.isActive ? (
            <span className="shrink-0 rounded-full bg-status-selected-bg px-2 py-0.5 text-[11px] font-semibold text-status-selected">{tc("active")}</span>
          ) : (
            <span className="shrink-0 rounded-full bg-status-rejected-bg px-2 py-0.5 text-[11px] font-semibold text-status-rejected">{t("referralDisabledStatus")}</span>
          )}
          <button
            onClick={handleCopyReferral}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {referralCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {referralCopied ? t("referralCopied") : tc("copy")}
          </button>
          <button
            onClick={handleToggleReferralActive}
            disabled={togglingActive}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
              referralData.isActive
                ? "border-status-shortlisted/20 text-status-shortlisted hover:bg-status-shortlisted-bg"
                : "border-status-selected/20 text-status-selected hover:bg-status-selected-bg"
            }`}
          >
            {referralData.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            {togglingActive ? t("referralUpdating") : referralData.isActive ? t("referralDisableLink") : t("referralEnableLink")}
          </button>
          <Link
            href={`/${locale}/agent/referral-links`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium text-status-applied hover:bg-status-applied-bg"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("referralManageAllLinks")}
          </Link>
        </section>
      )}

      {/* One table, like admin's (owner, 2026-10-02): the card grid it could
          switch to carried an inline Delete, and two layouts had to be kept
          in step for every action. */}
      <InlineFilterBar
        className="workspace-panel-surface rounded-2xl border-b-0"
        onClear={search ? () => setSearch("") : undefined}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
      >
        <InlineFilterSearch value={search} onChange={setSearch} placeholder={t("searchEmployersPlaceholder")} />
      </InlineFilterBar>

      {loadError ? (
        <section className="workspace-panel-surface rounded-2xl p-6">
          <ErrorState onRetry={() => void loadEmployers()} />
        </section>
      ) : (
        <EmployerTable {...listProps} />
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
        fields={employerFields}
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
        fields={onboardFields}
        onSubmit={handleOnboard}
      />
    </div>
  );
}
