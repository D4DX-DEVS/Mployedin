import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { SectionKey } from "../types";
import { formatDateValue } from "../types";
import {
  KeepWithFirst, PdfContactBar, RichPdfText, companyPhrase, dateRange, orderedSections, pdfScale, type PdfTemplateProps,
} from "./shared";
import { GRAY, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   MINIMAL PDF — mirrors MinimalTemplate:
   centred header, quiet grey headings, plain " · " lists
   ═══════════════════════════════════════ */

const G800 = "#1f2937";

export function MinimalPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, df, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);

  const heading = (label: string) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 8 * scale, color: GRAY.g400, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{label}</Text>
  );
  const date = { fontSize: 7.5 * scale, color: GRAY.g500 };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.experience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 11 }}>
              <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale, flexShrink: 1 }}>
                  {exp.jobTitle} <Text style={{ fontFamily: fonts.regular, color: GRAY.g500 }}>{companyPhrase(labels, exp.company)}{exp.country ? ` · ${exp.country}` : ""}</Text>
                </Text>
                <Text style={date}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 8 * scale, color: GRAY.g500, marginTop: 2 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.education)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: i === 0 ? 0 : 7 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                {edu.institution ? <Text style={{ fontSize: 8 * scale, color: GRAY.g500 }}>{edu.institution}</Text> : null}
              </View>
              {edu.graduationDate ? <Text style={{ fontSize: 7.5 * scale, color: GRAY.g400 }}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {heading(labels.skills)}
        <Text style={{ fontSize: 8.5 * scale, color: GRAY.g600 }}>{data.skills.join(" · ")}</Text>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 8 * scale, color: GRAY.g500 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {heading(labels.languages)}
        <Text style={{ fontSize: 8.5 * scale }}>{data.languages.map((l) => l.language).join(" · ")}</Text>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View wrap={false}>
        {heading(labels.certifications)}
        <Text style={{ fontSize: 8.5 * scale }}>{data.certifications.join(" · ")}</Text>
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale, color: G800 }}>
      <View style={{ alignItems: "center", paddingBottom: 9, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 22 * scale, color: primary, letterSpacing: 0.5, lineHeight: 1.2, textAlign: "center" }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontSize: 9 * scale, color: GRAY.g500, marginTop: 2, textAlign: "center" }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g400} align="center" style={{ marginTop: 6 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
