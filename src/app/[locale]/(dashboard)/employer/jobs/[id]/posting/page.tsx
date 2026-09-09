"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BookTemplate, CheckCircle, ExternalLink, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MyPostersPage } from "@/components/features/employer/poster/MyPostersPage";
import { usePermissions } from "@/hooks/usePermissions";
import { useJobDetail, useSaveAsTemplate, useJobTemplates } from "@/hooks/useJobs";
import { toUserFacingError } from "@/lib/errors/user-facing";

/** Posting tab: the public listing, this job's posters, and reuse (template). */
export default function JobPostingPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("employerJobWorkspace");
  const { can } = usePermissions();
  const { data: job } = useJobDetail(id);
  const saveAsTemplate = useSaveAsTemplate();
  const { data: templates = [] } = useJobTemplates();
  const [savingTemplate, setSavingTemplate] = useState(false);

  const jobHref = `/${locale}/employer/jobs/${id}`;
  const publicPath = `/${locale}/jobs/${id}`;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : "";
  const templateSaved = templates.some((tpl) => tpl.sourceJobId === id);

  // Legacy ?poster=1 lands here as ?create=1 → straight into the composer.
  useEffect(() => {
    if (searchParams.get("create") === "1") router.replace(`${jobHref}/poster`);
  }, [searchParams, router, jobHref]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success(t("postingLinkCopied"));
    } catch {
      /* clipboard unavailable (insecure context) — the Open link still works */
    }
  }

  async function handleSaveAsTemplate() {
    if (!job || templateSaved) return;
    setSavingTemplate(true);
    try {
      await saveAsTemplate.mutateAsync(job);
      toast.success(t("templateSaved"));
    } catch (error: unknown) {
      toast.error(toUserFacingError(error, { fallback: t("templateError") }).message);
    } finally {
      setSavingTemplate(false);
    }
  }

  if (!job) return null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <h2 className="sr-only">{t("postingHeading")}</h2>

      {/* Public listing */}
      <section aria-labelledby="posting-public-heading" className="card-base panel-body">
        <h3 id="posting-public-heading" className="heading-section font-semibold text-foreground">{t("postingPublicTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("postingPublicDesc")}</p>
        {job.status === "active" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="min-h-11 gap-1.5 rounded-xl sm:min-h-10">
              <Link href={publicPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden /> {t("postingPublicLink")}
              </Link>
            </Button>
            <Button variant="outline" className="min-h-11 gap-1.5 rounded-xl sm:min-h-10" onClick={() => { void copyLink(); }}>
              <Link2 className="h-4 w-4" aria-hidden /> {t("postingCopyLink")}
            </Button>
            {/* No Share here: the header Share (same popover) is on every tab (A28). */}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 text-xs font-medium text-amber-800 chip-pad">
            {t("postingDraftNote")}
          </p>
        )}
      </section>

      {/* Posters for this job */}
      <section aria-labelledby="posting-posters-heading" className="card-base panel-body">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="posting-posters-heading" className="heading-section font-semibold text-foreground">{t("postingPostersTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("postingPostersDesc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" className="min-h-11 rounded-xl sm:min-h-10">
              <Link href={`/${locale}/employer/my-posters`}>{t("postingManagePosters")}</Link>
            </Button>
            {can("jobs", "create") && (
              <Button asChild className="min-h-11 gap-1.5 rounded-xl sm:min-h-10">
                <Link href={`${jobHref}/poster`}>
                  <Plus className="h-4 w-4" aria-hidden /> {t("postingCreatePoster")}
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <MyPostersPage jobId={id} embedded />
        </div>
      </section>

      {/* Reuse */}
      <section aria-labelledby="posting-template-heading" className="card-base panel-body">
        <h3 id="posting-template-heading" className="heading-section font-semibold text-foreground">{t("postingTemplateTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("postingTemplateDesc")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {can("jobs", "create") && (
            <Button
              variant="outline"
              className="min-h-11 gap-1.5 rounded-xl sm:min-h-10"
              onClick={() => { void handleSaveAsTemplate(); }}
              disabled={templateSaved || savingTemplate}
            >
              {templateSaved ? (
                <><CheckCircle className="h-4 w-4 text-status-selected" aria-hidden /> {t("templateSaved")}</>
              ) : (
                <><BookTemplate className="h-4 w-4" aria-hidden /> {savingTemplate ? t("templateSaving") : t("saveAsTemplate")}</>
              )}
            </Button>
          )}
          <Button asChild variant="ghost" className="min-h-11 rounded-xl sm:min-h-10">
            <Link href={`/${locale}/employer/job-templates`}>
              {t("postingManageTemplates")}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
