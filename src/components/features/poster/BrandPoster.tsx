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
import { BRAND_FONTS, contrastRatio, readableTextOn, type BrandKit } from "@/lib/brand/brandKit";

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
  /** "Dubai, UAE"; shown with a pin. */
  location?: string;
  /** "Full time · Hybrid", "AED 14,000–18,000/month"; empty ones are dropped. */
  details: string[];
  /** "Posted: 27 Oct 2026"; shown with a calendar. */
  posted?: string;
  /** Up to four requirement lines, and their heading. */
  requirements?: string[];
  requirementsTitle?: string;
  /** Call to action beside the QR code. */
  cta: string;
  /** "Apply now" button text in the footer bar. */
  applyLabel?: string;
  /** "For enquiries" with Mployedin's email and phone (applying is through the QR / portal). */
  contact?: { label: string; email?: string; phone?: string };
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

/**
 * Icon paths copied from lucide (ISC). lucide-react can't be used here: its
 * forwardRef components don't render under satori (next/og), so the poster
 * draws the same paths itself.
 */
const ICONS = {
  megaphone: ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  pin: ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  calendar: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18"],
  check: ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z", "m9 12 2 2 4-4"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"],
  phone: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"],
  arrow: ["M5 12h14", "m12 5 7 7-7 7"],
} as const;

