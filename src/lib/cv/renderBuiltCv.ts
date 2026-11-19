/* ── The standardised ("Mployedin") CV: one input builder, one PDF render ──
   A candidate's built CV is their profile drawn in a template. The viewer's
   preview and download, and the bulk export, all go through this module, so
   there is exactly one way a built CV becomes a PDF (nothing is stored; the
   PDF is made in the browser when asked for).

   Client-only: it renders with react-pdf in the browser, through
   renderCvPdfBlob (re-exported here), which imports react-pdf and the CV
   document only when a PDF is made. Importing this module (for the input
   builder or the type) does not pull the renderer into the caller. */

import { EMPTY_CV_FORM, cvFormFromProfile, type SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING, getVisibleForm, type CVForm, type FormattingOptions } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";
import type { CVPDFLabels } from "@/app/[locale]/(dashboard)/job-seeker/cv/pdf/shared";
import { CV_TEMPLATE_IDS, STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";
import { renderCvPdfBlob } from "@/lib/cv/renderCvPdf";

export { renderCvPdfBlob, type CvPdfProps } from "@/lib/cv/renderCvPdf";

/** What `GET /api/employers/candidates/[id]/cv?kind=built` returns. */
export interface BuiltCvResponse {
  hasContent: boolean;
  identity: { fullName: string; email: string; phone: string };
  profile: SeekerProfileData & { cvDesign?: { templateId?: string; formatting?: FormattingOptions; hiddenSections?: string[] } | null };
}

/** Everything the PDF document (and the on-screen preview) is drawn from, except the labels. */
export interface BuiltCvRenderParts {
  /** The form with hidden sections already emptied. */
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  /** The sections left out of `data`: the ones the candidate hid, with or without a template override. */
  hiddenSections: ReadonlySet<string>;
}

export interface BuiltCvRenderOptions {
  /**
   * Draw the CV in this template instead of the candidate's own. An override
   * also drops the candidate's formatting (default formatting), so all
   * candidates look the same. The sections the candidate hid stay hidden: that
   * is a choice about what to share, not about the look.
   */
  templateId?: string;
}

const isTemplateId = (id: unknown): id is (typeof CV_TEMPLATE_IDS)[number] =>
  typeof id === "string" && (CV_TEMPLATE_IDS as readonly string[]).includes(id);

/**
 * The form, template, formatting and hidden sections a built CV is rendered
 * with. Pure, so the viewer's preview, its download and the export all agree
 * on it and it can be tested without react-pdf.
 *
 * Without an override this is the candidate's own design (Classic when they
 * never chose one). With one, the template and formatting are the fixed ones;
 * the candidate's hidden sections are kept either way.
 */
export function builtCvRenderInput(data: BuiltCvResponse, templateOverride?: string): BuiltCvRenderParts {
  const design = data.profile.cvDesign;
  const overridden = templateOverride !== undefined;

  const templateId = overridden
    ? (isTemplateId(templateOverride) ? templateOverride : STAFF_CV_TEMPLATE)
    : (isTemplateId(design?.templateId) ? design.templateId : "classic");
  const formatting = overridden ? DEFAULT_FORMATTING : (design?.formatting ?? DEFAULT_FORMATTING);
  const hiddenSections: ReadonlySet<string> = new Set(design?.hiddenSections ?? []);

  const form = cvFormFromProfile(data.profile, {
    ...EMPTY_CV_FORM,
    fullName: data.identity.fullName,
    email: data.identity.email,
    phone: data.identity.phone,
  });
  return { data: getVisibleForm(form, hiddenSections), templateId, formatting, hiddenSections };
}

/**
 * The built CV as a PDF. The one render function behind the viewer's download
 * and the bulk export; rejects if react-pdf cannot draw it.
 */
export async function renderBuiltCvPdf(
  data: BuiltCvResponse,
  labels: CVPDFLabels,
  opts: BuiltCvRenderOptions = {},
): Promise<Blob> {
  const { data: form, templateId, formatting } = builtCvRenderInput(data, opts.templateId);
  return renderCvPdfBlob({ data: form, templateId, formatting, labels });
}
