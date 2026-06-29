"use client";

import { useParams } from "next/navigation";
import { SharedJobEditPage } from "@/components/features/jobs/SharedJobEditPage";

export default function AdminJobEditRoute() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const jobsHref = `/${locale}/admin/jobs`;

  return (
    <SharedJobEditPage
      id={id}
      backHref={jobsHref}
      afterSaveHref={jobsHref}
      backLabel="Back to jobs"
    />
  );
}
