import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { PdfContactBar, orderedSections, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { GRAY, sectionGap, standardPdfSections } from "./standard-sections";
import { headerAlignOf, nameSizeOf, usePdfLayout } from "./pdf-layout";

/* ═══════════════════════════════════════
   ACADEMIC PDF — mirrors AcademicTemplate:
   serif throughout, centred header and headings
   ═══════════════════════════════════════ */

const FONTS = { regular: "Times-Roman", bold: "Times-Bold" };

export function AcademicPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, pageSize, formatting } = props;
  const { layout } = usePdfLayout();
  const scale = pdfScale(s);
  const headerAlign = headerAlignOf(formatting, "center");
  const contactAlign = (headerAlign === "center" ? "center" : "start") as "start" | "center";

  const heading = (label: string) => (
    <Text
      style={{
        fontFamily: FONTS.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 1.1,
        textAlign: "center", borderBottomWidth: 1, borderBottomColor: tint(primary, 0.25), paddingBottom: 2, marginBottom: 6,
      }}
    >
      {label}
    </Text>
  );
  const sections = standardPdfSections(props, heading, FONTS);

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale, fontFamily: FONTS.regular }}>
      <View style={{ alignItems: headerAlign === "center" ? "center" : "flex-start", paddingBottom: 9, marginBottom: 9, borderBottomWidth: 2, borderBottomColor: primary }}>
        <Text style={{ fontFamily: FONTS.bold, fontSize: nameSizeOf(formatting, 22), color: GRAY.g900, lineHeight: 1.2, textAlign: headerAlign }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontFamily: "Times-Italic", fontSize: 10 * scale, color: GRAY.g600, marginTop: 3, textAlign: layout.textAlign === "justify" ? "left" : layout.textAlign }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} align={contactAlign} fontFamily={FONTS.regular} style={{ marginTop: 3 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
