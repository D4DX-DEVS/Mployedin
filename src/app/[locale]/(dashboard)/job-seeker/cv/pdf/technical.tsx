import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { PdfContactBar, orderedSections, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { GRAY, sectionGap, standardFonts, standardPdfSections } from "./standard-sections";

/* ═══════════════════════════════════════
   TECHNICAL PDF — mirrors TechnicalTemplate:
   tinted header box, monospace name and "// " headings
   ═══════════════════════════════════════ */

export function TechnicalPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);

  // No letterSpacing on Courier: react-pdf mis-measures it and splits words.
  const heading = (label: string) => (
    <Text style={{ fontFamily: "Courier-Bold", fontSize: 9 * scale, color: primary, textTransform: "uppercase", marginBottom: 6 }}>
      <Text style={{ color: GRAY.g400 }}>{"// "}</Text>{label}
    </Text>
  );
  const sections = standardPdfSections(props, heading, fonts);

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      <View style={{ marginBottom: 12, padding: 9, borderRadius: 3, backgroundColor: tint(primary, 0.0625) }}>
        <Text style={{ fontFamily: "Courier-Bold", fontSize: 20 * scale, color: primary, lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontSize: 9.5 * scale, color: GRAY.g600, marginTop: 2 }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} fontFamily="Courier" style={{ marginTop: 3 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
