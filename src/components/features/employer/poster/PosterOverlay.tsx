"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { PosterType, PosterLayout, PosterFormat, ShowFields, PosterStyleOverrides, PosterElementId, ElementOverride } from "@/lib/composer/types";
import { getLayoutDefinition } from "@/lib/composer/layouts";
import type { ElementPosition } from "@/lib/composer/layouts";
import { buildPosterContent } from "@/lib/composer/content-builder";
import { getHeadlineForType, MPLOYEDIN_LOGO_PATH, proxiedImageUrl } from "@/lib/composer/branding";

// Layout font sizes are calibrated to a 1080px-wide canvas. Expressing them in
// container-query units (cqw = 1% of the poster container's width) makes every
// text block scale proportionally to whatever size the poster renders at — small
// preview, thumbnail, or full-resolution export — so nothing overflows/overlaps.
// Requires the poster container to set `container-type: size` (see PosterPreviewPanel / export).
const REFERENCE_WIDTH = 1080;
const fs = (px: number) => `${(px / REFERENCE_WIDTH) * 100}cqw`;
const clampPct = (n: number) => Math.min(98, Math.max(0, n));

// Post-generation appearance overrides (poster editor).
const THEME_COLORS: Record<NonNullable<PosterStyleOverrides["textTheme"]>, { primary: string; body: string }> = {
  white: { primary: "#ffffff", body: "#ffffffdd" },
  warm: { primary: "#fef3c7", body: "#fde68a" },
  sky: { primary: "#e0f2fe", body: "#bae6fd" },
  "mono-dark": { primary: "#0f172a", body: "#1f2937" },
};
const SCRIM: Record<NonNullable<PosterStyleOverrides["overlay"]>, string> = {
  none: "",
  light: "bg-gradient-to-b from-black/25 via-transparent to-black/40",
  medium: "bg-gradient-to-b from-black/45 via-black/10 to-black/70",
  heavy: "bg-gradient-to-b from-black/70 via-black/40 to-black/85",
};
function resolveStyle(style?: PosterStyleOverrides) {
  const t = style?.textTheme ? THEME_COLORS[style.textTheme] : undefined;
  return {
    fontFamily: style?.fontFamily,
    primary: t?.primary,
    body: t?.body,
    bodyWeight: style?.bodyWeight,
    scrim: SCRIM[style?.overlay ?? "medium"],
  };
}

interface PosterOverlayProps {
  job: {
    title?: string; companyName?: string; logo?: string;
    location?: { city?: string; country?: string };
    salary?: { min?: number; max?: number; currency?: string };
    experienceMin?: number; experienceMax?: number; employmentType?: string;
    skills?: string[]; description?: string; responsibilities?: string[]; qualifications?: string[];
    requirements?: { skills?: string[]; education?: string } | null;
  } | null;
  posterType: PosterType;
  showFields: ShowFields;
  layout: PosterLayout;
  format: PosterFormat;
  /** Pre-generated QR data URL (kept as a prop so the overlay stays pure/synchronous for off-screen export). */
  qrDataUrl?: string;
  /** Post-generation appearance overrides from the poster editor. */
  style?: PosterStyleOverrides;
  /** Editor: enable click-to-select + drag on blocks (preview only — off for export). */
  editable?: boolean;
  selectedId?: PosterElementId | null;
  onSelect?: (id: PosterElementId) => void;
  onDeselect?: () => void;
  onMove?: (id: PosterElementId, x: number, y: number) => void;
  onResize?: (id: PosterElementId, scale: number) => void;
  onPatch?: (id: PosterElementId, patch: Partial<ElementOverride>) => void;
  /** Called once at the start of a drag/resize gesture so the editor can checkpoint undo history. */
  onInteractStart?: () => void;
  compact?: boolean;
}

/**
 * Renders the deterministic text/branding overlay on top of an AI background.
 * Platform-first: Mployedin logo on top, employer identity below, hiring content
 * grouped, application CTA + QR grouped at the bottom. Rendered as HTML so
 * html-to-image can export it (see exportPoster.tsx).
 */
