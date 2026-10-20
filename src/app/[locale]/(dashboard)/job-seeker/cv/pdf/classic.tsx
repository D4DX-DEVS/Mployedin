import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { SectionKey } from "../types";
import { formatDateValue } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, dateRange, orderedSections, pdfScale, type PdfTemplateProps } from "./shared";
import { GRAY, SectionTitlePdf, capitalize, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   CLASSIC PDF — mirrors ClassicTemplate:
   ruled header, theme-coloured section titles, order-aware sections
   ═══════════════════════════════════════ */

export function ClassicPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const title = (label: string) => <SectionTitlePdf label={label} primary={primary} bold={fonts.bold} />;
  const date = { fontSize: 7.5 * scale, color: GRAY.g500 };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.experience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
              <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{exp.jobTitle}</Text>
                  <Text style={{ fontSize: 8.5 * scale, color: GRAY.g500 }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                </View>
                <Text style={date}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.education)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: i === 0 ? 0 : 7 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                {edu.institution ? <Text style={{ fontSize: 8.5 * scale, color: GRAY.g500 }}>{edu.institution}</Text> : null}
                {edu.grade ? <Text style={{ fontSize: 8 * scale, color: GRAY.g400 }}>{labels.grade}: {edu.grade}</Text> : null}
              </View>
              {edu.graduationDate ? <Text style={date}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {title(labels.skills)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {data.skills.map((sk, i) => (
            <Text key={i} style={{ fontSize: 8 * scale, color: GRAY.g700, backgroundColor: light, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1.5 }}>{sk}</Text>
          ))}
        </View>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 1 }} /> : null}
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
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {title(labels.languages)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 2 }}>
          {data.languages.map((l, i) => (
            <Text key={i} style={{ fontSize: 8.5 * scale }}>{l.language} <Text style={{ color: GRAY.g500 }}>({capitalize(l.proficiency)})</Text></Text>
          ))}
        </View>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.certifications)}>
          {data.certifications.map((c, i) => <Text key={i} style={{ fontSize: 8.5 * scale, marginBottom: 1.5 }}>• {c}</Text>)}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      <View style={{ paddingBottom: 9, marginBottom: 12, borderBottomWidth: 2, borderBottomColor: primary }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 20 * scale, color: GRAY.g900, lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontSize: 9 * scale, color: GRAY.g600, marginTop: 2 }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} style={{ marginTop: 6 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
