"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Building2, Check, Copy, DollarSign, Link2, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { CrudModal, CrudField } from "@/components/shared/CrudModal";
import { usePagination } from "@/hooks/usePagination";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";

interface Employer {
  _id: string;
  name: string;
  email: string;
  companyName?: string;
  industry?: string;
  location?: string;
  isActive: boolean;
  assignedAgent?: { name: string };
  jobCount?: number;
  totalPaid?: number;
  isAgentVerified?: boolean;
}

export default function SuperAgentEmployersPage() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { page, limit, total, totalPages, setPage, setLimit, updateTotal, resetPage } = usePagination();
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [referralLink, setReferralLink] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);

  const ONBOARD_FIELDS: CrudField[] = [
    { name: "name", label: "Contact Name", type: "text", required: true },
    { name: "email", label: "Email", type: "text", required: true },
    { name: "password", label: "Temporary Password", type: "text", required: true },
    { name: "companyName", label: "Company Name", type: "text", required: true },
    { name: "industry", label: "Industry", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
  ];

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/employers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmployers(data.employers ?? []);
        updateTotal(data.total ?? data.totalCount ?? data.pagination?.total ?? data.employers?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [search, page, limit, updateTotal]);

  useEffect(() => {
    const t = setTimeout(loadEmployers, 300);
    return () => clearTimeout(t);
  }, [loadEmployers]);

  const stats = useMemo(() => ({
    total: employers.length,
    active: employers.filter((e) => e.isActive).length,
    assigned: employers.filter((e) => Boolean(e.assignedAgent?.name)).length,
    revenue: employers.reduce((sum, employer) => sum + (employer.totalPaid ?? 0), 0),
  }), [employers]);

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

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        title="Employer Relationships"
        description="Track employer accounts across your region, review who owns each relationship, and keep commercial coverage visible without changing the underlying account data flow."
        summaryTitle="Portfolio"
        summaryDescription="Search across employer records, compare activity, and confirm which accounts already have active agent ownership."
      >
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setOnboardOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            <UserPlus className="h-4 w-4" />
            Onboard Employer
          </button>
          <button
            onClick={handleGetReferralLink}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/25 hover:text-primary"
          >
            <Link2 className="h-3.5 w-3.5" />
            Get Referral Link
          </button>
        </div>
      </SuperAgentPageIntro>

      <SuperAgentMetricsGrid
        items={[
          {
            label: "Total Employers",
            value: stats.total,
            helper: "Employer accounts currently visible in the regional workspace.",
            icon: <Building2 className="h-5 w-5" />,
            toneClassName: "workspace-tone-sky",
          },
          {
            label: "Active Accounts",
            value: stats.active,
            helper: "Accounts marked active and ready to work with your team.",
            icon: <ShieldCheck className="h-5 w-5" />,
            toneClassName: "workspace-tone-emerald",
          },
          {
            label: "Assigned",
            value: stats.assigned,
            helper: "Employer records that already have an assigned agent.",
            icon: <Users className="h-5 w-5" />,
            toneClassName: "workspace-tone-indigo",
          },
          {
            label: "Revenue Tracked",
            value: stats.revenue > 0 ? `AED ${stats.revenue.toLocaleString()}` : "—",
            helper: "Visible account revenue surfaced by the current employer response.",
            icon: <DollarSign className="h-5 w-5" />,
            toneClassName: "workspace-tone-amber",
          },
        ]}
      />

      <SuperAgentSection
        eyebrow="Accounts"
        title="Review employer ownership and account health"
        description="The search box and pagination still use the same existing employer endpoint."
      >
        <div className="mb-4 relative w-full max-w-xs min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <Input
            aria-label="Search employers"
            placeholder="Search employers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="h-11 rounded-xl bg-background/85 pl-9 text-sm shadow-none"
          />
        </div>

        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-secondary/65 hover:bg-secondary/65">
                <TableHead className="py-4 text-muted-foreground/80">Company</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Contact</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Industry</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Location</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Agent</TableHead>
                <TableHead className="py-4 text-muted-foreground/80">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j} className="py-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted/75" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : employers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <SuperAgentEmptyState
                      icon={<Building2 className="h-7 w-7" />}
                      title="No employers found"
                      description="Broaden the search to review more employer accounts in your region."
                    />
                  </TableCell>
                </TableRow>
              ) : employers.map((em) => (
                <TableRow key={em._id} className="border-border/50 hover:bg-accent/25">
                  <TableCell className="py-4 font-medium text-foreground">{em.companyName ?? em.name}</TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground">{em.email}</TableCell>
                  <TableCell className="py-4 text-muted-foreground">{em.industry ?? "—"}</TableCell>
                  <TableCell className="py-4 text-muted-foreground">{em.location ?? "—"}</TableCell>
                  <TableCell className="py-4 text-muted-foreground">{em.assignedAgent?.name ?? "Unassigned"}</TableCell>
                  <TableCell className="py-4">
                    <div className="flex items-center gap-1.5">
                      {em.isAgentVerified && (
                        <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>
                      )}
                      <StatusBadge status={em.isActive ? "active" : "inactive"} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SuperAgentDataTableShell>

        <div className="mt-4">
          <PaginationControls page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} onLimitChange={setLimit} />
        </div>
      </SuperAgentSection>

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
