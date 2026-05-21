"use client";

/**
 * Job Seeker Subscription Page
 *
 * Shows current plan, usage meters, AI usage, and invoice history.
 */

import {
  Crown, Sparkles, FileText, Clock, CheckCircle, AlertTriangle,
  BarChart3, MessageSquare,
} from "lucide-react";
import { useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useMySubscription, type MySubscription } from "@/hooks/useSubscription";
import { useFeatureGateMap } from "@/hooks/useFeatureGate";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { CurrencySelector } from "@/components/shared/CurrencySelector";
import { convertAndFormat, currencyCodeForCountry } from "@/lib/currency";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const AI_LABELS: Record<string, string> = {
  ai_chat: "AI Chat",
  ai_daily_insights: "Daily Insights",
  ai_cv_extraction: "CV Extraction",
  ai_skills_suggest: "Skills Suggest",
  ai_skills_gap: "Skills Gap",
  ai_interview_questions: "Interview Questions",
  ai_profile_fill: "Profile Fill",
  ai_enhance_text: "Enhance Text",
  ai_generate_summary: "Generate Summary",
  ai_voice_input: "Voice Input",
};

// ── Main Page ────────────────────────────────────────────────────────────────

export default function JobSeekerSubscriptionPage() {
  const { data: subscription, isLoading } = useMySubscription();
  const { data: gateMap } = useFeatureGateMap();
  const { data: invoices } = useInvoices({});
  const {
    displayCurrency,
    setDisplayCurrency,
    initializeDisplayCurrency,
    isCurrencyPreferenceReady,
  } = useCurrencyPreference();
  const { rates, source: rateSource } = useExchangeRates();

  useEffect(() => {
    if (!isCurrencyPreferenceReady) {
      return;
    }

    let active = true;

    const syncCurrencyFromCountry = async () => {
      try {
        const res = await fetch("/api/job-seeker/profile", { credentials: "include" });
        if (!res.ok) return;

        const profile = await res.json() as {
          preferredCountries?: string[];
          nationality?: string;
        };

        const primaryCountry = profile.preferredCountries?.[0] ?? profile.nationality ?? "";
        const countryCurrency = currencyCodeForCountry(primaryCountry);

        if (active) {
          initializeDisplayCurrency(countryCurrency);
        }
      } catch {
        // Keep existing currency if profile lookup fails.
      }
    };

    void syncCurrencyFromCountry();

    return () => {
      active = false;
    };
  }, [initializeDisplayCurrency, isCurrencyPreferenceReady]);

  if (isLoading) {
    return (
      <div className="page-container space-y-4">
        <PageHeader title="My Subscription" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-background/70" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader
          title="My Subscription"
          description="View your plan, usage, and invoices"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Display currency:</span>
          <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} />
          {rateSource === "live" && (
            <span className="text-[10px] text-emerald-500" title="Live exchange rates">● live</span>
          )}
        </div>
      </div>

      {subscription ? (
        <ActivePlanView
          subscription={subscription}
          features={gateMap?.features ?? {}}
          invoices={invoices ?? []}
          displayCurrency={displayCurrency}
          rates={rates}
        />
      ) : (
        <NoPlanView />
      )}
    </div>
  );
}

// ── Active Plan View ─────────────────────────────────────────────────────────

