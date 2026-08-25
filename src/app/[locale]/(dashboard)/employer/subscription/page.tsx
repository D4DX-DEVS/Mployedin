"use client";

/**
 * Employer Subscription Page — Modern SaaS layout
 *
 * 1. Current Plan + Billing Info
 * 2. Usage Overview with warning indicators
 * 3. Choose Your Plan (pricing cards)
 * 4. Included / Locked Features
 * 5. Billing & Invoices (only if exist)
 * 6. Payment Method placeholder
 */

import { useState } from "react";
import {
  Crown, Briefcase, Users, Eye, BarChart3,
  Check, X, AlertTriangle, FileText,
  CreditCard, ChevronDown, ChevronUp,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHero } from "@/components/shared/PageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useMySubscription, useAvailablePlans, useSelfAssignFreePlan,
  type MySubscription, type AvailablePlan,
} from "@/hooks/useSubscription";
import { useFeatureGateMap } from "@/hooks/useFeatureGate";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { CurrencySelector } from "@/components/shared/CurrencySelector";
import { PricingGrid } from "@/components/subscription/PricingGrid";
import { convertAndFormat } from "@/lib/currency";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(d: string | undefined) {
  if (!d) return 0;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function pctUsed(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function barColor(pct: number) {
  if (pct >= 100) return "bg-red-500";
  if (pct >= 80) return "bg-amber-500";
  return "bg-sky-500";
}

function barBg(pct: number) {
  if (pct >= 100) return "bg-red-500/10";
  if (pct >= 80) return "bg-amber-500/10";
  return "bg-sky-500/10";
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function EmployerSubscriptionPage() {
  const t = useTranslations("subscription");
  const { data: subscription, isLoading } = useMySubscription();
  const { data: gateMap } = useFeatureGateMap();
  const { data: invoices } = useInvoices({});
  const { data: plans = [] } = useAvailablePlans("employer");
  const { displayCurrency, setDisplayCurrency } = useCurrencyPreference();
  const { rates, source: rateSource } = useExchangeRates();

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHero icon={Crown} title={t("title")} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHero
        icon={Crown}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("displayCurrency")}</span>
            <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} />
            {rateSource === "live" && (
              <span className="text-[10px] text-emerald-500" title={t("a11yLiveExchangeRates")}>● live</span>
            )}
          </div>
        }
      />

      {subscription ? (
        <ActiveView
          subscription={subscription}
          features={gateMap?.features ?? {}}
          invoices={invoices ?? []}
          plans={plans}
          displayCurrency={displayCurrency}
          rates={rates}
        />
      ) : (
        <NoPlanView plans={plans} displayCurrency={displayCurrency} rates={rates} />
      )}
    </div>
  );
}

// ── Active View ──────────────────────────────────────────────────────────────