export function PosterOverlay({
  job,
  posterType,
  showFields,
  layout,
  format,
  qrDataUrl,
  style,
  editable = false,
  selectedId = null,
  onSelect,
  onDeselect,
  onMove,
  onResize,
  onPatch,
  onInteractStart,
}: PosterOverlayProps) {
  const p = getLayoutDefinition(layout, format);
  const ov = resolveStyle(style);
  const headline = getHeadlineForType(posterType);
  const hasLogo = Boolean(job?.logo);
  const content = buildPosterContent(job, format);
  const empType = job?.employmentType ? job.employmentType.replace(/_/g, " ") : "";
  const rootRef = useRef<HTMLDivElement>(null);

  const locationStr = job?.location?.city
    ? `${job.location.city}, ${job.location.country || ""}`
    : job?.location?.country || "";
  const salaryStr = job?.salary?.min
    ? `${job.salary.currency || "AED"} ${job.salary.min?.toLocaleString()} - ${job.salary.max?.toLocaleString()}`
    : "";
  const expStr = job?.experienceMin != null
    ? `${job.experienceMin}-${job.experienceMax || job.experienceMin} Years Experience`
    : "";

  const E = style?.elements;

  // Resolve a TEXT block: position (drag) + font/weight/color overrides over layout defaults.
  const globalScale = style?.textScale ?? 1;
  const T = (id: PosterElementId, base: ElementPosition, baseColor: string, baseWeight: number) => {
    const o = E?.[id];
    return {
      hidden: o?.hidden ?? false,
      text: o?.text,
      left: o?.x ?? base.x,
      top: o?.y ?? base.y,
      width: base.w,
      height: base.h,
      align: base.align,
      color: o?.color ?? baseColor,
      fontWeight: o?.fontWeight ?? baseWeight,
      fontSize: fs(base.fontSize * (o?.fontScale ?? 1) * globalScale),
    };
  };
  // Resolve an IMAGE block: position (drag) + box scale.
  const IMG = (id: PosterElementId, base: ElementPosition) => {
    const o = E?.[id];
    const s = o?.fontScale ?? 1;
    return {
      hidden: o?.hidden ?? false,
      left: o?.x ?? base.x,
      top: o?.y ?? base.y,
      width: base.w * s,
      height: base.h * s,
    };
  };

  // Drag: on pointer-down over a selected/selectable block, translate pointer motion
  // into % of the poster and push new x/y up. Clamped so blocks stay on-canvas.
  const startDrag = (id: PosterElementId, curLeft: number, curTop: number) => (e: ReactPointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(id);
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || !onMove) return;
    onInteractStart?.();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      onMove(id, clampPct(curLeft + dx), clampPct(curTop + dy));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Resize: drag the corner handle → scale the block (font size for text, box for images).
  const startResize = (id: PosterElementId, curScale: number) => (e: ReactPointerEvent) => {
    if (!editable || !onResize) return;
    e.stopPropagation();
    onInteractStart?.();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const d = ((ev.clientX - sx) + (ev.clientY - sy)) / 2; // px along the diagonal
      onResize(id, Math.min(2.5, Math.max(0.5, Math.round((curScale + d / 200) * 100) / 100)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Editor chrome (outline + grab cursor) for a block. No-op when not editing.
  const chrome = (id: PosterElementId) =>
    editable ? `pointer-events-auto cursor-grab active:cursor-grabbing ${selectedId === id ? "outline outline-2 outline-sky-400" : "hover:outline hover:outline-1 hover:outline-sky-300/60"}` : "";

  const pl = IMG("platformLogo", p.platformLogo);
  const elg = IMG("employerLogo", p.employerLogo);
  const qr = IMG("qrCode", p.qrCode);
  const cn = T("companyName", p.companyName, ov.primary ?? p.companyName.color, p.companyName.fontWeight);
  const hl = T("headline", p.headline, ov.primary ?? p.headline.color, p.headline.fontWeight);
  const jt = T("jobTitle", p.jobTitle, ov.primary ?? p.jobTitle.color, p.jobTitle.fontWeight);
  const sm = T("summary", p.summary, ov.body ?? p.summary.color, ov.bodyWeight ?? 400);
  const dt = T("details", p.details, ov.body ?? p.details.color, ov.bodyWeight ?? p.details.fontWeight);
  const rq = T("requirements", p.requirements, ov.body ?? p.requirements.color, ov.bodyWeight ?? 400);
  const ct = T("ctaTitle", p.ctaTitle, ov.primary ?? p.ctaTitle.color, p.ctaTitle.fontWeight);
  const cs = T("ctaSubtitle", p.ctaSubtitle, ov.body ?? p.ctaSubtitle.color, p.ctaSubtitle.fontWeight);
  const ft = T("footer", p.footer, ov.body ?? p.footer.color, p.footer.fontWeight);

  // Selected block's anchor, for the floating toolbar.
  const anchor: Record<PosterElementId, { left: number; top: number; width: number; height: number }> = {
    platformLogo: pl, employerLogo: elg, qrCode: qr, companyName: cn, headline: hl,
    jobTitle: jt, summary: sm, details: dt, requirements: rq, ctaTitle: ct, ctaSubtitle: cs, footer: ft,
  };
  const selKind = selectedId ? (["platformLogo", "employerLogo", "qrCode"].includes(selectedId) ? "image" : "text") : null;
  const selOv = selectedId ? E?.[selectedId] : undefined;

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 ${editable ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ fontFamily: ov.fontFamily }}
      onPointerDown={editable ? () => onDeselect?.() : undefined}
    >
      {/* Readability scrim: darken top (platform/employer) and bottom (CTA) bands. */}
      {ov.scrim && <div className={`absolute inset-0 ${ov.scrim}`} />}

      {/* Mployedin platform logo — TOP, platform-first (mandatory, never hidable) */}
      {!pl.hidden && (
        <div
          onPointerDown={editable ? startDrag("platformLogo", pl.left, pl.top) : undefined}
          className={`absolute flex items-center ${chrome("platformLogo")}`}
          style={{ left: `${pl.left}%`, top: `${pl.top}%`, width: `${pl.width}%`, height: `${pl.height}%` }}
        >
          <img src={MPLOYEDIN_LOGO_PATH} alt="Mployedin" className="h-full w-auto object-contain object-left" crossOrigin="anonymous" draggable={false} />
        </div>
      )}

      {/* Employer logo (only if the employer has one — never fall back to Mployedin) */}
      {hasLogo && !elg.hidden && (
        <div
          onPointerDown={editable ? startDrag("employerLogo", elg.left, elg.top) : undefined}
          className={`absolute ${chrome("employerLogo")}`}
          style={{ left: `${elg.left}%`, top: `${elg.top}%`, width: `${elg.width}%`, height: `${elg.height}%` }}
        >
          <img src={proxiedImageUrl(job!.logo)} alt={job?.companyName || ""} className="w-full h-full object-contain object-left rounded" crossOrigin="anonymous" draggable={false} />
        </div>
      )}

      {/* Employer company name */}
      {!cn.hidden && (
        <div
          onPointerDown={editable ? startDrag("companyName", cn.left, cn.top) : undefined}
          className={`absolute flex items-center overflow-hidden ${chrome("companyName")}`}
          style={{
            left: `${E?.companyName?.x != null ? cn.left : hasLogo ? cn.left : p.employerLogo.x}%`, top: `${cn.top}%`, width: `${cn.width}%`, height: `${cn.height}%`,
            color: cn.color, fontWeight: cn.fontWeight, fontSize: cn.fontSize,
          }}
        >
          <span className="truncate">{cn.text || job?.companyName || "Company"}</span>
        </div>
      )}

      {/* Hiring headline (single line — never wrap into the job title) */}
      {!hl.hidden && (
        <div
          onPointerDown={editable ? startDrag("headline", hl.left, hl.top) : undefined}
          className={`absolute flex items-center overflow-hidden ${chrome("headline")}`}
          style={{
            left: `${hl.left}%`, top: `${hl.top}%`, width: `${hl.width}%`, height: `${hl.height}%`,
            justifyContent: hl.align === "center" ? "center" : "flex-start",
            textAlign: hl.align, color: hl.color, fontWeight: hl.fontWeight, fontSize: hl.fontSize, lineHeight: 1.05,
          }}
        >
          <span className="whitespace-nowrap">{hl.text || headline}</span>
        </div>
      )}

      {/* Job title */}
      {!jt.hidden && (
        <div
          onPointerDown={editable ? startDrag("jobTitle", jt.left, jt.top) : undefined}
          className={`absolute flex items-center overflow-hidden ${chrome("jobTitle")}`}
          style={{
            left: `${jt.left}%`, top: `${jt.top}%`, width: `${jt.width}%`, height: `${jt.height}%`,
            justifyContent: jt.align === "center" ? "center" : "flex-start",
            textAlign: jt.align, color: jt.color, fontWeight: jt.fontWeight, fontSize: jt.fontSize, lineHeight: 1.1,
          }}
        >
          <span className="line-clamp-2">{jt.text || job?.title || "Job Title"}</span>
        </div>
      )}

      {/* Job summary (1–2 lines, extracted from the real description) */}
      {content.summary && !sm.hidden && (
        <div
          onPointerDown={editable ? startDrag("summary", sm.left, sm.top) : undefined}
          className={`absolute overflow-hidden ${chrome("summary")}`}
          style={{
            left: `${sm.left}%`, top: `${sm.top}%`, width: `${sm.width}%`, height: `${sm.height}%`,
            textAlign: sm.align, color: sm.color, fontSize: sm.fontSize, fontWeight: sm.fontWeight, lineHeight: 1.25,
          }}
        >
          <span className="line-clamp-2">{content.summary}</span>
        </div>
      )}

      {/* Metadata (grouped directly under the summary) */}
      {!dt.hidden && (
        <div
          onPointerDown={editable ? startDrag("details", dt.left, dt.top) : undefined}
          className={`absolute flex flex-col gap-0.5 overflow-hidden ${chrome("details")}`}
          style={{
            left: `${dt.left}%`, top: `${dt.top}%`, width: `${dt.width}%`, height: `${dt.height}%`,
            alignItems: dt.align === "center" ? "center" : "flex-start",
            textAlign: dt.align, color: dt.color, fontSize: dt.fontSize, fontWeight: dt.fontWeight,
          }}
        >
          {showFields.location && locationStr && <span>📍 {locationStr}</span>}
          {showFields.salary && salaryStr && <span>💰 {salaryStr}</span>}
          {showFields.experience && expStr && <span>⏰ {expStr}</span>}
          {empType && <span>💼 {empType}</span>}
        </div>
      )}

      {/* Key requirements (from real job data; gated by the Skills toggle) */}
      {showFields.skills && content.keyRequirements.length > 0 && !rq.hidden && (
        <div
          onPointerDown={editable ? startDrag("requirements", rq.left, rq.top) : undefined}
          className={`absolute flex flex-col overflow-hidden ${chrome("requirements")}`}
          style={{
            left: `${rq.left}%`, top: `${rq.top}%`, width: `${rq.width}%`, height: `${rq.height}%`,
            color: rq.color, fontSize: rq.fontSize, fontWeight: rq.fontWeight, lineHeight: 1.25,
          }}
        >
          <span className="font-semibold mb-1" style={{ letterSpacing: "0.04em", color: ov.primary ?? "#ffffff" }}>KEY REQUIREMENTS</span>
          {content.keyRequirements.map((r, i) => (
            <span key={i} className="line-clamp-1">• {r}</span>
          ))}
        </div>
      )}

      {/* Application CTA text (grouped with the QR to read as one block) */}
      {!ct.hidden && (
        <div
          onPointerDown={editable ? startDrag("ctaTitle", ct.left, ct.top) : undefined}
          className={`absolute flex items-center ${chrome("ctaTitle")}`}
          style={{
            left: `${ct.left}%`, top: `${ct.top}%`, width: `${ct.width}%`, height: `${ct.height}%`,
            color: ct.color, fontWeight: ct.fontWeight, fontSize: ct.fontSize, letterSpacing: "0.02em",
          }}
        >
          <span>{ct.text || "SCAN TO APPLY"}</span>
        </div>
      )}
      {!cs.hidden && (
        <div
          onPointerDown={editable ? startDrag("ctaSubtitle", cs.left, cs.top) : undefined}
          className={`absolute flex items-center ${chrome("ctaSubtitle")}`}
          style={{
            left: `${cs.left}%`, top: `${cs.top}%`, width: `${cs.width}%`, height: `${cs.height}%`,
            color: cs.color, fontWeight: cs.fontWeight, fontSize: cs.fontSize,
          }}
        >
          <span>{cs.text || "View job details · Apply via Mployedin"}</span>
        </div>
      )}

      {/* QR → apply page (white box keeps it scannable on any background) */}
      {qrDataUrl && !qr.hidden && (
        <div
          onPointerDown={editable ? startDrag("qrCode", qr.left, qr.top) : undefined}
          className={`absolute rounded bg-white p-1 ${chrome("qrCode")}`}
          style={{ left: `${qr.left}%`, top: `${qr.top}%`, width: `${qr.width}%`, height: `${qr.height}%` }}
        >
          <img src={qrDataUrl} alt="Scan to apply" className="w-full h-full object-contain" draggable={false} />
        </div>
      )}

      {/* Footer attribution */}
      {!ft.hidden && (
        <div
          onPointerDown={editable ? startDrag("footer", ft.left, ft.top) : undefined}
          className={`absolute flex items-center ${chrome("footer")}`}
          style={{
            left: `${ft.left}%`, top: `${ft.top}%`, width: `${ft.width}%`, height: `${ft.height}%`,
            color: ft.color, fontWeight: ft.fontWeight, fontSize: ft.fontSize, letterSpacing: "0.03em",
          }}
        >
          <span>{ft.text || "mployedin.com"}</span>
        </div>
      )}

      {/* Floating quick-toolbar above the selected block: bold + size. Full controls in the right panel. */}
      {editable && selectedId && onPatch && !E?.[selectedId]?.hidden && (
        <div
          className="absolute z-10 pointer-events-auto flex items-center gap-1 rounded-md bg-neutral-900/95 px-1.5 py-1 shadow-lg"
          style={
            // Sit fully ABOVE the selected block (translateY(-100%)) so it never covers
            // the text being edited; flip below the block when it's near the top edge.
            anchor[selectedId].top > 12
              ? { left: `${anchor[selectedId].left}%`, top: `${anchor[selectedId].top - 1}%`, transform: "translateY(-100%)" }
              : { left: `${anchor[selectedId].left}%`, top: `${anchor[selectedId].top + anchor[selectedId].height + 1}%` }
          }
          onPointerDown={(e) => e.stopPropagation()}
        >
          {selKind === "text" && (
            <button
              type="button"
              onClick={() => onPatch(selectedId, { fontWeight: (selOv?.fontWeight ?? 400) >= 700 ? 400 : 700 })}
              className={`h-6 w-6 rounded text-[12px] font-bold ${(selOv?.fontWeight ?? 400) >= 700 ? "bg-sky-500 text-white" : "text-neutral-200 hover:bg-neutral-700"}`}
            >
              B
            </button>
          )}
          <button type="button" onClick={() => onPatch(selectedId, { fontScale: Math.max(0.5, Math.round(((selOv?.fontScale ?? 1) - 0.1) * 100) / 100) })} className="h-6 w-6 rounded text-neutral-200 hover:bg-neutral-700 text-[14px]">−</button>
          <span className="text-[10px] text-neutral-300 w-8 text-center">{Math.round((selOv?.fontScale ?? 1) * 100)}%</span>
          <button type="button" onClick={() => onPatch(selectedId, { fontScale: Math.min(2.5, Math.round(((selOv?.fontScale ?? 1) + 0.1) * 100) / 100) })} className="h-6 w-6 rounded text-neutral-200 hover:bg-neutral-700 text-[14px]">+</button>
        </div>
      )}

      {/* Corner resize handle on the selected block (drag to scale). */}
      {editable && selectedId && onResize && !E?.[selectedId]?.hidden && (
        <div
          onPointerDown={startResize(selectedId, selOv?.fontScale ?? 1)}
          className="absolute z-10 pointer-events-auto h-3.5 w-3.5 rounded-full border-2 border-sky-400 bg-white cursor-nwse-resize -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${anchor[selectedId].left + anchor[selectedId].width}%`,
            top: `${anchor[selectedId].top + anchor[selectedId].height}%`,
          }}
        />
      )}
    </div>
  );
}
