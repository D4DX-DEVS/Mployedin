"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import {
  useReferralLinks,
  useCreateReferralLink,
  ReferralLinkItem,
} from "@/hooks/useReferralLinks";
import {
  SuperAgentDataTableShell,
  SuperAgentEmptyState,
  SuperAgentMetricsGrid,
  SuperAgentPageIntro,
  SuperAgentSection,
} from "@/components/features/super-agent/WorkspacePage";
import {
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Link2,
  Loader2,
  Plus,
  Search,
  Tag,
  User,
  Users,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function SuperAgentReferralLinksPage() {
  const pagination = usePagination();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [copyMap, setCopyMap] = useState<Record<string, boolean>>({});

  // Create form state
  const [newLabel, setNewLabel] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");

  const filters = { page: pagination.page, limit: pagination.limit, search };

  const { data, isLoading } = useReferralLinks(filters);
  const createMutation = useCreateReferralLink();

  const links = data?.links ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const baseUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/register/employer?ref=`
      : "";

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(`${baseUrl}${code}`);
    setCopyMap((m) => ({ ...m, [code]: true }));
    setTimeout(() => setCopyMap((m) => ({ ...m, [code]: false })), 2000);
  }, [baseUrl]);

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      label: newLabel || undefined,
      maxUses: newMaxUses ? parseInt(newMaxUses) : undefined,
      expiresAt: newExpiresAt || undefined,
    });
    setCreateOpen(false);
    setNewLabel("");
    setNewMaxUses("");
    setNewExpiresAt("");
  };

  // Stats
  const activeLinks = links.filter((l) => linkStatus(l) === "active").length;
  const totalRegistrations = links.reduce((s, l) => s + l.usedCount, 0);
  const myLinks = links.filter((l) => l.creatorRole === "super_agent").length;
  const agentLinks = links.filter((l) => l.creatorRole === "agent").length;

  return (
    <div className="page-container space-y-6">
      <SuperAgentPageIntro
        eyebrow="Referral Links"
        title="Referral Link Management"
        description="Track all referral links — yours and your agents'. See who registered via each link."
      />

      <SuperAgentMetricsGrid
        items={[
          { label: "Total Links", value: total, icon: <Link2 className="h-5 w-5" />, helper: "All referral links" },
          { label: "Active Links", value: activeLinks, icon: <Check className="h-5 w-5" />, helper: "Currently active" },
          { label: "Total Registrations", value: totalRegistrations, icon: <Users className="h-5 w-5" />, helper: "Users registered via links" },
          { label: "Your Links / Agent Links", value: `${myLinks} / ${agentLinks}`, icon: <User className="h-5 w-5" />, helper: "Breakdown by owner" },
        ]}
      />

      {/* Create section */}
      <SuperAgentSection
        title="Create New Link"
        actions={
          <button
            onClick={() => setCreateOpen(!createOpen)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-sky-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
          >
            {createOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {createOpen ? "Cancel" : "New Referral Link"}
          </button>
        }
      >
        {createOpen && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Label (optional)</label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. LinkedIn Campaign" className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Max Registrations (0 = unlimited)</label>
              <Input type="number" value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value)} placeholder="0" min={0} className="h-10 rounded-xl" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Expiry Date (optional)</label>
              <Input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="h-10 rounded-xl" />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Link
              </button>
            </div>
          </div>
        )}
      </SuperAgentSection>

      {/* Search */}
      <SuperAgentSection title="Browse Referral Links">
        <div className="mt-4 max-w-xl">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.resetPage(); }}
              placeholder="Search by code, label, or creator..."
              className="h-11 rounded-xl border-border bg-secondary/65 pl-9 text-sm text-foreground shadow-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </SuperAgentSection>

      {/* Links table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-sky-600" /></div>
      ) : links.length === 0 ? (
        <SuperAgentDataTableShell>
          <SuperAgentEmptyState
            icon={<Link2 className="h-6 w-6 text-muted-foreground" />}
            title="No referral links yet"
            description="Create your first referral link or wait for agents to create theirs."
          />
        </SuperAgentDataTableShell>
      ) : (
        <SuperAgentDataTableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Expires</TableHead>
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
                    <TableRow key={link._id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : link._id)}>
                      <TableCell className="font-mono text-sm font-medium">{link.code}</TableCell>
                      <TableCell className="text-sm">{creatorName(link)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${link.creatorRole === "super_agent" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                          {link.creatorRole === "super_agent" ? "Super Agent" : "Agent"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{link.label || "—"}</TableCell>
                      <TableCell className="text-sm">{link.usedCount}{link.maxUses > 0 ? `/${link.maxUses}` : ""}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(link.expiresAt)}</TableCell>
                      <TableCell><StatusBadge status={status === "active" ? "active" : "inactive"} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(link.code); }}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-primary"
                          >
                            {copyMap[link.code] ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {copyMap[link.code] ? "Copied" : "Copy"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : link._id); }}
                            className="inline-flex h-7 items-center rounded-md border border-border px-1.5 text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${link._id}-detail`}>
                        <TableCell colSpan={8} className="bg-secondary/30 px-6 py-4">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Registrations ({link.registrations.length})
                          </p>
                          {link.registrations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No registrations yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {link.registrations.map((reg, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-foreground">{reg.companyName}</p>
                                    <p className="text-xs text-muted-foreground">{reg.email}</p>
                                  </div>
                                  <div className="text-right text-xs text-muted-foreground">
                                    {reg.country && <p>{reg.city ? `${reg.city}, ` : ""}{reg.country}</p>}
                                    <p>{formatDate(reg.registeredAt)}</p>
                                  </div>
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
        </SuperAgentDataTableShell>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={totalPages}
        total={total}
        limit={pagination.limit}
        onPageChange={pagination.setPage}
        onLimitChange={pagination.setLimit}
      />
    </div>
  );
}