function ActiveView({
  subscription, features, invoices, plans, displayCurrency, rates,
}: {
  subscription: MySubscription;
  features: Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }>;
  invoices: InvoiceItem[];
  plans: AvailablePlan[];
  displayCurrency: string;
  rates: Record<string, number>;
}) {
  const t = useTranslations("subscription");
  const snap = subscription.planSnapshot;
  const limits = snap?.employerLimits as Record<string, unknown> | undefined;
  const usage = subscription.usage;
  const remaining = daysUntil(subscription.endDate);
  const currentTier = snap?.tier ?? 0;

  const usageItems = [
    { label: t("activeJobs"), icon: <Briefcase className="h-5 w-5" />, used: usage?.activeJobs ?? 0, max: (limits?.maxActiveJobs as number) ?? 0 },
    { label: t("applicationsViewed"), icon: <Eye className="h-5 w-5" />, used: usage?.applicationsViewed ?? 0, max: (limits?.maxApplicationsViewPerMonth as number) ?? 0 },
    { label: t("teamMembers"), icon: <Users className="h-5 w-5" />, used: 0, max: (limits?.maxTeamMembers as number) ?? 0 },
  ];

  const hasWarning = usageItems.some((u) => u.max > 0 && u.max !== -1 && pctUsed(u.used, u.max) >= 80);

  const maxJobs = (limits?.maxActiveJobs as number) ?? 0;
  const maxApps = (limits?.maxApplicationsViewPerMonth as number) ?? 0;
  const maxTeam = (limits?.maxTeamMembers as number) ?? 0;

  const featureList = [
    { label: t("jobPosting"), detail: maxJobs === -1 ? t("unlimited") : t("jobPostingsDetail", { count: maxJobs }), allowed: features.activeJobs?.allowed ?? true },
    { label: t("applicantTracking"), detail: t("applicantTrackingDetail", { max: maxApps === -1 ? t("unlimited") : maxApps }), allowed: features.applicationsViewed?.allowed ?? true },
    { label: t("teamCollaboration"), detail: t("teamCollaborationDetail", { max: maxTeam === -1 ? t("unlimited") : maxTeam }), allowed: features.teamMembers?.allowed ?? true },
    { label: t("dataExport"), allowed: features.dataExport?.allowed ?? false },
    { label: t("analytics"), detail: `${(limits?.analyticsLevel as string) ?? "none"} level`, allowed: (limits?.analyticsLevel as string) !== "none" },
    { label: t("commTemplates"), allowed: features.commTemplates?.allowed ?? false },
    { label: t("scorecards"), allowed: features.scorecardEvaluations?.allowed ?? false },
    { label: t("prioritySupport"), allowed: features.prioritySupport?.allowed ?? false },
  ];
  const included = featureList.filter((f) => f.allowed);
  const locked = featureList.filter((f) => !f.allowed);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ── 1. Current Plan ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Crown className="h-6 w-6 text-sky-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xl font-bold">{snap?.name ?? "Unknown"}</h3>
                <Badge className={subscription.status === "active" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30" : "bg-amber-500/10 text-amber-600 border border-amber-500/30"}>
                  {subscription.status === "active" ? t("active") : subscription.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {snap?.price > 0 ? `${convertAndFormat(snap.price, snap.currency ?? "AED", displayCurrency, rates)} / ${snap?.billingCycle}` : "Free / monthly"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">{t("nextRenewal")}</p>
              <p className="font-medium">{formatDate(subscription.endDate)} {t("daysRemaining", { days: remaining })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("autoRenew")}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Switch
                  checked={subscription.autoRenew}
                  onCheckedChange={() => toast.info(t("autoRenewAdminOnly"))}
                />
                <span className="text-sm font-medium">{subscription.autoRenew ? t("enabled") : t("disabled")}</span>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("billingCycleLabel")}</p>
              <p className="font-medium capitalize">{snap?.billingCycle ?? "monthly"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">{t("paymentMethodLabel")}</p>
              <p className="font-medium text-muted-foreground">
                {t("noPaymentMethod")}
                <button onClick={() => toast.info(t("paymentIntegrationComingSoon"), { description: t("paymentIntegrationNotYetAvailable") })} className="text-sky-500 hover:text-sky-600 ml-1">Add</button>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Usage Overview ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3 sm:space-y-4">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> {t("usageOverview")}
        </h4>
        <div className="grid gap-4 sm:grid-cols-3">
          {usageItems.map((u) => {
            const unlimited = u.max === -1;
            const pct = unlimited ? 0 : pctUsed(u.used, u.max);
            return (
              <div key={u.label} className={`rounded-xl border p-4 ${pct >= 80 ? "border-amber-500/40" : "border-border/40"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${barBg(pct)}`}>{u.icon}</div>
                  <span className="text-sm font-medium">{u.label}</span>
                </div>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-2xl font-bold">{u.used}<span className="text-sm font-normal text-muted-foreground"> / {unlimited ? "∞" : u.max}</span></p>
                  {!unlimited && u.max > 0 && (
                    <span className={`text-xs font-medium ${pct >= 100 ? "text-red-500" : pct >= 80 ? "text-amber-500" : "text-muted-foreground"}`}>{pct}% used</span>
                  )}
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${unlimited ? 5 : Math.max(pct, 2)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {hasWarning && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm text-muted-foreground flex-1">{t("nearingLimitsWarning")}</p>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10" onClick={() => toast.info(t("contactAdminToUpgrade"))}>{t("upgradePlanButton")}</Button>
          </div>
        )}
      </section>

      {/* ── 3. Choose Your Plan ── */}
      {plans.length > 0 && (
        <section className="space-y-3 sm:space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Crown className="h-4 w-4" /> {t("chooseYourPlan")}</h4>
          <PricingGrid plans={plans} currentTier={currentTier} displayCurrency={displayCurrency} rates={rates} />
        </section>
      )}

      {/* ── 4. Included / Locked Features ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> {t("includedInPlan")}</h4>
          <ul className="space-y-2.5">
            {included.map((f) => (
              <li key={f.label} className="flex items-start gap-3">
                <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  {f.detail && <p className="text-xs text-muted-foreground">{f.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        {locked.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><X className="h-4 w-4 text-muted-foreground/50" /> {t("notIncluded")}</h4>
            <ul className="space-y-2.5">
              {locked.map((f) => (
                <li key={f.label} className="flex items-start gap-3 opacity-60">
                  <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">{t("availableOnHigherPlans")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── 5. Billing & Invoices ── */}
      {invoices.length > 0 && <InvoiceSection invoices={invoices} displayCurrency={displayCurrency} rates={rates} />}

      {/* ── 6. Payment Method ── */}
      <section className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{t("paymentMethodLabel")}</p>
              <p className="text-xs text-muted-foreground">{t("addPaymentMethodPrompt")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info(t("paymentSetupComingSoon"), { description: t("onlinePaymentNotYetAvailable") })}>{t("addPaymentMethodButton")}</Button>
        </div>
      </section>
    </div>
  );
}

// ── No Plan View ─────────────────────────────────────────────────────────────

function NoPlanView({ plans, displayCurrency, rates }: { plans: AvailablePlan[]; displayCurrency: string; rates: Record<string, number> }) {
  const t = useTranslations("subscription");
  const { mutate: selfAssign, isPending } = useSelfAssignFreePlan();
  return (
    <div className="space-y-3 sm:space-y-6">
      <section className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-transparent p-6 flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0"><Crown className="h-6 w-6 text-sky-500" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg">{t("welcomeToMployedin")}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t("activateFreeDescription")}</p>
        </div>
        <Button onClick={() => selfAssign()} disabled={isPending} className="shrink-0">{isPending ? t("activating") : t("activateFreePlan")}</Button>
      </section>
      {plans.length > 0 && (
        <section className="space-y-3 sm:space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Crown className="h-4 w-4" /> {t("chooseRightPlanForTeam")}</h4>
          <PricingGrid plans={plans} showActivateFree displayCurrency={displayCurrency} rates={rates} />
        </section>
      )}
    </div>
  );
}

// ── Invoice Section ──────────────────────────────────────────────────────────

function InvoiceSection({ invoices, displayCurrency, rates }: { invoices: InvoiceItem[]; displayCurrency: string; rates: Record<string, number> }) {
  const t = useTranslations("subscription");
  const [expanded, setExpanded] = useState(invoices.length <= 3);
  const visible = expanded ? invoices : invoices.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-6 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><FileText className="h-4 w-4" /> {t("billingAndInvoices")}</h4>
        <span className="text-xs text-muted-foreground">{t("invoiceCountLabel", { count: invoices.length })}</span>
      </div>
      <div className="overflow-x-auto" tabIndex={0}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
              <th className="pb-2 pr-4 font-medium">{t("invoiceIdHeader")}</th>
              <th className="pb-2 pr-4 font-medium">{t("date")}</th>
              <th className="pb-2 pr-4 font-medium">{t("plan")}</th>
              <th className="pb-2 pr-4 font-medium">{t("amount")}</th>
              <th className="pb-2 font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inv) => (
              <tr key={inv._id} className="border-b border-border/20 last:border-0">
                <td className="py-3 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(inv.issuedAt)}</td>
                <td className="py-3 pr-4">{inv.planName}</td>
                <td className="py-3 pr-4 font-medium">
                  {convertAndFormat(inv.amount, inv.currency ?? "AED", displayCurrency, rates)}
                  {displayCurrency !== (inv.currency ?? "AED") && <span className="block text-[10px] text-muted-foreground/50">{inv.amount} {inv.currency}</span>}
                </td>
                <td className="py-3">
                  <Badge variant="outline" className={`text-xs ${inv.status === "paid" ? "text-emerald-500 border-emerald-500/30" : inv.status === "void" ? "text-red-500 border-red-500/30" : "text-amber-500 border-amber-500/30"}`}>{inv.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoices.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-sky-500 hover:text-sky-600 flex items-center gap-1 mx-auto">
          {expanded ? <><ChevronUp className="h-3 w-3" /> {t("showLess")}</> : <><ChevronDown className="h-3 w-3" /> {t("viewAllInvoices", { count: invoices.length })}</>}
        </button>
      )}
    </section>
  );
}