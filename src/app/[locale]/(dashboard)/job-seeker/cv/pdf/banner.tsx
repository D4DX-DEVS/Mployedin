import React from "react";
import { Page, Text, View, Image } from "@react-pdf/renderer";
import { PdfContactBar, orderedSections, pdfScale, safePhoto, tint, type PdfTemplateProps } from "./shared";
import { sectionGap, standardFonts, standardPdfSections } from "./standard-sections";

/* ═══════════════════════════════════════
   BANNER PDF — mirrors BannerTemplate:
   coloured name band with photo, single-column body
   ═══════════════════════════════════════ */

export function BannerPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const photo = safePhoto(data.photo);

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
        {photo ? <Image src={photo} style={{ width: 64, height: 64, borderRadius: 32, objectFit: "cover", borderWidth: 2, borderColor: "#ffffff" }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22 * scale, color: "#ffffff", lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: 10 * scale, color: tint(primary, 0.1), marginTop: 2 }}>{data.headline}</Text> : null}
          <PdfContactBar data={data} scale={scale} color={tint(primary, 0.15)} style={{ marginTop: 4 }} />
        </View>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 6, gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
