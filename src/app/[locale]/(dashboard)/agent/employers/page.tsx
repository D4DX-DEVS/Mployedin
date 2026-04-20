"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ArrowRight, BriefcaseBusiness, Building2, Check, Copy, Edit2, Globe2, Link2, Loader2, MapPin, Plus, Search, Sparkles, Trash2, UserPlus } from "lucide-react";
import { useConfirm } from "@/hooks/useConfirm";

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

const EMPLOYER_FIELDS: CrudField[] = [
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "industry", label: "Industry", type: "text" },
  { name: "location", label: "Location", type: "text" },
];

const ONBOARD_FIELDS: CrudField[] = [
  { name: "name", label: "Contact Name", type: "text", required: true },
  { name: "email", label: "Email", type: "text", required: true },
  { name: "password", label: "Temporary Password", type: "text", required: true },
  { name: "companyName", label: "Company Name", type: "text", required: true },
  { name: "industry", label: "Industry", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
];

export default function AgentEmployersPage() {
  const { can } = usePermissions();
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

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = pagination.paginationParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        pagination.updateTotal(data.total ?? data.employers?.length ?? 0);
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
    const ok = await confirmDialog("Delete this employer?");
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
    const res = await fetch("/api/referral");
    if (res.ok) {
      const data = await res.json();
      setReferralLink(data.referralLink);
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

  return (
    <div className="page-container agent-legacy-surface space-y-6">
      {ConfirmDialogNode}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              Employer Accounts
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Keep assigned employers organized, search their account details quickly, and jump straight into posting roles on their behalf.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{pagination.total} employer accounts</p>
              <p className="text-xs text-muted-foreground">Assigned companies ready for job posting and follow-up.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setOnboardOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
              >
                <UserPlus className="h-4 w-4" />
                Onboard Employer
              </button>
              <button
                onClick={handleGetReferralLink}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
              >
                <Link2 className="h-3.5 w-3.5" />
                Get Referral Link
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{activeEmployers}</p>
                <p className="mt-1 text-xs text-muted-foreground">Accounts currently available for hiring work.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Inactive</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{inactiveEmployers}</p>
                <p className="mt-1 text-xs text-muted-foreground">Accounts that may need reactivation or follow-up.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Industries</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{industriesCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Distinct sectors represented in your employer book.</p>
              </div>
              <div className="workspace-tone-indigo rounded-2xl p-2.5">
                <Globe2 className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Search ready</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{search ? 1 : 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Current search state for narrowing employer accounts.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Browse employers</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Filter the accounts you want to work on next</h2>
            <p className="mt-1 text-sm text-muted-foreground">Search by company, contact, industry, or location to focus your assigned book.</p>
          </div>
        </div>

        <div className="mt-5 max-w-xl">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employers"
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
        </div>
      ) : employers.length === 0 ? (
        <section className="workspace-empty-state rounded-[28px] p-10 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/55" />
          <p className="text-sm font-medium text-foreground">No employer accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Assigned companies will appear here once they are available to your workspace.</p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employers.map((em) => (
            <div key={em._id} className="workspace-panel-surface space-y-4 rounded-[28px] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_64px_-42px_rgba(2,132,199,0.32)]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="workspace-tone-sky flex h-11 w-11 items-center justify-center rounded-2xl">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{em.companyName ?? em.name}</p>
                    <p className="text-xs text-muted-foreground">{em.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {em.isAgentVerified && (
                    <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>
                  )}
                  <StatusBadge status={em.isActive ? "active" : "inactive"} />
                </div>
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                {em.industry && <p className="flex items-center gap-2"><Globe2 className="h-3.5 w-3.5 text-muted-foreground" /> Industry: {em.industry}</p>}
                {em.location && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Location: {em.location}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <Link
                  href={`./jobs/new?employer=${em._id}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  <BriefcaseBusiness className="h-3.5 w-3.5" /> Post Job
                </Link>
                <Link
                  href={`./jobs?employer=${em._id}`}
                  className="inline-flex items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/20 hover:text-primary"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                {can("employers", "update") && (
                  <button
                    onClick={() => { setEditEmployer(em); setModalOpen(true); }}
                    className="rounded-xl p-2 transition-colors hover:bg-secondary/80"
                    title="Edit"
                    aria-label={`Edit ${em.companyName ?? em.name}`}
                  >
                    <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                  </button>
                )}
                {can("employers", "delete") && (
                  <button
                    onClick={() => handleDelete(em._id)}
                    className="rounded-xl p-2 transition-colors hover:bg-secondary/80"
                    title="Delete"
                    aria-label={`Delete ${em.companyName ?? em.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </button>
                )}
              </div>
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
        title="Edit Employer"
        fields={EMPLOYER_FIELDS}
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
        title="Onboard New Employer"
        fields={ONBOARD_FIELDS}
        onSubmit={handleOnboard}
      />

      {referralLink && (
        <section className="workspace-panel-surface rounded-[28px] p-5">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-sky-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Your Referral Link</p>
              <p className="mt-1 text-xs text-muted-foreground break-all">{referralLink}</p>
            </div>
            <button
              onClick={handleCopyReferral}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
            >
              {referralCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {referralCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