function Icon({ name, size, color }: { name: keyof typeof ICONS; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function BrandPoster(props: BrandPosterProps) {
  const { data, kit, layout, look, width, height } = props;
  const landscape = width > height * 1.2;
  // Story and A4: more height than a square, so text grows a little and blocks spread out.
  const tall = height > width * 1.3;
  const u = (Math.min(width, height) / 100) * (tall ? 1.12 : 1); // 1% of the short side
  const spread = tall ? "space-around" : "space-between";
  const font = props.fontFamily ?? BRAND_FONTS[kit.font].stack;
  const reqs = (data.requirements ?? []).filter(Boolean).slice(0, landscape ? 2 : 4);
  // Requirements share the page with the title; a slightly smaller title keeps both readable.
  const titleSize = (data.title.length > 42 ? 6.4 : data.title.length > 26 ? 7.8 : 9.4) * u * (look === "clean" ? 0.88 : 1) * (landscape ? 0.82 : 1) * (reqs.length ? 0.86 : 1);
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
        alignItems: "center",
        gap: 1.2 * u,
      }}
    >
      <Icon name="megaphone" size={3.2 * u} color={palette.kickerFg} />
      <div style={{ display: "flex" }}>{data.headline}</div>
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

  const chips: { text: string; icon?: keyof typeof ICONS }[] = [
    ...(data.location ? [{ text: data.location, icon: "pin" as const }] : []),
    ...data.details.filter(Boolean).map((text) => ({ text })),
    ...(data.posted ? [{ text: data.posted, icon: "calendar" as const }] : []),
  ];
  const meta = chips.length ? (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1.2 * u,
        justifyContent: palette.align === "center" ? "center" : "flex-start",
      }}
    >
      {chips.map((chip) => (
        <div
          key={chip.text}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0.8 * u,
            fontSize: (reqs.length ? 2.4 : 2.7) * u,
            fontWeight: 600,
            color: palette.metaFg,
            padding: `${0.6 * u}px ${1.6 * u}px`,
            borderRadius: 1.2 * u,
            background: palette.metaBg,
          }}
        >
          {chip.icon ? <Icon name={chip.icon} size={2.8 * u} color={palette.metaFg} /> : null}
          <div style={{ display: "flex" }}>{chip.text}</div>
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
            width: 9.5 * u,
            height: 9.5 * u,
            borderRadius: 1.6 * u,
            background: "#ffffff",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          { }
          <img src={props.logoUrl} alt="" width={8.3 * u} height={8.3 * u} style={{ objectFit: "contain" }} />
        </div>
      ) : null}
      <div style={{ display: "flex", fontSize: 3.4 * u, fontWeight: 800, color: palette.bodyFg }}>{data.companyName}</div>
    </div>
  );

  const qrSize = (reqs.length ? 13 : 12) * u;
  const qrColumn = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.9 * u, flexShrink: 0 }}>
      {data.qrDataUrl ? (
        <div style={{ display: "flex", padding: 0.8 * u, background: "#ffffff", borderRadius: 1.2 * u, border: `${0.4 * u}px solid ${palette.iconFg}` }}>
          <img src={data.qrDataUrl} alt="" width={qrSize} height={qrSize} />
        </div>
      ) : null}
      {reqs.length ? (
        <div style={{ display: "flex", fontSize: 2.3 * u, fontWeight: 800, color: palette.ctaFg }}>{data.cta}</div>
      ) : null}
      {/* The small Mployedin mark sits under the QR: stacked, so they never overlap at any size. */}
      {props.platformLogoUrl ? (
        <div style={{ display: "flex", padding: `${0.5 * u}px ${1.2 * u}px`, borderRadius: 99 * u, background: "rgba(255,255,255,0.92)" }}>
          <img src={props.platformLogoUrl} alt="" width={10 * u} height={2.6 * u} style={{ objectFit: "contain" }} />
        </div>
      ) : null}
    </div>
  );

  const requirementsBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 1.1 * u, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", fontSize: 2.4 * u, fontWeight: 800, letterSpacing: 0.2 * u, textTransform: "uppercase", color: palette.iconFg }}>
        {data.requirementsTitle}
      </div>
      {reqs.map((line) => (
        <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: 1.2 * u }}>
          <Icon name="check" size={2.9 * u} color={palette.iconFg} />
          <div style={{ display: "flex", fontSize: 2.3 * u, lineHeight: 1.3, fontWeight: 600, color: palette.ctaFg }}>{line}</div>
        </div>
      ))}
    </div>
  );

  // With requirements: the list beside the QR (the call to action moves under the QR).
  // Without: the call to action beside the QR, as before.
  const apply = (
    <div style={{ display: "flex", alignItems: reqs.length ? "flex-end" : "center", gap: 3 * u, justifyContent: palette.align === "center" && !reqs.length ? "center" : "space-between" }}>
      {reqs.length ? (
        requirementsBlock
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0.4 * u }}>
          <div style={{ display: "flex", fontSize: 3.4 * u, fontWeight: 800, color: palette.ctaFg }}>{data.cta}</div>
          {data.footer ? (
            <div style={{ display: "flex", fontSize: 2.1 * u, fontWeight: 600, color: palette.mutedFg }}>{data.footer}</div>
          ) : null}
        </div>
      )}
      {qrColumn}
    </div>
  );

  const contact = data.contact;
  const footerBar = data.applyLabel || contact ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2.6 * u,
        paddingTop: 1.8 * u,
        borderTop: `${0.2 * u}px solid ${palette.ruleFg}`,
      }}
    >
      {data.applyLabel ? (
        <div style={{ display: "flex", alignItems: "center", gap: 1 * u, padding: `${1 * u}px ${2.4 * u}px`, borderRadius: 99 * u, background: palette.buttonBg, color: palette.buttonFg, fontSize: 2.6 * u, fontWeight: 800 }}>
          <div style={{ display: "flex" }}>{data.applyLabel}</div>
          <Icon name="arrow" size={2.8 * u} color={palette.buttonFg} />
        </div>
      ) : null}
      {contact ? (
        // One stacked column (label, email, phone): fits the narrowest layout without wrapping.
        <div style={{ display: "flex", flexDirection: "column", gap: 0.5 * u }}>
          <div style={{ display: "flex", fontSize: 1.8 * u, fontWeight: 600, color: palette.mutedFg }}>{contact.label}</div>
          {contact.email ? (
            <div style={{ display: "flex", alignItems: "center", gap: 1 * u }}>
              <Icon name="mail" size={2.6 * u} color={palette.iconFg} />
              <div style={{ display: "flex", fontSize: 2.2 * u, fontWeight: 800, color: palette.ctaFg }}>{contact.email}</div>
            </div>
          ) : null}
          {contact.phone ? (
            <div style={{ display: "flex", alignItems: "center", gap: 1 * u }}>
              <Icon name="phone" size={2.4 * u} color={palette.iconFg} />
              <div style={{ display: "flex", fontSize: 2.2 * u, fontWeight: 800, color: palette.ctaFg }}>{contact.phone}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  ) : null;

  // The bottom of every layout: requirements + QR, then the apply/contact bar.
  const bottom = (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 * u }}>
      {apply}
      {footerBar}
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
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 2 * u, padding: pad, paddingBottom: 4 * u, background: kit.primary, height: landscape ? "46%" : reqs.length ? "27%" : "38%" }}>
            {kicker}
            {company}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, flex: 1, padding: pad, paddingTop: 4 * u }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {title}
              {meta}
            </div>
            {bottom}
          </div>
        </div>
      );
      break;
    case "split":
      body = (
        <div style={{ display: "flex", flexDirection: landscape ? "row" : "column", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 2.6 * u, padding: pad, background: `linear-gradient(160deg, ${kit.primary}, ${darken(kit.primary, 0.35)})`, flex: landscape ? 1.2 : reqs.length ? 0.55 : 1.15 }}>
            {kicker}
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, gap: 3 * u, padding: pad, paddingTop: reqs.length && !landscape ? 4 * u : pad, flex: 1, borderTop: landscape ? "none" : `${1.2 * u}px solid ${kit.accent}`, borderLeft: landscape ? `${1.2 * u}px solid ${kit.accent}` : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.4 * u }}>
              {company}
              {meta}
            </div>
            {bottom}
          </div>
        </div>
      );
      break;
    case "frame":
      body = (
        <div style={{ display: "flex", width: "100%", height: "100%", padding: 3.5 * u }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, alignItems: "stretch", width: "100%", height: "100%", border: `${1.6 * u}px solid ${kit.primary}`, borderRadius: 3 * u, padding: pad - 2 * u }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {company}
              {kicker}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {title}
              {meta}
            </div>
            {bottom}
          </div>
        </div>
      );
      break;
    case "night":
      body = (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, width: "100%", height: "100%", padding: pad }}>
          <div style={{ display: "flex", position: "absolute", right: -26 * u, top: -26 * u, width: 50 * u, height: 50 * u, borderRadius: 999 * u, background: alpha(kit.accent, 0.55) }} />
          <div style={{ display: "flex", position: "absolute", right: 30 * u, top: 6 * u, width: 6 * u, height: 6 * u, borderRadius: 999 * u, background: alpha(kit.primary, 0.9) }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2.4 * u }}>
            {kicker}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
            {title}
            {meta}
            {company}
          </div>
          {bottom}
        </div>
      );
      break;
    case "minimal":
      body = (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          <div style={{ display: "flex", width: 2 * u, background: kit.primary }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, flex: 1, padding: pad }}>
            {company}
            <div style={{ display: "flex", flexDirection: "column", gap: 2.6 * u }}>
              {kicker}
              {title}
              <div style={{ display: "flex", width: 14 * u, height: 0.9 * u, background: kit.accent, borderRadius: u }} />
              {meta}
            </div>
            {bottom}
          </div>
        </div>
      );
      break;
    case "spotlight":
    default:
      body = (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: spread, alignItems: "stretch", width: "100%", height: "100%", padding: pad }}>
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: "100%", height: 1.4 * u, background: kit.accent }} />
          {company}
          <div style={{ display: "flex", flexDirection: "column", gap: 2.8 * u, alignItems: "stretch" }}>
            {kicker}
            {title}
            {meta}
          </div>
          {bottom}
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
  /** Icons, the requirements heading and the QR frame. */
  iconFg: string;
  buttonBg: string;
  buttonFg: string;
  ruleFg: string;
  align: "left" | "center";
}

