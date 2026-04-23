"use client";

import type { PosterData } from "../JobPoster";

interface ProfessionalTemplateProps {
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
          backgroundColor: "#ffffff",
          padding: qrSize * 0.08,
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
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
          backgroundColor: "#ffffff",
          padding: qrSize * 0.08,
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        }}
        dangerouslySetInnerHTML={{ __html: data.qrCodeSvg }}
      />
    );
  }
  return null;
}

export function ProfessionalTemplate({ data, size }: ProfessionalTemplateProps) {
  const { width, height } = SIZE_MAP[size];
  const scale = size === "landscape" ? 0.5 : size === "square" ? 0.45 : 0.35;
  const displayW = width * scale;
  const displayH = height * scale;
  const isStory = size === "story";

  const logoSize = displayW * (isStory ? 0.1 : 0.08);
  const qrSize = displayW * (isStory ? 0.14 : 0.12);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: displayW,
        height: displayH,
        background: `linear-gradient(145deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)`,
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Decorative orbs */}
      <div
        className="absolute"
        style={{
          width: displayW * 0.5,
          height: displayW * 0.5,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${data.accentColor}18 0%, transparent 70%)`,
          top: "-10%",
          right: "-10%",
        }}
      />
      <div
        className="absolute"
        style={{
          width: displayW * 0.35,
          height: displayW * 0.35,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${data.accentColor}10 0%, transparent 70%)`,
          bottom: "5%",
          left: "-8%",
        }}
      />

      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: displayH * 0.006,
          background: `linear-gradient(90deg, ${data.accentColor}, ${data.accentColor}88, transparent)`,
        }}
      />

      <div
        className="relative flex h-full flex-col justify-between"
        style={{ padding: `${displayH * 0.055}px ${displayW * 0.055}px` }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center" style={{ gap: displayW * 0.025 }}>
            {data.logoUrl ? (
              <div
                className="flex items-center justify-center overflow-hidden rounded-xl"
                style={{
                  width: logoSize,
                  height: logoSize,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <img
                  src={data.logoUrl}
                  alt=""
                  className="object-contain"
                  style={{ width: logoSize * 0.8, height: logoSize * 0.8 }}
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center rounded-xl font-bold text-white"
                style={{
                  width: logoSize,
                  height: logoSize,
                  background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}bb)`,
                  fontSize: displayW * 0.032,
                }}
              >
                {data.companyName?.charAt(0) ?? "M"}
              </div>
            )}
            <div>
              <div
                className="font-semibold text-white"
                style={{ fontSize: displayW * 0.026, letterSpacing: "-0.01em" }}
              >
                {data.companyName}
              </div>
              <div style={{ fontSize: displayW * 0.015, color: "rgba(255,255,255,0.5)" }}>
                is hiring
              </div>
            </div>
          </div>
          <div
            className="flex items-center rounded-full font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}cc)`,
              padding: `${displayH * 0.01}px ${displayW * 0.025}px`,
              fontSize: displayW * 0.018,
              letterSpacing: "0.06em",
              boxShadow: `0 4px 20px ${data.accentColor}40`,
            }}
          >
            WE&apos;RE HIRING
          </div>
        </div>

        {/* Middle */}
        <div
          className="flex flex-col justify-center"
          style={{ flex: 1, gap: displayH * 0.016, paddingTop: displayH * 0.02, paddingBottom: displayH * 0.02 }}
        >
          <h2
            className="font-bold leading-[1.1] text-white"
            style={{
              fontSize: displayW * (size === "landscape" ? 0.054 : size === "square" ? 0.048 : 0.044),
              letterSpacing: "-0.02em",
            }}
          >
            {data.title}
          </h2>
          {data.tagline && (
            <p className="italic leading-snug" style={{ color: data.accentColor, fontSize: displayW * 0.024, opacity: 0.9 }}>
              {data.tagline}
            </p>
          )}

          {/* Detail pills */}
          <div className="flex flex-wrap" style={{ gap: displayW * 0.012, marginTop: displayH * 0.008 }}>
            {data.location && (
              <span
                className="inline-flex items-center rounded-lg text-white"
                style={{
                  padding: `${displayH * 0.008}px ${displayW * 0.018}px`,
                  fontSize: displayW * 0.018,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  gap: displayW * 0.006,
                }}
              >
                📍 {data.location}
              </span>
            )}
            {data.salary && (
              <span
                className="inline-flex items-center rounded-lg text-white"
                style={{
                  padding: `${displayH * 0.008}px ${displayW * 0.018}px`,
                  fontSize: displayW * 0.018,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  gap: displayW * 0.006,
                }}
              >
                💰 {data.salary}
              </span>
            )}
            {data.workMode && (
              <span
                className="inline-flex items-center rounded-lg text-white"
                style={{
                  padding: `${displayH * 0.008}px ${displayW * 0.018}px`,
                  fontSize: displayW * 0.018,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  gap: displayW * 0.006,
                }}
              >
                🏢 {data.workMode}
              </span>
            )}
            {data.experience && (
              <span
                className="inline-flex items-center rounded-lg text-white"
                style={{
                  padding: `${displayH * 0.008}px ${displayW * 0.018}px`,
                  fontSize: displayW * 0.018,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  gap: displayW * 0.006,
                }}
              >
                📅 {data.experience}
              </span>
            )}
          </div>

          {/* Skills */}
          {data.skills.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: displayW * 0.008, marginTop: displayH * 0.005 }}>
              {data.skills.slice(0, isStory ? 8 : 6).map((skill) => (
                <span
                  key={skill}
                  className="rounded-md font-medium"
                  style={{
                    border: `1px solid ${data.accentColor}44`,
                    backgroundColor: `${data.accentColor}12`,
                    color: data.accentColor,
                    padding: `${displayH * 0.005}px ${displayW * 0.014}px`,
                    fontSize: displayW * 0.016,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* Benefits */}
          {data.benefits.length > 0 && size !== "landscape" && (
            <div className="flex flex-col" style={{ gap: displayH * 0.006, marginTop: displayH * 0.006 }}>
              {data.benefits.slice(0, 4).map((benefit) => (
                <span
                  key={benefit}
                  className="flex items-center"
                  style={{ color: "rgba(255,255,255,0.7)", fontSize: displayW * 0.016, gap: displayW * 0.008 }}
                >
                  <span style={{ color: data.accentColor }}>✓</span> {benefit}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="flex items-end justify-between">
          <div>
            {data.cta && (
              <div
                className="inline-block rounded-xl font-bold text-white"
                style={{
                  background: `linear-gradient(135deg, ${data.accentColor}, ${data.accentColor}dd)`,
                  padding: `${displayH * 0.014}px ${displayW * 0.035}px`,
                  fontSize: displayW * 0.02,
                  boxShadow: `0 4px 16px ${data.accentColor}30`,
                }}
              >
                {data.cta}
              </div>
            )}
            <div style={{ marginTop: displayH * 0.008, fontSize: displayW * 0.012, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
              Powered by MPLOYEDIN
            </div>
          </div>
          <QrBlock data={data} size={qrSize} />
        </div>
      </div>
    </div>
  );
}
