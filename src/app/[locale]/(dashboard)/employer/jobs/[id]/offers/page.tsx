"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { OffersWorkspace } from "@/components/features/employer/offers/OffersWorkspace";

/** Offers tab: the shared inbox pinned to this job (no job selector). */
export default function JobOffersPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("employerJobWorkspace");
  return (
    <>
      <h2 className="sr-only" tabIndex={-1}>{t("offersHeading")}</h2>
      <OffersWorkspace jobId={id} embedded />
    </>
  );
}
