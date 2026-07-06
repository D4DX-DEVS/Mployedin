/**
 * Poster Composer — Layout Engine
 * Platform-first composition: Mployedin header on top, employer identity below,
 * hiring content as one group, application CTA + QR as one block at the bottom.
 *
 * Positions are percentages (0–100) of the canvas. Font sizes are px at a 1080px
 * reference width; PosterOverlay renders them in `cqw` so they scale to any format.
 * Layout ids (layout-a..d) are stable storage keys; TEMPLATES map onto them.
 */

import type { PosterFormat, PosterLayout, PosterType } from "./types";

export interface ElementPosition {
  x: number; // % from left
  y: number; // % from top
  w: number; // % width
  h: number; // % height
  fontSize: number; // px at 1080px reference width (0 for image boxes)
  fontWeight: number;
  align: "left" | "center" | "right";
  color: string;
}

export interface LayoutDefinition {
  platformLogo: ElementPosition; // Mployedin — top, platform-first
  employerLogo: ElementPosition;
  companyName: ElementPosition;
  headline: ElementPosition; // WE ARE HIRING
  jobTitle: ElementPosition;
  summary: ElementPosition; // 1–2 line job summary
  details: ElementPosition; // location / salary / etc.
  requirements: ElementPosition; // KEY REQUIREMENTS + bullets
  ctaTitle: ElementPosition; // SCAN TO APPLY
  ctaSubtitle: ElementPosition; // View job details
  qrCode: ElementPosition;
  footer: ElementPosition; // mployedin.com
}

type LayoutMap = Record<PosterFormat, LayoutDefinition>;

// ── helpers ──────────────────────────────────────────────────────────────
type Align = "left" | "center" | "right";
const box = (x: number, y: number, w: number, h: number): ElementPosition => ({
  x, y, w, h, fontSize: 0, fontWeight: 0, align: "left", color: "",
});
const txt = (
  x: number, y: number, w: number, h: number,
  fontSize: number, fontWeight: number, align: Align, color: string,
): ElementPosition => ({ x, y, w, h, fontSize: Math.round(fontSize), fontWeight, align, color });

type Aspect = "square" | "portrait" | "wide";

// Base font sizes (px @1080 ref) per aspect.
const BASE: Record<Aspect, { headline: number; title: number; details: number; company: number; cta: number; ctaSub: number; footer: number }> = {
  square: { headline: 52, title: 34, details: 20, company: 24, cta: 28, ctaSub: 17, footer: 16 },
  portrait: { headline: 64, title: 40, details: 24, company: 26, cta: 30, ctaSub: 18, footer: 18 },
  wide: { headline: 40, title: 26, details: 16, company: 18, cta: 22, ctaSub: 14, footer: 13 },
};

// Per-template knobs. Only these differ between the 4 templates — geometry is shared,
// so the composition stays coherent and there is one grid to reason about.
interface Knobs {
  align: Align; // headline/title alignment
  hScale: number; // headline size multiplier
  hWeight: number;
  tScale: number; // job-title size multiplier
}
const KNOBS: Record<PosterLayout, Knobs> = {
  "layout-a": { align: "left", hScale: 1.0, hWeight: 800, tScale: 1.0 }, // platform-editorial
  "layout-c": { align: "center", hScale: 1.25, hWeight: 900, tScale: 1.05 }, // bold-recruitment
  "layout-b": { align: "left", hScale: 0.5, hWeight: 600, tScale: 1.35 }, // minimal-professional (eyebrow headline, hero title)
  "layout-d": { align: "left", hScale: 1.0, hWeight: 800, tScale: 1.0 }, // tech-signal
};

const WHITE = "#ffffff";

