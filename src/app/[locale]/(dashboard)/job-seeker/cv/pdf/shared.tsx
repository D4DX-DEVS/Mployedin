/* ── Shared building blocks for the CV PDF templates ──
   Each template in this folder mirrors its on-screen twin in ../templates.tsx.
   Keep the two in step: same sections, same order, same layout. */

import React from "react";
import { Text, View, Link, StyleSheet, Svg, Path, Rect, Circle } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { CVForm, FormattingOptions, DateFormat } from "../types";
import { formatDateValue, getSectionOrder, normalizeUrl } from "../types";
import { parseRichText } from "../rich-text";

export type CVPDFLabels = {
  yourName: string;
  present: string;
  experience: string;
  education: string;
  grade: string;
  skills: string;
  projects: string;
  languages: string;
  certifications: string;
  /** Alternate headings some templates use (Executive, Professional, Elegant). */
  professionalExperience: string;
  keyProjects: string;
  coreCompetencies: string;
  decoratedExperience: string;
  decoratedEducation: string;
  decoratedSkills: string;
  decoratedProjects: string;
  atCompany: string;
  proficiency: Record<string, string>;
};

export function companyPhrase(labels: CVPDFLabels, company: string): string {
  return labels.atCompany.replace("{company}", company);
}

export function languageLevel(labels: CVPDFLabels, proficiency: string): string {
  return labels.proficiency[proficiency] ?? proficiency;
}

/** Formats a "start – end" date range honoring the chosen date format. */
export function dateRange(start: string, end: string, isCurrent: boolean, df: DateFormat, present: string): string {
  const s = formatDateValue(start, df);
  const e = isCurrent ? present : formatDateValue(end, df);
  if (!s && !e) return "";
  return `${s} – ${e}`;
}

/**
 * Renders a resume description for PDF. Accepts constrained rich-text HTML or
 * plain text, converting it into react-pdf Text/View nodes with bullets,
 * numbered lists, and bold/italic/underline inline formatting preserved.
 */
export function RichPdfText({
  value, style,
}: { value: string; style?: Style }) {
  if (!value) return null;
  const blocks = parseRichText(value);
  if (blocks.length === 0) return null;
  let numberCounter = 0;
  return (
    <View>
      {blocks.map((block, bi) => {
        const inline = block.spans.map((span, si) => (
          <Text
            key={si}
            style={{
              fontWeight: span.bold ? "bold" : "normal",
              fontStyle: span.italic ? "italic" : "normal",
              textDecoration: span.underline ? "underline" : "none",
            }}
          >
            {span.text}
          </Text>
        ));
        let prefix = "";
        if (block.type === "bullet") prefix = "•  ";
        else if (block.type === "number") prefix = `${++numberCounter}.  `;
        else numberCounter = 0;
        return (
          <Text key={bi} style={style}>
            {prefix}{inline}
          </Text>
        );
      })}
    </View>
  );
}


/** Only allow http(s) or data-URI images so a bad value can't break PDF rendering. */
export function safePhoto(src: string | undefined): string | null {
  if (!src) return null;
  return /^(https?:|data:image\/)/i.test(src) ? src : null;
}

/**
 * A clickable PDF hyperlink that displays a friendly label but opens the URL
 * when clicked in the exported PDF. Falls back to nothing if the URL is unsafe.
 */
export function PdfLink({
  url, label, style,
}: { url: string; label: string; style?: Style }) {
  const href = normalizeUrl(url);
  if (!href) return null;
  return (
    <Link src={href} style={{ textDecoration: "none", ...(style as object) }}>
      {label}
    </Link>
  );
}

/** Build the list of clickable profile links (LinkedIn, Portfolio, custom). */
export function profileLinks(data: CVForm): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  if (data.linkedin) links.push({ url: data.linkedin, label: "LinkedIn" });
  if (data.portfolio) links.push({ url: data.portfolio, label: "Portfolio" });
  data.additionalLinks?.forEach((l) => {
    if (l.url) links.push({ url: l.url, label: l.label || l.url });
  });
  return links;
}

/* ── Helper to resolve PDF font ── */
export function getPDFFont(formatting: FormattingOptions): string {
  // react-pdf only has built-in: Helvetica, Times-Roman, Courier
  const f = formatting.font;
  if (f === "georgia" || f === "merriweather" || f === "playfair") return "Times-Roman";
  return "Helvetica";
}

export function getPDFBoldFont(formatting: FormattingOptions): string {
  const f = formatting.font;
  if (f === "georgia" || f === "merriweather" || f === "playfair") return "Times-Bold";
  return "Helvetica-Bold";
}

/* ═══════════════════════════════════════
   PDF STYLES (parameterized by theme)
   ═══════════════════════════════════════ */

