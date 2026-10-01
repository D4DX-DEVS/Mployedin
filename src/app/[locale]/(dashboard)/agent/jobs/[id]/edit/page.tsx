"use client";

import { useParams } from "next/navigation";
import { SharedJobEditPage } from "@/components/features/jobs/SharedJobEditPage";

/**
 * Edit a job of an assigned employer — the employer's and admin's editor.
 * A job started from a template opens here as a draft; PATCH /api/jobs/[id]
 * already scopes an agent to jobs of their assigned employers or their own.
 */
export default function AgentJobEditRoute() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const jobHref = `/${locale}/agent/jobs/${id}`;

  return <SharedJobEditPage id={id} backHref={jobHref} afterSaveHref={jobHref} />;
}
