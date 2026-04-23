"use client";

import type { PosterData } from "../JobPoster";

interface CleanTemplateProps {
  data: PosterData;
  size: "landscape" | "square" | "story";
}

const SIZE_MAP = {
  landscape: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

function QrBlock({ data, size: qrSize }: { data: PosterData; size: number }) {
  if (data.qrDataUrl) {
    return (
      <div
        className="overflow-hidden rounded-xl"
        style={{
          width: qrSize,
          height: qrSize,
          border: "1px solid #e5e7eb",
          padding: qrSize * 0.08,
        }}
      >
        <img src={data.qrDataUrl} alt="Scan to apply" className="h-full w-full object-contain" />
      </div>
    );
  }
  if (data.qrCodeSvg) {
    return (
      <div
        className="overflow-hidden rounded-xl"
        style={{
          width: qrSize,
          height: qrSize,
          border: "1px solid #e5e7eb",
          padding: qrSize * 0.08,
        }}
        dangerouslySetInnerHTML={{ __html: data.qrCodeSvg }}
      />
    );
  }
  return null;
}

export function CleanTemplate({ data, size }: CleanTemplateProps) {
  const { width, height } = SIZE_MAP[size];
  const scale = size === "landscape" ? 0.5 : size === "square" ? 0.45 : 0.35;
  const displayW = width * scale;
  const displayH = height * scale;
  const isStory = size === "story";

  const logoSize = displayW * (isStory ? 0.12 : 0.1);
  const qrSize = displayW * 0.11;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: displayW,
        height: displayH,
        backgroundColor: "#ffffff",
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Left accent strip */}
      <div
        className="absolute left-0 top-0 bottom-0"
        style={{ width: displayW * 0.012, backgroundColor: data.accentColor }}
      />

      {/* Subtle top-right watermark circle */}
      <div
        className="absolute"
        style={{
          width: displayW * 0.3,
          height: displayW * 0.3,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${data.accentColor}08 0%, transparent 70%)`,
          top: "-5%",
          right: "-5%",
        }}
      />

      <div
        className="relative flex h-full flex-col justify-between"
        style={{
          padding: `${displayH * 0.06}px ${displayW * 0.06}px`,
          paddingLeft: displayW * 0.055,
        }}
      >
        {/* Header — Logo + Company */}
        <div className="flex items-center" style={{ gap: displayW * 0.025 }}>
          {data.logoUrl ? (
            <div
              className="flex items-center justify-center overflow-hidden rounded-2xl"
              style={{
                width: logoSize,
                height: logoSize,
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            >
              <img
                src={data.logoUrl}
                alt=""
                className="object-contain"
                style={{ width: logoSize * 0.75, height: logoSize * 0.75 }}
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded-2xl font-bold text-white"
              style={{
                width: logoSize,
                height: logoSize,
                background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}cc)`,
                fontSize: displayW * 0.04,
              }}
            >
              {data.companyName?.charAt(0) ?? "M"}
            </div>
          )}
          <div>
            <div
              className="font-semibold"
              style={{ fontSize: displayW * 0.028, color: "#1e293b", letterSpacing: "-0.01em" }}
            >
              {data.companyName}
            </div>
            <div
              className="font-medium"
              style={{ fontSize: displayW * 0.016, color: data.accentColor, letterSpacing: "0.04em" }}
            >
              NOW HIRING
            </div>
          </div>
        </div>

        {/* Middle — Title + Tagline + Details */}
        <div
          className="flex flex-col justify-center"
          style={{ flex: 1, gap: displayH * 0.018, paddingTop: displayH * 0.02, paddingBottom: displayH * 0.02 }}
        >
          <h2
            className="font-bold leading-[1.15]"
            style={{
              fontSize: displayW * (size === "landscape" ? 0.05 : size === "square" ? 0.046 : 0.042),
              color: "#0f172a",
              letterSpacing: "-0.02em",
            }}
          >
            {data.title}
          </h2>
          {data.tagline && (
            <p
              className="leading-snug"
              style={{ fontSize: displayW * 0.022, color: "#64748b" }}
            >
              {data.tagline}
            </p>
          )}

          {/* Structured details grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: size === "landscape" ? "1fr 1fr 1fr 1fr" : "1fr 1fr",
              gap: `${displayH * 0.012}px`,
              marginTop: displayH * 0.008,
            }}
          >
            {data.salary && (
              <div
                className="rounded-xl"
                style={{
                  padding: `${displayH * 0.012}px ${displayW * 0.018}px`,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: displayW * 0.013, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>
                  SALARY
                </div>
                <div style={{ fontSize: displayW * 0.018, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>
                  {data.salary}
                </div>
              </div>
            )}
            {data.location && (
              <div
                className="rounded-xl"
                style={{
                  padding: `${displayH * 0.012}px ${displayW * 0.018}px`,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: displayW * 0.013, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>
                  LOCATION
                </div>
                <div style={{ fontSize: displayW * 0.018, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>
                  {data.location}
                </div>
              </div>
            )}
            {data.experience && (
              <div
                className="rounded-xl"
                style={{
                  padding: `${displayH * 0.012}px ${displayW * 0.018}px`,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: displayW * 0.013, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>
                  EXPERIENCE
                </div>
                <div style={{ fontSize: displayW * 0.018, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>
                  {data.experience}
                </div>
              </div>
            )}
            {data.workMode && (
              <div
                className="rounded-xl"
                style={{
                  padding: `${displayH * 0.012}px ${displayW * 0.018}px`,
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: displayW * 0.013, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>
                  WORK MODE
                </div>
                <div style={{ fontSize: displayW * 0.018, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>
                  {data.workMode}
                </div>
              </div>
            )}
          </div>

          {/* Skills */}
          {data.skills.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: displayW * 0.008, marginTop: displayH * 0.005 }}>
              {data.skills.slice(0, isStory ? 8 : 6).map((skill) => (
                <span
                  key={skill}
                  className="rounded-lg font-medium"
                  style={{
                    backgroundColor: `${data.accentColor}10`,
                    color: data.accentColor,
                    padding: `${displayH * 0.005}px ${displayW * 0.014}px`,
                    fontSize: displayW * 0.015,
                    border: `1px solid ${data.accentColor}20`,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Benefits */}
          {data.benefits.length > 0 && size !== "landscape" && (
            <div className="flex flex-col" style={{ gap: displayH * 0.005, marginTop: displayH * 0.004 }}>
              {data.benefits.slice(0, 4).map((b) => (
                <div key={b} className="flex items-center" style={{ gap: displayW * 0.008, fontSize: displayW * 0.016 }}>
                  <span
                    className="flex items-center justify-center rounded-full"
                    style={{
                      width: displayW * 0.024,
                      height: displayW * 0.024,
                      backgroundColor: `${data.accentColor}15`,
                      color: data.accentColor,
                      fontSize: displayW * 0.012,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ color: "#475569" }}>{b}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom — QR + CTA + Watermark */}
        <div className="flex items-end justify-between">
          <div className="flex items-center" style={{ gap: displayW * 0.025 }}>
            <QrBlock data={data} size={qrSize} />
            {data.cta && (
              <div
                className="rounded-xl font-bold text-white"
                style={{
                  background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}dd)`,
                  padding: `${displayH * 0.013}px ${displayW * 0.03}px`,
                  fontSize: displayW * 0.019,
                  boxShadow: `0 4px 16px ${data.accentColor}25`,
                }}
              >
                {data.cta}
              </div>
            )}
          </div>
          <div style={{ fontSize: displayW * 0.012, color: "#cbd5e1", letterSpacing: "0.06em" }}>
            Powered by MPLOYEDIN
          </div>
        </div>
      </div>
    </div>
  );
}