function build(aspect: Aspect, k: Knobs): LayoutDefinition {
  const b = BASE[aspect];
  const detailAlign: Align = k.align === "center" ? "center" : "left";

  if (aspect === "wide") {
    // Two-column: content left, application block right. Landscape is short —
    // summary but no requirements list (REQ_LIMIT.linkedin-post = 0).
    return {
      platformLogo: box(3, 6, 22, 15),
      employerLogo: box(3, 28, 6, 14),
      companyName: txt(11, 29, 50, 12, b.company, 600, "left", WHITE),
      headline: txt(3, 43, 62, 14, b.headline * k.hScale, k.hWeight, "left", WHITE),
      jobTitle: txt(3, 58, 60, 9, b.title * k.tScale, 600, "left", "#ffffffee"),
      summary: txt(3, 68, 60, 8, b.details, 400, "left", "#ffffffcc"),
      details: txt(3, 78, 58, 12, b.details, 400, "left", "#ffffffdd"),
      requirements: txt(3, 90, 55, 8, b.details, 400, "left", "#ffffffcc"),
      ctaTitle: txt(64, 36, 33, 8, b.cta, 800, "left", WHITE),
      ctaSubtitle: txt(64, 48, 33, 7, b.ctaSub, 400, "left", "#ffffffcc"),
      qrCode: box(80, 56, 16, 34),
      footer: txt(3, 92, 50, 6, b.footer, 500, "left", "#ffffffaa"),
    };
  }

  // square & portrait: vertical bands, platform-first.
  const P =
    aspect === "portrait"
      ? {
          pl: [5, 4, 40, 6], el: [5, 11, 9, 5], cn: [16, 11.5, 60, 5],
          hl: [5, 20, 90, 8], jt: [5, 29, 90, 6], sm: [5, 36, 84, 6], dt: [5, 43, 80, 9],
          rq: [5, 54, 84, 21],
          ct: [5, 83, 52, 5], cs: [5, 88, 52, 4], qr: [78, 80, 15, 11], ft: [5, 95, 60, 3],
        }
      : {
          pl: [5, 5, 44, 8], el: [5, 16, 10, 6], cn: [17, 17, 58, 5],
          hl: [5, 26, 90, 8], jt: [5, 35, 90, 6], sm: [5, 42, 84, 6], dt: [5, 49, 80, 8],
          rq: [5, 59, 58, 17],
          ct: [5, 81, 50, 5], cs: [5, 87, 50, 4], qr: [76, 75, 17, 15], ft: [5, 95, 60, 4],
        };

  return {
    platformLogo: box(P.pl[0], P.pl[1], P.pl[2], P.pl[3]),
    employerLogo: box(P.el[0], P.el[1], P.el[2], P.el[3]),
    companyName: txt(P.cn[0], P.cn[1], P.cn[2], P.cn[3], b.company, 600, "left", WHITE),
    headline: txt(P.hl[0], P.hl[1], P.hl[2], P.hl[3], b.headline * k.hScale, k.hWeight, k.align, WHITE),
    jobTitle: txt(P.jt[0], P.jt[1], P.jt[2], P.jt[3], b.title * k.tScale, 600, k.align, "#ffffffee"),
    summary: txt(P.sm[0], P.sm[1], P.sm[2], P.sm[3], b.details, 400, detailAlign, "#ffffffcc"),
    details: txt(P.dt[0], P.dt[1], P.dt[2], P.dt[3], b.details, 400, detailAlign, "#ffffffdd"),
    requirements: txt(P.rq[0], P.rq[1], P.rq[2], P.rq[3], b.details, 400, "left", "#ffffffcc"),
    ctaTitle: txt(P.ct[0], P.ct[1], P.ct[2], P.ct[3], b.cta, 800, "left", WHITE),
    ctaSubtitle: txt(P.cs[0], P.cs[1], P.cs[2], P.cs[3], b.ctaSub, 400, "left", "#ffffffcc"),
    qrCode: box(P.qr[0], P.qr[1], P.qr[2], P.qr[3]),
    footer: txt(P.ft[0], P.ft[1], P.ft[2], P.ft[3], b.footer, 500, "left", "#ffffffaa"),
  };
}

function layoutMap(layout: PosterLayout): LayoutMap {
  const k = KNOBS[layout];
  return {
    "instagram-post": build("square", k),
    "instagram-story": build("portrait", k),
    "linkedin-post": build("wide", k),
    "a4-print": build("portrait", k),
  };
}

// ── All Layouts ────────────────────────────────────────────────────────────
export const LAYOUTS: Record<PosterLayout, LayoutMap> = {
  "layout-a": layoutMap("layout-a"),
  "layout-b": layoutMap("layout-b"),
  "layout-c": layoutMap("layout-c"),
  "layout-d": layoutMap("layout-d"),
};

// ── Auto-select layout based on poster type (fallback when no template chosen) ─
const TYPE_TO_LAYOUT: Record<PosterType, PosterLayout[]> = {
  "single-job": ["layout-a", "layout-d"],
  "bulk-hiring": ["layout-c", "layout-b"],
  "urgent-hiring": ["layout-c", "layout-a"],
  "walk-in-interview": ["layout-a", "layout-d"],
};

export function getLayoutForVariation(type: PosterType, variationIndex: number): PosterLayout {
  const preferred = TYPE_TO_LAYOUT[type];
  return preferred[variationIndex % preferred.length];
}

export function getLayoutDefinition(layout: PosterLayout, format: PosterFormat): LayoutDefinition {
  return LAYOUTS[layout][format];
}
