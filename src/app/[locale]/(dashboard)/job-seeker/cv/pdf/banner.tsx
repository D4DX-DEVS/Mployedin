import React from "react";
import { Page, Text, View, Image } from "@react-pdf/renderer";
import { PdfContactBar, orderedSections, pdfScale, safePhoto, tint, type PdfTemplateProps } from "./shared";
import { sectionGap, standardFonts, standardPdfSections } from "./standard-sections";
import { headerAlignOf, nameSizeOf, photoRadiusOf, usePdfLayout } from "./pdf-layout";

/* ═══════════════════════════════════════
   BANNER PDF — mirrors BannerTemplate:
   coloured name band with photo, single-column body
   ═══════════════════════════════════════ */

export function BannerPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, pageSize, formatting } = props;
  const { layout } = usePdfLayout();
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const photo = safePhoto(data.photo);
  const headerAlign = headerAlignOf(formatting, "left");
  const contactAlign = (headerAlign === "center" ? "center" : "start") as "start" | "center";

  const heading = (label: string) => (
    <Text
      style={{
        fontFamily: fonts.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 0.8,
        borderBottomWidth: 2, borderBottomColor: primary, alignSelf: "flex-start", paddingBottom: 1, marginBottom: 6,
      }}
    >
      {label}
    </Text>
  );
  const sections = standardPdfSections(props, heading, fonts);

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      {/* Text on the band uses solid tints of the theme colour: react-pdf has no reliable alpha. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 24, paddingVertical: 20, backgroundColor: primary, marginBottom: 14 }}>
        {photo ? <Image src={photo} style={{ width: 64, height: 64, borderRadius: photoRadiusOf(formatting, 64), objectFit: "cover", borderWidth: 2, borderColor: "#ffffff" }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: nameSizeOf(formatting, 22), color: "#ffffff", lineHeight: 1.2, textAlign: headerAlign }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: 10 * scale, color: tint(primary, 0.1), marginTop: 2, textAlign: layout.textAlign === "justify" ? "left" : layout.textAlign }}>{data.headline}</Text> : null}
          <PdfContactBar data={data} scale={scale} color={tint(primary, 0.15)} align={contactAlign} style={{ marginTop: 4 }} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 6, gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
