import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface JourneySectionProps {
  locale: string;
}

export function JourneySection({ locale }: JourneySectionProps) {
  const t = useTranslations("landing");
  const steps = [
    { number: "01", title: t("journeyStepOneTitle"), description: t("journeyStepOneDescription") },
    { number: "02", title: t("journeyStepTwoTitle"), description: t("journeyStepTwoDescription") },
    { number: "03", title: t("journeyStepThreeTitle"), description: t("journeyStepThreeDescription") },
  ];

  return (
    <section className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex flex-col gap-7 rounded-[1.75rem] bg-[hsl(var(--brand-blue-dark))] p-6 text-white sm:p-10 lg:p-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[hsl(var(--brand-cyan))]">{t("journeyEyebrow")}</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{t("journeyTitle")}</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-white/75">{t("journeyDescription")}</p>
        </div>

        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="flex flex-col gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] p-5">
              <span className="text-sm font-extrabold text-[hsl(var(--brand-cyan))]">{step.number}</span>
              <h3 className="text-lg font-extrabold">{step.title}</h3>
              <p className="text-sm leading-6 text-white/75">{step.description}</p>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/${locale}/register`}>
            <Button size="lg" variant="secondary" className="w-full gap-2 rounded-xl font-bold sm:w-auto">
              {t("joinFree")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          </Link>
          <Link href={`/${locale}/jobs`}>
            <Button size="lg" variant="outline" className="w-full rounded-xl border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto">
              {t("exploreOpportunities")}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
