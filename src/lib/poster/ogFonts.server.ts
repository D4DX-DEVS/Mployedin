import "server-only";
import logger from "@/lib/logger";
import { BRAND_FONTS, type BrandFont } from "@/lib/brand/brandKit";

/**
 * Fonts for server-drawn posters (next/og). It reads TTF/OTF/WOFF only, and the
 * app's next/font files are woff2, so the kit's family is fetched once from
 * Google Fonts (a request without a browser user agent is answered with TTF)
 * and kept in memory. A failed fetch falls back to next/og's built-in font.
 */

type Weight = 400 | 500 | 600 | 700 | 800 | 900;
export interface OgFont { name: string; data: ArrayBuffer; weight: Weight; style: "normal" }


const cache = new Map<string, Promise<ArrayBuffer | null>>();

async function fetchFont(family: string, weight: Weight): Promise<ArrayBuffer | null> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
    { signal: AbortSignal.timeout(5000) },
  ).then((r) => (r.ok ? r.text() : ""));
  const url = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('(?:opentype|truetype|woff)'\)/)?.[1];
  if (!url || !url.startsWith("https://fonts.gstatic.com/")) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  return res.ok ? res.arrayBuffer() : null;
}

function load(family: string, weight: Weight): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetchFont(family, weight).catch((err) => {
      logger.warn({ err, family, weight }, "[poster] font fetch failed; using the built-in font");
      return null;
    });
    // Forget a failure so the next request tries again.
    hit.then((data) => { if (!data) cache.delete(key); });
    cache.set(key, hit);
  }
  return hit;
}

/** The kit's family in the weights posters use, plus Arabic glyphs when the text needs them. */
export async function posterFonts(font: BrandFont, needsArabic: boolean): Promise<{ fonts: OgFont[]; family?: string }> {
  const chosen = BRAND_FONTS[font] ?? BRAND_FONTS.manrope;
  // Cairo and Tajawal carry Arabic glyphs themselves; other fonts borrow Noto Sans Arabic.
  const hasArabic = font === "arabic" || font === "cairo" || font === "tajawal";
  const sets: { family: string; weights: readonly number[] }[] = [chosen, ...(needsArabic && !hasArabic ? [BRAND_FONTS.arabic] : [])];
  const families = sets.map((set) => set.family);
  const loaded = await Promise.all(
    sets.flatMap((set) => set.weights.map(async (weight) => ({ family: set.family, weight: weight as Weight, data: await load(set.family, weight as Weight) }))),
  );
  const fonts = loaded
    .filter((f): f is { family: string; weight: Weight; data: ArrayBuffer } => Boolean(f.data))
    .map((f) => ({ name: f.family, data: f.data, weight: f.weight, style: "normal" as const }));
  return { fonts, family: fonts.length ? families.join(", ") : undefined };
}
