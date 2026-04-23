"use client";

import type { PosterData, PosterSize } from "../JobPoster";
import type { TextZone, PosterTemplateItem, ZoneDisplayStyle } from "@/hooks/usePosterTemplates";

interface Props {
  data: PosterData;
  size: PosterSize;
  template: PosterTemplateItem;
  /** Override the template's accent color */
  accentColorOverride?: string;
  /** Override text color for all zones: "light" = white text, "dark" = dark text */
  textTheme?: "light" | "dark" | "auto";
  /** Font family override */
  fontFamily?: string;
  /** Scale all font sizes (0.7 = smaller, 1.0 = normal, 1.3 = larger) */
  fontScale?: number;
}

const SIZE_DIMS = {
  landscape: { w: 1200, h: 630 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
} as const;

/** Scale factors to match built-in templates' preview sizes */
const PREVIEW_SCALE = {
  landscape: 0.5,
  square: 0.45,
  story: 0.35,
} as const;

/** Auto-infer display style from field type when not explicitly set */
const FIELD_AUTO_STYLE: Record<string, ZoneDisplayStyle> = {
  title: "plain",
  tagline: "plain",
  company: "badge",
  location: "card",
  salary: "card",
  skills: "pill",
  cta: "button",
  experience: "card",
  workMode: "card",
  watermark: "plain",
  qr: "plain",
  logo: "plain",
};

const FIELD_LABELS: Record<string, string> = {
  salary: "SALARY",
  location: "LOCATION",
  experience: "EXPERIENCE",
  workMode: "WORK MODE",
  company: "COMPANY",
  title: "ROLE",
};

function inferStyle(zone: TextZone): ZoneDisplayStyle {
  // If admin explicitly set a style, respect it
  if (zone.displayStyle && zone.displayStyle !== "plain") return zone.displayStyle;
  // If admin set bgColor or borderRadius, they configured it manually — use plain
  if (zone.bgColor || zone.borderRadius) return zone.displayStyle ?? "plain";
  // Auto-infer from field type
  return FIELD_AUTO_STYLE[zone.field] ?? "plain";
}

/**
 * Renders a poster using an admin-created background template.
 * Positions text content in the zones defined by the template.
 * Internally renders at full resolution; CSS-scaled for preview display.
 */
export function BackgroundTemplate({ data, size, template, accentColorOverride, textTheme = "auto", fontFamily, fontScale = 1 }: Props) {
  const { w, h } = SIZE_DIMS[size];
  const scale = PREVIEW_SCALE[size];
  const accent = accentColorOverride || template.defaultAccentColor;
  const bgUrl =
    template.backgroundImages[size] ||
    template.backgroundImages.landscape ||
    template.backgroundImages.square ||
    template.backgroundImages.story;
  const rawZones =
    (template.textZones[size]?.length ? template.textZones[size] : null) ??
    template.textZones.landscape ??
    template.textZones.square ??
    template.textZones.story ??
    [];

  // Apply text theme + font scale — but be smart about zones with their own backgrounds
  const zones = rawZones.map((z) => {
    const updated = { ...z, fontSize: Math.round(z.fontSize * fontScale) };
    if (textTheme === "auto" || z.field === "qr" || z.field === "logo") return updated;
    const style = inferStyle(z);
    // Cards & pills have their own light background — always use dark text inside them
    if (style === "card") {
      return { ...updated, color: "#1e293b" };
    }
    // For plain/button/badge — follow the theme
    const themeColor = textTheme === "light" ? "#FFFFFF" : "#1e293b";
    return { ...updated, color: themeColor };
  });
  const font = fontFamily || "'Inter', sans-serif";

  return (
    <div
      className="relative"
      style={{ width: w * scale, height: h * scale }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: w,
          height: h,
          fontFamily: font,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
      {/* Background */}
      {bgUrl ? (
        <img
          src={bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: accent }}
        />
      )}

      {/* Render each zone */}
      {zones
        .filter((z) => z.visible)
        .map((zone) => (
          <ZoneRenderer key={zone.id} zone={zone} data={data} w={w} h={h} accentColor={accent} />
        ))}
      </div>
    </div>
  );
}

function ZoneRenderer({
  zone,
  data,
  w,
  h,
  accentColor,
}: {
  zone: TextZone;
  data: PosterData;
  w: number;
  h: number;
  accentColor: string;
}) {
  const content = getZoneContent(zone.field, data);
  if (!content && zone.field !== "qr" && zone.field !== "logo") return null;

  const left = (zone.x / 100) * w;
  const top = (zone.y / 100) * h;
  const width = (zone.w / 100) * w;
  const height = (zone.h / 100) * h;
  const style = inferStyle(zone);
  const pad = zone.padding ?? 0;
  const radius = zone.borderRadius ?? 0;
  const bgColor = zone.bgColor || "";

  // ── QR Code ──────────────────────────────────────────────
  if (zone.field === "qr") {
    return (
      <div
        className="absolute flex items-center justify-center"
        style={{
          left, top, width, height,
          backgroundColor: bgColor || "#ffffff",
          borderRadius: radius || 16,
          padding: pad || Math.min(width, height) * 0.08,
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
        }}
      >
        {data.qrDataUrl ? (
          <img src={data.qrDataUrl} alt="QR Code" className="max-w-full max-h-full object-contain" draggable={false} />
        ) : data.qrCodeSvg ? (
          <div className="max-w-full max-h-full" dangerouslySetInnerHTML={{ __html: data.qrCodeSvg }} />
        ) : null}
      </div>
    );
  }

  // ── Logo ─────────────────────────────────────────────────
  if (zone.field === "logo") {
    return (
      <div
        className="absolute flex items-center justify-center overflow-hidden"
        style={{
          left, top, width, height,
          backgroundColor: bgColor || "#f8fafc",
          borderRadius: radius || 16,
          border: "1px solid rgba(226,232,240,0.6)",
          padding: pad || Math.min(width, height) * 0.1,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {data.logoUrl ? (
          <img src={data.logoUrl} alt={data.companyName} className="max-w-full max-h-full object-contain" draggable={false} />
        ) : (
          <span style={{ fontSize: Math.min(width, height) * 0.45, fontWeight: 700, color: accentColor }}>
            {data.companyName?.charAt(0) ?? "M"}
          </span>
        )}
      </div>
    );
  }

  // ── Company (badge style with "is hiring" sub-label) ────
  if (zone.field === "company" && style === "badge") {
    return (
      <div
        className="absolute flex items-center"
        style={{ left, top, width, height, gap: 6 }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{
            fontSize: zone.fontSize,
            fontWeight: zone.fontWeight || 600,
            color: zone.color,
            lineHeight: 1.2,
          }}>
            {content}
          </span>
          <span style={{
            fontSize: Math.max(9, zone.fontSize * 0.6),
            fontWeight: 600,
            color: accentColor,
            letterSpacing: "0.04em",
            marginTop: 1,
          }}>
            NOW HIRING
          </span>
        </div>
      </div>
    );
  }

  // ── Skills as pills ──────────────────────────────────────
  if (zone.field === "skills" && data.skills?.length) {
    const isPill = style === "pill";
    return (
      <div
        className="absolute flex flex-wrap items-center"
        style={{
          left, top, width, height,
          gap: Math.max(5, zone.fontSize * 0.4),
          padding: pad || 0,
        }}
      >
        {data.skills.slice(0, 8).map((skill) => (
          <span
            key={skill}
            style={{
              display: "inline-block",
              fontSize: zone.fontSize,
              fontWeight: isPill ? 500 : zone.fontWeight,
              color: isPill ? accentColor : zone.color,
              backgroundColor: isPill ? (bgColor || `${accentColor}15`) : "transparent",
              borderRadius: isPill ? (radius || 20) : 0,
              padding: isPill
                ? `${Math.max(3, zone.fontSize * 0.2)}px ${Math.max(8, zone.fontSize * 0.55)}px`
                : undefined,
              border: isPill ? `1px solid ${accentColor}25` : undefined,
              lineHeight: 1.4,
            }}
          >
            {skill}
          </span>
        ))}
      </div>
    );
  }

  // ── CTA Button ───────────────────────────────────────────
  if (style === "button") {
    return (
      <div
        className="absolute flex items-center"
        style={{
          left, top, width, height,
          justifyContent: zone.align === "center" ? "center" : zone.align === "right" ? "flex-end" : "flex-start",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: zone.fontSize,
            fontWeight: zone.fontWeight || 700,
            color: zone.color || "#ffffff",
            backgroundColor: bgColor || accentColor,
            borderRadius: radius || 12,
            padding: pad
              ? `${pad}px ${pad * 2.2}px`
              : `${Math.max(10, zone.fontSize * 0.55)}px ${Math.max(20, zone.fontSize * 1.4)}px`,
            boxShadow: `0 6px 20px ${bgColor || accentColor}45`,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  // ── Info Card (salary, location, experience, workMode) ──
  if (style === "card") {
    const label = FIELD_LABELS[zone.field] ?? zone.field.toUpperCase();
    return (
      <div
        className="absolute overflow-hidden"
        style={{
          left, top, width, height,
          backgroundColor: bgColor || "rgba(248,250,252,0.92)",
          borderRadius: radius || 12,
          border: "1px solid rgba(226,232,240,0.5)",
          padding: pad || Math.max(8, Math.min(width, height) * 0.12),
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{
          fontSize: Math.max(8, zone.fontSize * 0.55),
          fontWeight: 600,
          color: "#94a3b8",
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          marginBottom: 3,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: zone.fontSize,
          fontWeight: zone.fontWeight || 600,
          color: zone.color === "#FFFFFF" || zone.color === "#ffffff" ? "#1e293b" : zone.color,
          lineHeight: 1.25,
        }}>
          {content}
        </div>
      </div>
    );
  }

  // ── Badge ────────────────────────────────────────────────
  if (style === "badge") {
    return (
      <div
        className="absolute flex items-center"
        style={{ left, top, width, height }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: zone.fontSize,
            fontWeight: zone.fontWeight || 600,
            color: zone.color,
            backgroundColor: bgColor || `${accentColor}20`,
            borderRadius: radius || 20,
            padding: pad
              ? `${pad}px ${pad * 1.5}px`
              : `${Math.max(3, zone.fontSize * 0.2)}px ${Math.max(8, zone.fontSize * 0.6)}px`,
            lineHeight: 1.3,
          }}
        >
          {content}
        </span>
      </div>
    );
  }

  // ── Plain text (title, tagline, watermark) ───────────────
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left,
        top,
        width,
        height,
        fontSize: zone.fontSize,
        fontWeight: zone.fontWeight,
        color: zone.color,
        textAlign: zone.align,
        lineHeight: 1.2,
        display: "flex",
        alignItems: "center",
        justifyContent:
          zone.align === "center"
            ? "center"
            : zone.align === "right"
              ? "flex-end"
              : "flex-start",
        backgroundColor: bgColor || undefined,
        borderRadius: radius || undefined,
        padding: pad || undefined,
        letterSpacing: zone.field === "title" ? "-0.02em" : undefined,
      }}
    >
      <span className="w-full">{content}</span>
    </div>
  );
}

function getZoneContent(
  field: string,
  data: PosterData
): string | null {
  switch (field) {
    case "title":
      return data.title || null;
    case "tagline":
      return data.tagline || null;
    case "company":
      return data.companyName || null;
    case "location":
      return data.location || null;
    case "salary":
      return data.salary || null;
    case "skills":
      return data.skills?.length ? data.skills.join(" • ") : null;
    case "cta":
      return data.cta || "Apply Now";
    case "experience":
      return data.experience || null;
    case "workMode":
      return data.workMode || null;
    case "watermark":
      return data.companyName || null;
    default:
      return null;
  }
}
