import React from "react";
import { Document, Page, Text, View, Image, Link, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { CVForm, FormattingOptions, SectionKey, DateFormat } from "./types";
import {
  getTheme, getFontScale, getSectionGap, getSectionOrder,
  formatDateValue, getPdfPageSize, getMarginPt, getLineHeight, normalizeUrl,
} from "./types";
import { parseRichText } from "./rich-text";

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
  atCompany: string;
  proficiency: Record<string, string>;
};

function companyPhrase(labels: CVPDFLabels, company: string): string {
  return labels.atCompany.replace("{company}", company);
}

function languageLevel(labels: CVPDFLabels, proficiency: string): string {
  return labels.proficiency[proficiency] ?? proficiency;
}

/** Formats a "start – end" date range honoring the chosen date format. */
function dateRange(start: string, end: string, isCurrent: boolean, df: DateFormat, present: string): string {
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
function RichPdfText({
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
function safePhoto(src: string | undefined): string | null {
  if (!src) return null;
  return /^(https?:|data:image\/)/i.test(src) ? src : null;
}

/**
 * A clickable PDF hyperlink that displays a friendly label but opens the URL
 * when clicked in the exported PDF. Falls back to nothing if the URL is unsafe.
 */
function PdfLink({
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
function profileLinks(data: CVForm): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  if (data.linkedin) links.push({ url: data.linkedin, label: "LinkedIn" });
  if (data.portfolio) links.push({ url: data.portfolio, label: "Portfolio" });
  data.additionalLinks?.forEach((l) => {
    if (l.url) links.push({ url: l.url, label: l.label || l.url });
  });
  return links;
}

/* ── Helper to resolve PDF font ── */
function getPDFFont(formatting: FormattingOptions): string {
  // react-pdf only has built-in: Helvetica, Times-Roman, Courier
  const f = formatting.font;
  if (f === "georgia" || f === "merriweather" || f === "playfair") return "Times-Roman";
  return "Helvetica";
}

function getPDFBoldFont(formatting: FormattingOptions): string {
  const f = formatting.font;
  if (f === "georgia" || f === "merriweather" || f === "playfair") return "Times-Bold";
  return "Helvetica-Bold";
}

/* ═══════════════════════════════════════
   PDF STYLES (parameterized by theme)
   ═══════════════════════════════════════ */

function makeStyles(primary: string, scale: number, gap: string, font: string, boldFont: string, margin: number, lineHeight: number) {
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

/* ═══════════════════════════════════════
   CLASSIC PDF
   ═══════════════════════════════════════ */

function ClassicPDF({ data, styles: s, labels, df, pageSize, formatting }: { data: CVForm; styles: ReturnType<typeof makeStyles>; labels: CVPDFLabels; df: DateFormat; pageSize: "A4" | "LETTER"; formatting: FormattingOptions }) {
  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.experience}</Text>
        {data.experience.map((exp, i) => (
          <View key={i} style={s.expItem}>
            <View style={s.expHeader}>
              <View>
                <Text style={s.expTitle}>{exp.jobTitle}</Text>
                <Text style={s.expCompany}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
              </View>
              <Text style={s.expDate}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
            </View>
            {exp.description ? <RichPdfText value={exp.description} style={s.expDesc} /> : null}
          </View>
        ))}
      </View>
    ) : null,
    education: data.education.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.education}</Text>
        {data.education.map((edu, i) => (
          <View key={i} style={s.eduItem}>
            <View>
              <Text style={s.eduDegree}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</Text>
              <Text style={s.eduInst}>{edu.institution}</Text>
              {edu.grade ? <Text style={s.eduGrade}>{labels.grade}: {edu.grade}</Text> : null}
            </View>
            {edu.graduationDate ? <Text style={s.expDate}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
          </View>
        ))}
      </View>
    ) : null,
    skills: data.skills.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.skills}</Text>
        <View style={s.skillsRow}>
          {data.skills.map((sk, i) => <Text key={i} style={s.skillBadge}>{sk}</Text>)}
        </View>
      </View>
    ) : null,
    projects: data.projects?.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.projects}</Text>
        {data.projects.map((proj, i) => (
          <View key={i} style={s.projItem}>
            <Text style={s.projTitle}>{proj.title}</Text>
            {proj.description ? <RichPdfText value={proj.description} style={s.projDesc} /> : null}
            {proj.techStack?.length > 0 && (
              <View style={s.projTechRow}>
                {proj.techStack.map((t, j) => <Text key={j} style={s.projTechBadge}>{t}</Text>)}
              </View>
            )}
          </View>
        ))}
      </View>
    ) : null,
    languages: data.languages.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.languages}</Text>
        <View style={s.langRow}>
          {data.languages.map((l, i) => (
            <Text key={i} style={s.langItem}>{l.language} <Text style={s.langLevel}>({languageLevel(labels, l.proficiency)})</Text></Text>
          ))}
        </View>
      </View>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{labels.certifications}</Text>
        {data.certifications.map((c, i) => <Text key={i} style={s.certItem}>• {c}</Text>)}
      </View>
    ) : null,
  };

  return (
    <Page size={pageSize} style={s.page}>
      <View style={s.header}>
        <Text style={s.name}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={s.headline}>{data.headline}</Text> : null}
        <View style={s.contactRow}>
          {data.email ? <PdfLink url={`mailto:${data.email}`} label={data.email} style={{ color: "#6b7280", textDecoration: "none" }} /> : null}
          {data.phone ? <Text>{data.phone}</Text> : null}
          {data.currentLocation ? <Text>{data.currentLocation}</Text> : null}
          {data.nationality ? <Text>{data.nationality}</Text> : null}
        </View>
        {profileLinks(data).length > 0 && (
          <View style={s.linkRow}>
            {profileLinks(data).map((link, i) => (
              <PdfLink key={i} url={link.url} label={link.label} style={{ color: s.linkRow.color }} />
            ))}
          </View>
        )}
      </View>

      {getSectionOrder(formatting).map((key) => (
        <React.Fragment key={key}>{sections[key]}</React.Fragment>
      ))}
    </Page>
  );
}

