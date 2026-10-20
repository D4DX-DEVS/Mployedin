import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

interface ClosingSectionProps {
  locale: string;
}

export function ClosingSection({ locale }: ClosingSectionProps) {
  const t = useTranslations("landing");

  return (
    <section className="container mx-auto px-4 py-12 sm:px-6 lg:py-16">
      <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-border/70 bg-[hsl(var(--brand-blue-pale))] px-6 py-10 text-center sm:py-14">
        <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl">{t("ctaHeading")}</h2>
        <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">{t("ctaDescription")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/jobs`}>
            <Button size="lg" className="rounded-xl font-bold">{t("browseJobs")}</Button>
          </Link>
          <Link href={`/${locale}/register`}>
            <Button size="lg" variant="outline" className="rounded-xl font-bold">{t("createProfile")}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
