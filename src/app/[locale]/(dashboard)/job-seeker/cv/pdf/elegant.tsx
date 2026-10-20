import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { SectionKey } from "../types";
import { formatDateValue } from "../types";
import { KeepWithFirst, PdfContactBar, RichPdfText, orderedSections, pdfScale, tint, type PdfTemplateProps } from "./shared";
import { GRAY, capitalize, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   ELEGANT PDF — mirrors ElegantTemplate:
   centred, letter-spaced name, diamond divider, centred entries
   ═══════════════════════════════════════ */

const G800 = "#1f2937";

export function ElegantPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, labels, df, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const italic = fonts.regular.startsWith("Times") ? "Times-Italic" : "Helvetica-Oblique";
  const center = { textAlign: "center" as const };

  const heading = (label: string) => (
    <Text style={{ ...center, fontFamily: fonts.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 1.35, marginBottom: 6 }}>{label}</Text>
  );

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.decoratedExperience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
              <View wrap={false}>
                <Text style={{ ...center, fontFamily: fonts.bold, fontSize: 9.5 * scale }}>{exp.jobTitle}</Text>
                <Text style={{ ...center, fontFamily: italic, fontSize: 8.5 * scale, color: primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                <Text style={{ ...center, fontSize: 7.5 * scale, color: GRAY.g400 }}>{formatDateValue(exp.startDate, df)} – {exp.isCurrent ? labels.present : formatDateValue(exp.endDate, df)}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.decoratedEducation)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ ...center, fontFamily: fonts.bold, fontSize: 9 * scale }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
              <Text style={{ ...center, fontFamily: italic, fontSize: 8.5 * scale, color: GRAY.g500 }}>
                {[edu.institution, edu.graduationDate ? formatDateValue(edu.graduationDate, df) : ""].filter(Boolean).join(" · ")}
              </Text>
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {heading(labels.decoratedSkills)}
        <Text style={{ ...center, fontSize: 8.5 * scale, color: GRAY.g600 }}>{data.skills.join("  ·  ")}</Text>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.decoratedProjects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ ...center, fontFamily: fonts.bold, fontSize: 9 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 8 * scale, color: GRAY.g500 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {heading(labels.languages)}
        {data.languages.map((l, i) => (
          <Text key={i} style={{ ...center, fontSize: 8.5 * scale }}>
            {l.language} <Text style={{ fontFamily: italic, color: GRAY.g400 }}>({capitalize(l.proficiency)})</Text>
          </Text>
        ))}
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.certifications)}>
          {data.certifications.map((c, i) => <Text key={i} style={{ ...center, fontSize: 8.5 * scale }}>{c}</Text>)}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  const rule = <View style={{ flex: 1, height: 1, backgroundColor: tint(primary, 0.19) }} />;

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale, color: G800 }}>
      <View style={{ alignItems: "center", paddingBottom: 14, marginBottom: 10 }}>
        <Text style={{ ...center, fontFamily: fonts.bold, fontSize: 20 * scale, color: primary, textTransform: "uppercase", letterSpacing: 4, lineHeight: 1.2 }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ ...center, fontFamily: italic, fontSize: 9.5 * scale, color: GRAY.g500, marginTop: 4 }}>{data.headline}</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, width: "100%" }}>
          {rule}
          <View style={{ width: 6, height: 6, backgroundColor: primary, transform: "rotate(45deg)" }} />
          {rule}
        </View>
        <PdfContactBar data={data} scale={scale} color={GRAY.g400} align="center" style={{ marginTop: 8 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
