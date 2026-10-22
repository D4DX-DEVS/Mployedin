import Link from "next/link";
import { useTranslations } from "next-intl";

interface BrowseSectionProps {
  locale: string;
}

const AREA_KEYS = [
  "areaHardware", "areaSalesBD", "areaArchitects", "areaMaintenance",
  "areaRestaurant", "areaSupplyChain", "areaAccounts", "areaResearch",
] as const;

const INDUSTRY_KEYS = [
  "industryRecruitment", "industryEngineering", "industryTextiles", "industryEvents",
  "industryAdvertising", "industryFMCG", "industryHospitality", "industryRetail",
] as const;

export function BrowseSection({ locale }: BrowseSectionProps) {
  const t = useTranslations("landing");
  const jobsLink = (term: string) => `/${locale}/jobs?search=${encodeURIComponent(term)}`;

  return (
    <section className="container mx-auto px-4 pt-12 sm:px-6 lg:pt-16">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-[2]">
          <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">{t("jobsByFunctionalArea")}</h2>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {AREA_KEYS.map((key) => (
              <Link
                key={key}
                href={jobsLink(t(key))}
                className="inline-flex min-h-11 items-center rounded-2xl border border-border/70 bg-card px-4 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
              >
                {t(key)}
              </Link>
            ))}
          </div>

          <h2 className="mt-9 text-2xl font-extrabold tracking-[-0.01em] text-foreground">{t("jobsByIndustry")}</h2>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {INDUSTRY_KEYS.map((key) => (
              <Link
                key={key}
                href={jobsLink(t(key))}
                className="inline-flex min-h-11 items-center rounded-full border border-border/70 bg-card px-4 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary"
              >
                {t(key)}
              </Link>
            ))}
          </div>
        </div>

        <aside className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl border border-border/70 bg-[hsl(var(--brand-blue-pale))] p-7">
          <h3 className="text-2xl font-extrabold leading-tight tracking-[-0.01em] text-foreground">{t("hireFaster")}</h3>
          <p className="text-base leading-7 text-muted-foreground">{t("hireFasterDesc")}</p>
          <Link
            href={`/${locale}/employer-register`}
            className="inline-flex min-h-11 items-center self-start rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            {t("startHiring")}
          </Link>
        </aside>
      </div>
    </section>
  );
}
