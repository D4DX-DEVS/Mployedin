"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Mail, Phone, MapPin, Flag, Linkedin, Globe, Link as LinkIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CVForm, FormattingOptions, SectionKey, DateFormat, CvLayout } from "./types";
import {
  DEFAULT_CV_LAYOUT, DEFAULT_FORMATTING, getCvLayout, getNameScale, getBulletChar, getPhotoRadius, pickAuto,
  getTheme, getFontStack, getFontScale, getSectionGap,
  getLineHeight, getSectionOrder, getColumnOrder, formatDateValue, normalizeUrl,
} from "./types";
import { sanitizeHtml, isHtml } from "./rich-text";
import { toSafeImageSrc } from "@/lib/images/externalAvatar";

/* ── Shared helpers ── */

/** Builds the list of clickable profile links (LinkedIn, Portfolio, custom). */
function getProfileLinks(data: CVForm): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  if (data.linkedin) links.push({ url: data.linkedin, label: "LinkedIn" });
  if (data.portfolio) links.push({ url: data.portfolio, label: "Portfolio" });
  data.additionalLinks?.forEach((l) => {
    if (l.url) links.push({ url: l.url, label: l.label || l.url });
  });
  return links;
}

/** Builds the ordered contact items (email, phone, location, nationality, profile links) with icons. The PDF twin is PdfContactBar in ./pdf/shared.tsx. */
function buildContactItems(data: CVForm): { icon: LucideIcon; url?: string; label: string }[] {
  const items: { icon: LucideIcon; url?: string; label: string }[] = [];
  if (data.email) items.push({ icon: Mail, url: `mailto:${data.email}`, label: data.email });
  if (data.phone) items.push({ icon: Phone, url: `tel:${data.phone}`, label: data.phone });
  if (data.currentLocation) items.push({ icon: MapPin, label: data.currentLocation });
  if (data.nationality) items.push({ icon: Flag, label: data.nationality });
  for (const link of getProfileLinks(data)) {
    const icon = /linkedin/i.test(link.label) ? Linkedin : /portfolio/i.test(link.label) ? Globe : LinkIcon;
    items.push({ icon, url: link.url, label: link.label });
  }
  return items;
}

/**
 * A modern, icon-based contact bar shown in template headers/sidebars.
 * Links (email, profile) are clickable and open in a new tab; icons inherit the
 * provided color via `currentColor`.
 */
function ContactBar({
  data, scale, color = "#6b7280", align = "start", vertical = false, mono = false, className,
}: {
  data: CVForm;
  scale: number;
  color?: string;
  align?: "start" | "center";
  vertical?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const items = buildContactItems(data);
  if (items.length === 0) return null;
  const iconSize = 10.5 * scale;
  return (
    <div
      className={cn(
        "flex flex-wrap",
        vertical ? "flex-col items-start" : "items-center",
        align === "center" && !vertical ? "justify-center" : "",
        className,
      )}
      style={{
        fontSize: `${8 * scale}px`,
        lineHeight: 1.2, // as PdfContactBar
        color,
        columnGap: `${10 * scale}px`,
        rowGap: `${3.5 * scale}px`,
        fontFamily: mono ? "'Courier New', monospace" : undefined,
      }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const inner = (
          <>
            <Icon style={{ width: iconSize, height: iconSize, flexShrink: 0, opacity: 0.8 }} strokeWidth={2} />
            <span className="break-all">{item.label}</span>
          </>
        );
        const href = item.url ? normalizeUrl(item.url) : "";
        return href ? (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color }}
          >
            {inner}
          </a>
        ) : (
          <span key={i} className="inline-flex items-center gap-1">{inner}</span>
        );
      })}
    </div>
  );
}

/* Line height: each template root sets it in px from the PDF page's body size
   (8pt × scale; Compact 7.5pt), because react-pdf turns the page's line
   height into fixed points that every text inherits. A unitless value here
   gave titles taller lines than the PDF and pushed content onto a page the
   PDF never had. Names (1.2) and the contact bar set their own, as in the PDF. */

/* ── Layout controls (Formatting → Layout) ──
   Provided once by TemplateRenderer so the shared pieces below follow the
   seeker's choices without every template passing them down. The PDF twins
   read the same values (pdf/pdf-layout.tsx). */

const CvLayoutContext = React.createContext<{ layout: CvLayout; formatting: FormattingOptions }>({
  layout: DEFAULT_CV_LAYOUT,
  formatting: DEFAULT_FORMATTING,
});

function useCvLayout() {
  return React.useContext(CvLayoutContext);
}

/** Template's own header alignment unless the seeker picked one. */
function useHeaderAlign(templateDefault: "left" | "center"): "left" | "center" {
  return pickAuto(useCvLayout().layout.headerAlign, templateDefault);
}

/** Name font size in px: the template's size x font scale x the seeker's Name size. */
function useNameSize(base: number): number {
  const { formatting } = useCvLayout();
  return base * getFontScale(formatting) * getNameScale(formatting);
}

/**
 * Section heading. `variant` is the template's own look; the Heading style
 * control can swap it for underlined, plain or a filled colour band.
 */
