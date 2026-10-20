import React from "react";
import { Page, Text, View, Image } from "@react-pdf/renderer";
import { formatDateValue, getColumnOrder } from "../types";
import type { SectionKey } from "../types";
import {
  KeepWithFirst, PdfContactBar, RichPdfText, dateRange, pdfScale, safePhoto, tint, type PdfTemplateProps,
} from "./shared";
import { GRAY, sectionGap, standardFonts } from "./standard-sections";

/* ═══════════════════════════════════════
   MODERN PDF — mirrors ModernTemplate:
   35% coloured sidebar (photo, name, contact, skills, languages,
   certifications) beside the main column. White-on-colour text uses
   solid tints of the theme colour: react-pdf has no reliable alpha.
   ═══════════════════════════════════════ */

const SIDEBAR = "35%";

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function ModernPDF(props: PdfTemplateProps) {
  const { data, styles: s, primary, light, labels, df, pageSize, formatting } = props;
  const scale = pdfScale(s);
  const fonts = standardFonts(props);
  const photo = safePhoto(data.photo);
  const white90 = tint(primary, 0.1);

  const sideHeading = (label: string) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 8 * scale, color: white90, textTransform: "uppercase", letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: tint(primary, 0.7), paddingBottom: 2, marginBottom: 5 }}>
      {label}
    </Text>
  );
  const mainHeading = (label: string) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, color: primary, textTransform: "uppercase", letterSpacing: 0.8, borderBottomWidth: 1.5, borderBottomColor: tint(primary, 0.19), paddingBottom: 3, marginBottom: 6 }}>
      {label}
    </Text>
  );

  const side: Partial<Record<SectionKey, React.ReactNode>> = {
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {sideHeading(labels.skills)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
          {data.skills.map((sk, i) => (
            <Text key={i} style={{ fontSize: 7 * scale, color: "#ffffff", backgroundColor: tint(primary, 0.85), borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1.5 }}>{sk}</Text>
          ))}
        </View>
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {sideHeading(labels.languages)}
        {data.languages.map((l, i) => (
          <Text key={i} style={{ fontSize: 7.5 * scale, color: white90, marginBottom: 1.5 }}>
            {l.language} <Text style={{ color: tint(primary, 0.4) }}>– {capitalize(l.proficiency)}</Text>
          </Text>
        ))}
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View>
        <KeepWithFirst heading={sideHeading(labels.certifications)}>
          {data.certifications.map((c, i) => (
            <Text key={i} style={{ fontSize: 7.5 * scale, color: white90, marginBottom: 1.5 }}>• {c}</Text>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
  };

  const main: Partial<Record<SectionKey, React.ReactNode>> = {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={mainHeading(labels.experience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 9 }}>
              <View wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, flexShrink: 1 }}>{exp.jobTitle}</Text>
                  <Text style={{ fontSize: 7.5 * scale, color: GRAY.g500 }}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
                </View>
                <Text style={{ fontSize: 8 * scale, color: GRAY.g500 }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600, marginTop: 2 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View>
        <KeepWithFirst heading={mainHeading(labels.education)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, flexShrink: 1 }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                {edu.graduationDate ? <Text style={{ fontSize: 7.5 * scale, color: GRAY.g500 }}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
              </View>
              {edu.institution ? <Text style={{ fontSize: 8 * scale, color: GRAY.g500 }}>{edu.institution}</Text> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={mainHeading(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600 }} /> : null}
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
  };

  return (
    <Page size={pageSize} style={{ fontFamily: fonts.regular, fontSize: 8 * scale, color: GRAY.g900, lineHeight: s.page.lineHeight, flexDirection: "row" }}>
      {/* Sidebar colour on every page, behind the content. */}
      <View fixed style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: SIDEBAR, backgroundColor: primary }} />

      <View style={{ width: SIDEBAR, padding: 16 }}>
        {photo ? (
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            <Image src={photo} style={{ width: 64 * scale, height: 64 * scale, borderRadius: 32 * scale, objectFit: "cover", borderWidth: 2, borderColor: tint(primary, 0.4) }} />
          </View>
        ) : null}
        <Text style={{ fontFamily: fonts.bold, fontSize: 16 * scale, color: "#ffffff", lineHeight: 1.2, marginBottom: 2 }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ fontSize: 8 * scale, color: tint(primary, 0.2), marginBottom: 10 }}>{data.headline}</Text> : null}

        <PdfContactBar data={data} scale={scale} color={white90} vertical style={{ marginBottom: 14 }} />

        <View style={{ gap: 14 }}>
          {getColumnOrder(formatting, "modern", "side").map((key) => (
            <React.Fragment key={key}>{side[key]}</React.Fragment>
          ))}
        </View>
      </View>

      <View style={{ flex: 1, padding: 16, gap: sectionGap(props) }}>
        {getColumnOrder(formatting, "modern", "main").map((key) => (
          <React.Fragment key={key}>{main[key]}</React.Fragment>
        ))}
      </View>
    </Page>
  );
}
