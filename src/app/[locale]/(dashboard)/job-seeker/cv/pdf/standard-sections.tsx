/* ── PDF twin of useStandardSections() in ../templates.tsx ──
   Timeline, Academic, Technical and Banner share these body sections and
   differ only in heading and header, exactly as their HTML versions do. */

import React from "react";
import { Image, Text, View } from "@react-pdf/renderer";
import type { SectionKey } from "../types";
import { formatDateValue, getSectionGap } from "../types";
import { KeepWithFirst, RichPdfText, dateRange, pdfScale, safePhoto, tint, type PdfTemplateProps } from "./shared";

export const GRAY = {
  g400: "#9ca3af",
  g500: "#6b7280",
  g600: "#4b5563",
  g700: "#374151",
  g900: "#111827",
  g100: "#f3f4f6",
} as const;

/**
 * Templates built here set their Page fontSize to the body size (8pt × scale):
 * react-pdf resolves the page line-height into fixed points from that base,
 * so a 10pt base double-spaced the 7.5pt body text. Large text (names) sets
 * its own lineHeight.
 */

/** Section gap in pt, from the seeker's spacing setting (same value the HTML uses in px). */
export function sectionGap(props: PdfTemplateProps): number {
  return parseInt(getSectionGap(props.formatting), 10) || 14;
}

export interface StandardFonts {
  regular: string;
  bold: string;
}

export function standardFonts(props: PdfTemplateProps): StandardFonts {
  return { regular: String(props.styles.page.fontFamily), bold: String(props.styles.name.fontFamily) };
}

/**
 * Body sections keyed by SectionKey. `heading` renders one section title in
 * the template's own style; each heading is kept on the page with its first
 * entry so no page ends on a lone title.
 */
export function standardPdfSections(
  props: PdfTemplateProps,
  heading: (label: string) => React.ReactNode,
  fonts: StandardFonts = standardFonts(props),
): Record<SectionKey, React.ReactNode> {
  const { data, labels, df } = props;
  const scale = pdfScale(props.styles);
  const date = { fontSize: 7.5 * scale, color: GRAY.g500 };

  return {
    experience: data.experience.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.experience)}>
          {data.experience.map((exp, i) => (
            <View key={i} style={{ marginTop: i === 0 ? 0 : 7 }}>
              <View wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 9 * scale, color: GRAY.g900, flexShrink: 1 }}>{exp.jobTitle}</Text>
                  <Text style={date}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
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
        <KeepWithFirst heading={heading(labels.education)}>
          {data.education.map((edu, i) => (
            <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: i === 0 ? 0 : 5 }}>
              <Text style={{ fontSize: 8.5 * scale, color: GRAY.g900, flexShrink: 1 }}>
                <Text style={{ fontFamily: fonts.bold }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</Text>
                {edu.institution ? <Text style={{ color: GRAY.g500 }}> — {edu.institution}</Text> : null}
              </Text>
              {edu.graduationDate ? <Text style={{ fontSize: 7.5 * scale, color: GRAY.g400 }}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View wrap={false}>
        {heading(labels.skills)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {data.skills.map((sk, i) => (
            <Text key={i} style={{ fontSize: 7.5 * scale, color: GRAY.g700, backgroundColor: GRAY.g100, borderRadius: 2, paddingHorizontal: 6, paddingVertical: 1.5 }}>{sk}</Text>
          ))}
        </View>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View>
        <KeepWithFirst heading={heading(labels.projects)}>
          {data.projects.map((p, i) => (
            <View key={i} wrap={false} style={{ marginTop: i === 0 ? 0 : 5 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 8.5 * scale, color: GRAY.g900 }}>{p.title}</Text>
              {p.description ? <RichPdfText value={p.description} style={{ fontSize: 7.5 * scale, color: GRAY.g600 }} /> : null}
            </View>
          ))}
        </KeepWithFirst>
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View wrap={false}>
        {heading(labels.languages)}
        <Text style={{ fontSize: 8 * scale, color: GRAY.g700 }}>
          {data.languages.map((l) => `${l.language} (${l.proficiency})`).join("  ·  ")}
        </Text>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View wrap={false}>
        {heading(labels.certifications)}
        <Text style={{ fontSize: 8 * scale, color: GRAY.g700 }}>{data.certifications.join("  ·  ")}</Text>
      </View>
    ) : null,
  };
}

/** CSS `capitalize` for the level word ("conversational" → "Conversational"). */
export function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** Twin of SectionTitle in ../templates.tsx: uppercase, theme colour, faint theme rule. */
export function SectionTitlePdf({ label, primary, bold }: { label: string; primary: string; bold: string }) {
  return (
    <Text style={{ fontFamily: bold, fontSize: 10.5, color: primary, textTransform: "uppercase", letterSpacing: 0.8, borderBottomWidth: 1.5, borderBottomColor: tint(primary, 0.19), paddingBottom: 3, marginBottom: 6 }}>
      {label}
    </Text>
  );
}

/**
 * Photo circle for coloured header bands, or (as the HTML does for
 * Executive / Professional) the name's initial on a soft circle.
 */
export function BandPhoto({
  photo, name, size, ring, primary, bold, initialFallback,
}: { photo: string; name: string; size: number; ring: string; primary: string; bold: string; initialFallback: boolean }) {
  const src = safePhoto(photo);
  if (src) {
    return <Image src={src} style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", borderWidth: 2, borderColor: ring }} />;
  }
  if (!initialFallback) return null;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint(primary, 0.8), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: bold, fontSize: size * 0.36, color: tint(primary, 0.3), lineHeight: 1 }}>{(name || "U").charAt(0).toUpperCase()}</Text>
    </View>
  );
}
