"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BUILT_CV_KEY, PROFILE_CV_KEY, defaultCvKey } from "@/lib/applications/cvChoice";
import { shortDate, type HomeResume } from "./homeData";

/**
 * The CV an application will carry, by the same rule the apply screens use
 * (lib/applications/cvChoice.ts), with the way to change it.
 */
export function CvSentCard({
  locale,
  resumes,
  hasProfileCv,
  hasBuiltCv,
  preferredCvId,
}: {
  locale: string;
  resumes: HomeResume[];
  hasProfileCv: boolean;
  hasBuiltCv: boolean;
  preferredCvId?: string | null;
}) {
  const t = useTranslations("jobSeekerHome");
  const tApply = useTranslations("easyApply");
  const documents = resumes.map((r) => ({ ...r, url: "", category: "resume" }));
  const key = defaultCvKey({ documents, hasProfileCv, hasBuiltCv, preferredId: preferredCvId });
  const doc = resumes.find((r) => r.id === key);

  const name =
    key === PROFILE_CV_KEY ? tApply("profileCvLabel") : key === BUILT_CV_KEY ? tApply("builtCv") : doc?.name ?? null;
  const detail =
    key === PROFILE_CV_KEY
      ? t("cvCard.profileDetail")
      : key === BUILT_CV_KEY
        ? t("cvCard.builtDetail")
        : doc
          ? t("cvCard.uploadedDetail", { date: shortDate(doc.uploadedAt, locale) ?? "" })
          : null;

  return (
    <section aria-labelledby="job-seeker-cv-sent" className="min-w-0 rounded-2xl border border-border/80 bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="job-seeker-cv-sent" className="heading-section font-semibold tracking-tight">
          {t("cvCard.title")}
        </h2>
        <Link
          href={`/${locale}/job-seeker/documents`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          {t("cvCard.myCvs")}
        </Link>
      </div>
      {name ? (
        <div className="flex items-center gap-3 px-4 pb-4 pt-2 sm:px-5">
          <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
            {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
          </span>
          <Button asChild variant="outline" size="sm" className="min-h-10 shrink-0 rounded-xl">
            <Link href={`/${locale}/job-seeker/documents`}>{t("cvCard.change")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 pb-4 pt-2 sm:px-5">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("cvCard.none")}</p>
          <Button asChild size="sm" className="min-h-10 shrink-0 rounded-xl">
            <Link href={`/${locale}/job-seeker/documents`}>
              <Upload className="me-1.5 size-4" aria-hidden />
              {t("cvCard.add")}
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
