/**
 * BrandPoster: a job poster drawn in code from a brand kit.
 *
 * Six layouts, three looks, any size. Instant and free (no AI call), so the
 * poster maker shows every layout at once and a set never repeats itself.
 *
 * Rendered in two places from this one file:
 *  - the browser (preview, PNG download via html-to-image), and
 *  - the server through next/og (ImageResponse/satori) for share pages and the
 *    MCP connector.
 * So: inline styles only, flex layout only, and every element with more than
 * one child sets display:flex (a satori rule). No hooks, no "use client".
 */
import type { CSSProperties, ReactNode } from "react";
import { BRAND_FONTS, readableTextOn, type BrandKit } from "@/lib/brand/brandKit";

export const BRAND_LAYOUTS = ["spotlight", "band", "split", "frame", "night", "minimal"] as const;
export type BrandLayout = (typeof BRAND_LAYOUTS)[number];

export const POSTER_LOOKS = ["bold", "clean", "urgent"] as const;
export type PosterLook = (typeof POSTER_LOOKS)[number];

export const POSTER_SIZES = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  landscape: { width: 1200, height: 627 },
  a4: { width: 2480, height: 3508 },
} as const;
export type PosterSize = keyof typeof POSTER_SIZES;

export interface BrandPosterData {
  title: string;
  companyName: string;
  /** Kicker above the title ("WE'RE HIRING"). */
  headline: string;
  /** "Location · Full time · AED 14,000–18,000" pieces; empty ones are dropped. */
  details: string[];
  /** Call to action beside the QR code. */
  cta: string;
  /** Small line at the bottom, e.g. "mployedin.com". */
  footer?: string;
  qrDataUrl?: string;
}

export interface BrandPosterProps {
  data: BrandPosterData;
  kit: BrandKit;
  layout: BrandLayout;
  look: PosterLook;
  width: number;
  height: number;
  /** Absolute or same-origin logo URL; the server passes absolute URLs. */
  logoUrl?: string | null;
  /** The small Mployedin mark every poster carries. */
  platformLogoUrl?: string | null;
  /** Server rendering names a loaded font; the browser uses the kit's CSS stack. */
  fontFamily?: string;
}

/** Mix a #rrggbb colour toward black (amount 0–1). */
function darken(color: string, amount: number): string {
  const c = (i: number) => Math.round(parseInt(color.slice(i, i + 2), 16) * (1 - amount));
  return `rgb(${c(1)}, ${c(3)}, ${c(5)})`;
}

/** #rrggbb with alpha, as rgba(). */
function alpha(color: string, a: number): string {
  const c = (i: number) => parseInt(color.slice(i, i + 2), 16);
  return `rgba(${c(1)}, ${c(3)}, ${c(5)}, ${a})`;
}

