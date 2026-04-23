"use client";

import type { PosterData } from "../JobPoster";

interface SocialTemplateProps {
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
        className="overflow-hidden rounded-2xl"
        style={{
          width: qrSize,
          height: qrSize,
          backgroundColor: "#ffffff",
          padding: qrSize * 0.1,
          boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        }}
      >
        <img src={data.qrDataUrl} alt="Scan to apply" className="h-full w-full object-contain" />
      </div>
    );
  }
  if (data.qrCodeSvg) {
    return (
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          width: qrSize,
          height: qrSize,
          backgroundColor: "#ffffff",
          padding: qrSize * 0.1,
          boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        }}
        dangerouslySetInnerHTML={{ __html: data.qrCodeSvg }}
      />
    );
  }
  return null;
}

export function SocialTemplate({ data, size }: SocialTemplateProps) {
  const { width, height } = SIZE_MAP[size];
  const scale = size === "landscape" ? 0.5 : size === "square" ? 0.45 : 0.35;
  const displayW = width * scale;
  const displayH = height * scale;
  const isStory = size === "story";

  const logoSize = displayW * (isStory ? 0.1 : 0.08);
  const qrSize = displayW * (isStory ? 0.16 : 0.13);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: displayW,
        height: displayH,
        background: `linear-gradient(160deg, ${data.accentColor} 0%, ${data.accentColor}cc 35%, #1e1b4b 100%)`,
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Decorative blurred circles */}
      <div
        className="absolute"
        style={{
          width: displayW * 0.4,
          height: displayW * 0.4,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          top: "-8%",
          right: "-8%",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute"
        style={{
          width: displayW * 0.35,
          height: displayW * 0.35,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.15)",
          bottom: "5%",
          left: "-10%",
          filter: "blur(40px)",
        }}
      />

      {/* Semi-transparent logo watermark */}
      {data.logoUrl && (
        <img
          src={data.logoUrl}
          alt=""
          className="absolute"
          style={{
            width: displayW * 0.5,
            height: displayW * 0.5,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.04,
            objectFit: "contain",
          }}
        />
      )}

      <div
        className="relative flex h-full flex-col items-center justify-between text-center"
        style={{ padding: `${displayH * 0.06}px ${displayW * 0.07}px` }}
      >
        {/* Top — Company */}
        <div className="flex items-center" style={{ gap: displayW * 0.02 }}>
          {data.logoUrl ? (
            <div
              className="flex items-center justify-center overflow-hidden rounded-xl"
              style={{
                width: logoSize,
                height: logoSize,
                backgroundColor: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
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
              className="flex items-center justify-center rounded-xl font-bold text-white"
              style={{
                width: logoSize,
                height: logoSize,
                backgroundColor: "rgba(255,255,255,0.15)",
                fontSize: displayW * 0.035,
              }}
            >
              {data.companyName?.charAt(0) ?? "M"}
            </div>
          )}
          <div className="text-left">
            <div className="font-semibold text-white" style={{ fontSize: displayW * 0.026 }}>
              {data.companyName}
            </div>
            <div
              className="font-bold"
              style={{
                fontSize: displayW * 0.013,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.1em",
              }}
            >
              JOIN OUR TEAM
            </div>
          </div>
        </div>

        {/* Middle — Hero text */}
        <div
          className="flex flex-col items-center justify-center"
          style={{ flex: 1, gap: displayH * 0.018, paddingTop: displayH * 0.015, paddingBottom: displayH * 0.015 }}
        >
          {data.tagline && (
            <p
              className="font-extrabold leading-[1.05]"
              style={{
                fontSize: displayW * (size === "square" ? 0.06 : isStory ? 0.05 : 0.048),
                color: "#ffffff",
                letterSpacing: "-0.02em",
                textShadow: "0 2px 20px rgba(0,0,0,0.15)",
              }}
            >
              {data.tagline}
            </p>
          )}
          <h2
            className="font-bold leading-tight"
            style={{
              fontSize: displayW * 0.034,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {data.title}
          </h2>

          {/* Stats row */}
          <div
            className="flex items-center justify-center flex-wrap rounded-2xl"
            style={{
              gap: displayW * 0.03,
              marginTop: displayH * 0.01,
              backgroundColor: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(8px)",
              padding: `${displayH * 0.015}px ${displayW * 0.04}px`,
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {data.salary && (
              <div className="flex flex-col items-center">
                <span style={{ fontSize: displayW * 0.014, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  SALARY
                </span>
                <span className="font-bold text-white" style={{ fontSize: displayW * 0.02 }}>
                  {data.salary}
                </span>
              </div>
            )}
            {data.salary && data.location && (
              <div style={{ width: 1, height: displayH * 0.03, backgroundColor: "rgba(255,255,255,0.2)" }} />
            )}
            {data.location && (
              <div className="flex flex-col items-center">
                <span style={{ fontSize: displayW * 0.014, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  LOCATION
                </span>
                <span className="font-bold text-white" style={{ fontSize: displayW * 0.02 }}>
                  {data.location}
                </span>
              </div>
            )}
            {data.location && data.experience && (
              <div style={{ width: 1, height: displayH * 0.03, backgroundColor: "rgba(255,255,255,0.2)" }} />
            )}
            {data.experience && (
              <div className="flex flex-col items-center">
                <span style={{ fontSize: displayW * 0.014, color: "rgba(255,255,255,0.6)", fontWeight: 600, letterSpacing: "0.04em" }}>
                  EXPERIENCE
                </span>
                <span className="font-bold text-white" style={{ fontSize: displayW * 0.02 }}>
                  {data.experience}
                </span>
              </div>
            )}
          </div>

          {/* Skills */}
          {data.skills.length > 0 && (
            <div style={{ fontSize: displayW * 0.017, color: "rgba(255,255,255,0.7)", marginTop: displayH * 0.005 }}>
              {data.skills.slice(0, 5).join("  ·  ")}
            </div>
          )}
        </div>

        {/* Bottom — CTA + QR + Watermark */}
        <div className="flex flex-col items-center" style={{ gap: displayH * 0.012 }}>
          {data.cta && (
            <div
              className="rounded-full font-bold"
              style={{
                backgroundColor: "white",
                color: "#1e1b4b",
                padding: `${displayH * 0.013}px ${displayW * 0.065}px`,
                fontSize: displayW * 0.022,
                boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
                letterSpacing: "-0.01em",
              }}
            >
              {data.cta}
            </div>
          )}
          <QrBlock data={data} size={qrSize} />
          <div style={{ fontSize: displayW * 0.012, color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em" }}>
            Powered by MPLOYEDIN
          </div>
        </div>
      </div>
    </div>
  );
}