export function makeStyles(primary: string, scale: number, gap: string, font: string, boldFont: string, margin: number, lineHeight: number) {
  const base = 10 * scale;
  return StyleSheet.create({
    page:       { padding: margin, fontFamily: font, fontSize: base, color: "#1a1a1a", lineHeight },
    header:     { marginBottom: 16, borderBottom: `1.5pt solid ${primary}`, paddingBottom: 12 },
    name:       { fontSize: 22 * scale, fontFamily: boldFont, color: "#111827", marginBottom: 4 },
    headline:   { fontSize: base, color: "#4b5563", marginBottom: 6 },
    contactRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, fontSize: 9 * scale, color: "#6b7280" },
    linkRow:    { flexDirection: "row", gap: 12, fontSize: 9 * scale, color: primary, marginTop: 3 },
    section:    { marginTop: parseInt(gap) || 14 },
    sectionTitle: { fontSize: 11 * scale, fontFamily: boldFont, color: "#1f2937", textTransform: "uppercase", letterSpacing: 0.8, borderBottom: "0.75pt solid #d1d5db", paddingBottom: 3, marginBottom: 8 },
    expItem:    { marginBottom: 10 },
    expHeader:  { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    expTitle:   { fontSize: base, fontFamily: boldFont, color: "#111827" },
    expCompany: { fontSize: 9 * scale, color: "#4b5563" },
    expDate:    { fontSize: 9 * scale, color: "#6b7280" },
    expDesc:    { fontSize: 9 * scale, color: "#4b5563", marginTop: 3 },
    eduItem:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    eduDegree:  { fontSize: base, fontFamily: boldFont, color: "#111827" },
    eduInst:    { fontSize: 9 * scale, color: "#4b5563" },
    eduGrade:   { fontSize: 9 * scale, color: "#6b7280" },
    skillsRow:  { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    skillBadge: { backgroundColor: "#f3f4f6", borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, fontSize: 9 * scale, color: "#374151" },
    langRow:    { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    langItem:   { fontSize: 9 * scale, color: "#374151" },
    langLevel:  { color: "#6b7280" },
    certItem:   { fontSize: 9 * scale, color: "#374151", marginBottom: 2 },
    projItem:   { marginBottom: 8 },
    projTitle:  { fontSize: base, fontFamily: boldFont, color: "#111827" },
    projDesc:   { fontSize: 9 * scale, color: "#4b5563", marginTop: 2 },
    projTechRow:   { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 4, marginTop: 3 },
    projTechBadge: { backgroundColor: "#eff6ff", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, fontSize: 8 * scale, color: "#1d4ed8" },
    // Modern sidebar
    sidebar:    { width: "35%", padding: 16, backgroundColor: primary, color: "white" },
    sidebarName:  { fontSize: 16 * scale, fontFamily: boldFont, color: "white", marginBottom: 4 },
    sidebarText:  { fontSize: 7.5 * scale, color: "rgba(255,255,255,0.9)", marginBottom: 2 },
    sidebarSection: { marginBottom: 12 },
    sidebarSectionTitle: { fontSize: 8 * scale, fontFamily: boldFont, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "0.5pt solid rgba(255,255,255,0.3)", paddingBottom: 2, marginBottom: 6 },
    mainContent: { flex: 1, padding: 16 },
    // Executive
    headerBand: { padding: 16, backgroundColor: primary, flexDirection: "row", alignItems: "center", gap: 12 },
    avatar:     { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)" },
    twoCols:    { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingTop: 12 },
    colLeft:    { width: "60%" },
    colRight:   { width: "40%" },
    // Creative
    boldHeader: { padding: 20, backgroundColor: primary },
    progressBar: { height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", marginTop: 2 },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: primary },
    // Elegant
    diamond:    { width: 6, height: 6, backgroundColor: primary, transform: "rotate(45deg)" },
    centerText: { textAlign: "center" },
    // Profile photo
    photoSidebar: { width: 56 * scale, height: 56 * scale, borderRadius: 28 * scale, marginBottom: 8, alignSelf: "center", objectFit: "cover" as const, border: "1.5pt solid rgba(255,255,255,0.6)" },
    photoHeader:  { width: 50 * scale, height: 50 * scale, borderRadius: 25 * scale, objectFit: "cover" as const, border: "1.5pt solid rgba(255,255,255,0.6)" },
  });
}

export type PdfStyles = ReturnType<typeof makeStyles>;

/** Everything a template needs to draw itself. */
export interface PdfTemplateProps {
  data: CVForm;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
  styles: PdfStyles;
  primary: string;
  /** Light tint of the theme colour, for badges and soft backgrounds. */
  light: string;
  df: DateFormat;
  pageSize: "A4" | "LETTER";
}

/**
 * Section title that never sits alone at the bottom of a page:
 * react-pdf moves it to the next page unless ~48pt of content follows.
 */
export function PdfSectionTitle({ children, style }: { children: React.ReactNode; style?: Style }) {
  return <Text minPresenceAhead={48} style={style}>{children}</Text>;
}

/** The body sections in the order the seeker chose on the Formatting tab. */
export function orderedSections(formatting: FormattingOptions, sections: Partial<Record<string, React.ReactNode>>): React.ReactNode {
  return getSectionOrder(formatting).map((key) => <React.Fragment key={key}>{sections[key] ?? null}</React.Fragment>);
}

/**
 * The theme colour blended toward white, as a solid hex. react-pdf draws
 * rgba() and #rrggbbaa colours wrongly (they came out yellow), so a "40%
 * primary" line has to be a real colour.
 */
export function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount)).toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

/** Font-size multiplier from the seeker's Formatting choice (small / medium / large). */
export function pdfScale(styles: PdfStyles): number {
  return (Number(styles.page.fontSize) || 10) / 10;
}

/**
 * A section heading plus its first entry as one unbreakable block, so a page
 * never ends on a lone heading (react-pdf's minPresenceAhead does not hold
 * when the heading sits in its own row). Later entries flow normally.
 */
export function KeepWithFirst({ heading, children }: { heading: React.ReactNode; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <>
      <View wrap={false}>
        {heading}
        {items[0] ?? null}
      </View>
      {items.slice(1)}
    </>
  );
}

/* ── Contact bar: the PDF twin of ContactBar in ../templates.tsx ──
   Same items, same order, same lucide icons (drawn from lucide's own 24×24
   paths, since react-pdf cannot render the React icon components). */

type IconName = "mail" | "phone" | "pin" | "flag" | "linkedin" | "globe" | "link";

function PdfIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} style={{ opacity: 0.8 }}>
      {name === "mail" && (<><Path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" {...stroke} /><Rect x="2" y="4" width="20" height="16" rx="2" {...stroke} /></>)}
      {name === "phone" && <Path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" {...stroke} />}
      {name === "pin" && (<><Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" {...stroke} /><Circle cx="12" cy="10" r="3" {...stroke} /></>)}
      {name === "flag" && <Path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" {...stroke} />}
      {name === "linkedin" && (<><Path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" {...stroke} /><Rect x="2" y="9" width="4" height="12" {...stroke} /><Circle cx="4" cy="4" r="2" {...stroke} /></>)}
      {name === "globe" && (<><Circle cx="12" cy="12" r="10" {...stroke} /><Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" {...stroke} /><Path d="M2 12h20" {...stroke} /></>)}
      {name === "link" && (<><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" {...stroke} /><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" {...stroke} /></>)}
    </Svg>
  );
}

export function PdfContactBar({
  data, scale, color = "#6b7280", align = "start", vertical = false, fontFamily, style,
}: {
  data: CVForm;
  scale: number;
  color?: string;
  align?: "start" | "center";
  vertical?: boolean;
  /** e.g. "Courier" for the Technical template's mono contact line. */
  fontFamily?: string;
  style?: Style;
}) {
  const items: { icon: IconName; url?: string; label: string }[] = [];
  if (data.email) items.push({ icon: "mail", url: `mailto:${data.email}`, label: data.email });
  if (data.phone) items.push({ icon: "phone", url: `tel:${data.phone}`, label: data.phone });
  if (data.currentLocation) items.push({ icon: "pin", label: data.currentLocation });
  if (data.nationality) items.push({ icon: "flag", label: data.nationality });
  for (const link of profileLinks(data)) {
    const icon: IconName = /linkedin/i.test(link.label) ? "linkedin" : /portfolio/i.test(link.label) ? "globe" : "link";
    items.push({ icon, url: link.url, label: link.label });
  }
  if (items.length === 0) return null;
  const fontSize = 8 * scale;
  const iconSize = 8.5 * scale;
  return (
    <View
      style={{
        flexDirection: vertical ? "column" : "row",
        flexWrap: "wrap",
        alignItems: vertical ? "flex-start" : "center",
        justifyContent: align === "center" && !vertical ? "center" : "flex-start",
        columnGap: 10 * scale,
        rowGap: 3 * scale,
        ...(style as object),
      }}
    >
      {items.map((item, i) => {
        const href = item.url ? normalizeUrl(item.url) : "";
        const text = <Text style={{ fontSize, color, lineHeight: 1.2, ...(fontFamily ? { fontFamily } : {}) }}>{item.label}</Text>;
        return (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <PdfIcon name={item.icon} size={iconSize} color={color} />
            {href ? <Link src={href} style={{ textDecoration: "none", color }}>{text}</Link> : text}
          </View>
        );
      })}
    </View>
  );
}