export function BrandPoster(props: BrandPosterProps) {
  const { data, kit, layout, look, width, height } = props;
  const u = Math.min(width, height) / 100; // 1% of the short side
  const landscape = width > height * 1.2;
  const font = props.fontFamily ?? BRAND_FONTS[kit.font].stack;
  const titleSize = (data.title.length > 42 ? 6.4 : data.title.length > 26 ? 7.8 : 9.4) * u * (look === "clean" ? 0.88 : 1) * (landscape ? 0.82 : 1);
  const weight = look === "clean" ? 700 : 800;

  const palette = paletteFor(layout, kit, look);

  const kicker = (
    <div
      style={{
        display: "flex",
        alignSelf: palette.align === "center" ? "center" : "flex-start",
        padding: `${0.9 * u}px ${2.2 * u}px`,
        borderRadius: 99 * u,
        background: palette.kickerBg,
        color: palette.kickerFg,
        fontSize: 2.6 * u,
        fontWeight: 800,
        letterSpacing: 0.25 * u,
        textTransform: look === "clean" ? "none" : "uppercase",
      }}
    >
      {data.headline}
    </div>
  );

  const title = (
    <div
      style={{
        display: "flex",
        fontSize: titleSize,
        fontWeight: weight,
        lineHeight: 1.05,
        color: palette.titleFg,
        textAlign: palette.align,
        justifyContent: palette.align === "center" ? "center" : "flex-start",
      }}
    >
      {data.title}
    </div>
  );

  const details = data.details.filter(Boolean);
  const meta = details.length ? (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1.2 * u,
        justifyContent: palette.align === "center" ? "center" : "flex-start",
      }}
    >
      {details.map((d) => (
        <div
          key={d}
          style={{
            display: "flex",
            fontSize: 2.7 * u,
            fontWeight: 600,
            color: palette.metaFg,
            padding: `${0.6 * u}px ${1.6 * u}px`,
            borderRadius: 1.2 * u,
            background: palette.metaBg,
          }}
        >
          {d}
        </div>
      ))}
    </div>
  ) : null;

  const company = (
    <div style={{ display: "flex", alignItems: "center", gap: 1.6 * u, justifyContent: palette.align === "center" ? "center" : "flex-start" }}>
      {props.logoUrl ? (
        <div
          style={{
            display: "flex",
            width: 7.5 * u,
            height: 7.5 * u,
            borderRadius: 1.6 * u,
            background: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          { }
          <img src={props.logoUrl} alt="" width={6.5 * u} height={6.5 * u} style={{ objectFit: "contain" }} />
        </div>
      ) : null}
      <div style={{ display: "flex", fontSize: 3 * u, fontWeight: 700, color: palette.bodyFg }}>{data.companyName}</div>
    </div>
  );

  const apply = (
    <div style={{ display: "flex", alignItems: "center", gap: 2 * u, justifyContent: palette.align === "center" ? "center" : "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 0.4 * u }}>
        <div style={{ display: "flex", fontSize: 3.4 * u, fontWeight: 800, color: palette.ctaFg }}>{data.cta}</div>
        {data.footer ? (
          <div style={{ display: "flex", fontSize: 2.1 * u, fontWeight: 600, color: palette.mutedFg }}>{data.footer}</div>
        ) : null}
      </div>
      {/* QR with the small Mployedin mark under it: stacked, so they never overlap at any size. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 * u }}>
        {data.qrDataUrl ? (
          <div style={{ display: "flex", padding: 0.8 * u, background: "#ffffff", borderRadius: 1.2 * u }}>
            <img src={data.qrDataUrl} alt="" width={12 * u} height={12 * u} />
          </div>
        ) : null}
        {props.platformLogoUrl ? (
          <div style={{ display: "flex", padding: `${0.5 * u}px ${1.2 * u}px`, borderRadius: 99 * u, background: "rgba(255,255,255,0.92)" }}>
            <img src={props.platformLogoUrl} alt="" width={10 * u} height={2.6 * u} style={{ objectFit: "contain" }} />
          </div>
        ) : null}
      </div>
    </div>
  );

  const root: CSSProperties = {
    display: "flex",
    position: "relative",
    width,
    height,
    overflow: "hidden",
    fontFamily: font,
    background: palette.background,
  };

  let body: ReactNode;
  const pad = landscape ? 5 * u : 7 * u;

  switch (layout) {
    case "band":
      body = (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 * u, padding: pad, paddingBottom: 4 * u, background: kit.primary, height: landscape ? "46%" : "38%" }}>
            {kicker}
            {company}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: pad, paddingTop: 4 * u }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {title}
              {meta}
            </div>
            {apply}
          </div>
        </div>
      );
      break;
    case "split":
      body = (
        <div style={{ display: "flex", flexDirection: landscape ? "row" : "column", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2.6 * u, padding: pad, background: `linear-gradient(160deg, ${kit.primary}, ${darken(kit.primary, 0.35)})`, flex: landscape ? 1.2 : 1.15 }}>
            {kicker}
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 3 * u, padding: pad, flex: 1, borderTop: landscape ? "none" : `${1.2 * u}px solid ${kit.accent}`, borderLeft: landscape ? `${1.2 * u}px solid ${kit.accent}` : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.4 * u }}>
              {company}
              {meta}
            </div>
            {apply}
          </div>
        </div>
      );
      break;
    case "frame":
      body = (
        <div style={{ display: "flex", width: "100%", height: "100%", padding: 3.5 * u }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "stretch", width: "100%", height: "100%", border: `${1.6 * u}px solid ${kit.primary}`, borderRadius: 3 * u, padding: pad - 2 * u }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {company}
              {kicker}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {title}
              {meta}
            </div>
            {apply}
          </div>
        </div>
      );
      break;
    case "night":
      body = (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: pad }}>
          <div style={{ display: "flex", position: "absolute", right: -26 * u, top: -26 * u, width: 50 * u, height: 50 * u, borderRadius: 999 * u, background: alpha(kit.accent, 0.55) }} />
          <div style={{ display: "flex", position: "absolute", right: 22 * u, top: 17 * u, width: 6 * u, height: 6 * u, borderRadius: 999 * u, background: alpha(kit.primary, 0.9) }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2.4 * u }}>
            {kicker}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
            {title}
            {meta}
            {company}
          </div>
          {apply}
        </div>
      );
      break;
    case "minimal":
      body = (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", width: 2 * u, background: kit.primary }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: pad }}>
            {company}
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {kicker}
              {title}
              <div style={{ display: "flex", width: 14 * u, height: 0.9 * u, background: kit.accent, borderRadius: u }} />
              {meta}
            </div>
            {apply}
          </div>
        </div>
      );
      break;
    case "spotlight":
    default:
      body = (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "stretch", width: "100%", height: "100%", padding: pad }}>
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: "100%", height: 1.4 * u, background: kit.accent }} />
          {company}
          <div style={{ display: "flex", flexDirection: "column", gap: 2.8 * u, alignItems: "stretch" }}>
            {kicker}
            {title}
            {meta}
          </div>
          {apply}
        </div>
      );
  }

  return (
    <div style={root}>
      {body}
    </div>
  );
}

interface Palette {
  background: string;
  titleFg: string;
  bodyFg: string;
  metaFg: string;
  metaBg: string;
  mutedFg: string;
  ctaFg: string;
  kickerBg: string;
  kickerFg: string;
  align: "left" | "center";
}

/** Colours for each layout, always picked for contrast against what they sit on. */
function paletteFor(layout: BrandLayout, kit: BrandKit, look: PosterLook): Palette {
  const urgentKicker = look === "urgent";
  const onPrimary = readableTextOn(kit.primary);
  const onBackground = readableTextOn(kit.background);
  const onAccent = readableTextOn(kit.accent);
  const titleOnBackground = readableTextOn(kit.background) === "#ffffff" ? "#ffffff" : kit.text;

  switch (layout) {
    case "band":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: onPrimary,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.primary, 0.1),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
    case "split":
      return {
        background: kit.background,
        titleFg: onPrimary,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.primary, 0.1),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
    case "frame":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: alpha(kit.accent, 0.14),
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.65),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : kit.primary,
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "center",
      };
    case "night": {
      const dark = readableTextOn(kit.text) === "#ffffff" ? kit.text : "#0b1328";
      return {
        background: `linear-gradient(180deg, ${dark}, ${darken(dark.startsWith("#") ? dark : "#0b1328", 0.4)})`,
        titleFg: "#ffffff",
        bodyFg: "#ffffff",
        metaFg: "#ffffff",
        metaBg: "rgba(255,255,255,0.12)",
        mutedFg: "rgba(255,255,255,0.7)",
        ctaFg: "#ffffff",
        kickerBg: kit.accent,
        kickerFg: onAccent,
        align: "left",
      };
    }
    case "minimal":
      return {
        background: kit.background,
        titleFg: titleOnBackground,
        bodyFg: titleOnBackground,
        metaFg: titleOnBackground,
        metaBg: "rgba(0,0,0,0)",
        mutedFg: alpha(onBackground === "#ffffff" ? "#ffffff" : kit.text, 0.6),
        ctaFg: titleOnBackground,
        kickerBg: urgentKicker ? kit.accent : alpha(kit.primary, 0.12),
        kickerFg: urgentKicker ? onAccent : readableTextOn(kit.background) === "#ffffff" ? "#ffffff" : kit.primary,
        align: "left",
      };
    case "spotlight":
    default:
      return {
        background: `linear-gradient(150deg, ${kit.primary} 0%, ${darken(kit.primary, 0.45)} 75%)`,
        titleFg: onPrimary,
        bodyFg: onPrimary,
        metaFg: onPrimary,
        metaBg: "rgba(255,255,255,0.14)",
        mutedFg: onPrimary === "#ffffff" ? "rgba(255,255,255,0.72)" : "rgba(17,24,39,0.7)",
        ctaFg: onPrimary,
        kickerBg: urgentKicker ? kit.accent : "rgba(255,255,255,0.18)",
        kickerFg: urgentKicker ? onAccent : onPrimary,
        align: "left",
      };
  }
}
