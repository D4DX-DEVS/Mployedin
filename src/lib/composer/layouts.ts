/**
 * Poster Composer — Layout Engine
 * Defines structural positions for poster elements across formats.
 * Positions are in percentages (0-100) of canvas dimensions.
 */

import type { PosterFormat, PosterLayout, PosterType } from "./types";

export interface ElementPosition {
  x: number; // % from left
  y: number; // % from top
  w: number; // % width
  h: number; // % height
  fontSize: number; // px (at 1080px reference width)
  fontWeight: number;
  align: "left" | "center" | "right";
  color: string;
}

export interface LayoutDefinition {
  employerLogo: ElementPosition;
  companyName: ElementPosition;
  headline: ElementPosition;
  jobTitle: ElementPosition;
  details: ElementPosition;
  qrCode: ElementPosition;
  mployedinLogo: ElementPosition;
  applyText: ElementPosition;
}

type LayoutMap = Record<PosterFormat, LayoutDefinition>;

// ── Layout A: Classic (Logo top-left, headline center, details below) ──────
const layoutA: LayoutMap = {
  "instagram-post": {
    employerLogo: { x: 5, y: 5, w: 15, h: 15, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 22, y: 8, w: 50, h: 8, fontSize: 18, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 28, w: 90, h: 15, fontSize: 42, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 5, y: 44, w: 90, h: 10, fontSize: 24, fontWeight: 500, align: "center", color: "#ffffffcc" },
    details: { x: 8, y: 58, w: 84, h: 22, fontSize: 16, fontWeight: 400, align: "left", color: "#ffffffdd" },
    qrCode: { x: 5, y: 82, w: 14, h: 14, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 78, y: 86, w: 18, h: 8, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 86, w: 54, h: 6, fontSize: 13, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "instagram-story": {
    employerLogo: { x: 5, y: 3, w: 12, h: 7, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 19, y: 4, w: 60, h: 5, fontSize: 18, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 20, w: 90, h: 10, fontSize: 48, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 5, y: 31, w: 90, h: 6, fontSize: 26, fontWeight: 500, align: "center", color: "#ffffffcc" },
    details: { x: 8, y: 42, w: 84, h: 30, fontSize: 18, fontWeight: 400, align: "left", color: "#ffffffdd" },
    qrCode: { x: 5, y: 80, w: 15, h: 8, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 75, y: 90, w: 20, h: 6, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 90, w: 50, h: 4, fontSize: 14, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "linkedin-post": {
    employerLogo: { x: 3, y: 6, w: 10, h: 20, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 15, y: 10, w: 40, h: 14, fontSize: 16, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 3, y: 30, w: 60, h: 25, fontSize: 36, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 3, y: 55, w: 60, h: 12, fontSize: 20, fontWeight: 500, align: "left", color: "#ffffffcc" },
    details: { x: 3, y: 68, w: 55, h: 20, fontSize: 14, fontWeight: 400, align: "left", color: "#ffffffdd" },
    qrCode: { x: 80, y: 65, w: 16, h: 28, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 80, y: 8, w: 17, h: 16, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 65, y: 92, w: 32, h: 6, fontSize: 12, fontWeight: 400, align: "right", color: "#ffffffaa" },
  },
  "a4-print": {
    employerLogo: { x: 5, y: 3, w: 12, h: 6, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 19, y: 4, w: 50, h: 4, fontSize: 20, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 18, w: 90, h: 10, fontSize: 56, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 5, y: 29, w: 90, h: 6, fontSize: 30, fontWeight: 500, align: "center", color: "#ffffffcc" },
    details: { x: 10, y: 40, w: 80, h: 35, fontSize: 20, fontWeight: 400, align: "left", color: "#ffffffdd" },
    qrCode: { x: 5, y: 82, w: 12, h: 9, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 80, y: 92, w: 16, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 20, y: 93, w: 58, h: 4, fontSize: 16, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
};

// ── Layout B: Hero (Logo top-center, big headline, details bottom band) ────
const layoutB: LayoutMap = {
  "instagram-post": {
    employerLogo: { x: 38, y: 4, w: 24, h: 14, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 19, w: 80, h: 6, fontSize: 16, fontWeight: 500, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 30, w: 90, h: 18, fontSize: 48, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 50, w: 80, h: 10, fontSize: 22, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 8, y: 63, w: 84, h: 16, fontSize: 15, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 82, w: 14, h: 14, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 78, y: 86, w: 18, h: 8, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 87, w: 54, h: 5, fontSize: 13, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "instagram-story": {
    employerLogo: { x: 35, y: 4, w: 30, h: 10, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 15, w: 80, h: 4, fontSize: 18, fontWeight: 500, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 24, w: 90, h: 12, fontSize: 52, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 37, w: 80, h: 6, fontSize: 26, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 8, y: 48, w: 84, h: 25, fontSize: 18, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 80, w: 16, h: 9, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 75, y: 91, w: 20, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 91, w: 50, h: 4, fontSize: 14, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "linkedin-post": {
    employerLogo: { x: 3, y: 5, w: 12, h: 22, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 17, y: 10, w: 40, h: 12, fontSize: 15, fontWeight: 500, align: "left", color: "#ffffffcc" },
    headline: { x: 3, y: 32, w: 70, h: 28, fontSize: 38, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 3, y: 60, w: 60, h: 12, fontSize: 18, fontWeight: 500, align: "left", color: "#ffffffdd" },
    details: { x: 3, y: 74, w: 55, h: 18, fontSize: 13, fontWeight: 400, align: "left", color: "#ffffffcc" },
    qrCode: { x: 80, y: 60, w: 16, h: 28, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 78, y: 8, w: 18, h: 15, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 60, y: 90, w: 37, h: 8, fontSize: 12, fontWeight: 400, align: "right", color: "#ffffffaa" },
  },
  "a4-print": {
    employerLogo: { x: 35, y: 3, w: 30, h: 8, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 12, w: 80, h: 4, fontSize: 20, fontWeight: 500, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 22, w: 90, h: 12, fontSize: 60, fontWeight: 800, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 35, w: 80, h: 6, fontSize: 28, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 10, y: 45, w: 80, h: 30, fontSize: 20, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 82, w: 12, h: 9, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 80, y: 92, w: 16, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 20, y: 93, w: 58, h: 4, fontSize: 16, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
};

// ── Layout C: Bold Centered ────────────────────────────────────────────────
const layoutC: LayoutMap = {
  "instagram-post": {
    employerLogo: { x: 35, y: 3, w: 30, h: 12, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 16, w: 80, h: 6, fontSize: 16, fontWeight: 600, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 26, w: 90, h: 20, fontSize: 44, fontWeight: 900, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 47, w: 80, h: 10, fontSize: 22, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 12, y: 60, w: 76, h: 18, fontSize: 15, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 82, w: 14, h: 14, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 78, y: 86, w: 18, h: 8, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 87, w: 54, h: 5, fontSize: 13, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "instagram-story": {
    employerLogo: { x: 32, y: 3, w: 36, h: 8, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 12, w: 80, h: 4, fontSize: 18, fontWeight: 600, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 22, w: 90, h: 14, fontSize: 52, fontWeight: 900, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 37, w: 80, h: 6, fontSize: 26, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 10, y: 48, w: 80, h: 25, fontSize: 18, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 80, w: 16, h: 9, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 75, y: 91, w: 20, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 22, y: 91, w: 50, h: 4, fontSize: 14, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
  "linkedin-post": {
    employerLogo: { x: 3, y: 5, w: 12, h: 22, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 17, y: 10, w: 50, h: 12, fontSize: 15, fontWeight: 600, align: "left", color: "#ffffffcc" },
    headline: { x: 3, y: 28, w: 94, h: 30, fontSize: 40, fontWeight: 900, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 58, w: 80, h: 12, fontSize: 18, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 10, y: 72, w: 55, h: 20, fontSize: 13, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 80, y: 65, w: 16, h: 28, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 82, y: 8, w: 15, h: 14, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 60, y: 92, w: 37, h: 6, fontSize: 11, fontWeight: 400, align: "right", color: "#ffffffaa" },
  },
  "a4-print": {
    employerLogo: { x: 35, y: 3, w: 30, h: 8, fontSize: 0, fontWeight: 0, align: "center", color: "" },
    companyName: { x: 10, y: 12, w: 80, h: 4, fontSize: 22, fontWeight: 600, align: "center", color: "#ffffffcc" },
    headline: { x: 5, y: 22, w: 90, h: 14, fontSize: 64, fontWeight: 900, align: "center", color: "#ffffff" },
    jobTitle: { x: 10, y: 37, w: 80, h: 6, fontSize: 30, fontWeight: 500, align: "center", color: "#ffffffdd" },
    details: { x: 10, y: 48, w: 80, h: 28, fontSize: 22, fontWeight: 400, align: "center", color: "#ffffffcc" },
    qrCode: { x: 5, y: 82, w: 12, h: 9, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    mployedinLogo: { x: 80, y: 92, w: 16, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 20, y: 93, w: 58, h: 4, fontSize: 16, fontWeight: 400, align: "center", color: "#ffffffaa" },
  },
};

// ── Layout D: Info Band (bottom overlay panel) ─────────────────────────────
const layoutD: LayoutMap = {
  "instagram-post": {
    employerLogo: { x: 5, y: 4, w: 16, h: 14, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 23, y: 7, w: 50, h: 7, fontSize: 16, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 52, w: 90, h: 14, fontSize: 38, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 5, y: 67, w: 90, h: 8, fontSize: 20, fontWeight: 500, align: "left", color: "#ffffffdd" },
    details: { x: 5, y: 76, w: 65, h: 12, fontSize: 14, fontWeight: 400, align: "left", color: "#ffffffcc" },
    qrCode: { x: 80, y: 75, w: 16, h: 16, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 78, y: 92, w: 18, h: 6, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 5, y: 92, w: 50, h: 5, fontSize: 12, fontWeight: 400, align: "left", color: "#ffffffaa" },
  },
  "instagram-story": {
    employerLogo: { x: 5, y: 3, w: 14, h: 6, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 21, y: 4, w: 60, h: 4, fontSize: 16, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 55, w: 90, h: 10, fontSize: 44, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 5, y: 66, w: 90, h: 5, fontSize: 24, fontWeight: 500, align: "left", color: "#ffffffdd" },
    details: { x: 5, y: 74, w: 65, h: 12, fontSize: 16, fontWeight: 400, align: "left", color: "#ffffffcc" },
    qrCode: { x: 75, y: 74, w: 20, h: 11, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 75, y: 92, w: 20, h: 5, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 5, y: 92, w: 50, h: 4, fontSize: 14, fontWeight: 400, align: "left", color: "#ffffffaa" },
  },
  "linkedin-post": {
    employerLogo: { x: 3, y: 5, w: 10, h: 20, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 15, y: 9, w: 40, h: 12, fontSize: 14, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 3, y: 45, w: 60, h: 22, fontSize: 32, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 3, y: 67, w: 55, h: 10, fontSize: 16, fontWeight: 500, align: "left", color: "#ffffffdd" },
    details: { x: 3, y: 78, w: 55, h: 14, fontSize: 12, fontWeight: 400, align: "left", color: "#ffffffcc" },
    qrCode: { x: 80, y: 60, w: 16, h: 28, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 80, y: 8, w: 17, h: 15, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 60, y: 92, w: 37, h: 6, fontSize: 11, fontWeight: 400, align: "right", color: "#ffffffaa" },
  },
  "a4-print": {
    employerLogo: { x: 5, y: 3, w: 14, h: 6, fontSize: 0, fontWeight: 0, align: "left", color: "" },
    companyName: { x: 21, y: 4, w: 50, h: 4, fontSize: 20, fontWeight: 600, align: "left", color: "#ffffff" },
    headline: { x: 5, y: 55, w: 90, h: 10, fontSize: 52, fontWeight: 800, align: "left", color: "#ffffff" },
    jobTitle: { x: 5, y: 66, w: 90, h: 6, fontSize: 28, fontWeight: 500, align: "left", color: "#ffffffdd" },
    details: { x: 5, y: 75, w: 65, h: 14, fontSize: 18, fontWeight: 400, align: "left", color: "#ffffffcc" },
    qrCode: { x: 78, y: 75, w: 16, h: 12, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    mployedinLogo: { x: 80, y: 93, w: 16, h: 4, fontSize: 0, fontWeight: 0, align: "right", color: "" },
    applyText: { x: 5, y: 93, w: 50, h: 4, fontSize: 16, fontWeight: 400, align: "left", color: "#ffffffaa" },
  },
};

// ── All Layouts ────────────────────────────────────────────────────────────
export const LAYOUTS: Record<PosterLayout, LayoutMap> = {
  "layout-a": layoutA,
  "layout-b": layoutB,
  "layout-c": layoutC,
  "layout-d": layoutD,
};

// ── Auto-select layout based on poster type ────────────────────────────────
const TYPE_TO_LAYOUT: Record<PosterType, PosterLayout[]> = {
  "single-job": ["layout-a", "layout-d"],
  "bulk-hiring": ["layout-c", "layout-b"],
  "urgent-hiring": ["layout-b", "layout-c"],
  "walk-in-interview": ["layout-a", "layout-d"],
};

/**
 * Get the layout for a given poster type and variation index.
 * Cycles through preferred layouts for variety.
 */
export function getLayoutForVariation(type: PosterType, variationIndex: number): PosterLayout {
  const preferred = TYPE_TO_LAYOUT[type];
  return preferred[variationIndex % preferred.length];
}

/**
 * Get the full layout definition for a given layout and format.
 */
export function getLayoutDefinition(layout: PosterLayout, format: PosterFormat): LayoutDefinition {
  return LAYOUTS[layout][format];
}