function SectionTitle({
  children, color, variant = "underline", className, style,
}: {
  children: React.ReactNode;
  color: string;
  variant?: "underline" | "plain" | "band";
  className?: string;
  style?: React.CSSProperties;
}) {
  const choice = pickAuto(useCvLayout().layout.headingStyle, variant);
  const look: React.CSSProperties =
    choice === "band"
      ? { color: "#ffffff", backgroundColor: color, padding: "2px 6px", borderRadius: 2 }
      : choice === "plain"
        ? { color }
        : { color, borderBottom: `1.5px solid ${color}30` };
  return (
    <h2
      className={cn("font-bold uppercase tracking-wider pb-1 mb-2", className)}
      // Same size as the PDF heading (10.5pt): the sheet is laid out in pt units.
      style={{ fontSize: "10.5px", ...look, ...style }}
    >
      {children}
    </h2>
  );
}

/**
 * Title block + date for one entry. Dates sit on the right, or under the
 * title when the seeker picks "Under the title" (or the template does).
 */
function EntryRow({
  children, date, templateDefault = "right", align = "start", className,
}: {
  children: React.ReactNode;
  date: React.ReactNode;
  templateDefault?: "right" | "below";
  align?: "start" | "end";
  className?: string;
}) {
  const position = pickAuto(useCvLayout().layout.datePosition, templateDefault);
  if (position === "below" || !date) {
    return (
      <div className={className}>
        {children}
        {date ? <div>{date}</div> : null}
      </div>
    );
  }
  return (
    <div className={cn("flex justify-between gap-2", align === "end" ? "items-end" : "items-start", className)}>
      <div className="min-w-0">{children}</div>
      <div className="shrink-0">{date}</div>
    </div>
  );
}

/**
 * Skills in the template's chip style, or as a comma list / bullet columns.
 * `chip` draws one chip the template's way.
 */
function SkillList({
  skills, chip, fontSize, color = "#374151", columns = 3, chipGap = "0.25rem", templateDefault = "chips", separator = ", ", className,
}: {
  skills: string[];
  chip: (skill: string, index: number) => React.ReactNode;
  fontSize: number;
  color?: string;
  /** Columns for "Bullet columns" (2 suits a narrow sidebar). */
  columns?: number;
  chipGap?: string;
  templateDefault?: "chips" | "comma" | "columns";
  /** Joiner for the template's own list look (e.g. " · "); an explicit Comma list uses ", ". */
  separator?: string;
  className?: string;
}) {
  const { layout, formatting } = useCvLayout();
  const choice = pickAuto(layout.skillsStyle, templateDefault);
  if (choice === "comma") {
    return <p className={className} style={{ fontSize: `${fontSize}px`, color }}>{skills.join(layout.skillsStyle === "auto" ? separator : ", ")}</p>;
  }
  if (choice === "columns") {
    const bullet = getBulletChar(formatting);
    return (
      <div className={cn("flex flex-wrap", className)} style={{ fontSize: `${fontSize}px`, color, rowGap: 2 }}>
        {skills.map((s, i) => (
          <span key={i} className="flex min-w-0 gap-1 pr-2" style={{ width: `${100 / columns}%` }}>
            <span aria-hidden="true">{bullet}</span>
            <span className="min-w-0 break-words">{s}</span>
          </span>
        ))}
      </div>
    );
  }
  return <div className={cn("flex flex-wrap", className)} style={{ gap: chipGap }}>{skills.map((s, i) => <React.Fragment key={i}>{chip(s, i)}</React.Fragment>)}</div>;
}

function DateRange({
  start, end, isCurrent, df = "short",
}: { start: string; end: string; isCurrent: boolean; df?: DateFormat }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const { formatting } = useCvLayout();
  if (!start && !end) return null;
  return (
    <span className="text-gray-500 whitespace-nowrap" style={{ fontSize: `${7.5 * getFontScale(formatting)}px` }}>
      {formatDateValue(start, df)} – {isCurrent ? t("present") : formatDateValue(end, df)}
    </span>
  );
}

/**
 * Renders a resume description. Accepts either constrained rich-text HTML or
 * legacy plain text (rendered with preserved line breaks).
 */
