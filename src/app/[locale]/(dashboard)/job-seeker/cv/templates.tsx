"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Mail, Phone, MapPin, Linkedin, Globe, Link as LinkIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CVForm, FormattingOptions, SectionKey, DateFormat } from "./types";
import {
  getTheme, getFontStack, getFontScale, getSectionGap,
  getLineHeight, getSectionOrder, formatDateValue, normalizeUrl,
} from "./types";
import { sanitizeHtml, isHtml } from "./rich-text";

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

/** Builds the ordered contact items (email, phone, location, profile links) with icons. */
function buildContactItems(data: CVForm): { icon: LucideIcon; url?: string; label: string }[] {
  const items: { icon: LucideIcon; url?: string; label: string }[] = [];
  if (data.email) items.push({ icon: Mail, url: `mailto:${data.email}`, label: data.email });
  if (data.phone) items.push({ icon: Phone, url: `tel:${data.phone}`, label: data.phone });
  if (data.currentLocation) items.push({ icon: MapPin, label: data.currentLocation });
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

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2
      className="text-[0.7rem] font-bold uppercase tracking-wider pb-1 mb-2"
      style={{ color, borderBottom: `1.5px solid ${color}30` }}
    >
      {children}
    </h2>
  );
}

function DateRange({
  start, end, isCurrent, df = "short",
}: { start: string; end: string; isCurrent: boolean; df?: DateFormat }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  if (!start && !end) return null;
  return (
    <span className="text-[0.6rem] text-gray-500 whitespace-nowrap">
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
  if (!value) return null;
  if (isHtml(value)) {
    return (
      <div
        className={cn("cv-rich-text [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4", className)}
        style={style}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }
  return <p className={cn("whitespace-pre-line", className)} style={style}>{value}</p>;
}

/** Circular profile photo for templates that support one. Renders nothing if no photo. */
function PhotoCircle({
  src, size, borderColor,
}: { src?: string; size: number; borderColor?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
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

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("experience")}</SectionTitle>
        <div className="space-y-2.5">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                  <p style={{ fontSize: `${8.5 * scale}px`, color: "#6b7280" }}>
                    {exp.company}{exp.country ? ` · ${exp.country}` : ""}
                  </p>
                </div>
                <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
              </div>
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
            <div key={i} className="flex justify-between items-start">
              <div>
                <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>
                  {edu.degree}{edu.field ? ` in ${edu.field}` : ""}
                </p>
                <p style={{ fontSize: `${8.5 * scale}px`, color: "#6b7280" }}>{edu.institution}</p>
                {edu.grade && <p style={{ fontSize: `${8 * scale}px`, color: "#9ca3af" }}>{t("grade")}: {edu.grade}</p>}
              </div>
              {edu.graduationDate && <span className="text-[0.6rem] text-gray-500">{formatDateValue(edu.graduationDate, df)}</span>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        <SectionTitle color={theme.primary}>{t("skills")}</SectionTitle>
        <div className="flex flex-wrap gap-1">
          {data.skills.map((s, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-gray-700" style={{ fontSize: `${8 * scale}px`, backgroundColor: theme.light }}>{s}</span>
          ))}
        </div>
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
                    <span key={j} className="px-1 py-0.5 rounded text-[0.55rem]" style={{ backgroundColor: theme.light, color: theme.primary }}>{tech}</span>
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
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      {/* Header */}
      <div className="pb-3 mb-3" style={{ borderBottom: `2px solid ${theme.primary}` }}>
        <h1 className="font-bold text-gray-900" style={{ fontSize: `${20 * scale}px` }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" className="mt-1.5" />
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900 flex min-h-full">
      {/* Left Sidebar */}
      <div className="w-[35%] p-4 text-white" style={{ backgroundColor: theme.primary }}>
        {data.photo && (
          <div className="mb-3 flex justify-center">
            <PhotoCircle src={data.photo} size={64 * scale} borderColor="rgba(255,255,255,0.6)" />
          </div>
        )}
        <h1 className="font-bold mb-0.5" style={{ fontSize: `${16 * scale}px` }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-white/80 mb-3" style={{ fontSize: `${8 * scale}px` }}>{data.headline}</p>}

        <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.9)" vertical className="mb-4" />

        {/* Skills */}
        {data.skills.length > 0 && (
          <div className="mb-4">
            <h3 className="font-bold uppercase tracking-wide text-white/90 mb-1.5 pb-0.5" style={{ fontSize: `${8 * scale}px`, borderBottom: "1px solid rgba(255,255,255,0.3)" }}>{t("skills")}</h3>
            <div className="flex flex-wrap gap-1">
              {data.skills.map((s, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-white" style={{ fontSize: `${7 * scale}px`, backgroundColor: "rgba(255,255,255,0.15)" }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {data.languages.length > 0 && (
          <div className="mb-4">
            <h3 className="font-bold uppercase tracking-wide text-white/90 mb-1.5 pb-0.5" style={{ fontSize: `${8 * scale}px`, borderBottom: "1px solid rgba(255,255,255,0.3)" }}>{t("languages")}</h3>
            <div className="space-y-0.5" style={{ fontSize: `${7.5 * scale}px` }}>
              {data.languages.map((l, i) => (
                <p key={i} className="text-white/90">{l.language} <span className="text-white/60 capitalize">– {l.proficiency}</span></p>
              ))}
            </div>
          </div>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <div>
            <h3 className="font-bold uppercase tracking-wide text-white/90 mb-1.5 pb-0.5" style={{ fontSize: `${8 * scale}px`, borderBottom: "1px solid rgba(255,255,255,0.3)" }}>{t("certifications")}</h3>
            <ul className="space-y-0.5" style={{ fontSize: `${7.5 * scale}px` }}>
              {data.certifications.map((c, i) => <li key={i} className="text-white/90">• {c}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Right Main Content */}
      <div className="flex-1 p-4" style={{ display: "flex", flexDirection: "column", gap }}>
        {/* Experience */}
        {data.experience.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wider pb-1 mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary, borderBottom: `1.5px solid ${theme.primary}30` }}>{t("experience")}</h2>
            <div className="space-y-2.5">
              {data.experience.map((exp, i) => (
                <div key={i}>
                  <div className="flex justify-between items-start">
                    <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{exp.jobTitle}</p>
                    <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
                  </div>
                  <p style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                  {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wider pb-1 mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary, borderBottom: `1.5px solid ${theme.primary}30` }}>{t("education")}</h2>
            <div className="space-y-2">
              {data.education.map((edu, i) => (
                <div key={i}>
                  <div className="flex justify-between items-start">
                    <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                    {edu.graduationDate && <span className="text-[0.6rem] text-gray-500">{edu.graduationDate}</span>}
                  </div>
                  <p style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>{edu.institution}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wider pb-1 mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary, borderBottom: `1.5px solid ${theme.primary}30` }}>{t("projects")}</h2>
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
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 3: MINIMAL (Free)
   Ultra-clean, ATS-friendly
   ═══════════════════════════════════════ */

export function MinimalTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const heading = (label: string) => (
    <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{label}</h2>
  );

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("experience"))}
        <div className="space-y-3">
          {data.experience.map((exp, i) => (
            <div key={i}>
              <div className="flex justify-between">
                <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle} <span className="font-normal text-gray-500">{t("atCompany", { company: exp.company })}</span></p>
                <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
              </div>
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
            <div key={i} className="flex justify-between">
              <div>
                <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</p>
                <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{edu.institution}</p>
              </div>
              {edu.graduationDate && <span className="text-[0.6rem] text-gray-400">{formatDateValue(edu.graduationDate, df)}</span>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("skills"))}
        <p className="text-gray-600" style={{ fontSize: `${8.5 * scale}px` }}>{data.skills.join(" · ")}</p>
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
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-800">
      {/* Header — centered */}
      <div className="text-center pb-3 mb-3 border-b border-gray-200">
        <h1 className="font-bold tracking-wide" style={{ fontSize: `${22 * scale}px`, color: theme.primary }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-500 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#9ca3af" align="center" className="mt-1.5" />
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      {/* Header band */}
      <div className="px-4 py-4 text-white flex items-center gap-4" style={{ backgroundColor: theme.primary }}>
        {data.photo ? (
          <PhotoCircle src={data.photo} size={56 * scale} borderColor="rgba(255,255,255,0.5)" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white/70 text-xl font-bold flex-shrink-0">
            {(data.fullName || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-bold" style={{ fontSize: `${18 * scale}px` }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="text-white/80" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
          <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-0.5" />
        </div>
      </div>

      {/* Two columns */}
      <div className="flex gap-4 px-4 pt-3" style={{ paddingTop: gap }}>
        {/* Left column — 60% */}
        <div className="w-[60%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {data.experience.length > 0 && (
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
          )}

          {data.projects.length > 0 && (
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
          )}
        </div>

        {/* Right column — 40% */}
        <div className="w-[40%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {data.education.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("education")}</SectionTitle>
              <div className="space-y-2">
                {data.education.map((edu, i) => (
                  <div key={i}>
                    <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}</p>
                    <p className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{edu.institution}</p>
                    {edu.graduationDate && <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{edu.graduationDate}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.skills.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("coreCompetencies")}</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {data.skills.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded font-medium" style={{ fontSize: `${7.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {data.languages.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
              <div className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
                {data.languages.map((l, i) => (
                  <p key={i}>{l.language} <span className="text-gray-400 capitalize">({l.proficiency})</span></p>
                ))}
              </div>
            </div>
          )}

          {data.certifications.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
              <ul className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
                {data.certifications.map((c, i) => <li key={i}>• {c}</li>)}
              </ul>
            </div>
          )}
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      {/* Bold Header */}
      <div className="p-5 text-white relative" style={{ backgroundColor: theme.primary }}>
        <div className="absolute inset-0 opacity-10" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)" }} />
        <div className="relative flex items-center gap-4">
          {data.photo && <PhotoCircle src={data.photo} size={70 * scale} borderColor="rgba(255,255,255,0.6)" />}
          <div>
            <h1 className="font-bold" style={{ fontSize: `${24 * scale}px` }}>
              {data.fullName || t("yourName")}
            </h1>
            {data.headline && <p className="text-white/80 mt-0.5" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
            <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-2" />
          </div>
        </div>
      </div>

      <div className="p-4" style={{ display: "flex", flexDirection: "column", gap }}>
        {/* Skills as progress bars */}
        {data.skills.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{t("skills")}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {data.skills.slice(0, 10).map((s, i) => (
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
        )}

        {/* Experience */}
        {data.experience.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{t("experience")}</h2>
            <div className="space-y-3">
              {data.experience.map((exp, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: theme.primary }} />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="font-bold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                      <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
                    </div>
                    <p style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{exp.company}</p>
                    {exp.description && <RichText value={exp.description} className="text-gray-500 mt-0.5" style={{ fontSize: `${7.5 * scale}px` }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{t("education")}</h2>
            <div className="space-y-2">
              {data.education.map((edu, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: theme.primary }} />
                  <div>
                    <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                    <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{edu.institution} {edu.graduationDate ? `· ${edu.graduationDate}` : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{t("projects")}</h2>
            <div className="grid grid-cols-2 gap-3">
              {data.projects.map((p, i) => (
                <div key={i} className="p-2 rounded-lg" style={{ backgroundColor: theme.light }}>
                  <p className="font-bold" style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{p.title}</p>
                  {p.description && <RichText value={p.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${7 * scale}px` }} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {data.languages.length > 0 && (
          <div className="flex gap-6">
            <div>
              <h2 className="font-bold uppercase tracking-wide mb-1" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{t("languages")}</h2>
              <div className="flex gap-2">
                {data.languages.map((l, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-white" style={{ fontSize: `${7 * scale}px`, backgroundColor: theme.primary }}>{l.language}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   TEMPLATE 6: ELEGANT (Pro)
   Refined serif typography
   ═══════════════════════════════════════ */

export function ElegantTemplate({ data, formatting }: { data: CVForm; formatting: FormattingOptions }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const heading = (label: string) => (
    <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{label}</h2>
  );

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
              <p className="italic text-gray-500" style={{ fontSize: `${8.5 * scale}px` }}>{edu.institution} {edu.graduationDate ? `· ${formatDateValue(edu.graduationDate, df)}` : ""}</p>
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("decoratedSkills"))}
        <p className="text-center text-gray-600" style={{ fontSize: `${8.5 * scale}px` }}>
          {data.skills.join("  ·  ")}
        </p>
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
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-800">
      {/* Header with decorative line */}
      <div className="text-center pb-4 mb-3">
        <h1 className="font-bold tracking-[0.2em] uppercase" style={{ fontSize: `${20 * scale}px`, color: theme.primary }}>
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
        <ContactBar data={data} scale={scale} color="#9ca3af" align="center" className="mt-2" />
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      {/* Photo header */}
      <div className="flex items-center gap-4 px-5 py-4 text-white" style={{ backgroundColor: theme.primary }}>
        {data.photo ? (
          <PhotoCircle src={data.photo} size={68 * scale} borderColor="rgba(255,255,255,0.7)" />
        ) : (
          <div className="rounded-full bg-white/20 flex items-center justify-center font-bold flex-shrink-0"
            style={{ width: 68 * scale, height: 68 * scale, fontSize: `${24 * scale}px` }}>
            {(data.fullName || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="font-bold" style={{ fontSize: `${20 * scale}px` }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="text-white/85 mt-0.5" style={{ fontSize: `${9.5 * scale}px` }}>{data.headline}</p>}
          <ContactBar data={data} scale={scale} color="rgba(255,255,255,0.85)" className="mt-1.5" />
        </div>
      </div>

      {/* Two columns */}
      <div className="flex gap-4 px-5" style={{ paddingTop: gap }}>
        {/* Main column */}
        <div className="w-[62%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {data.experience.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("professionalExperience")}</SectionTitle>
              <div className="space-y-2.5">
                {data.experience.map((exp, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-start">
                      <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                      <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
                    </div>
                    <p style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                    {exp.description && <RichText value={exp.description} className="text-gray-600 mt-0.5" style={{ fontSize: `${8 * scale}px` }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.projects.length > 0 && (
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
          )}
        </div>

        {/* Side column */}
        <div className="w-[38%]" style={{ display: "flex", flexDirection: "column", gap }}>
          {data.skills.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("coreCompetencies")}</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {data.skills.map((s, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded font-medium" style={{ fontSize: `${7.5 * scale}px`, backgroundColor: theme.light, color: theme.primary }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {data.education.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("education")}</SectionTitle>
              <div className="space-y-2">
                {data.education.map((edu, i) => (
                  <div key={i}>
                    <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                    <p className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{edu.institution}</p>
                    {edu.graduationDate && <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{edu.graduationDate}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.languages.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
              <div className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
                {data.languages.map((l, i) => (
                  <p key={i}>{l.language} <span className="text-gray-400 capitalize">({l.proficiency})</span></p>
                ))}
              </div>
            </div>
          )}

          {data.certifications.length > 0 && (
            <div>
              <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
              <ul className="space-y-0.5" style={{ fontSize: `${8 * scale}px` }}>
                {data.certifications.map((c, i) => <li key={i}>• {c}</li>)}
              </ul>
            </div>
          )}
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const heading = (label: string) => (
    <h2 className="font-bold uppercase tracking-wide" style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{label}</h2>
  );

  const sections: Record<SectionKey, React.ReactNode> = {
    experience: data.experience.length > 0 ? (
      <div>
        {heading(t("experience"))}
        {data.experience.map((exp, i) => (
          <div key={i} className="mt-1">
            <div className="flex justify-between items-baseline gap-2">
              <p className="font-semibold" style={{ fontSize: `${8.5 * scale}px` }}>{exp.jobTitle} <span className="font-normal text-gray-500">— {exp.company}</span></p>
              <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
            </div>
            {exp.description && <RichText value={exp.description} className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }} />}
          </div>
        ))}
      </div>
    ) : null,
    education: data.education.length > 0 ? (
      <div>
        {heading(t("education"))}
        {data.education.map((edu, i) => (
          <div key={i} className="flex justify-between items-baseline gap-2 mt-0.5">
            <p style={{ fontSize: `${8 * scale}px` }}><span className="font-semibold">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</span> <span className="text-gray-500">— {edu.institution}</span></p>
            {edu.graduationDate && <span className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span>}
          </div>
        ))}
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {heading(t("skills"))}
        <p className="text-gray-700" style={{ fontSize: `${8 * scale}px` }}>{data.skills.join("  ·  ")}</p>
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
    <div style={{ fontFamily, fontSize: `${9 * scale}px`, lineHeight }} className="text-gray-900 p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-x-3" style={{ borderBottom: `1px solid ${theme.primary}`, paddingBottom: 4, marginBottom: 6 }}>
        <h1 className="font-bold" style={{ fontSize: `${16 * scale}px`, color: theme.primary }}>{data.fullName || t("yourName")}</h1>
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
              <div className="flex justify-between items-baseline gap-2">
                <p className="font-semibold" style={{ fontSize: `${9 * scale}px` }}>{exp.jobTitle}</p>
                <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} df={df} />
              </div>
              <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
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
            <div key={i} className="flex justify-between items-baseline gap-2">
              <p style={{ fontSize: `${8.5 * scale}px` }}>
                <span className="font-semibold">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</span>
                <span className="text-gray-500"> — {edu.institution}</span>
              </p>
              {edu.graduationDate && <span className="text-gray-400" style={{ fontSize: `${7.5 * scale}px` }}>{formatDateValue(edu.graduationDate, df)}</span>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    skills: data.skills.length > 0 ? (
      <div>
        {Heading(t("skills"))}
        <div className="flex flex-wrap gap-1.5">
          {data.skills.map((s, i) => (
            <span key={i} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700" style={{ fontSize: `${7.5 * scale}px` }}>{s}</span>
          ))}
        </div>
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.primary }} />
      <h2 className="font-bold uppercase tracking-wider" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>{label}</h2>
    </div>
  );
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900 p-1">
      <div className="mb-4">
        <h1 className="font-bold" style={{ fontSize: `${22 * scale}px`, color: theme.primary }}>{data.fullName || t("yourName")}</h1>
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => (
    <h2 className="font-semibold tracking-[0.12em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary, borderBottom: `1px solid ${theme.primary}40`, paddingBottom: 2 }}>{label}</h2>
  );
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily: `Georgia, 'Times New Roman', ${fontFamily}`, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      <div className="text-center pb-3 mb-3 border-b-2" style={{ borderColor: theme.primary }}>
        <h1 className="font-bold" style={{ fontSize: `${22 * scale}px` }}>{data.fullName || t("yourName")}</h1>
        {data.headline && <p className="italic text-gray-600 mt-1" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
        <ContactBar data={data} scale={scale} color="#6b7280" align="center" className="mt-1" />
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => (
    <h2 className="font-bold uppercase tracking-wide mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary, fontFamily: "'Courier New', monospace" }}>
      <span className="text-gray-400">{"// "}</span>{label}
    </h2>
  );
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      <div className="mb-4 p-3 rounded" style={{ backgroundColor: `${theme.primary}10` }}>
        <h1 className="font-bold" style={{ fontSize: `${20 * scale}px`, color: theme.primary, fontFamily: "'Courier New', monospace" }}>{data.fullName || t("yourName")}</h1>
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
  const t = useTranslations("cvBuilderPage.previewSections");
  const theme = getTheme(formatting);
  const fontFamily = getFontStack(formatting);
  const scale = getFontScale(formatting);
  const gap = getSectionGap(formatting);
  const lineHeight = getLineHeight(formatting);
  const df = formatting.dateFormat;

  const Heading = (label: string) => (
    <h2 className="font-bold uppercase tracking-wider mb-2 inline-block" style={{ fontSize: `${9 * scale}px`, color: theme.primary, borderBottom: `2px solid ${theme.primary}` }}>{label}</h2>
  );
  const sections = useStandardSections(data, scale, df, Heading);

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight }} className="text-gray-900">
      {/* Full-width colored banner */}
      <div className="flex items-center gap-4 px-6 py-5 mb-4" style={{ backgroundColor: theme.primary }}>
        <PhotoCircle src={data.photo} size={64} borderColor="#ffffff" />
        <div className="text-white">
          <h1 className="font-bold" style={{ fontSize: `${22 * scale}px` }}>{data.fullName || t("yourName")}</h1>
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