function ActivePlanView({
  subscription,
  features,
  invoices,
  displayCurrency,
  rates,
}: {
  subscription: MySubscription;
  features: Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }>;
  invoices: InvoiceItem[];
  displayCurrency: string;
  rates: Record<string, number>;
}) {
  const snap = subscription.planSnapshot;
  const limits = snap?.jobSeekerLimits as Record<string, unknown> | undefined;
  const usage = subscription.usage;
  const remaining = daysUntil(subscription.endDate);

  return (
    <div className="space-y-6">
      {/* ── Plan Card ── */}
      <section className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-sky-500/0 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center">
              <Crown className="h-6 w-6 text-sky-500" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{snap?.name ?? "Unknown"}</h3>
              <p className="text-sm text-muted-foreground">
                {snap?.price > 0
                  ? convertAndFormat(snap.price, snap.currency ?? "AED", displayCurrency, rates)
                  : "Free"}{" "}
                / {snap?.billingCycle}
              </p>
              {snap?.price > 0 && displayCurrency !== (snap.currency ?? "AED") && (
                <p className="text-[10px] text-muted-foreground/60">
                  ≈ original: {snap.price} {snap.currency}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge className={`${
              subscription.status === "active"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
            }`}>
              {subscription.status === "active" ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Active</>
              ) : (
                <><AlertTriangle className="h-3 w-3 mr-1" /> {subscription.status}</>
              )}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {remaining > 0 ? `${remaining} days left` : "Expired"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <InfoCard label="Start Date" value={formatDate(subscription.startDate)} icon={<Clock className="h-4 w-4" />} />
          <InfoCard label="End Date" value={formatDate(subscription.endDate)} icon={<Clock className="h-4 w-4" />} />
          <InfoCard label="Auto-Renew" value={subscription.autoRenew ? "Enabled" : "Disabled"} icon={<CheckCircle className="h-4 w-4" />} />
        </div>
      </section>

      {/* ── Usage Meter ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Usage
        </h4>

        <UsageMeter
          label="Applications This Month"
          icon={<FileText className="h-4 w-4 text-sky-500" />}
          used={usage?.applicationsSubmitted ?? 0}
          max={(limits?.maxApplicationsPerMonth as number) ?? 0}
        />
      </section>

      {/* ── AI Features Usage ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Features
        </h4>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(AI_LABELS).map(([key, label]) => {
            const gate = features[key];
            if (!gate) return null;

            return (
              <div
                key={key}
                className={`rounded-xl border p-3 ${
                  gate.allowed
                    ? "border-border/40"
                    : "border-red-500/20 bg-red-500/5 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{label}</span>
                  {gate.allowed ? (
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                      <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> On
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">
                      Off
                    </Badge>
                  )}
                </div>
                {gate.limit !== undefined && (
                  <div className="mt-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{gate.used ?? 0} used</span>
                      <span>{gate.remaining ?? 0} left</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          (gate.remaining ?? 0) === 0 ? "bg-red-500" : "bg-sky-500"
                        }`}
                        style={{
                          width: `${gate.limit > 0 ? Math.min(100, ((gate.used ?? 0) / gate.limit) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Boolean Features ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <FileText className="h-4 w-4" /> Plan Features
        </h4>

        <div className="flex flex-wrap gap-2">
          <FeaturePill label="Profile Boost" allowed={features.profileVisibilityBoost?.allowed} />
          <FeaturePill label="Salary Insights" allowed={features.salaryInsights?.allowed} />
          <FeaturePill label="Priority Review" allowed={features.priorityApplicationReview?.allowed} />
          <FeaturePill label="Resume Builder" allowed={features.resumeBuilderAccess?.allowed} />
        </div>
      </section>

      {/* ── Invoice History ── */}
      {invoices.length > 0 && <InvoiceTable invoices={invoices} displayCurrency={displayCurrency} rates={rates} />}

      {/* ── Upgrade CTA ── */}
      {(snap?.tier ?? 0) < 2 && (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-center space-y-2">
          <Crown className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="font-semibold">Want more features?</p>
          <p className="text-sm text-muted-foreground">
            Contact your administrator to upgrade your plan for unlimited AI access and priority application review
          </p>
        </section>
      )}
    </div>
  );
}

// ── No Plan View ─────────────────────────────────────────────────────────────

function NoPlanView() {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-12 text-center space-y-3">
      <Crown className="h-12 w-12 text-muted-foreground/30 mx-auto" />
      <h3 className="text-lg font-semibold">No Active Subscription</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        You are currently on the free tier. Contact your administrator
        to unlock AI-powered features, more applications per month,
        and profile visibility boosts.
      </p>
    </section>
  );
}

// ── Sub-Components ───────────────────────────────────────────────────────────

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon} {label}
      </div>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function UsageMeter({
  label,
  icon,
  used,
  max,
}: {
  label: string;
  icon: React.ReactNode;
  used: number;
  max: number;
}) {
  const unlimited = max === -1;
  const pct = unlimited ? 10 : max > 0 ? Math.min(100, (used / max) * 100) : 0;

  return (
    <div className="rounded-xl border border-border/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {icon} {label}
        </span>
        <span className="text-sm text-muted-foreground">
          {unlimited ? `${used} / ∞` : `${used} / ${max}`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-sky-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FeaturePill({ label, allowed }: { label: string; allowed?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${
        allowed
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border/40 bg-muted/20 text-muted-foreground/50"
      }`}
    >
      {allowed ? <CheckCircle className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function InvoiceTable({ invoices, displayCurrency, rates }: { invoices: InvoiceItem[]; displayCurrency: string; rates: Record<string, number> }) {
  const TYPE_BADGE: Record<string, string> = {
    new: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    renewal: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    upgrade: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    downgrade: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> Invoices
      </h4>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
              <th className="pb-2 pr-4">Invoice #</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Plan</th>
              <th className="pb-2 pr-4">Amount</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv._id} className="border-b border-border/20">
                <td className="py-2.5 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="py-2.5 pr-4">
                  <Badge variant="outline" className={`text-xs ${TYPE_BADGE[inv.type] ?? ""}`}>
                    {inv.type}
                  </Badge>
                </td>
                <td className="py-2.5 pr-4">{inv.planName}</td>
                <td className="py-2.5 pr-4 font-medium">
                  {convertAndFormat(inv.amount, inv.currency ?? "AED", displayCurrency, rates)}
                  {displayCurrency !== (inv.currency ?? "AED") && (
                    <span className="block text-[10px] text-muted-foreground/60">
                      ≈ {inv.amount} {inv.currency}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <Badge variant="outline" className={`text-xs ${
                    inv.status === "paid"
                      ? "text-emerald-400 border-emerald-500/30"
                      : inv.status === "void"
                        ? "text-red-400 border-red-500/30"
                        : "text-amber-400 border-amber-500/30"
                  }`}>
                    {inv.status}
                  </Badge>
                </td>
                <td className="py-2.5 text-muted-foreground">{formatDate(inv.issuedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