function RichText({
  value, className, style,
}: { value: string; className?: string; style?: React.CSSProperties }) {
  const { layout, formatting } = useCvLayout();
  if (!value) return null;
  const align: React.CSSProperties = layout.textAlign === "justify" ? { textAlign: "justify" } : {};
  if (isHtml(value)) {
    // Dot keeps the native disc; dash / arrow use a string marker (same glyph as the PDF).
    const bullet = layout.bulletStyle === "dot" ? undefined : `"${getBulletChar(formatting)}  "`;
    return (
      <div
        className={cn(
          "cv-rich-text [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
          bullet && "[&_ul]:[list-style-type:var(--cv-bullet)]",
          className,
        )}
        style={{ ...style, ...align, ...(bullet ? ({ "--cv-bullet": bullet } as React.CSSProperties) : {}) }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }
  return <p className={cn("whitespace-pre-line", className)} style={{ ...style, ...align }}>{value}</p>;
}

/** Circular profile photo for templates that support one. Renders nothing if no photo. */
function PhotoCircle({
  src, size, borderColor,
}: { src?: string; size: number; borderColor?: string }) {
  const { formatting } = useCvLayout();
  if (!src) return null;
  return (
     
    <img
      src={toSafeImageSrc(src)}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: getPhotoRadius(formatting, size),
        objectFit: "cover",
        border: borderColor ? `2px solid ${borderColor}` : undefined,
        flexShrink: 0,
      }}
    />
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 1: CLASSIC (Free)
   Clean single-column with colored accents
   ═══════════════════════════════════════ */

export function ClassicTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;
  const headerAlign = useHeaderAlign("left");

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("experience")}</SectionTitle>
        <div className="space-y-2.5">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <EntryRow
                date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                <p style={{ fontSize: `${8.5 * scale}px`, color: "#6b7280" }}>
                  {exp.company}{exp.country ? ` · ${exp.country}` : ""}
                </p>
              </EntryRow>
              {exp.description && (
                <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${8 * scale}px` }} />
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("education")}</SectionTitle>
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i}>
              <EntryRow
                date={edu.graduationDate ? <span className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span> : null}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>
                  {edu.degree}{edu.field ? ` in ${edu.field}` : ""}
                </p>
                <p style={{ fontSize: `${8.5 * scale}px`, color: "#6b7280" }}>{edu.institution}</p>
                {edu.grade && <p style={{ fontSize: `${8 * scale}px`, color: "#9ca3af" }}>{t("grade")}: {edu.grade}</p>}
              </EntryRow>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("skills")}</SectionTitle>
        <SkillList
          skills={data.skills}
          chip={(skill) => (
            <span className="px-1.5 py-0.5 rounded text-gray-700" style={{ fontSize: `${8 * scale}px`, backgroundColor: theme.light }}>{skill}</span>
          )}
          fontSize={8 * scale}
          templateDefault="chips"
        />
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("projects")}</SectionTitle>
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${8 * scale}px` }} />}
              {p.techStack.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {p.techStack.map((tech, j) => (
                    <span key={j} className="px-1 py-0.5 rounded" style={{ fontSize: `${6.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{tech}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: `${8.5 * scale}px` }}>
          {data.languages.map((l, i) => (
            <span key={i}>{l.language} <span className="text-gray-500 capitalize">({l.proficiency})</span></span>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
        <ul className="list-disc list-inside space-y-0.5" style={{ fontSize: `${8.5 * scale}px` }}>
          {data.certifications.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      {/* Header */}
      <div className="pb-3 mb-3" style={{ borderBottom: `2px solid ${theme.primary}`, textAlign: headerAlign === "center" ? "center" : "left" }}>
        <h1 className="font-bold text-gray-900" style={{ fontSize: `${useNameSize(20)}px`, lineHeight: 1.2 }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" align={headerAlign === "center" ? "center" : "start"} className="mt-1.5" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 2: MODERN (Free)
   Two-column with left sidebar
   ═══════════════════════════════════════ */

export function ModernTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const sideHeading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "underline");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: "rgba(255,255,255,0.2)", padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "plain"
          ? { color: "rgba(255,255,255,0.9)" }
          : { color: "rgba(255,255,255,0.9)", borderBottom: "1px solid rgba(255,255,255,0.3)", paddingBottom: 2 };
    return (
      <h3 className="font-bold uppercase tracking-wide text-white/90 mb-1.5" style={{ fontSize: `${8 * scale}px`, ...headingLook }}>{label}</h3>
    );
  };

  const side: Partial<Record<SectionKey, React.ReactNode>> = {
    skills: data.skills.length > 0 ? (
      <div>
        {sideHeading(t("skills"))}
        <SkillList
          skills={data.skills}
          chip={(skill) => (
            <span className="px-1.5 py-0.5 rounded text-white" style={{ fontSize: `${7 * scale}px`, backgroundColor: "rgba(255,255,255,0.15)" }}>{skill}</span>
          )}
          fontSize={7 * scale}
          color="#ffffff"
          templateDefault="chips"
          columns={2}
        />
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        {sideHeading(t("languages"))}
        <div className="space-y-0.5" style={{ fontSize: `${7.5 * scale}px` }}>
          {data.languages.map((l, i) => (
            <p key={i} className="text-white/90">{l.language} <span className="text-white/60 capitalize">– {l.proficiency}</span></p>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        {sideHeading(t("certifications"))}
        <ul className="space-y-0.5" style={{ fontSize: `${7.5 * scale}px` }}>
          {data.certifications.map((c, i) => <li key={i} className="text-white/90">• {c}</li>)}
        </ul>
      </div>
    ) : null,
  };

  const mainHeading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "underline");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "plain"
          ? { color: theme.primary }
          : { color: theme.primary, borderBottom: `1.5px solid ${theme.primary}30`, paddingBottom: 2 };
    return (
      <h2 className="font-bold uppercase tracking-wider mb-2" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };

  const main: Partial<Record<SectionKey, React.ReactNode>> = {
    experience: data.experience.length > 0 ? (
      <div>
        {mainHeading(t("experience"))}
        <div className="space-y-2.5">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <EntryRow
                date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{exp.jobTitle}</p>
                <p style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
              </EntryRow>
              {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {mainHeading(t("education"))}
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i}>
              <EntryRow
                date={edu.graduationDate ? <span className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span> : null}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                <p style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>{edu.institution}</p>
              </EntryRow>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {mainHeading(t("projects"))}
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }} />}
              {p.techStack.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {p.techStack.map((t, j) => (
                    <span key={j} className="px-1 py-0.5 rounded" style={{ fontSize: `${6.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900 flex min-h-full">
      {/* Left Sidebar */}
      <div className="w-[35%] p-4 text-white" style={{ backgroundColor: theme.primary }}>
        {data.photo && (
          <div className="mb-3 flex justify-center">
            <PhotoCircle src={data.photo} size={64 * scale} borderColor="rgba(255,255,255,0.6)" />
          </div>
        )}
        <h1 className="font-bold mb-0.5" style={{ fontSize: `${useNameSize(16)}px`, lineHeight: 1.2 }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-white/80 mb-3" style={{ fontSize: `${8 * scale}px` }}>{data.headline}</p>}

        <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.9)" vertical className="mb-4" />

        <div className="flex flex-col gap-4">{getColumnOrder(formatting, "modern", "side").map((key) => (
          <React.Fragment key={key}>{side[key]}</React.Fragment>
        ))}</div>
      </div>

      {/* Right Main Content */}
      <div className="flex-1 p-4" style={{ display: "flex", flexDirection: "column", gap }}>
        {getColumnOrder(formatting, "modern", "main").map((key) => (
          <React.Fragment key={key}>{main[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 3: MINIMAL (Free)
   Ultra-clean, ATS-friendly
   ═══════════════════════════════════════ */

export function MinimalTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;
  const headerAlign = useHeaderAlign("center");

  const heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: "#9ca3af", borderBottom: `1px solid #9ca3af` }
          : { color: "#9ca3af" };
    return (
      <h2 className="font-semibold uppercase tracking-widest mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em", ...headingLook }}>{label}</h2>
    );
  };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("experience"))}
        <div className="space-y-3">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <EntryRow
                date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                templateDefault="right"
              >
                <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle} <span className="font-normal text-gray-500">{t("atCompany", { company: exp.company })}{exp.country ? ` · ${exp.country}` : ""}</span></p>
              </EntryRow>
              {exp.description && <RichText value={exp.description} className="text-gray-500 mt-0.5" style={{ fontSize: `${8 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {heading(t("education"))}
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i}>
              <EntryRow
                date={edu.graduationDate ? <span className="text-gray-400" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span> : null}
                templateDefault="right"
              >
                <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{edu.institution}</p>
              </EntryRow>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("skills"))}
        <SkillList
          skills={data.skills}
          chip={(skill) => <span>{skill}</span>}
          fontSize={8.5 * scale}
          color="#4b5563"
          templateDefault="comma"
          separator=" · "
        />
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {heading(t("projects"))}
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-500" style={{ fontSize: `${8 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        {heading(t("languages"))}
        <div style={{ fontSize: `${8.5 * scale}px` }}>
          {data.languages.map((l, i) => (
            <span key={i}>{i > 0 ? " · " : ""}{l.language}</span>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        {heading(t("certifications"))}
        <div style={{ fontSize: `${8.5 * scale}px` }}>{data.certifications.join(" · ")}</div>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-800">
      {/* Header — centered */}
      <div className="pb-3 mb-3 border-b border-gray-200" style={{ textAlign: headerAlign === "center" ? "center" : "left" }}>
        <h1 className="font-bold tracking-wide" style={{ fontSize: `${useNameSize(22)}px`, lineHeight: 1.2, color: theme.primary }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-500 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#9ca3af" align={headerAlign === "center" ? "center" : "start"} className="mt-1.5" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 4: EXECUTIVE (Pro)
   Premium two-column with photo placeholder
   ═══════════════════════════════════════ */

export function ExecutiveTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const main: Partial<Record<SectionKey, React.ReactNode>> = {
    experience: data.experience.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("professionalExperience")}</SectionTitle>
        <div className="space-y-3">
          {data.experience.map((exp, i) => (
            <div key={i} className="pl-3" style={{ borderLeft: `2px solid ${theme.primary}40` }}>
              <p className="font-bold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
              <p style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
              <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{formatDateValue(exp.startDate, df)} – {exp.isCurrent ? t("present") : formatDateValue(exp.endDate, df)}</p>
              {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("keyProjects")}</SectionTitle>
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }} />}
              {p.techStack.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {p.techStack.map((t, j) => (
                    <span key={j} className="px-1 py-0.5 rounded" style={{ fontSize: `${6.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ) : null,
  };

  const side: Partial<Record<SectionKey, React.ReactNode>> = {
    education: data.education.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("education")}</SectionTitle>
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
              <p className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{edu.institution}</p>
              {edu.graduationDate && <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</p>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("coreCompetencies")}</SectionTitle>
        <SkillList
          skills={data.skills}
          chip={(skill) => (
            <span className="px-1.5 py-0.5 rounded font-medium" style={{ fontSize: `${7.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{skill}</span>
          )}
          fontSize={7.5 * scale}
          templateDefault="chips"
        />
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
        <div className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
          {data.languages.map((l, i) => (
            <p key={i}>{l.language} <span className="text-gray-400 capitalize">({l.proficiency})</span></p>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
        <ul className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
          {data.certifications.map((c, i) => <li key={i}>• {c}</li>)}
        </ul>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      {/* Header band */}
      <div className="px-4 py-4 text-white flex items-center gap-4" style={{ backgroundColor: theme.primary }}>
        {data.photo ? (
          <PhotoCircle src={data.photo} size={56 * scale} borderColor="rgba(255,255,255,0.5)" />
        ) : (
          <div className="flex-shrink-0 bg-white/20 flex items-center justify-center text-white/70 text-xl font-bold" style={{ width: 56 * scale, height: 56 * scale, borderRadius: getPhotoRadius(formatting, 56 * scale) }}>
            {(data.fullName || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-bold" style={{ fontSize: `${useNameSize(18)}px`, lineHeight: 1.2 }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="text-white/80" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
          <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-0.5" />
        </div>
      </div>

      {/* Two columns */}
      <div className="flex gap-4 px-4 pt-3" style={{ paddingTop: gap }}>
        {/* Left column — 60% */}
        <div className="w-[60%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {getColumnOrder(formatting, "executive", "main").map((key) => (
            <React.Fragment key={key}>{main[key]}</React.Fragment>
          ))}
        </div>

        {/* Right column — 40% */}
        <div className="w-[40%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {getColumnOrder(formatting, "executive", "side").map((key) => (
            <React.Fragment key={key}>{side[key]}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 5: CREATIVE (Pro)
   Bold colored header with skill bars
   ═══════════════════════════════════════ */

export function CreativeTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: theme.primary, borderBottom: `1.5px solid ${theme.primary}` }
          : { color: theme.primary };
    return (
      <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };

  const sections: Partial<Record<SectionKey, React.ReactNode>> = {
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("skills"))}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {data.skills.map((s, i) => (
            <div key={i}>
              <div className="flex justify-between mb-0.5" style={{ fontSize: `${7.5 * scale}px` }}>
                <span className="font-medium">{s}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${75 + (i % 4) * 7}%`, backgroundColor: theme.primary, opacity: 0.7 + (i % 3) * 0.1 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("experience"))}
        <div className="space-y-3">
          {data.experience.map((exp, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: theme.primary }} />
              <div className="flex-1">
                <EntryRow
                  date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                  templateDefault="right"
                >
                  <p className="font-bold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                  <p style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                </EntryRow>
                {exp.description && <RichText value={exp.description} className="text-gray-500 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {heading(t("education"))}
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: theme.primary }} />
              <div>
                <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{[edu.institution, formatDateValue(edu.graduationDate, df)].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {heading(t("projects"))}
        <div className="grid grid-cols-2 gap-3">
          {data.projects.map((p, i) => (
            <div key={i} className="p-2 rounded-lg" style={{ backgroundColor: theme.light }}>
              <p className="font-bold" style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div className="flex gap-6">
        <div>
          {heading(t("languages"))}
          <div className="flex gap-2">
            {data.languages.map((l, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-white" style={{ fontSize: `${7 * scale}px`, backgroundColor: theme.primary }}>{l.language}</span>
            ))}
          </div>
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        {heading(t("certifications"))}
        <ul className="space-y-0.5 text-gray-700" style={{ fontSize: `${7.5 * scale}px` }}>
          {data.certifications.map((c, i) => <li key={i}>• {c}</li>)}
        </ul>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      {/* Bold Header */}
      <div className="p-5 text-white relative" style={{ backgroundColor: theme.primary }}>
        <div className="absolute inset-0 opacity-10" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)" }} />
        <div className="relative flex items-center gap-4">
          {data.photo && <PhotoCircle src={data.photo} size={70 * scale} borderColor="rgba(255,255,255,0.6)" />}
          <div>
            <h1 className="font-bold" style={{ fontSize: `${useNameSize(24)}px`, lineHeight: 1.2 }}>
              {data.fullName || t("yourName")}
            </h1>
            {data.headline && <p className="text-white/80 mt-0.5" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
            <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-2" />
          </div>
        </div>
      </div>

      <div className="p-4" style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 6: ELEGANT (Pro)
   Refined serif typography
   ═══════════════════════════════════════ */

export function ElegantTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;
  const headerAlign = useHeaderAlign("center");

  const heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: theme.primary, borderBottom: `1px solid ${theme.primary}40`, paddingBottom: 2 }
          : { color: theme.primary };
    return (
      <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("decoratedExperience"))}
        <div className="space-y-3">
          {data.experience.map((exp, i) => (
            <div key={i} className="text-center">
              <p className="font-bold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
              <p className="italic" style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
              <p className="text-gray-400" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(exp.startDate, df)} – {exp.isCurrent ? t("present") : formatDateValue(exp.endDate, df)}</p>
              {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5 text-left" style={{ fontSize: `${8 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {heading(t("decoratedEducation"))}
        <div className="space-y-2 text-center">
          {data.education.map((edu, i) => (
            <div key={i}>
              <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
              <p className="italic text-gray-500" style={{ fontSize: `${8.5 * scale}px` }}>{[edu.institution, edu.graduationDate ? formatDateValue(edu.graduationDate, df) : ""].filter(Boolean).join(" · ")}</p>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("decoratedSkills"))}
        <div className="text-center">
          <SkillList
            skills={data.skills}
            chip={(skill) => <span>{skill}</span>}
            fontSize={8.5 * scale}
            color="#4b5563"
            templateDefault="comma"
            separator="  ·  "
          />
        </div>
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {heading(t("decoratedProjects"))}
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i} className="text-center">
              <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-500 text-left" style={{ fontSize: `${8 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div className="text-center">
        {heading(t("languages"))}
        <div style={{ fontSize: `${8.5 * scale}px` }}>
          {data.languages.map((l, i) => (
            <p key={i}>{l.language} <span className="text-gray-400 italic capitalize">({l.proficiency})</span></p>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div className="text-center">
        {heading(t("certifications"))}
        <div style={{ fontSize: `${8.5 * scale}px` }}>
          {data.certifications.map((c, i) => <p key={i}>{c}</p>)}
        </div>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-800">
      {/* Header with decorative line */}
      <div className="pb-4 mb-3" style={{ textAlign: headerAlign === "center" ? "center" : "left" }}>
        <h1 className="font-bold tracking-[0.2em] uppercase" style={{ fontSize: `${useNameSize(20)}px`, lineHeight: 1.2, color: theme.primary }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && (
          <p className="italic text-gray-500 mt-1" style={{ fontSize: `${9.5 * scale}px` }}>{data.headline}</p>
        )}
        <div className="flex justify-center items-center gap-2 mt-2">
          <div className="flex-1 h-px" style={{ backgroundColor: `${theme.primary}30` }} />
          <div className="w-2 h-2 rotate-45" style={{ backgroundColor: theme.primary }} />
          <div className="flex-1 h-px" style={{ backgroundColor: `${theme.primary}30` }} />
        </div>
        <ContactBar data={data} scale={scale} color="#9ca3af" align={headerAlign === "center" ? "center" : "start"} className="mt-2" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 7: PROFESSIONAL (photo header)
   Colored photo header + two-column body
   ═══════════════════════════════════════ */

export function ProfessionalTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const main: Partial<Record<SectionKey, React.ReactNode>> = {
    experience: data.experience.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("professionalExperience")}</SectionTitle>
        <div className="space-y-2.5">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <EntryRow
                date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                <p style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
              </EntryRow>
              {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${8 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("keyProjects")}</SectionTitle>
        <div className="space-y-2">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
  };

  const side: Partial<Record<SectionKey, React.ReactNode>> = {
    skills: data.skills.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("coreCompetencies")}</SectionTitle>
        <SkillList
          skills={data.skills}
          chip={(skill) => (
            <span className="px-1.5 py-0.5 rounded font-medium" style={{ fontSize: `${7.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{skill}</span>
          )}
          fontSize={7.5 * scale}
          templateDefault="chips"
        />
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("education")}</SectionTitle>
        <div className="space-y-2">
          {data.education.map((edu, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
              <p className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{edu.institution}</p>
              {edu.graduationDate && <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</p>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
        <div className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
          {data.languages.map((l, i) => (
            <p key={i}>{l.language} <span className="text-gray-400 capitalize">({l.proficiency})</span></p>
          ))}
        </div>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
        <ul className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
          {data.certifications.map((c, i) => <li key={i}>• {c}</li>)}
        </ul>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      {/* Photo header */}
      <div className="flex items-center gap-4 px-5 py-4 text-white" style={{ backgroundColor: theme.primary }}>
        {data.photo ? (
          <PhotoCircle src={data.photo} size={68 * scale} borderColor="rgba(255,255,255,0.7)" />
        ) : (
          <div className="bg-white/20 flex items-center justify-center font-bold flex-shrink-0"
            style={{ width: 68 * scale, height: 68 * scale, fontSize: `${24 * scale}px`, borderRadius: getPhotoRadius(formatting, 68 * scale) }}>
            {(data.fullName || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-bold" style={{ fontSize: `${useNameSize(20)}px`, lineHeight: 1.2 }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="text-white/85 mt-0.5" style={{ fontSize: `${9.5 * scale}px` }}>{data.headline}</p>}
          <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-1.5" />
        </div>
      </div>

      {/* Two columns */}
      <div className="flex gap-4 px-5" style={{ paddingTop: gap }}>
        {/* Main column */}
        <div className="w-[62%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {getColumnOrder(formatting, "professional", "main").map((key) => (
            <React.Fragment key={key}>{main[key]}</React.Fragment>
          ))}
        </div>

        {/* Side column */}
        <div className="w-[38%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {getColumnOrder(formatting, "professional", "side").map((key) => (
            <React.Fragment key={key}>{side[key]}</React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 8: COMPACT (dense single column)
   Fits more content on a single page
   ═══════════════════════════════════════ */

export function CompactTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: theme.primary, borderBottom: `1px solid ${theme.primary}` }
          : { color: theme.primary };
    return (
      <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: `${8.5 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("experience"))}
        {data.experience.map((exp, i) => (
          <div key={i} className="mt-1">
            <EntryRow
              date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
              templateDefault="right"
            >
              <p className="font-semibold" style={{ fontSize: `${8.5 * scale}px` }}>{exp.jobTitle} <span className="font-normal text-gray-500">— {exp.company}{exp.country ? ` · ${exp.country}` : ""}</span></p>
            </EntryRow>
            {exp.description && <RichText value={exp.description} className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }} />}
          </div>
        ))}
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {heading(t("education"))}
        {data.education.map((edu, i) => (
          <div key={i} className="mt-0.5">
            <EntryRow
              date={edu.graduationDate ? <span className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span> : null}
              templateDefault="right"
            >
              <p style={{ fontSize: `${8 * scale}px` }}><span className="font-semibold">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</span> {edu.institution && <span className="text-gray-500">— {edu.institution}</span>}</p>
            </EntryRow>
          </div>
        ))}
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("skills"))}
        <SkillList
          skills={data.skills}
          chip={(skill) => <span>{skill}</span>}
          fontSize={8 * scale}
          color="#374151"
          templateDefault="comma"
          separator="  ·  "
        />
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {heading(t("projects"))}
        {data.projects.map((p, i) => (
          <div key={i} className="mt-0.5">
            <p className="font-semibold" style={{ fontSize: `${8 * scale}px` }}>{p.title}</p>
            {p.description && <RichText value={p.description} className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }} />}
          </div>
        ))}
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        {heading(t("languages"))}
        <p className="text-gray-700" style={{ fontSize: `${8 * scale}px` }}>
          {data.languages.map((l) => `${l.language} (${l.proficiency})`).join("  ·  ")}
        </p>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        {heading(t("certifications"))}
        <p className="text-gray-700" style={{ fontSize: `${8 * scale}px` }}>{data.certifications.join("  ·  ")}</p>
      </div>
    ) : null,
  };

  return (
    <div style={{ fontFamily, fontSize: `${9 * scale}px`, lineHeight: `${7.5 * scale * lineHeight}px` }} className="text-gray-900 p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-x-3" style={{ borderBottom: `1px solid ${theme.primary}`, paddingBottom: 4, marginBottom: 6 }}>
        <h1 className="font-bold" style={{ fontSize: `${useNameSize(16)}px`, lineHeight: 1.2, color: theme.primary }}>{data.fullName || t("yourName")}</h1>
        <ContactBar data={data} scale={scale} color="#6b7280" />
      </div>
      {data.headline && <p className="text-gray-600 mb-2" style={{ fontSize: `${8 * scale}px` }}>{data.headline}</p>}

      <div className="space-y-2.5">
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Shared single-column section builder
   Used by the order-aware "new" templates
   ═══════════════════════════════════════ */

function useStandardSections(
  data: CVForm,
  scale: number,
  df: DateFormat,
  Heading: (label: string) => React.ReactNode,
): Record<SectionKey, React.ReactNode> {
  const t = useTranslations("cvBuilderPage.previewSections");
  return {
    experience: data.experience.length > 0 ? (
      <div>
        {Heading(t("experience"))}
        <div className="space-y-2">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <EntryRow
                date={<DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />}
                templateDefault="right"
              >
                <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{exp.jobTitle}</p>
                <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
              </EntryRow>
              {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {Heading(t("education"))}
        <div className="space-y-1.5">
          {data.education.map((edu, i) => (
            <div key={i}>
              <EntryRow
                date={edu.graduationDate ? <span className="text-gray-400" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span> : null}
                templateDefault="right"
              >
                <p style={{ fontSize: `${8.5 * scale}px` }}>
                  <span className="font-semibold">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</span>
                  {edu.institution && <span className="text-gray-500"> — {edu.institution}</span>}
                </p>
              </EntryRow>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {Heading(t("skills"))}
        <SkillList
          skills={data.skills}
          chip={(s, i) => <span key={i} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700" style={{ fontSize: `${7.5 * scale}px` }}>{s}</span>}
          fontSize={7.5 * scale}
          chipGap="0.375rem"
        />
      </div>
    ) : null,
    projects: data.projects.length > 0 ? (
      <div>
        {Heading(t("projects"))}
        <div className="space-y-1.5">
          {data.projects.map((p, i) => (
            <div key={i}>
              <p className="font-semibold" style={{ fontSize: `${8.5 * scale}px` }}>{p.title}</p>
              {p.description && <RichText value={p.description} className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }} />}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    languages: data.languages.length > 0 ? (
      <div>
        {Heading(t("languages"))}
        <p className="text-gray-700" style={{ fontSize: `${8 * scale}px` }}>
          {data.languages.map((l) => `${l.language} (${l.proficiency})`).join("  ·  ")}
        </p>
      </div>
    ) : null,
    certifications: data.certifications.length > 0 ? (
      <div>
        {Heading(t("certifications"))}
        <p className="text-gray-700" style={{ fontSize: `${8 * scale}px` }}>{data.certifications.join("  ·  ")}</p>
      </div>
    ) : null,
  };
}

/* ═══════════════════════════════════════
   TEMPLATE 9: TIMELINE (vertical accent line)
   ═══════════════════════════════════════ */

export function TimelineTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: theme.primary, borderBottom: `1px solid ${theme.primary}` }
          : { color: theme.primary };
    return (
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
        <h2 className="font-bold uppercase tracking-wider" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
      </div>
    );
  };
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900 p-1">
      <div className="mb-4">
        <h1 className="font-bold" style={{ fontSize: `${useNameSize(22)}px`, lineHeight: 1.2, color: theme.primary }}>{data.fullName || t("yourName")}</h1>
        {data.headline && <p className="text-gray-500 mt-0.5" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" className="mt-1" />
      </div>
      <div className="pl-4 border-l-2" style={{ borderColor: `${theme.primary}40`, display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 10: ACADEMIC (formal, centered)
   ═══════════════════════════════════════ */

export function AcademicTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;
  const headerAlign = useHeaderAlign("center");

  const Heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "underline");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "plain"
          ? { color: theme.primary }
          : { color: theme.primary, borderBottom: `1px solid ${theme.primary}40`, paddingBottom: 2 };
    return (
      <h2 className="font-semibold tracking-[0.12em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif" /* PDF: Times-Roman */, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      <div className="pb-3 mb-3 border-b-2" style={{ borderColor: theme.primary, textAlign: headerAlign === "center" ? "center" : "left" }}>
        <h1 className="font-bold" style={{ fontSize: `${useNameSize(22)}px`, lineHeight: 1.2 }}>{data.fullName || t("yourName")}</h1>
        {data.headline && <p className="italic text-gray-600 mt-1" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" align={headerAlign === "center" ? "center" : "start"} className="mt-1" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 11: TECHNICAL (monospace accents)
   ═══════════════════════════════════════ */

export function TechnicalTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "plain");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "underline"
          ? { color: theme.primary, borderBottom: `2px solid ${theme.primary}` }
          : { color: theme.primary };
    return (
      <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, ...headingLook, fontFamily: "'Courier New', monospace" }}>
        <span className="text-gray-400">{"// "}</span>{label}
      </h2>
    );
  };
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      <div className="mb-4 p-3 rounded" style={{ backgroundColor: `${theme.primary}10` }}>
        <h1 className="font-bold" style={{ fontSize: `${useNameSize(20)}px`, lineHeight: 1.2, color: theme.primary, fontFamily: "'Courier New', monospace" }}>{data.fullName || t("yourName")}</h1>
        {data.headline && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${9.5 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" mono className="mt-1" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 12: BANNER (full-width name band)
   ═══════════════════════════════════════ */

export function BannerTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const headingChoice = useCvLayout().layout.headingStyle;
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => {
    const headingStyle = pickAuto(headingChoice, "underline");
    const headingLook: React.CSSProperties =
      headingStyle === "band"
        ? { color: "#ffffff", backgroundColor: theme.primary, padding: "2px 6px", borderRadius: 2 }
        : headingStyle === "plain"
          ? { color: theme.primary }
          : { color: theme.primary, borderBottom: `2px solid ${theme.primary}` };
    return (
      <h2 className="font-bold uppercase tracking-wider mb-2 inline-block" style={{ fontSize: `${9 * scale}px`, ...headingLook }}>{label}</h2>
    );
  };
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: `${8 * scale * lineHeight}px` }} className="text-gray-900">
      {/* Full-width colored banner */}
      <div className="flex items-center gap-4 px-6 py-5 mb-4" style={{ backgroundColor: theme.primary }}>
        <PhotoCircle src={data.photo} size={64} borderColor="#ffffff" />
        <div className="text-white">
          <h1 className="font-bold" style={{ fontSize: `${useNameSize(22)}px`, lineHeight: 1.2 }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="opacity-90 mt-0.5" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
          <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-1" />
        </div>
      </div>
      <div className="px-6 pb-2" style={{ display: "flex", flexDirection: "column", gap }}>
        {getSectionOrder(formatting).map((key) => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE RENDERER — dispatches by ID
   ═══════════════════════════════════════ */

export function TemplateRenderer({
  templateId, data, formatting,
}: {
  templateId: string;
  data: CVForm;
  formatting: FormattingOptions;
}) {
  const value = React.useMemo(() => ({ layout: getCvLayout(formatting), formatting }), [formatting]);
  return (
    <CvLayoutContext.Provider value={value}>
      <TemplateSwitch templateId={templateId} data={data} formatting={formatting} />
    </CvLayoutContext.Provider>
  );
}

function TemplateSwitch({
  templateId, data, formatting,
}: {
  templateId: string;
  data: CVForm;
  formatting: FormattingOptions;
}) {
  switch (templateId) {
    case "modern":       return <ModernTemplate data={data} formatting={formatting} />;
    case "minimal":      return <MinimalTemplate data={data} formatting={formatting} />;
    case "executive":    return <ExecutiveTemplate data={data} formatting={formatting} />;
    case "creative":     return <CreativeTemplate data={data} formatting={formatting} />;
    case "elegant":      return <ElegantTemplate data={data} formatting={formatting} />;
    case "professional": return <ProfessionalTemplate data={data} formatting={formatting} />;
    case "compact":      return <CompactTemplate data={data} formatting={formatting} />;
    case "timeline":     return <TimelineTemplate data={data} formatting={formatting} />;
    case "academic":     return <AcademicTemplate data={data} formatting={formatting} />;
    case "technical":    return <TechnicalTemplate data={data} formatting={formatting} />;
    case "banner":       return <BannerTemplate data={data} formatting={formatting} />;
    default:             return <ClassicTemplate data={data} formatting={formatting} />;
  }
}
