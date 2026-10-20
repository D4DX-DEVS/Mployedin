/* ── CV PDF export ──
   One react-pdf renderer per template, each mirroring its on-screen twin in
   ./templates.tsx. Shared helpers live in ./pdf/shared.tsx. */

import React from "react";
import { Document, Font } from "@react-pdf/renderer";
import type { CVForm, FormattingOptions } from "./types";
import { getTheme, getFontScale, getSectionGap, getPdfPageSize, getMarginPt, getLineHeight } from "./types";
import { getPDFBoldFont, getPDFFont, makeStyles, type CVPDFLabels, type PdfTemplateProps } from "./pdf/shared";
import { ClassicPDF } from "./pdf/classic";
import { ModernPDF } from "./pdf/modern";
import { MinimalPDF } from "./pdf/minimal";
import { ExecutivePDF } from "./pdf/executive";
import { CreativePDF } from "./pdf/creative";
import { ElegantPDF } from "./pdf/elegant";
import { ProfessionalPDF } from "./pdf/professional";
import { CompactPDF } from "./pdf/compact";
import { TimelinePDF } from "./pdf/timeline";
import { AcademicPDF } from "./pdf/academic";
import { TechnicalPDF } from "./pdf/technical";
import { BannerPDF } from "./pdf/banner";

export type { CVPDFLabels } from "./pdf/shared";

// Never split words with hyphens: "high-perfor-mance" reads badly and breaks
// keyword matching when an applicant-tracking system extracts the text.
Font.registerHyphenationCallback((word) => [word]);

const PDF_TEMPLATES: Record<string, (props: PdfTemplateProps) => React.ReactElement> = {
  classic: ClassicPDF,
  modern: ModernPDF,
  minimal: MinimalPDF,
  executive: ExecutivePDF,
  creative: CreativePDF,
  elegant: ElegantPDF,
  professional: ProfessionalPDF,
  compact: CompactPDF,
  timeline: TimelinePDF,
  academic: AcademicPDF,
  technical: TechnicalPDF,
  banner: BannerPDF,
};

export function CVPDFDocument({
  data,
  templateId,
  formatting,
  labels,
}: {
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
}) {
  const theme = getTheme(formatting);
  const styles = makeStyles(
    theme.primary, getFontScale(formatting), getSectionGap(formatting), getPDFFont(formatting),
    getPDFBoldFont(formatting), getMarginPt(formatting), getLineHeight(formatting),
  );
  const Template = PDF_TEMPLATES[templateId] ?? ClassicPDF;

  return (
    <Document>
      <Template
        data={data}
        formatting={formatting}
        labels={labels}
        styles={styles}
        primary={theme.primary}
        light={theme.light}
        df={formatting.dateFormat}
        pageSize={getPdfPageSize(formatting)}
      />
    </Document>
  );
}
