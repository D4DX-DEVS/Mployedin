"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Search, Crown, ArrowUpRight, ArrowDownRight, RotateCcw, X, Loader2,
  Clock, CheckCircle, XCircle, AlertTriangle, User, Briefcase,
  ChevronDown, ChevronUp, CreditCard, Users,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUserSearch, type SearchUser } from "@/hooks/useUserSearch";
import { useSubscriptionPlans, type SubscriptionPlanItem } from "@/hooks/useSubscriptionPlans";
import { useTableExport } from "@/hooks/useTableExport";
import { TableToolbar } from "@/components/shared/TableToolbar";
import type { ExportColumn } from "@/lib/export";
import {
  useUserSubscription,
  useSubscriptionHistory,
  useAssignSubscription,
  useChangeSubscription,
  useCancelSubscription,
  useRenewSubscription,
  useBulkAssignSubscription,
  type SubscriptionItem,
  type HistoryItem,
  type BulkAssignResult,
} from "@/hooks/useSubscriptionManagement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function daysUntil(d: string | undefined) {
  if (!d) return 0;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  expired: { color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  cancelled: { color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  suspended: { color: "bg-orange-500/10 text-orange-400 border-orange-500/30", icon: AlertTriangle },
};

const ACTION_LABELS: Record<string, string> = {
  assigned: "Assigned",
  upgraded: "Upgraded",
  downgraded: "Downgraded",
  renewed: "Renewed",
  cancelled: "Cancelled",
  expired: "Expired",
  suspended: "Suspended",
  reactivated: "Reactivated",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminSubscriptionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);

  // ── Search users ──
  const { data: searchResults, isLoading: isSearching } = useUserSearch(searchQuery);

  // Filter to only employer and job_seeker
  const filteredResults = useMemo(
    () => (searchResults ?? []).filter((u) => u.role === "employer" || u.role === "job_seeker"),
    [searchResults],
  );

  const exportColumns: ExportColumn<SearchUser>[] = [
    { header: "Name", key: "name" as keyof SearchUser },
    { header: "Role", key: "role" as keyof SearchUser, formatter: (v) => v === "employer" ? "Employer" : "Job Seeker" },
    { header: "Company", key: "companyName" as keyof SearchUser, formatter: (v) => String(v || "—") },
  ];
  const { handleExportCsv, handleExportExcel, handleExportPdf } = useTableExport({
    data: filteredResults as unknown as Record<string, unknown>[],
    columns: exportColumns as unknown as ExportColumn<Record<string, unknown>>[],
    filename: "subscriptions-users",
    title: "Subscription Users",
  });

  return (
    <div className="page-container space-y-6">
      <PageHeader
        title="Subscription Management"
        description="Assign, change, and manage user subscriptions"
      />

      {/* ── User Search ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Search User
        </h3>

        <TableToolbar
          search={searchQuery}
          onSearchChange={(v) => setSearchQuery(v)}
          searchPlaceholder="Search by name or email…"
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
        />

        {/* Search Results */}
        {filteredResults.length > 0 && !selectedUser && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredResults.map((user) => (
              <button
                key={user._id}
                onClick={() => {
                  setSelectedUser(user);
                  setSearchQuery("");
                }}
                className="w-full flex items-center gap-3 rounded-xl border border-border/40 p-3 hover:bg-sky-500/5 hover:border-sky-500/30 transition-colors text-left"
              >
                <div className="h-9 w-9 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
                  {user.role === "employer" ? <Briefcase className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.role === "employer" ? "Employer" : "Job Seeker"}
                    {user.companyName ? ` · ${user.companyName}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {user.role === "employer" ? "Employer" : "Job Seeker"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Bulk Assign Section ──────────────────────────────────────── */}
      <BulkAssignSection />

      {/* ── Selected User Panel ──────────────────────────────────────── */}
      {selectedUser && (
        <UserSubscriptionPanel
          user={selectedUser}
          onClear={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

// ── User Subscription Panel ──────────────────────────────────────────────────

function UserSubscriptionPanel({
  user,
  onClear,
}: {
  user: SearchUser;
  onClear: () => void;
}) {
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const targetRole = user.role === "employer" ? "employer" : "job_seeker";

  // ── Queries ──
  const { data: subscription, isLoading: isLoadingSub } = useUserSubscription(user._id);
  const { data: plans } = useSubscriptionPlans({ targetRole, isActive: "true" });
  const { data: history } = useSubscriptionHistory(user._id);

  // ── Mutations ──
  const assignMut = useAssignSubscription();
  const changeMut = useChangeSubscription();
  const cancelMut = useCancelSubscription();
  const renewMut = useRenewSubscription();

  const isMutating = assignMut.isPending || changeMut.isPending || cancelMut.isPending || renewMut.isPending;

  const statusCfg = subscription ? STATUS_CONFIG[subscription.status] ?? STATUS_CONFIG.active : null;
  const StatusIcon = statusCfg?.icon ?? CheckCircle;

  return (
    <div className="space-y-4">
      {/* ── User Header ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-500">
              {user.role === "employer" ? <Briefcase className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <p className="text-sm text-muted-foreground">
                {user.role === "employer" ? "Employer" : "Job Seeker"}
                {user.companyName ? ` · ${user.companyName}` : ""}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── Current Subscription Card ────────────────────────── */}
      {isLoadingSub ? (
        <div className="h-32 animate-pulse rounded-2xl bg-background/70" />
      ) : subscription && subscription.status === "active" ? (
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              <h4 className="font-semibold">Current Subscription</h4>
            </div>
            <Badge className={`${statusCfg?.color} border`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {subscription.status}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/40 p-4">
              <p className="text-xs text-muted-foreground mb-1">Plan</p>
              <p className="font-semibold text-lg">{subscription.planSnapshot?.name ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">
                Tier {subscription.planSnapshot?.tier ?? 0} ·{" "}
                {subscription.planSnapshot?.price ?? 0} {subscription.planSnapshot?.currency ?? "AED"}/{subscription.planSnapshot?.billingCycle ?? "monthly"}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 p-4">
              <p className="text-xs text-muted-foreground mb-1">Period</p>
              <p className="font-medium">{formatDate(subscription.startDate)} — {formatDate(subscription.endDate)}</p>
              <p className="text-xs text-muted-foreground">
                {daysUntil(subscription.endDate) > 0
                  ? `${daysUntil(subscription.endDate)} days remaining`
                  : "Expired"}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 p-4">
              <p className="text-xs text-muted-foreground mb-1">Auto-Renew</p>
              <p className="font-medium">{subscription.autoRenew ? "Yes" : "No"}</p>
              <p className="text-xs text-muted-foreground">
                Assigned by {subscription.assignedByRole}
              </p>
            </div>
          </div>

          {/* ── Usage Summary ── */}
          <UsageSummary subscription={subscription} targetRole={targetRole} />

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => { setShowChangeForm(!showChangeForm); setShowAssignForm(false); }}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Change Plan
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => renewMut.mutate({ subscriptionId: subscription._id })}
              disabled={isMutating}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Renew
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-400 hover:text-red-300 hover:border-red-500/30"
              onClick={() => setConfirmCancel(true)}
              disabled={isMutating}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 ml-auto"
              onClick={() => setShowHistory(!showHistory)}
            >
              <Clock className="h-3.5 w-3.5" />
              History
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {/* ── Cancel Confirm ── */}
          {confirmCancel && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
              <p className="text-sm font-medium text-red-400">Confirm Cancellation</p>
              <Input
                placeholder="Reason for cancellation (optional)..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isMutating}
                  onClick={async () => {
                    await cancelMut.mutateAsync({
                      subscriptionId: subscription._id,
                      reason: cancelReason || undefined,
                    });
                    setConfirmCancel(false);
                    setCancelReason("");
                  }}
                >
                  {cancelMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Subscription"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
                  Never mind
                </Button>
              </div>
            </div>
          )}

          {/* ── Change Plan Form ── */}
          {showChangeForm && (
            <ChangePlanForm
              userId={user._id}
              currentPlanId={subscription.planId}
              plans={plans ?? []}
              onClose={() => setShowChangeForm(false)}
              changeMut={changeMut}
            />
          )}
        </section>
      ) : (
        /* ── No Active Subscription ── */
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="text-center py-6">
            <Crown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="font-medium text-muted-foreground">No Active Subscription</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Assign a plan to enable premium features for this user
            </p>
          </div>

          <Button
            className="w-full gap-2 bg-sky-600 hover:bg-sky-700"
            onClick={() => setShowAssignForm(!showAssignForm)}
          >
            <Crown className="h-4 w-4" />
            Assign Subscription Plan
          </Button>
        </section>
      )}

      {/* ── Assign Form (when no active sub) ── */}
      {showAssignForm && !subscription?.status?.includes("active") && (
        <AssignPlanForm
          userId={user._id}
          plans={plans ?? []}
          onClose={() => setShowAssignForm(false)}
          assignMut={assignMut}
        />
      )}

      {/* ── History ── */}
      {showHistory && (
        <HistoryTimeline history={history ?? []} />
      )}

      {/* ── Mutation Errors ── */}
      {(assignMut.error || changeMut.error || cancelMut.error || renewMut.error) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">
            {(assignMut.error ?? changeMut.error ?? cancelMut.error ?? renewMut.error)?.message}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Usage Summary ────────────────────────────────────────────────────────────

function UsageSummary({
  subscription,
  targetRole,
}: {
  subscription: SubscriptionItem;
  targetRole: string;
}) {
  const limits =
    targetRole === "employer"
      ? subscription.planSnapshot?.employerLimits
      : subscription.planSnapshot?.jobSeekerLimits;

  if (!limits) return null;

  const snapshot = limits as Record<string, unknown>;
  const usage = subscription.usage;

  const numericItems: { label: string; used: number; max: number }[] = [];

  if (targetRole === "employer") {
    numericItems.push(
      { label: "Active Jobs", used: usage.activeJobs ?? 0, max: snapshot.maxActiveJobs as number ?? 0 },
      { label: "Applications Viewed", used: usage.applicationsViewed ?? 0, max: snapshot.maxApplicationsViewPerMonth as number ?? 0 },
      { label: "Team Members", used: 0, max: snapshot.maxTeamMembers as number ?? 0 },
    );
  } else {
    numericItems.push(
      { label: "Applications", used: usage.applicationsSubmitted ?? 0, max: snapshot.maxApplicationsPerMonth as number ?? 0 },
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {numericItems.map((item) => {
          const unlimited = item.max === -1;
          const pct = unlimited ? 10 : item.max > 0 ? Math.min(100, (item.used / item.max) * 100) : 0;
          return (
            <div key={item.label} className="rounded-xl border border-border/40 p-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>{item.label}</span>
                <span>{unlimited ? `${item.used} / ∞` : `${item.used} / ${item.max}`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-sky-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Assign Plan Form ─────────────────────────────────────────────────────────

function AssignPlanForm({
  userId,
  plans,
  onClose,
  assignMut,
}: {
  userId: string;
  plans: SubscriptionPlanItem[];
  onClose: () => void;
  assignMut: ReturnType<typeof useAssignSubscription>;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [notes, setNotes] = useState("");

  const selectedPlan = plans.find((p) => p._id === selectedPlanId);

  const handleAssign = async () => {
    if (!selectedPlanId) return;
    await assignMut.mutateAsync({
      userId,
      planId: selectedPlanId,
      autoRenew,
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-sky-500" />
          Assign Plan
        </h4>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Plan Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <button
            key={plan._id}
            onClick={() => setSelectedPlanId(plan._id)}
            className={`text-left rounded-xl border p-4 transition-colors ${
              selectedPlanId === plan._id
                ? "border-sky-500 bg-sky-500/10"
                : "border-border/40 hover:border-sky-500/30 hover:bg-sky-500/5"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{plan.name}</span>
              <Badge variant="outline" className="text-xs">Tier {plan.tier}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{plan.description}</p>
            <p className="text-lg font-bold text-sky-500">
              {plan.price > 0 ? `${plan.price} ${plan.currency}` : "Free"}
              <span className="text-xs font-normal text-muted-foreground">/{plan.billingCycle}</span>
            </p>
          </button>
        ))}
      </div>

      {selectedPlan && (
        <div className="space-y-3 pt-3 border-t border-sky-500/20">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">Auto-renew</label>
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenew(e.target.checked)}
              className="rounded border-border"
            />
          </div>
          <Input
            placeholder="Admin notes (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="bg-sky-600 hover:bg-sky-700 gap-2"
              disabled={assignMut.isPending}
              onClick={handleAssign}
            >
              {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              Assign {selectedPlan.name}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Change Plan Form ─────────────────────────────────────────────────────────

function ChangePlanForm({
  userId,
  currentPlanId,
  plans,
  onClose,
  changeMut,
}: {
  userId: string;
  currentPlanId: string;
  plans: SubscriptionPlanItem[];
  onClose: () => void;
  changeMut: ReturnType<typeof useChangeSubscription>;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const otherPlans = plans.filter((p) => p._id !== currentPlanId);
  const selectedPlan = plans.find((p) => p._id === selectedPlanId);
  const currentPlan = plans.find((p) => p._id === currentPlanId);
  const isUpgrade = selectedPlan && currentPlan ? selectedPlan.tier > currentPlan.tier : false;

  const handleChange = async () => {
    if (!selectedPlanId) return;
    await changeMut.mutateAsync({
      userId,
      newPlanId: selectedPlanId,
      reason: reason || undefined,
    });
    onClose();
  };

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
      <p className="text-sm font-semibold">Change to:</p>
      <div className="flex flex-wrap gap-2">
        {otherPlans.map((plan) => (
          <button
            key={plan._id}
            onClick={() => setSelectedPlanId(plan._id)}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              selectedPlanId === plan._id
                ? "border-sky-500 bg-sky-500/10 font-medium"
                : "border-border/40 hover:border-sky-500/30"
            }`}
          >
            {plan.name} ({plan.price > 0 ? `${plan.price} ${plan.currency}` : "Free"})
          </button>
        ))}
      </div>

      {selectedPlan && (
        <div className="space-y-2">
          <Badge className={isUpgrade ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border border-amber-500/30"}>
            {isUpgrade ? (
              <><ArrowUpRight className="h-3 w-3 mr-1" /> Upgrade</>
            ) : (
              <><ArrowDownRight className="h-3 w-3 mr-1" /> Downgrade</>
            )}
          </Badge>
          <Input
            placeholder="Reason (optional)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="bg-sky-600 hover:bg-sky-700 gap-1.5"
              size="sm"
              disabled={changeMut.isPending}
              onClick={handleChange}
            >
              {changeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm {isUpgrade ? "Upgrade" : "Downgrade"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History Timeline ─────────────────────────────────────────────────────────

function HistoryTimeline({ history }: { history: HistoryItem[] }) {
  if (!history.length) {
    return (
      <section className="rounded-2xl border border-border/60 bg-card p-6 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No history yet</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      <h4 className="font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        Subscription History
      </h4>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border/60">
        {history.map((item) => (
          <div key={item._id} className="relative">
            <div className="absolute -left-[19px] top-1 h-3 w-3 rounded-full border-2 border-background bg-sky-500" />
            <div className="rounded-xl border border-border/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className="text-xs">
                  {ACTION_LABELS[item.action] ?? item.action}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
              </div>
              {item.fromPlanName && item.toPlanName && (
                <p className="text-sm text-muted-foreground">
                  {item.fromPlanName} → {item.toPlanName}
                </p>
              )}
              {!item.fromPlanName && item.toPlanName && (
                <p className="text-sm text-muted-foreground">
                  Assigned: {item.toPlanName}
                </p>
              )}
              {item.reason && (
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Reason: {item.reason}
                </p>
              )}
              <p className="text-xs text-muted-foreground/50 mt-1">
                By {item.performedByRole}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Bulk Assign Section ──────────────────────────────────────────────────────

function BulkAssignSection() {
  const [expanded, setExpanded] = useState(false);
  const [targetRole, setTargetRole] = useState<"employer" | "job_seeker">("employer");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [userIdsText, setUserIdsText] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkAssignResult | null>(null);

  const { data: plans } = useSubscriptionPlans({ targetRole, isActive: "true" });
  const bulkMut = useBulkAssignSubscription();

  const userIds = useMemo(
    () => userIdsText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
    [userIdsText],
  );

  const handleBulkAssign = useCallback(() => {
    if (!selectedPlanId || userIds.length === 0) return;
    bulkMut.mutate(
      { userIds, planId: selectedPlanId, autoRenew: false, notes: "Bulk assigned from admin" },
      { onSuccess: (data) => setBulkResult(data) },
    );
  }, [selectedPlanId, userIds, bulkMut]);

  return (
    <section className="rounded-2xl border border-border/60 bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 hover:bg-sky-500/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Bulk Assign
          </h3>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Role toggle */}
          <div className="flex gap-2">
            {(["employer", "job_seeker"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={targetRole === r ? "default" : "outline"}
                onClick={() => { setTargetRole(r); setSelectedPlanId(""); }}
              >
                {r === "employer" ? "Employer" : "Job Seeker"}
              </Button>
            ))}
          </div>

          {/* Plan select */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Select Plan</label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
            >
              <option value="">Choose a plan...</option>
              {(plans ?? []).map((p: SubscriptionPlanItem) => (
                <option key={p._id} value={p._id}>
                  {p.name} — Tier {p.tier} ({p.price} {p.currency}/{p.billingCycle})
                </option>
              ))}
            </select>
          </div>

          {/* User IDs textarea */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              User IDs (one per line or comma-separated) — max 100
            </label>
            <textarea
              value={userIdsText}
              onChange={(e) => setUserIdsText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-mono resize-y"
              placeholder={"60f1b2c3d4e5f6a7b8c9d0e1\n60f1b2c3d4e5f6a7b8c9d0e2"}
            />
            <p className="text-xs text-muted-foreground mt-1">{userIds.length} user(s) entered</p>
          </div>

          {/* Assign button */}
          <Button
            onClick={handleBulkAssign}
            disabled={!selectedPlanId || userIds.length === 0 || bulkMut.isPending}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {bulkMut.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning...</>
            ) : (
              <>Assign to {userIds.length} User(s)</>
            )}
          </Button>

          {/* Results */}
          {bulkResult && (
            <div className="rounded-xl border border-border/40 p-4 space-y-2">
              <p className="text-sm font-medium">
                Results: {bulkResult.assigned}/{bulkResult.total} assigned
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {bulkResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {r.status === "assigned" && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                    {r.status === "skipped" && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {r.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                    <span className="font-mono">{r.userId.slice(0, 12)}...</span>
                    <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                    {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {bulkMut.isError && (
            <p className="text-sm text-red-400">Error: {bulkMut.error?.message}</p>
          )}
        </div>
      )}
    </section>
  );
}
