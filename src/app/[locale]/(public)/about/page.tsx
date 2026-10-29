import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Briefcase, Building2, CheckCircle2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("landing");
  const tf = await getTranslations("footer");
  const canonicalUrl = `${BASE_URL}/${locale}/about`;
  return {
    title: t("aboutUs"),
    description: tf("description"),
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/about`,
        ar: `${BASE_URL}/ar/about`,
        "x-default": `${BASE_URL}/en/about`,
      },
    },
    openGraph: { title: `${t("aboutUs")} | MPLOYEDIN`, description: tf("description"), type: "website", url: canonicalUrl },
  };
}

/**
 * About page (JS-7). /about was linked from llms.txt and allow-listed as a
 * public route but had no page. Built from the existing marketing copy so no
 * new claims are introduced.
 */
export default async function AboutPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("landing");
  const tf = await getTranslations("footer");

  const sections = [
    {
      icon: Users,
      title: t("seekerBenefitsTitle"),
      description: t("seekerBenefitsDescription"),
      points: [
        [t("seekerBenefitOneTitle"), t("seekerBenefitOneDescription")],
        [t("seekerBenefitTwoTitle"), t("seekerBenefitTwoDescription")],
        [t("seekerBenefitThreeTitle"), t("seekerBenefitThreeDescription")],
      ],
    },
    {
      icon: Building2,
      title: t("employerBenefitsTitle"),
      description: t("employerBenefitsDescription"),
      points: [
        [t("employerBenefitOneTitle"), t("employerBenefitOneDescription")],
        [t("employerBenefitTwoTitle"), t("employerBenefitTwoDescription")],
        [t("employerBenefitThreeTitle"), t("employerBenefitThreeDescription")],
      ],
    },
  ];

  return (
    <div className="bg-muted/30 py-14">
      <div className="container mx-auto max-w-5xl space-y-10 px-4">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">{t("heroEyebrow")}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">{t("aboutUs")}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{tf("description")}</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
            {[tf("aiMatching"), tf("fasterScreening"), tf("smarterHiring")].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {sections.map(({ icon: Icon, title, description, points }) => (
            <section key={title} className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="mt-4 text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{description}</p>
              <ul className="mt-5 space-y-4">
                {points.map(([pointTitle, pointBody]) => (
                  <li key={pointTitle}>
                    <p className="text-sm font-semibold text-foreground">{pointTitle}</p>
                    <p className="text-sm text-muted-foreground">{pointBody}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href={`/${locale}/jobs`}>
              <Briefcase className="me-2 h-4 w-4" aria-hidden /> {t("findJobs")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${locale}/contact`}>{t("contactHeading")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