/* ═══════════════════════════════════════
   MODERN PDF (sidebar)
   ═══════════════════════════════════════ */

function ModernPDF({ data, styles: s, labels, df, pageSize }: { data: CVForm; styles: ReturnType<typeof makeStyles>; labels: CVPDFLabels; df: DateFormat; pageSize: "A4" | "LETTER" }) {
  return (
    <Page size={pageSize} style={{ flexDirection: "row", fontFamily: s.page.fontFamily, fontSize: s.page.fontSize, color: "#1a1a1a" }}>
      {/* Sidebar */}
      <View style={s.sidebar}>
        {safePhoto(data.photo) ? <Image src={safePhoto(data.photo) as string} style={s.photoSidebar} /> : null}
        <Text style={s.sidebarName}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ ...s.sidebarText, marginBottom: 8, opacity: 0.8 }}>{data.headline}</Text> : null}
        {data.email ? <PdfLink url={`mailto:${data.email}`} label={`✉ ${data.email}`} style={{ ...(s.sidebarText as object), color: "#ffffff" }} /> : null}
        {data.phone ? <Text style={s.sidebarText}>☎ {data.phone}</Text> : null}
        {data.currentLocation ? <Text style={s.sidebarText}>📍 {data.currentLocation}</Text> : null}
        {profileLinks(data).map((link, i) => (
          <PdfLink key={i} url={link.url} label={`🔗 ${link.label}`} style={{ ...(s.sidebarText as object), color: "#ffffff" }} />
        ))}

        {data.skills.length > 0 && (
          <View style={s.sidebarSection}>
            <Text style={s.sidebarSectionTitle}>{labels.skills}</Text>
            <View style={{ ...s.skillsRow, gap: 4 }}>
              {data.skills.map((sk, i) => <Text key={i} style={{ ...s.sidebarText, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, paddingHorizontal: 4, paddingVertical: 1 }}>{sk}</Text>)}
            </View>
          </View>
        )}

        {data.languages.length > 0 && (
          <View style={s.sidebarSection}>
            <Text style={s.sidebarSectionTitle}>{labels.languages}</Text>
            {data.languages.map((l, i) => <Text key={i} style={s.sidebarText}>{l.language} – {languageLevel(labels, l.proficiency)}</Text>)}
          </View>
        )}

        {data.certifications.length > 0 && (
          <View style={s.sidebarSection}>
            <Text style={s.sidebarSectionTitle}>{labels.certifications}</Text>
            {data.certifications.map((c, i) => <Text key={i} style={s.sidebarText}>• {c}</Text>)}
          </View>
        )}
      </View>

      {/* Main content */}
      <View style={s.mainContent}>
        {data.experience.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.experience}</Text>
            {data.experience.map((exp, i) => (
              <View key={i} style={s.expItem}>
                <View style={s.expHeader}>
                  <View>
                    <Text style={s.expTitle}>{exp.jobTitle}</Text>
                    <Text style={s.expCompany}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                  </View>
                  <Text style={s.expDate}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
                </View>
                {exp.description ? <RichPdfText value={exp.description} style={s.expDesc} /> : null}
              </View>
            ))}
          </View>
        )}

        {data.education.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.education}</Text>
            {data.education.map((edu, i) => (
              <View key={i} style={s.eduItem}>
                <View>
                  <Text style={s.eduDegree}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</Text>
                  <Text style={s.eduInst}>{edu.institution}</Text>
                </View>
                {edu.graduationDate ? <Text style={s.expDate}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {data.projects?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.projects}</Text>
            {data.projects.map((proj, i) => (
              <View key={i} style={s.projItem}>
                <Text style={s.projTitle}>{proj.title}</Text>
                {proj.description ? <RichPdfText value={proj.description} style={s.projDesc} /> : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </Page>
  );
}

/* ═══════════════════════════════════════
   MINIMAL PDF
   ═══════════════════════════════════════ */

function MinimalPDF({ data, styles: s, primary, labels, df, pageSize }: { data: CVForm; styles: ReturnType<typeof makeStyles>; primary: string; labels: CVPDFLabels; df: DateFormat; pageSize: "A4" | "LETTER" }) {
  return (
    <Page size={pageSize} style={s.page}>
      <View style={{ textAlign: "center", marginBottom: 12, borderBottom: "0.5pt solid #e5e7eb", paddingBottom: 10 }}>
        <Text style={{ ...s.name, color: primary, textAlign: "center", letterSpacing: 1 }}>{data.fullName || labels.yourName}</Text>
        {data.headline ? <Text style={{ ...s.headline, textAlign: "center" }}>{data.headline}</Text> : null}
        <View style={{ ...s.contactRow, justifyContent: "center" }}>
          {data.email ? <PdfLink url={`mailto:${data.email}`} label={data.email} style={{ color: "#6b7280", textDecoration: "none" }} /> : null}
          {data.phone ? <Text>· {data.phone}</Text> : null}
          {data.currentLocation ? <Text>· {data.currentLocation}</Text> : null}
        </View>
        {profileLinks(data).length > 0 && (
          <View style={{ ...s.linkRow, justifyContent: "center" }}>
            {profileLinks(data).map((link, i) => (
              <PdfLink key={i} url={link.url} label={link.label} style={{ color: s.linkRow.color }} />
            ))}
          </View>
        )}
      </View>

      {data.experience.length > 0 && (
        <View style={s.section}>
          <Text style={{ ...s.sectionTitle, borderBottom: "none", color: "#9ca3af", letterSpacing: 2 }}>{labels.experience}</Text>
          {data.experience.map((exp, i) => (
            <View key={i} style={s.expItem}>
              <View style={s.expHeader}>
                <Text style={s.expTitle}>{exp.jobTitle} <Text style={{ fontFamily: s.page.fontFamily, color: "#6b7280" }}>{companyPhrase(labels, exp.company)}</Text></Text>
                <Text style={s.expDate}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
              </View>
              {exp.description ? <RichPdfText value={exp.description} style={s.expDesc} /> : null}
            </View>
          ))}
        </View>
      )}

      {data.education.length > 0 && (
        <View style={s.section}>
          <Text style={{ ...s.sectionTitle, borderBottom: "none", color: "#9ca3af", letterSpacing: 2 }}>{labels.education}</Text>
          {data.education.map((edu, i) => (
            <View key={i} style={s.eduItem}>
              <View>
                <Text style={s.eduDegree}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</Text>
                <Text style={s.eduInst}>{edu.institution}</Text>
              </View>
              {edu.graduationDate ? <Text style={s.expDate}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
            </View>
          ))}
        </View>
      )}

      {data.skills.length > 0 && (
        <View style={s.section}>
          <Text style={{ ...s.sectionTitle, borderBottom: "none", color: "#9ca3af", letterSpacing: 2 }}>{labels.skills}</Text>
          <Text style={{ fontSize: 9, color: "#4b5563" }}>{data.skills.join(" · ")}</Text>
        </View>
      )}

      {data.languages.length > 0 && (
        <View style={s.section}>
          <Text style={{ ...s.sectionTitle, borderBottom: "none", color: "#9ca3af", letterSpacing: 2 }}>{labels.languages}</Text>
          <Text style={{ fontSize: 9, color: "#4b5563" }}>{data.languages.map((l) => l.language).join(" · ")}</Text>
        </View>
      )}
    </Page>
  );
}

/* ═══════════════════════════════════════
   PROFESSIONAL PDF — photo header + body
   ═══════════════════════════════════════ */

function ProfessionalPDF({ data, styles: s, primary, labels, df, pageSize }: { data: CVForm; styles: ReturnType<typeof makeStyles>; primary: string; labels: CVPDFLabels; df: DateFormat; pageSize: "A4" | "LETTER" }) {
  const photo = safePhoto(data.photo);
  return (
    <Page size={pageSize} style={{ ...s.page, padding: 0 }}>
      {/* Photo header band */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 24, backgroundColor: primary }}>
        {photo ? <Image src={photo} style={s.photoHeader} /> : null}
        <View>
          <Text style={{ ...s.name, color: "white", marginBottom: 2 }}>{data.fullName || labels.yourName}</Text>
          {data.headline ? <Text style={{ fontSize: s.headline.fontSize, color: "rgba(255,255,255,0.85)" }}>{data.headline}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
            {data.email ? <PdfLink url={`mailto:${data.email}`} label={data.email} style={{ fontSize: 8, color: "rgba(255,255,255,0.8)", textDecoration: "none" }} /> : null}
            {data.phone ? <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.8)" }}>{data.phone}</Text> : null}
            {data.currentLocation ? <Text style={{ fontSize: 8, color: "rgba(255,255,255,0.8)" }}>{data.currentLocation}</Text> : null}
            {profileLinks(data).map((link, i) => (
              <PdfLink key={i} url={link.url} label={link.label} style={{ fontSize: 8, color: "#ffffff", textDecoration: "none" }} />
            ))}
          </View>
        </View>
      </View>

      <View style={{ padding: 32 }}>
        {data.experience.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.experience}</Text>
            {data.experience.map((exp, i) => (
              <View key={i} style={s.expItem}>
                <View style={s.expHeader}>
                  <View>
                    <Text style={s.expTitle}>{exp.jobTitle}</Text>
                    <Text style={{ ...s.expCompany, color: primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</Text>
                  </View>
                  <Text style={s.expDate}>{dateRange(exp.startDate, exp.endDate, exp.isCurrent, df, labels.present)}</Text>
                </View>
                {exp.description ? <RichPdfText value={exp.description} style={s.expDesc} /> : null}
              </View>
            ))}
          </View>
        )}

        {data.education.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.education}</Text>
            {data.education.map((edu, i) => (
              <View key={i} style={s.eduItem}>
                <View>
                  <Text style={s.eduDegree}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</Text>
                  <Text style={s.eduInst}>{edu.institution}</Text>
                </View>
                {edu.graduationDate ? <Text style={s.expDate}>{formatDateValue(edu.graduationDate, df)}</Text> : null}
              </View>
            ))}
          </View>
        )}

        {data.skills.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.skills}</Text>
            <View style={s.skillsRow}>
              {data.skills.map((sk, i) => <Text key={i} style={s.skillBadge}>{sk}</Text>)}
            </View>
          </View>
        )}

        {data.projects?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.projects}</Text>
            {data.projects.map((proj, i) => (
              <View key={i} style={s.projItem}>
                <Text style={s.projTitle}>{proj.title}</Text>
                {proj.description ? <RichPdfText value={proj.description} style={s.projDesc} /> : null}
              </View>
            ))}
          </View>
        )}

        {data.languages.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.languages}</Text>
            <View style={s.langRow}>
              {data.languages.map((l, i) => (
                <Text key={i} style={s.langItem}>{l.language} <Text style={s.langLevel}>({languageLevel(labels, l.proficiency)})</Text></Text>
              ))}
            </View>
          </View>
        )}

        {data.certifications.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>{labels.certifications}</Text>
            {data.certifications.map((c, i) => <Text key={i} style={s.certItem}>• {c}</Text>)}
          </View>
        )}
      </View>
    </Page>
  );
}

