import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { formatDateValue } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, dateRange, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { BandPhoto, GRAY, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   CREATIVE PDF — mirrors CreativeTemplate:
   bold colour header, skill bars, dotted entries, project cards.
   Fixed section order, as in the HTML.
   ═══════════════════════════════════════ */

export function CreativePDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);

  const heading = (label: string, marginBottom = 6) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom }}>{label}</Text>
  );
  // Drawn inside each entry's unbreakable header, so a dot never strands at a page bottom.
  const dot = <View style={{ position: "absolute", left: -16, top: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: primary }} />;

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      {/* White-on-colour text uses solid tints: react-pdf has no reliable alpha. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 20, backgroundColor: primary }}>
        <BandPhoto photo={data.photo} name={data.fullName} size={70 * scale} ring={tint(primary, 0.4)} primary={primary} bold={fonts.bold} initialFallback={false} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 24 * scale, color: "#ffffff", lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: 10 * scale, color: tint(primary, 0.2), marginTop: 2 }}>{data.headline}</Text> : null}
          <PdfContactBar data={data} scale={scale} color={tint(primary, 0.15)} style={{ marginTop: 8 }} />
        </View>
      </View>

      <View style={{ padding: 16, gap: sectionGap(props) }}>
        {data.skills.length > 0 ? (
          <View>
            {heading(labels.skills)}
            <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 5 }}>
              {data.skills.map((sk, i) => (
                <View key={i} wrap={false} style={{ width: "47%" }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 7.5 * scale, marginBottom: 1.5 }}>{sk}</Text>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: GRAY.g100 }}>
                    <View style={{ height: 4, borderRadius: 2, width: `${75 + (i % 4) * 7}%`, backgroundColor: tint(primary, 0.7 + (i % 3) * 0.1) }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {data.experience.length > 0 ? (
          <View>
            <KeepWithFirst heading={heading(labels.experience)}>
              {data.experience.map((exp, i) => (
                <View key={i} style={{ paddingLeft: 16, marginTop: i === 0 ? 0 : 10 }}>
                  <View>
                    <View wrap={false}>
                      {dot}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale, flexShrink: 1 }}>{exp.jobTitle}</Text>
                        <Text style={{ fontSize: 7.5 * scale, color: GRAY.g500 }}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
                      </View>
                      <Text style={{ fontSize: 8 * scale, color: primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                    </View>
                    {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 7.5 * scale, color: GRAY.g500, marginTop: 2 }} /> : null}
                  </View>
                </View>
              ))}
            </KeepWithFirst>
          </View>
        ) : null}

        {data.education.length > 0 ? (
          <View>
            <KeepWithFirst heading={heading(labels.education)}>
              {data.education.map((edu, i) => (
                <View key={i} wrap={false} style={{ paddingLeft: 16, marginTop: i === 0 ? 0 : 7 }}>
                  <View>
                    {dot}
                    <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                    <Text style={{ fontSize: 8 * scale, color: GRAY.g500 }}>{[edu.institution, formatDateValue(edu.graduationDate, df)].filter(Boolean).join(" · ")}</Text>
                  </View>
                </View>
              ))}
            </KeepWithFirst>
          </View>
        ) : null}

        {data.projects?.length > 0 ? (
          <View>
            {/* Two cards per row; each row stays whole across a page break. */}
            <KeepWithFirst heading={heading(labels.projects)}>
              {Array.from({ length: Math.ceil(data.projects.length / 2) }, (_, r) => (
                <View key={r} wrap={false} style={{ flexDirection: "row", gap: 10, marginTop: r === 0 ? 0 : 10 }}>
                  {data.projects.slice(r * 2, r * 2 + 2).map((p, i) => (
                    <View key={i} style={{ width: "48.5%", padding: 7, borderRadius: 5, backgroundColor: light }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 8.5 * scale, color: primary }}>{p.title}</Text>
                      {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7 * scale, color: GRAY.g600, marginTop: 1 }} /> : null}
                    </View>
                  ))}
                </View>
              ))}
            </KeepWithFirst>
          </View>
        ) : null}

        {data.languages.length > 0 ? (
          <View wrap={false}>
            {heading(labels.languages, 4)}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {data.languages.map((l, i) => (
                <Text key={i} style={{ fontSize: 7 * scale, color: "#ffffff", backgroundColor: primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2.5, lineHeight: 1.2 }}>{l.language}</Text>
              ))}
            </View>
          </View>
        ) : null}

        {data.certifications.length > 0 ? (
          <View>
            <KeepWithFirst heading={heading(labels.certifications, 4)}>
              {data.certifications.map((c, i) => <Text key={i} style={{ fontSize: 7.5 * scale, color: GRAY.g700, marginBottom: 1.5 }}>• {c}</Text>)}
            </KeepWithFirst>
          </View>
        ) : null}
      </View>
    </Page>
  );
}
