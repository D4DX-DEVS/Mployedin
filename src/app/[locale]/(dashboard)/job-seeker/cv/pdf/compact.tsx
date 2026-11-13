import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { SectionKey } from "../types";
import { formatDateValue } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, dateRange, orderedSections, pdfScale, type PdfTemplateProps } from "./shared";
import { GRAY, standardFonts } from "./standard-sections";
import { headerAlignOf, nameSizeOf, PdfSkillList, usePdfLayout } from "./pdf-layout";

/* ═══════════════════════════════════════
   COMPACT PDF — mirrors CompactTemplate:
   name and contact on one ruled line, dense inline entries
   ═══════════════════════════════════════ */

export function CompactPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, df, pageSize, formatting } = props;
  const { layout } = usePdfLayout();
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const headerAlign = headerAlignOf(formatting, "left");
  const contactAlign = (headerAlign === "center" ? "center" : "start") as "start" | "center";

  const heading = (label: string) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 8.5 * scale, color: primary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>{label}</Text>
  );
  const date = { fontSize: 7.5 * scale, color: GRAY.g500 };
  const joined = { fontSize: 8 * scale, color: GRAY.g700 };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.experience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 4 }}>
              <View wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 8.5 * scale, flexShrink: 1 }}>
                  {exp.jobTitle} <Text style={{ fontFamily: fonts.regular, color: GRAY.g500 }}>— {exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                </Text>
                <Text style={date}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.education)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: i === 0 ? 0 : 2 }}>
              <Text style={{ fontSize: 8 * scale, flexShrink: 1 }}>
                <Text style={{ fontFamily: fonts.bold }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                {edu.institution ? <Text style={{ color: GRAY.g500 }}> — {edu.institution}</Text> : null}
              </Text>
              {edu.graduationDate ? <Text style={{ fontSize: 7 * scale, color: GRAY.g400 }}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {heading(labels.skills)}
        <PdfSkillList skills={data.skills} chip={(sk) => <Text style={joined}>{sk}</Text>} fontSize={8 * scale} color={GRAY.g700} templateDefault="comma" separator="  ·  " />
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 2 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 8 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {heading(labels.languages)}
        <Text style={joined}>{data.languages.map((l) => `${l.language} (${l.proficiency})`).join("  ·  ")}</Text>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View wrap={false}>
        {heading(labels.certifications)}
        <Text style={joined}>{data.certifications.join("  ·  ")}</Text>
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 7.5 * scale }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: headerAlign === "center" ? "center" : "space-between", alignItems: "flex-end", columnGap: 12, borderBottomWidth: 1, borderBottomColor: primary, paddingBottom: 4, marginBottom: 6 }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: nameSizeOf(formatting, 16), color: primary, lineHeight: 1.2, textAlign: headerAlign }}>{data.fullName || labels.yourName}</Text>
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} align={contactAlign} style={{ marginBottom: 2 }} />
      </View>
      {data.headline ? <Text style={{ fontSize: 8 * scale, color: GRAY.g600, marginBottom: 8, textAlign: layout.textAlign === "justify" ? "left" : layout.textAlign }}>{data.headline}</Text> : null}
      <View style={{ gap: 10 }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
