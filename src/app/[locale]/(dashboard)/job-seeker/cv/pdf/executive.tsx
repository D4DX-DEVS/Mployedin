import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { formatDateValue } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { BandPhoto, GRAY, SectionTitlePdf, capitalize, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   EXECUTIVE PDF — mirrors ExecutiveTemplate:
   colour header band (photo or initial), then 60 / 40 columns.
   Fixed section placement, as in the HTML.
   ═══════════════════════════════════════ */

export function ExecutivePDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const gap = sectionGap(props);
  const title = (label: string) => <SectionTitlePdf label={label} primary={primary} bold={fonts.bold} />;

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      {/* White-on-colour text uses solid tints: react-pdf has no reliable alpha. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 16, backgroundColor: primary }}>
        <BandPhoto photo={data.photo} name={data.fullName} size={56 * scale} ring={tint(primary, 0.5)} primary={primary} bold={fonts.bold} initialFallback />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 18 * scale, color: "#ffffff", lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: 9 * scale, color: tint(primary, 0.2) }}>{data.headline}</Text> : null}
          <PdfContactBar data={data} scale={scale} color={tint(primary, 0.15)} style={{ marginTop: 2 }} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: gap }}>
        <View style={{ width: "60%", gap }}>
          {data.experience.length > 0 ? (
            <View>
              <KeepWithFirst heading={title(labels.professionalExperience)}>
                {data.experience.map((exp, i) => (
                  <View key={i} style={{ marginTop: i === 0 ? 0 : 10, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: tint(primary, 0.25) }}>
                    <View wrap={false}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{exp.jobTitle}</Text>
                      <Text style={{ fontSize: 8 * scale, color: primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                      <Text style={{ fontSize: 7 * scale, color: GRAY.g400 }}>{formatDateValue(exp.startDate, df)} – {exp.isCurrent ? labels.present : formatDateValue(exp.endDate, df)}</Text>
                    </View>
                    {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
                  </View>
                ))}
              </KeepWithFirst>
            </View>
          ) : null}

          {data.projects?.length > 0 ? (
            <View>
              <KeepWithFirst heading={title(labels.keyProjects)}>
                {data.projects.map((p, i) => (
                  <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale }}>{p.title}</Text>
                    {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7.5 * scale, color: GRAY.g500 }} /> : null}
                    {p.techStack?.length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                        {p.techStack.map((tech, j) => (
                          <Text key={j} style={{ fontSize: 6.5 * scale, color: primary, backgroundColor: light, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 }}>{tech}</Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </KeepWithFirst>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1, gap }}>
          {data.education.length > 0 ? (
            <View>
              <KeepWithFirst heading={title(labels.education)}>
                {data.education.map((edu, i) => (
                  <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                    {edu.institution ? <Text style={{ fontSize: 7.5 * scale, color: GRAY.g500 }}>{edu.institution}</Text> : null}
                    {edu.graduationDate ? <Text style={{ fontSize: 7 * scale, color: GRAY.g400 }}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
                  </View>
                ))}
              </KeepWithFirst>
            </View>
          ) : null}

          {data.skills.length > 0 ? (
            <View wrap={false}>
              {title(labels.coreCompetencies)}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
                {data.skills.map((sk, i) => (
                  <Text key={i} style={{ fontSize: 7.5 * scale, color: primary, backgroundColor: light, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1.5 }}>{sk}</Text>
                ))}
              </View>
            </View>
          ) : null}

          {data.languages.length > 0 ? (
            <View wrap={false}>
              {title(labels.languages)}
              {data.languages.map((l, i) => (
                <Text key={i} style={{ fontSize: 8 * scale, marginBottom: 1.5 }}>{l.language} <Text style={{ color: GRAY.g400 }}>({capitalize(l.proficiency)})</Text></Text>
              ))}
            </View>
          ) : null}

          {data.certifications.length > 0 ? (
            <View>
              <KeepWithFirst heading={title(labels.certifications)}>
                {data.certifications.map((c, i) => <Text key={i} style={{ fontSize: 8 * scale, marginBottom: 1.5 }}>• {c}</Text>)}
              </KeepWithFirst>
            </View>
          ) : null}
        </View>
      </View>
    </Page>
  );
}
