import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import { formatDateValue, getColumnOrder } from "../types";
import type { SectionKey } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, dateRange, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { BandPhoto, GRAY, SectionTitlePdf, capitalize, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   PROFESSIONAL PDF — mirrors ProfessionalTemplate:
   photo header band, then 62 / 38 columns.
   Sections keep their column; the seeker's order applies within each.
   ═══════════════════════════════════════ */

export function ProfessionalPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const gap = sectionGap(props);
  const title = (label: string) => <SectionTitlePdf label={label} primary={primary} bold={fonts.bold} />;

  const main: Partial<Record<SectionKey, React.ReactNode>> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.professionalExperience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 9 }}>
              <View wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale, flexShrink: 1 }}>{exp.jobTitle}</Text>
                  <Text style={{ fontSize: 7.5 * scale, color: GRAY.g500 }}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
                </View>
                <Text style={{ fontSize: 8.5 * scale, color: primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.keyProjects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7.5 * scale, color: GRAY.g500 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  const side: Partial<Record<SectionKey, React.ReactNode>> = {
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {title(labels.coreCompetencies)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
          {data.skills.map((sk, i) => (
            <Text key={i} style={{ fontSize: 7.5 * scale, color: primary, backgroundColor: light, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1.5 }}>{sk}</Text>
          ))}
        </View>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
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
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {title(labels.languages)}
        {data.languages.map((l, i) => (
          <Text key={i} style={{ fontSize: 8 * scale, marginBottom: 1.5 }}>{l.language} <Text style={{ color: GRAY.g400 }}>({capitalize(l.proficiency)})</Text></Text>
        ))}
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.certifications)}>
          {data.certifications.map((c, i) => <Text key={i} style={{ fontSize: 8 * scale, marginBottom: 1.5 }}>• {c}</Text>)}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      {/* White-on-colour text uses solid tints: react-pdf has no reliable alpha. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: primary }}>
        <BandPhoto photo={data.photo} name={data.fullName} size={68 * scale} ring={tint(primary, 0.3)} primary={primary} bold={fonts.bold} initialFallback />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 20 * scale, color: "#ffffff", lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: 9.5 * scale, color: tint(primary, 0.15), marginTop: 2 }}>{data.headline}</Text> : null}
          <PdfContactBar data={data} scale={scale} color={tint(primary, 0.15)} style={{ marginTop: 5 }} />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 16, paddingHorizontal: 20, paddingTop: gap }}>
        <View style={{ width: "62%", gap }}>
          {getColumnOrder(formatting, "professional", "main").map((key) => (
            <React.Fragment key={key}>{main[key]}</React.Fragment>
          ))}
        </View>

        <View style={{ flex: 1, gap }}>
          {getColumnOrder(formatting, "professional", "side").map((key) => (
            <React.Fragment key={key}>{side[key]}</React.Fragment>
          ))}
        </View>
      </View>
    </Page>
  );
}