type BasePalette = Omit<Palette, "iconFg" | "buttonBg" | "buttonFg" | "ruleFg">;

/** #rrggbb or white/black for a colour that may be an rgba() string. */
function solid(color: string): string {
  return color.startsWith("#") ? color : "#ffffff";
}

/**
 * Colours for each layout, always picked for contrast against what they sit on.
 * The extras (icons, the Apply button, the divider) follow the area the bottom
 * of the poster sits on: the brand colour for light layouts, white/accent on dark ones.
 */
function paletteFor(layout: BrandLayout, kit: BrandKit, look: PosterLook): Palette {
  const base = basePalette(layout, kit, look);
  const onPrimary = readableTextOn(kit.primary);
  const dark = layout === "spotlight" || layout === "night";
  if (layout === "night") {
    const accentOk = contrastRatio(kit.accent, "#0b1328") >= 3;
    return { ...base, iconFg: accentOk ? kit.accent : "#ffffff", buttonBg: kit.accent, buttonFg: readableTextOn(kit.accent), ruleFg: "rgba(255,255,255,0.18)" };
  }
  if (dark) {
    const lightText = onPrimary === "#ffffff";
    return {
      ...base,
      iconFg: contrastRatio(kit.accent, kit.primary) >= 3 ? kit.accent : onPrimary,
      buttonBg: lightText ? "#ffffff" : kit.text,
      buttonFg: lightText ? kit.primary : "#ffffff",
      ruleFg: lightText ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
    };
  }
  const text = solid(base.ctaFg);
  return {
    ...base,
    iconFg: contrastRatio(kit.primary, kit.background) >= 3 ? kit.primary : text,
    buttonBg: kit.primary,
    buttonFg: onPrimary,
    ruleFg: alpha(text, 0.15),
  };
}

function basePalette(layout: BrandLayout, kit: BrandKit, look: PosterLook): BasePalette {
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
