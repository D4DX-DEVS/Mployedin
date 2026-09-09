"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { HiresList } from "@/components/features/employer/hires/HiresList";

/** Hires tab: placements + background checks for the candidates hired on this job. */
export default function JobHiresPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <section aria-labelledby="job-hires-heading" className="space-y-3 sm:space-y-4">
      <h2 id="job-hires-heading" className="sr-only" tabIndex={-1}>{t("hiresHeading")}</h2>
      <HiresList jobId={id} locale={locale} />
    </section>
  );
}
