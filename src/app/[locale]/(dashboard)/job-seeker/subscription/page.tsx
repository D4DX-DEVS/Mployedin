"use client";

/**
 * Job Seeker Subscription Page — Modern SaaS layout
 *
 * 1. Current Plan
 * 2. Activity Overview (applications, profile views, resume downloads, AI score)
 * 3. Upgrade banner (free tier or near-limit)
 * 4. Choose Your Plan (pricing cards)
 * 5. Why Upgrade to Premium (free tier only)
 * 6. Included / Locked Features
 * 7. FAQ
 * 8. Billing & Invoices
 * 9. Payment trust strip + Payment Method placeholder
 */

import { useState } from "react";
import {
  Crown, FileText, Download,
  Check, X, AlertTriangle, Rocket,
  CreditCard, ChevronDown, ChevronUp,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
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
import { ActivityOverview } from "@/components/subscription/ActivityOverview";
import { WhyUpgrade } from "@/components/subscription/WhyUpgrade";
import { SubscriptionFAQ } from "@/components/subscription/SubscriptionFAQ";
import { PaymentTrustStrip } from "@/components/subscription/PaymentTrustStrip";
import { convertAndFormat } from "@/lib/currency";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | undefined, locale: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(d: string | undefined) {
  if (!d) return 0;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function pctUsed(used: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function JobSeekerSubscriptionPage() {
  const t = useTranslations("jobSeekerExtra.subscription");
  const locale = useLocale();
  const { data: subscription, isLoading } = useMySubscription();
  const { data: gateMap } = useFeatureGateMap();
  const { data: invoices } = useInvoices({});
  const { data: plans = [] } = useAvailablePlans("job_seeker");
  const { displayCurrency, setDisplayCurrency } = useCurrencyPreference();
  const { rates, source: rateSource } = useExchangeRates();

  if (isLoading) {
    return (
      <div className="page-container">
        <PageHeader title={t("title")} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title={t("title")} description={t("description")} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("displayCurrency")}</span>
          <CurrencySelector value={displayCurrency} onChange={setDisplayCurrency} />
          {rateSource === "live" && (
            <span className="text-[10px] text-emerald-500" title={t("liveRates")}>● {t("live")}</span>
          )}
        </div>
      </div>

      {subscription ? (
        <ActiveView
          subscription={subscription}
          features={gateMap?.features ?? {}}
          invoices={invoices ?? []}
          plans={plans}
          displayCurrency={displayCurrency}
          rates={rates}
          locale={locale}
        />
      ) : (
        <NoPlanView plans={plans} displayCurrency={displayCurrency} rates={rates} />
      )}
    </div>
  );
}

// ── Active View ──────────────────────────────────────────────────────────────

function ActiveView({
  subscription, features, invoices, plans, displayCurrency, rates, locale,
}: {
  subscription: MySubscription;
  features: Record<string, { allowed: boolean; limit?: number; used?: number; remaining?: number }>;
  invoices: InvoiceItem[];
  plans: AvailablePlan[];
  displayCurrency: string;
  rates: Record<string, number>;
  locale: string;
}) {
  const t = useTranslations("jobSeekerExtra.subscription");
  const snap = subscription.planSnapshot;
  const limits = snap?.jobSeekerLimits as Record<string, unknown> | undefined;
  const usage = subscription.usage;
  const remaining = daysUntil(subscription.endDate);
  const currentTier = snap?.tier ?? 0;
  const isFreeTier = currentTier === 0;

  const maxApps = (limits?.maxApplicationsPerMonth as number) ?? 0;
  const usedApps = usage?.applicationsSubmitted ?? 0;
  const pct = maxApps === -1 ? 0 : pctUsed(usedApps, maxApps);
  const nearLimit = pct >= 80 && maxApps !== -1;

  const featureList = [
    { label: "Applications", detail: `${maxApps === -1 ? "Unlimited" : maxApps} applications/month`, allowed: true },
    { label: "Profile Boost", allowed: features.profileVisibilityBoost?.allowed ?? false },
    { label: "Salary Insights", allowed: features.salaryInsights?.allowed ?? false },
    { label: "Priority Review", allowed: features.priorityApplicationReview?.allowed ?? false },
    { label: "Resume Builder", allowed: features.resumeBuilderAccess?.allowed ?? false },
  ];
  const included = featureList.filter((f) => f.allowed);
  const locked = featureList.filter((f) => !f.allowed);

  return (
    <div className="space-y-6">
      {/* ── 1. Current Plan ── */}
      <section className="rounded-2xl border border-border/60 bg-card space-y-5 panel-body">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Crown className="h-6 w-6 text-sky-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="heading-subsection font-bold">{snap?.name ?? t("unknown")}</h3>
                <Badge className={subscription.status === "active" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30" : "bg-amber-500/10 text-amber-600 border border-amber-500/30"}>
                  {subscription.status === "active" ? "Active" : subscription.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {snap?.price > 0 ? `${convertAndFormat(snap.price, snap.currency ?? "AED", displayCurrency, rates)} / ${snap?.billingCycle}` : `${t("free")} / monthly`}
              </p>
            </div>
          </div>

          {isFreeTier && (
            <Button asChild size="sm" className="shrink-0">
              <a href="#plans">{t("upgradeNow")}</a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-sm border-t border-border/40 pt-4">
          <div>
            <p className="text-muted-foreground text-xs">Next Renewal</p>
            <p className="font-medium">{formatDate(subscription.endDate, locale)} · {t("renewsIn", { count: remaining })}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Auto Renew</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Switch
                checked={subscription.autoRenew}
                onCheckedChange={() => toast.info(t("autoRenewAdminOnly"))}
              />
              <span className="text-sm font-medium">{subscription.autoRenew ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Billing Cycle</p>
            <p className="font-medium capitalize">{snap?.billingCycle ?? "monthly"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Start Date</p>
            <p className="font-medium">{formatDate(subscription.startDate, locale)}</p>
          </div>
        </div>
      </section>

      {/* ── 2. Activity Overview ── */}
      <ActivityOverview appsUsed={usedApps} appsMax={maxApps} />

      {/* ── 3. Upgrade banner ── */}
      {nearLimit ? (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 card-pad">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">You are nearing your application limit. Upgrade for more applications.</p>
          <Button asChild size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10">
            <a href="#plans">{t("upgradeNow")}</a>
          </Button>
        </div>
      ) : isFreeTier && (
        <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-transparent flex items-center gap-4 panel-body">
          <div className="h-11 w-11 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0">
            <Rocket className="h-5 w-5 text-sky-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("unlockTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("unlockDescription")}</p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <a href="#plans">{t("upgradeNow")}</a>
          </Button>
        </div>
      )}

      {/* ── 4. Choose Your Plan ── */}
      {plans.length > 0 && (
        <section id="plans" className="space-y-4 scroll-mt-6">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Crown className="h-4 w-4" /> Available Plans</h4>
          <PricingGrid plans={plans} currentPlanId={subscription.planId} displayCurrency={displayCurrency} rates={rates} />
        </section>
      )}

      {/* ── 5. Why Upgrade (free tier only) ── */}
      {isFreeTier && <WhyUpgrade />}

      {/* ── 6. Included / Locked Features ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card space-y-3 panel-body">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Included</h4>
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
          <section className="rounded-2xl border border-border/60 bg-card space-y-3 panel-body">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><X className="h-4 w-4 text-muted-foreground/50" /> Not included</h4>
            <ul className="space-y-2.5">
              {locked.map((f) => (
                <li key={f.label} className="flex items-start gap-3 opacity-60">
                  <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{f.label}</p>
                    <p className="text-xs text-muted-foreground">Available on Premium</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── 7. FAQ ── */}
      <SubscriptionFAQ />

      {/* ── 8. Invoices ── */}
      {invoices.length > 0 && <InvoiceSection invoices={invoices} displayCurrency={displayCurrency} rates={rates} locale={locale} />}

      {/* ── 9. Payment trust + Payment Method ── */}
      <PaymentTrustStrip />
      <section className="rounded-2xl border border-border/60 bg-card panel-body">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">Payment Method</p>
              <p className="text-xs text-muted-foreground">No payment method added.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => toast.info(t("paymentIntegrationComingSoon"), { description: t("paymentIntegrationNotYetAvailable") })}>Add Payment Method</Button>
        </div>
      </section>
    </div>
  );
}

// ── No Plan View ─────────────────────────────────────────────────────────────

function NoPlanView({ plans, displayCurrency, rates }: { plans: AvailablePlan[]; displayCurrency: string; rates: Record<string, number> }) {
  const { mutate: selfAssign, isPending } = useSelfAssignFreePlan();
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-transparent flex items-start gap-4 panel-body">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/10 flex items-center justify-center shrink-0"><Crown className="h-6 w-6 text-sky-500" /></div>
        <div className="flex-1 min-w-0">
          <h3 className="heading-subsection font-semibold">Get Started</h3>
          <p className="text-sm text-muted-foreground mt-1">Activate your free plan to start applying for jobs and track your applications.</p>
        </div>
        <Button onClick={() => selfAssign()} disabled={isPending} className="shrink-0">{isPending ? "Activating…" : "Activate Free Plan"}</Button>
      </section>
      {plans.length > 0 && (
        <section id="plans" className="space-y-4 scroll-mt-6">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><Crown className="h-4 w-4" /> Available Plans</h4>
          <PricingGrid plans={plans} showActivateFree displayCurrency={displayCurrency} rates={rates} />
        </section>
      )}
      <WhyUpgrade />
      <SubscriptionFAQ />
      <PaymentTrustStrip />
    </div>
  );
}

// ── Invoice Section ──────────────────────────────────────────────────────────

function InvoiceSection({ invoices, displayCurrency, rates, locale }: { invoices: InvoiceItem[]; displayCurrency: string; rates: Record<string, number>; locale: string }) {
  const t = useTranslations("jobSeekerExtra.subscription");
  const [expanded, setExpanded] = useState(invoices.length <= 3);
  const visible = expanded ? invoices : invoices.slice(0, 3);

  return (
    <section className="rounded-2xl border border-border/60 bg-card space-y-4 panel-body">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2"><FileText className="h-4 w-4" /> Invoices</h4>
        <span className="text-xs text-muted-foreground">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
              <th className="pb-2 pr-4 font-medium">Invoice ID</th>
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Amount</th>
              <th className="pb-2 pr-4 font-medium">Status</th>
              <th className="pb-2 font-medium">{t("download")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inv) => (
              <tr key={inv._id} className="border-b border-border/20 last:border-0">
                <td className="py-3 pr-4 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(inv.issuedAt, locale)}</td>
                <td className="py-3 pr-4 font-medium">
                  {convertAndFormat(inv.amount, inv.currency ?? "AED", displayCurrency, rates)}
                  {displayCurrency !== (inv.currency ?? "AED") && <span className="block text-[10px] text-muted-foreground/50">{inv.amount} {inv.currency}</span>}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant="outline" className={`text-xs ${inv.status === "paid" ? "text-emerald-500 border-emerald-500/30" : inv.status === "void" ? "text-red-500 border-red-500/30" : "text-amber-500 border-amber-500/30"}`}>{inv.status}</Badge>
                </td>
                <td className="py-3">
                  <a
                    href={`/api/invoices/${inv._id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-500 hover:text-sky-600"
                  >
                    <Download className="h-3.5 w-3.5" /> {t("download")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invoices.length > 3 && (
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-sky-500 hover:text-sky-600 flex items-center gap-1 mx-auto">
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> View all</>}
        </button>
      )}
    </section>
  );
}
