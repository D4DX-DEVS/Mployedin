"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EMPTY_CV_FORM, cvFormFromProfile, type SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING, getVisibleForm, type FormattingOptions } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import { useCvPdfLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/use-cv-pdf-labels";
import { PdfPagesPreview } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf-pages-preview";
import { PagedPreview } from "@/app/[locale]/(dashboard)/job-seeker/cv/paged-preview";
import { TemplateRenderer } from "@/app/[locale]/(dashboard)/job-seeker/cv/templates";
import { CV_TEMPLATE_IDS } from "@/lib/jobSeeker/cvDesign";

/**
 * The CV built on Mployedin for a seeker, drawn from their profile in the
 * design they saved (Classic when they never chose one) — the "Mployedin CV"
 * side of the CV viewer. Loaded only when that side is opened: it carries the
 * PDF renderer.
 */

interface BuiltCvResponse {
  hasContent: boolean;
  identity: { fullName: string; email: string; phone: string };
  profile: SeekerProfileData & { cvDesign?: { templateId?: string; formatting?: FormattingOptions; hiddenSections?: string[] } | null };
}

export default function MployedinCvView({ url, fileName }: { url: string; fileName: string }) {
  const t = useTranslations("resumeViewerModal");
  const tp = useTranslations("cvBuilderPage.preview");
  const labels = useCvPdfLabels();
  const [data, setData] = useState<BuiltCvResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    fetch(url, { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<BuiltCvResponse>) : Promise.reject(new Error(String(res.status)))))
      .then((body) => { if (live) setData(body); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [url]);

  const design = data?.profile.cvDesign;
  const templateId = design?.templateId && (CV_TEMPLATE_IDS as readonly string[]).includes(design.templateId) ? design.templateId : "classic";
  const formatting = design?.formatting ?? DEFAULT_FORMATTING;
  const cv = useMemo(() => {
    if (!data) return null;
    const form = cvFormFromProfile(data.profile, {
      ...EMPTY_CV_FORM,
      fullName: data.identity.fullName,
      email: data.identity.email,
      phone: data.identity.phone,
    });
    return getVisibleForm(form, new Set(design?.hiddenSections ?? []));
  }, [data, design?.hiddenSections]);

  async function download() {
    if (!cv) return;
    setDownloading(true);
    try {
      const [{ pdf }, { CVPDFDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/app/[locale]/(dashboard)/job-seeker/cv/cv-pdf-document"),
      ]);
      const blob = await pdf(<CVPDFDocument data={cv} templateId={templateId} formatting={formatting} labels={labels} />).toBlob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } finally {
      setDownloading(false);
    }
  }

  if (failed || (data && !data.hasContent)) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FileText className="size-10 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-sm font-medium">{failed ? t("builtCvFailed") : t("builtCvEmpty")}</p>
      </div>
    );
  }
  if (!cv) {
    return (
      <div className="flex min-h-full items-center justify-center" role="status" aria-label={t("builtCvLoading")}>
        <Loader2 className="size-6 animate-spin text-muted-foreground/50" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("builtCvHint")}</p>
        <Button size="sm" variant="outline" onClick={download} disabled={downloading} className="min-h-9 shrink-0 gap-1.5">
          {downloading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          {t("builtCvDownload")}
        </Button>
      </div>
      <PdfPagesPreview
        data={cv}
        templateId={templateId}
        formatting={formatting}
        labels={labels}
        pageLabel={(n) => tp("pageBreak", { n })}
        updatingLabel={tp("updating")}
        fallback={
          <PagedPreview formatting={formatting} bleed={templateId === "modern"} pageLabel={(n) => tp("pageBreak", { n })}>
            <TemplateRenderer templateId={templateId} data={cv} formatting={formatting} />
          </PagedPreview>
        }
      />
    </div>
  );
}
