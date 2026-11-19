import React from "react";
import { Page, Text, View } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { SectionKey } from "../types";
import { formatDateValue } from "../types";
import { hasArabicScript, isRtlCv } from "@/lib/cv/scriptDirection";
import { CV_ARABIC_LINE_HEIGHT, pdfFontForText, type PdfFontWeight } from "../fonts";
import { KeepWithFirst, PdfContactBar, RichPdfText, dateRange, languageLevel, orderedSections, pdfScale, type PdfTemplateProps } from "./shared";
import { GRAY, SectionTitlePdf, capitalize, sectionGap, standardFonts } from "./standard-sections";
import { headerAlignOf, nameSizeOf, PdfSkillList, usePdfLayout } from "./pdf-layout";

/* ═══════════════════════════════════════
   CLASSIC PDF — mirrors ClassicTemplate:
   ruled header, theme-coloured section titles, order-aware sections.

   Mainly-Arabic content (name + summary) is laid out right to left: every
   text block gets direction rtl and flush-right text, and every flex row is
   mirrored. Other CVs are drawn exactly as before. Any text with Arabic in
   it, in any CV, is drawn in the Arabic face (see pdfFontForText).
   ═══════════════════════════════════════ */

export function ClassicPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize, formatting } = props;
  const { layout } = usePdfLayout();
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const rtl = isRtlCv(data);
  /** Spread into every Text block: right-to-left paragraphs, flush right. */
  const dir: Style = rtl ? { direction: "rtl", textAlign: "right" } : {};
  const row = rtl ? "row-reverse" : "row";
  /** The font for this text: the page font, or the Arabic face when the text has Arabic. */
  const ff = (text: string, weight: PdfFontWeight = "regular") => ({
    fontFamily: pdfFontForText(text, weight === "bold" ? fonts.bold : fonts.regular, weight),
  });
  const title = (label: string) => <SectionTitlePdf label={label} primary={primary} bold={fonts.bold} rtl={rtl} />;
  // Every date string uses one face. "Jan 2020 – حتى الآن" is a single string with Arabic in it, so when the
  // "Present" label is Arabic they ALL use the Arabic face (see pdfFontForText), else none does.
  const date = { fontSize: 7.5 * scale, color: GRAY.g500, ...ff(labels.present) };
  const headerAlign = headerAlignOf(formatting, "left");
  const nameAlign = headerAlign === "center" ? "center" : rtl ? "right" : "left";
  const contactAlign = (headerAlign === "center" ? "center" : "start") as "start" | "center";
  // "Degree in Field" is English; a neutral dash reads in any right-to-left language.
  const degreeOf = (edu: { degree: string; field: string }) => `${edu.degree}${edu.field ? (rtl ? ` – ${edu.field}` : ` in ${edu.field}`) : ""}`;
  const companyLine = (exp: { company: string; country: string }) => `${exp.company}${exp.country ? ` · ${exp.country}` : ""}`;
  const levelOf = (l: { proficiency: string }) => (rtl ? languageLevel(labels, l.proficiency) : capitalize(l.proficiency));

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.experience)}>
          {data.experience.map((exp, i) => {
            const company = companyLine(exp);
            const dates = dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present);
            return (
              <View key={i} style={{ marginTop: i === 0 ? 0 : 10 }}>
                <View wrap={false} style={{ flexDirection: row, justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ ...ff(exp.jobTitle, "bold"), fontSize: 9.5 * scale, ...dir }}>{exp.jobTitle}</Text>
                    <Text style={{ ...ff(company), fontSize: 8.5 * scale, color: GRAY.g500, ...dir }}>{company}</Text>
                  </View>
                  <Text style={date}>{dates}</Text>
                </View>
                {exp.description ? <RichPdfText rtl={rtl} value={exp.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
              </View>
            );
          })}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.education)}>
          {data.education.map((edu, i) => {
            const degree = degreeOf(edu);
            return (
              <View key={i} wrap={false} style={{ flexDirection: row, justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginTop: i === 0 ? 0 : 7 }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ ...ff(degree, "bold"), fontSize: 9.5 * scale, ...dir }}>{degree}</Text>
                  {edu.institution ? <Text style={{ ...ff(edu.institution), fontSize: 8.5 * scale, color: GRAY.g500, ...dir }}>{edu.institution}</Text> : null}
                  {edu.grade ? <Text style={{ ...ff(`${labels.grade}: ${edu.grade}`), fontSize: 8 * scale, color: GRAY.g400, ...dir }}>{labels.grade}: {edu.grade}</Text> : null}
                </View>
                {edu.graduationDate ? <Text style={date}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
              </View>
            );
          })}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {title(labels.skills)}
        <PdfSkillList skills={data.skills} rtl={rtl} chip={(sk) => <Text style={{ ...ff(sk), fontSize: 8 * scale, color: GRAY.g700, backgroundColor: light, borderRadius: 2, paddingHorizontal: 5, paddingVertical: 1.5 }}>{sk}</Text>} fontSize={8 * scale} color={GRAY.g700} templateDefault="chips" />
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ ...ff(p.title, "bold"), fontSize: 9.5 * scale, ...dir }}>{p.title}</Text>
              {p.description ? <RichPdfText rtl={rtl} value={p.description} style={{ fontSize: 8 * scale, color: GRAY.g600, marginTop: 1 }} /> : null}
              {p.techStack?.length > 0 ? (
                <View style={{ flexDirection: row, flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                  {p.techStack.map((tech, j) => (
                    <Text key={j} style={{ ...ff(tech), fontSize: 6.5 * scale, color: primary, backgroundColor: light, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 }}>{tech}</Text>
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
        <View style={{ flexDirection: row, flexWrap: "wrap", columnGap: 12, rowGap: 2 }}>
          {data.languages.map((l, i) => {
            const level = levelOf(l);
            return (
              <Text key={i} style={{ ...ff(`${l.language} (${level})`), fontSize: 8.5 * scale, ...dir }}>{l.language} <Text style={{ color: GRAY.g500 }}>({level})</Text></Text>
            );
          })}
        </View>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View>
        <KeepWithFirst heading={title(labels.certifications)}>
          {data.certifications.map((c, i) => (rtl ? (
            // The bullet is a node of its own at the right edge: a wrapped certification stays beside the text (hanging bullet), and the bullet takes no part in the Arabic line's reordering.
            <View key={i} style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 3, marginBottom: 1.5 }}>
              <Text style={{ ...ff(c), fontSize: 8.5 * scale }}>•</Text>
              <Text style={{ ...ff(c), fontSize: 8.5 * scale, flexShrink: 1, ...dir }}>{c}</Text>
            </View>
          ) : (
            <Text key={i} style={{ ...ff(c), fontSize: 8.5 * scale, marginBottom: 1.5 }}>• {c}</Text>
          )))}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={{ ...s.page, fontSize: 8 * scale }}>
      <View style={{ paddingBottom: 9, marginBottom: 12, borderBottomWidth: 2, borderBottomColor: primary, alignItems: headerAlign === "center" ? "center" : rtl ? "flex-end" : "flex-start" }}>
        <Text style={{ ...ff(data.fullName || labels.yourName, "bold"), fontSize: nameSizeOf(formatting, 20), color: GRAY.g900, lineHeight: hasArabicScript(data.fullName || labels.yourName) ? CV_ARABIC_LINE_HEIGHT : 1.2, ...dir, textAlign: nameAlign }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ ...ff(data.headline), fontSize: 9 * scale, color: GRAY.g600, marginTop: 2, textAlign: layout.textAlign === "justify" ? "left" : layout.textAlign, ...dir }}>{data.headline}</Text> : null}
        <PdfContactBar data={data} scale={scale} color={GRAY.g500} align={contactAlign} rtl={rtl} style={{ marginTop: 6 }} />
      </View>
      <View style={{ gap: sectionGap(props) }}>
        {orderedSections(formatting, sections)}
      </View>
    </Page>
  );
}
