"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SharedJobEditPage } from "@/components/features/jobs/SharedJobEditPage";

export default function AdminJobEditRoute() {
  const t = useTranslations("adminJobsIdEdit");
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const jobsHref = `/${locale}/admin/jobs`;

  return (
    <SharedJobEditPage
      id={id}
      backHref={jobsHref}
      afterSaveHref={jobsHref}
      backLabel={t("backToJobs")}
    />
  );
}
