"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CVForm, FormattingOptions } from "./types";
import { getTheme, getFontStack, getFontScale, getSectionGap } from "./types";

/* ── Shared helpers ── */

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

function DateRange({ start, end, isCurrent }: { start: string; end: string; isCurrent: boolean }) {
  const t = useTranslations("cvBuilderPage.previewSections");
  if (!start && !end) return null;
  return (
    <span className="text-[0.6rem] text-gray-500 whitespace-nowrap">
      {start} – {isCurrent ? t("present") : end}
    </span>
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: 1.5 }} className="text-gray-900">
      {/* Header */}
      <div className="pb-3 mb-3" style={{ borderBottom: `2px solid ${theme.primary}` }}>
        <h1 className="font-bold text-gray-900" style={{ fontSize: `${20 * scale}px` }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5" style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.currentLocation && <span>{data.currentLocation}</span>}
        </div>
        {(data.linkedin || data.portfolio) && (
          <div className="flex gap-x-3 mt-1" style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>
            {data.linkedin && <span>{data.linkedin}</span>}
            {data.portfolio && <span>{data.portfolio}</span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {/* Experience */}
        {data.experience.length > 0 && (
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
                    <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} />
                  </div>
                  {exp.description && (
                    <p className="text-gray-600 mt-0.5 whitespace-pre-line" style={{ fontSize: `${8 * scale}px` }}>{exp.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
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
                  {edu.graduationDate && <span className="text-[0.6rem] text-gray-500">{edu.graduationDate}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <SectionTitle color={theme.primary}>{t("skills")}</SectionTitle>
            <div className="flex flex-wrap gap-1">
              {data.skills.map((s, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-gray-700" style={{ fontSize: `${8 * scale}px`, backgroundColor: theme.light }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <SectionTitle color={theme.primary}>{t("projects")}</SectionTitle>
            <div className="space-y-2">
              {data.projects.map((p, i) => (
                <div key={i}>
                  <p className="font-semibold" style={{ fontSize: `${9.5 * scale}px` }}>{p.title}</p>
                  {p.description && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${8 * scale}px` }}>{p.description}</p>}
                  {p.techStack.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {p.techStack.map((t, j) => (
                        <span key={j} className="px-1 py-0.5 rounded text-[0.55rem]" style={{ backgroundColor: theme.light, color: theme.primary }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {data.languages.length > 0 && (
          <div>
            <SectionTitle color={theme.primary}>{t("languages")}</SectionTitle>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ fontSize: `${8.5 * scale}px` }}>
              {data.languages.map((l, i) => (
                <span key={i}>{l.language} <span className="text-gray-500 capitalize">({l.proficiency})</span></span>
              ))}
            </div>
          </div>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <div>
            <SectionTitle color={theme.primary}>{t("certifications")}</SectionTitle>
            <ul className="list-disc list-inside space-y-0.5" style={{ fontSize: `${8.5 * scale}px` }}>
              {data.certifications.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px` }} className="text-gray-900 flex min-h-full">
      {/* Left Sidebar */}
      <div className="w-[35%] p-4 text-white" style={{ backgroundColor: theme.primary }}>
        <h1 className="font-bold mb-0.5" style={{ fontSize: `${16 * scale}px` }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-white/80 mb-3" style={{ fontSize: `${8 * scale}px` }}>{data.headline}</p>}

        <div className="space-y-0.5 mb-4" style={{ fontSize: `${7.5 * scale}px` }}>
          {data.email && <p className="text-white/90">✉ {data.email}</p>}
          {data.phone && <p className="text-white/90">☎ {data.phone}</p>}
          {data.currentLocation && <p className="text-white/90">📍 {data.currentLocation}</p>}
          {data.linkedin && <p className="text-white/80 break-all">🔗 {data.linkedin}</p>}
        </div>

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
                    <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} />
                  </div>
                  <p style={{ fontSize: `${8 * scale}px`, color: "#6b7280" }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                  {exp.description && <p className="text-gray-600 mt-0.5 whitespace-pre-line" style={{ fontSize: `${7.5 * scale}px` }}>{exp.description}</p>}
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
                  {p.description && <p className="text-gray-600" style={{ fontSize: `${7.5 * scale}px` }}>{p.description}</p>}
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: 1.6 }} className="text-gray-800">
      {/* Header — centered */}
      <div className="text-center pb-3 mb-3 border-b border-gray-200">
        <h1 className="font-bold tracking-wide" style={{ fontSize: `${22 * scale}px`, color: theme.primary }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-gray-500 mt-0.5" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
        <div className="flex justify-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5" style={{ fontSize: `${8 * scale}px`, color: "#9ca3af" }}>
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>· {data.phone}</span>}
          {data.currentLocation && <span>· {data.currentLocation}</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {/* Experience */}
        {data.experience.length > 0 && (
          <div>
            <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("experience")}</h2>
            <div className="space-y-3">
              {data.experience.map((exp, i) => (
                <div key={i}>
                  <div className="flex justify-between">
                    <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle} <span className="font-normal text-gray-500">{t("atCompany", { company: exp.company })}</span></p>
                    <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} />
                  </div>
                  {exp.description && <p className="text-gray-500 mt-0.5 whitespace-pre-line" style={{ fontSize: `${8 * scale}px` }}>{exp.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("education")}</h2>
            <div className="space-y-2">
              {data.education.map((edu, i) => (
                <div key={i} className="flex justify-between">
                  <div>
                    <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{edu.degree}{edu.field ? `, ${edu.field}` : ""}</p>
                    <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{edu.institution}</p>
                  </div>
                  {edu.graduationDate && <span className="text-[0.6rem] text-gray-400">{edu.graduationDate}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("skills")}</h2>
            <p className="text-gray-600" style={{ fontSize: `${8.5 * scale}px` }}>{data.skills.join(" · ")}</p>
          </div>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-2" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("projects")}</h2>
            <div className="space-y-2">
              {data.projects.map((p, i) => (
                <div key={i}>
                  <p className="font-medium" style={{ fontSize: `${9.5 * scale}px` }}>{p.title}</p>
                  {p.description && <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{p.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages & Certifications */}
        <div className="flex gap-8">
          {data.languages.length > 0 && (
            <div>
              <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-1" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("languages")}</h2>
              <div style={{ fontSize: `${8.5 * scale}px` }}>
                {data.languages.map((l, i) => (
                  <span key={i}>{i > 0 ? " · " : ""}{l.language}</span>
                ))}
              </div>
            </div>
          )}
          {data.certifications.length > 0 && (
            <div>
              <h2 className="font-semibold uppercase tracking-widest text-gray-400 mb-1" style={{ fontSize: `${8 * scale}px`, letterSpacing: "0.15em" }}>{t("certifications")}</h2>
              <div style={{ fontSize: `${8.5 * scale}px` }}>{data.certifications.join(" · ")}</div>
            </div>
          )}
        </div>
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px` }} className="text-gray-900">
      {/* Header band */}
      <div className="px-4 py-4 text-white flex items-center gap-4" style={{ backgroundColor: theme.primary }}>
        <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white/70 text-xl font-bold flex-shrink-0">
          {(data.fullName || "U").charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="font-bold" style={{ fontSize: `${18 * scale}px` }}>{data.fullName || t("yourName")}</h1>
          {data.headline && <p className="text-white/80" style={{ fontSize: `${9 * scale}px` }}>{data.headline}</p>}
          <div className="flex flex-wrap gap-x-3 mt-0.5" style={{ fontSize: `${7.5 * scale}px`, color: "rgba(255,255,255,0.7)" }}>
            {data.email && <span>{data.email}</span>}
            {data.phone && <span>{data.phone}</span>}
            {data.currentLocation && <span>{data.currentLocation}</span>}
          </div>
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
                    <p className="text-gray-400" style={{ fontSize: `${7 * scale}px` }}>{exp.startDate} – {exp.isCurrent ? t("present") : exp.endDate}</p>
                    {exp.description && <p className="text-gray-600 mt-0.5 whitespace-pre-line" style={{ fontSize: `${7.5 * scale}px` }}>{exp.description}</p>}
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
                    {p.description && <p className="text-gray-500" style={{ fontSize: `${7.5 * scale}px` }}>{p.description}</p>}
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px` }} className="text-gray-900">
      {/* Bold Header */}
      <div className="p-5 text-white relative" style={{ backgroundColor: theme.primary }}>
        <div className="absolute inset-0 opacity-10" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)" }} />
        <h1 className="font-bold relative" style={{ fontSize: `${24 * scale}px` }}>
          {data.fullName || t("yourName")}
        </h1>
        {data.headline && <p className="text-white/80 relative mt-0.5" style={{ fontSize: `${10 * scale}px` }}>{data.headline}</p>}
        <div className="flex flex-wrap gap-x-4 mt-2 relative" style={{ fontSize: `${8 * scale}px`, color: "rgba(255,255,255,0.8)" }}>
          {data.email && <span>✉ {data.email}</span>}
          {data.phone && <span>☎ {data.phone}</span>}
          {data.currentLocation && <span>📍 {data.currentLocation}</span>}
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
                      <DateRange start={exp.startDate} end={exp.endDate} isCurrent={exp.isCurrent} />
                    </div>
                    <p style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{exp.company}</p>
                    {exp.description && <p className="text-gray-500 mt-0.5 whitespace-pre-line" style={{ fontSize: `${7.5 * scale}px` }}>{exp.description}</p>}
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
                  {p.description && <p className="text-gray-600 mt-0.5" style={{ fontSize: `${7 * scale}px` }}>{p.description}</p>}
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

  return (
    <div style={{ fontFamily, fontSize: `${10 * scale}px`, lineHeight: 1.7 }} className="text-gray-800">
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
        <div className="flex justify-center flex-wrap gap-x-4 mt-2" style={{ fontSize: `${8 * scale}px`, color: "#9ca3af" }}>
          {data.email && <span>{data.email}</span>}
          {data.phone && <span>{data.phone}</span>}
          {data.currentLocation && <span>{data.currentLocation}</span>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap }}>
        {/* Experience */}
        {data.experience.length > 0 && (
          <div>
            <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>
              {t("decoratedExperience")}
            </h2>
            <div className="space-y-3">
              {data.experience.map((exp, i) => (
                <div key={i} className="text-center">
                  <p className="font-bold" style={{ fontSize: `${9.5 * scale}px` }}>{exp.jobTitle}</p>
                  <p className="italic" style={{ fontSize: `${8.5 * scale}px`, color: theme.primary }}>{exp.company}{exp.country ? ` · ${exp.country}` : ""}</p>
                  <p className="text-gray-400" style={{ fontSize: `${7.5 * scale}px` }}>{exp.startDate} – {exp.isCurrent ? t("present") : exp.endDate}</p>
                  {exp.description && <p className="text-gray-600 mt-0.5 text-left whitespace-pre-line" style={{ fontSize: `${8 * scale}px` }}>{exp.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div>
            <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>
              {t("decoratedEducation")}
            </h2>
            <div className="space-y-2 text-center">
              {data.education.map((edu, i) => (
                <div key={i}>
                  <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                  <p className="italic text-gray-500" style={{ fontSize: `${8.5 * scale}px` }}>{edu.institution} {edu.graduationDate ? `· ${edu.graduationDate}` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div>
            <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>
              {t("decoratedSkills")}
            </h2>
            <p className="text-center text-gray-600" style={{ fontSize: `${8.5 * scale}px` }}>
              {data.skills.join("  ·  ")}
            </p>
          </div>
        )}

        {/* Projects */}
        {data.projects.length > 0 && (
          <div>
            <h2 className="font-bold tracking-[0.15em] uppercase text-center mb-2" style={{ fontSize: `${9 * scale}px`, color: theme.primary }}>
              {t("decoratedProjects")}
            </h2>
            <div className="space-y-2">
              {data.projects.map((p, i) => (
                <div key={i} className="text-center">
                  <p className="font-bold" style={{ fontSize: `${9 * scale}px` }}>{p.title}</p>
                  {p.description && <p className="text-gray-500" style={{ fontSize: `${8 * scale}px` }}>{p.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages & Certifications side by side */}
        <div className="flex justify-center gap-12">
          {data.languages.length > 0 && (
            <div className="text-center">
              <h2 className="font-bold tracking-[0.15em] uppercase mb-1" style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{t("languages")}</h2>
              <div style={{ fontSize: `${8.5 * scale}px` }}>
                {data.languages.map((l, i) => (
                  <p key={i}>{l.language} <span className="text-gray-400 italic capitalize">({l.proficiency})</span></p>
                ))}
              </div>
            </div>
          )}
          {data.certifications.length > 0 && (
            <div className="text-center">
              <h2 className="font-bold tracking-[0.15em] uppercase mb-1" style={{ fontSize: `${8 * scale}px`, color: theme.primary }}>{t("certifications")}</h2>
              <div style={{ fontSize: `${8.5 * scale}px` }}>
                {data.certifications.map((c, i) => <p key={i}>{c}</p>)}
              </div>
            </div>
          )}
        </div>
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
    case "modern":    return <ModernTemplate data={data} formatting={formatting} />;
    case "minimal":   return <MinimalTemplate data={data} formatting={formatting} />;
    case "executive": return <ExecutiveTemplate data={data} formatting={formatting} />;
    case "creative":  return <CreativeTemplate data={data} formatting={formatting} />;
    case "elegant":   return <ElegantTemplate data={data} formatting={formatting} />;
    default:          return <ClassicTemplate data={data} formatting={formatting} />;
  }
}