/* ═══════════════════════════════════════
   DOCUMENT WRAPPER — selects template
   ═══════════════════════════════════════ */

export function CVPDFDocument({
  data,
  templateId,
  formatting,
  labels,
}: {
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
}) {
  const theme = getTheme(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const font = getPDFFont(formatting);
  const boldFont = getPDFBoldFont(formatting);
  const margin = getMarginPt(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;
  const pageSize = getPdfPageSize(formatting);
  const s = makeStyles(theme.primary, scale, gap, font, boldFont, margin, lineHeight);

  return (
    <Document>
      {templateId === "modern" ? (
        <ModernPDF data={data} styles={s} labels={labels} df={df} pageSize={pageSize} />
      ) : templateId === "minimal" || templateId === "compact" ? (
        <MinimalPDF data={data} styles={s} primary={theme.primary} labels={labels} df={df} pageSize={pageSize} />
      ) : templateId === "professional" || templateId === "banner" ? (
        <ProfessionalPDF data={data} styles={s} primary={theme.primary} labels={labels} df={df} pageSize={pageSize} />
      ) : (
        /* classic, executive, creative, elegant, timeline, academic, technical
           use the order-aware Classic layout for PDF. A profile photo (when set)
           is rendered in Modern, Professional and Banner. */
        <ClassicPDF data={data} styles={s} labels={labels} df={df} pageSize={pageSize} formatting={formatting} />
      )}
    </Document>
  );
}
