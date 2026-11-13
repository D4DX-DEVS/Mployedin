import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { PdfContactBar, orderedSections, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { GRAY, sectionGap, standardFonts, standardPdfSections } from "./standard-sections";
import { headerAlignOf, nameSizeOf, usePdfLayout } from "./pdf-layout";

/* ═══════════════════════════════════════
   TIMELINE PDF — mirrors TimelineTemplate:
   dot + heading, sections behind a tinted left rule
   ═══════════════════════════════════════ */

export function TimelinePDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, pageSize, formatting } = props;
  const { layout } = usePdfLayout();
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const headerAlign = headerAlignOf(formatting, "left");
  const contactAlign = (headerAlign === "center" ? "center" : "start") as "start" | "center";

  const heading = (label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: primary }} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</Text>
    </View>
  );
  const sections = standardPdfSections(props, heading, fonts);

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      <View style={{ marginBottom: 14, alignItems: headerAlign === "center" ? "center" : "flex-start" }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: nameSizeOf(formatting, 22), color: primary, lineHeight: 1.2, textAlign: headerAlign }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontSize: 10 * scale, color: GRAY.g500, marginTop: 2, textAlign: layout.textAlign === "justify" ? "left" : layout.textAlign }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} align={contactAlign} style={{ marginTop: 4 }} />
      </View>
      <View style={{ paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: tint(primary, 0.25), gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
