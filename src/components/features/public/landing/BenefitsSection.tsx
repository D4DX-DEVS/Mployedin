import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BadgeCheck, BarChart3, Rocket, ShieldCheck, Sparkles, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Audience } from "./types";

interface BenefitsSectionProps {
  locale: string;
  audience: Audience;
}

export function BenefitsSection({ locale, audience }: BenefitsSectionProps) {
  const t = useTranslations("landing");
  const isSeeker = audience === "jobSeeker";

  const benefits = isSeeker
    ? [
        { icon: Sparkles, title: t("seekerBenefitOneTitle"), description: t("seekerBenefitOneDescription") },
        { icon: Target, title: t("seekerBenefitTwoTitle"), description: t("seekerBenefitTwoDescription") },
        { icon: ShieldCheck, title: t("seekerBenefitThreeTitle"), description: t("seekerBenefitThreeDescription") },
      ]
    : [
        { icon: Target, title: t("employerBenefitOneTitle"), description: t("employerBenefitOneDescription") },
        { icon: BarChart3, title: t("employerBenefitTwoTitle"), description: t("employerBenefitTwoDescription") },
        { icon: BadgeCheck, title: t("employerBenefitThreeTitle"), description: t("employerBenefitThreeDescription") },
      ];

  return (
    <section className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <Rocket className="h-4 w-4" aria-hidden="true" />
            {t("benefitsEyebrow")}
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">
            {isSeeker ? t("seekerBenefitsTitle") : t("employerBenefitsTitle")}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            {isSeeker ? t("seekerBenefitsDescription") : t("employerBenefitsDescription")}
          </p>
        </div>
        <Link href={isSeeker ? `/${locale}/register` : `/${locale}/employer-register`}>
          <Button size="lg" className="w-full gap-2 rounded-xl sm:w-auto">
            {isSeeker ? t("createProfile") : t("startHiring")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <article
              key={benefit.title}
              className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_20px_50px_-34px_hsl(var(--brand-blue-dark)/0.45)]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-xl font-extrabold text-foreground">{benefit.title}</h3>
              <p className="text-base leading-7 text-muted-foreground">{benefit.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
