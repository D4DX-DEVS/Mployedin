"use client";

/** Static "Why Upgrade to Premium?" benefit cards for the job seeker subscription page. */

import { useTranslations } from "next-intl";
import { Rocket, Bot, Infinity as InfinityIcon, LineChart, Target } from "lucide-react";

const BENEFITS = [
  { icon: Rocket, titleKey: "benefitVisibilityTitle", descKey: "benefitVisibilityDesc", tone: "text-violet-500", bg: "bg-violet-500/10" },
  { icon: Bot, titleKey: "benefitAiTitle", descKey: "benefitAiDesc", tone: "text-sky-500", bg: "bg-sky-500/10" },
  { icon: InfinityIcon, titleKey: "benefitUnlimitedTitle", descKey: "benefitUnlimitedDesc", tone: "text-emerald-500", bg: "bg-emerald-500/10" },
  { icon: LineChart, titleKey: "benefitSalaryTitle", descKey: "benefitSalaryDesc", tone: "text-amber-500", bg: "bg-amber-500/10" },
  { icon: Target, titleKey: "benefitPriorityTitle", descKey: "benefitPriorityDesc", tone: "text-red-500", bg: "bg-red-500/10" },
] as const;

export function WhyUpgrade() {
  const t = useTranslations("jobSeekerExtra.subscription");

  return (
    <section className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider text-center">
        {t("whyUpgradeTitle")}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BENEFITS.map((b) => (
          <div key={b.titleKey} className="rounded-2xl border border-border/60 bg-card panel-body">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${b.bg}`}>
              <b.icon className={`h-5 w-5 ${b.tone}`} />
            </div>
            <p className="text-sm font-semibold mb-1">{t(b.titleKey)}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{t(b.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
