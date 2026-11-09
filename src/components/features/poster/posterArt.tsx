/**
 * Poster layouts with drawn background art: a wave or slanted hero edge, a
 * watermark headline, a dotted backdrop under a floating card, orbit rings and
 * a globe with a flight path.
 *
 * Same rules as BrandPoster, which renders these both in the browser and
 * through next/og (satori): inline styles, flex layout only, every element with
 * more than one child sets display:flex, and art drawn as inline SVG with plain
 * fills (no gradients, patterns or clip paths inside the SVG). Art always comes
 * before a position:relative content wrapper, so text paints on top of it in
 * both renderers.
 */
import type { CSSProperties, ReactNode } from "react";
import { readableTextOn, type BrandKit } from "@/lib/brand/brandKit";
import { alpha, darken, type ArtLayout } from "./posterPalette";

/** The pieces BrandPoster builds once and every layout arranges. */
export interface ArtParts {
  company: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  /** Requirements + QR, then the apply/contact bar. */
  bottom: ReactNode;
  headline: string;
  kit: BrandKit;
  width: number;
  height: number;
  /** 1% of the short side. */
  u: number;
  pad: number;
  landscape: boolean;
  tall: boolean;
  spread: "space-around" | "space-between";
}

const rd = (n: number) => Math.round(n * 10) / 10;

/** A full-size SVG layer behind the content. */
function Art({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${rd(width)} ${rd(height)}`} style={{ position: "absolute", left: 0, top: 0 }}>
      {children}
    </svg>
  );
}

function dots(x: number, y: number, cols: number, rows: number, gap: number, r: number, fill: string, opacity: number): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out.push(<circle key={`d${i}-${j}`} cx={rd(x + i * gap)} cy={rd(y + j * gap)} r={rd(r)} fill={fill} opacity={opacity} />);
    }
  }
  return out;
}

function rings(cx: number, cy: number, radii: number[], stroke: string, width: number, opacities: number[]): ReactNode[] {
  return radii.map((r, i) => (
    <circle key={`r${i}`} cx={rd(cx)} cy={rd(cy)} r={rd(r)} fill="none" stroke={stroke} strokeWidth={rd(width)} opacity={opacities[i] ?? opacities[opacities.length - 1]} />
  ));
}

/** The content layer: relative, so it paints over the art in the browser too. */
function Layer({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", position: "relative", width: "100%", height: "100%", ...style }}>{children}</div>;
}

function Stack({ gap, style, children }: { gap: number; style?: CSSProperties; children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
}

/**
 * The bottom edge of a brand-coloured hero (right edge in landscape): a layered
 * wave or a slant with an accent stripe. Drawn hanging just outside the hero.
 */
function HeroEdge({ kind, horizontal, length, depth, kit }: { kind: "wave" | "slant"; horizontal: boolean; length: number; depth: number; kit: BrandKit }) {
  // a = along the edge (0–1), c = away from the hero (0–1).
  const p = (a: number, c: number) => (horizontal ? `${rd(a * length)} ${rd(c * depth)}` : `${rd(c * depth)} ${rd(a * length)}`);
  const [main, stripe] =
    kind === "wave"
      ? [
          `M${p(0, 0)} L${p(1, 0)} L${p(1, 0.42)} C${p(0.8, 0.82)} ${p(0.62, 0.02)} ${p(0.4, 0.34)} C${p(0.18, 0.66)} ${p(0.08, 0.6)} ${p(0, 0.3)} Z`,
          `M${p(0, 0)} L${p(1, 0)} L${p(1, 0.74)} C${p(0.8, 1)} ${p(0.62, 0.36)} ${p(0.42, 0.64)} C${p(0.22, 0.92)} ${p(0.1, 0.94)} ${p(0, 0.62)} Z`,
        ]
      : [`M${p(0, 0)} L${p(1, 0)} L${p(1, 0.08)} L${p(0, 0.72)} Z`, `M${p(0, 0)} L${p(1, 0)} L${p(1, 0.36)} L${p(0, 1)} Z`];
  const w = horizontal ? length : depth;
  const h = horizontal ? depth : length;
  // Tucked 1px into the hero (same colour there), so no hairline seam shows when the preview is scaled.
  const place: CSSProperties = horizontal ? { left: 0, bottom: -h + 1 } : { top: 0, right: -w + 1 };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${rd(w)} ${rd(h)}`} style={{ position: "absolute", ...place }}>
      <path d={stripe} fill={kit.accent} />
      <path d={main} fill={kit.primary} />
    </svg>
  );
}

/** Wave and Slant: a brand hero (company, kicker, title, chips) over a light bottom with the details. */
function heroLayout(kind: "wave" | "slant", p: ArtParts) {
  const { kit, u, pad, landscape, tall, width, height } = p;
  const fg = readableTextOn(kit.primary);
  const depth = (kind === "slant" ? 10 : landscape ? 7 : 8) * u;
  // Story and A4 have a taller hero: bigger art, and the text centred in it.
  const k = tall ? 1.5 : 1;
  const decorSize = 46 * u * k;
  const decor =
    kind === "wave" ? (
      <svg width={decorSize} height={decorSize} viewBox={`0 0 ${rd(decorSize)} ${rd(decorSize)}`} style={{ position: "absolute", right: 0, top: 0 }}>
        {rings(decorSize, 0, [13 * u * k, 22 * u * k, 31 * u * k, 40 * u * k], fg, 0.45 * u, [0.2, 0.15, 0.1, 0.06])}
        {dots(8 * u * k, 5 * u, 5, 3, 2.8 * u, 0.45 * u, fg, 0.35)}
      </svg>
    ) : (
      <svg width={decorSize} height={decorSize} viewBox={`0 0 ${rd(decorSize)} ${rd(decorSize)}`} style={{ position: "absolute", right: 0, top: 0 }}>
        {[10, 17, 24, 31].map((o, i) => {
          const s = decorSize;
          const t = (i === 1 ? 3.2 : 2.2) * u;
          const off = o * u * k;
          return (
            <path
              key={o}
              d={`M${rd(s - off)} 0 L${rd(s - off + t)} 0 L${rd(s)} ${rd(off - t)} L${rd(s)} ${rd(off)} Z`}
              fill={i === 1 ? kit.accent : fg}
              opacity={i === 1 ? 0.9 : 0.14 - i * 0.02}
            />
          );
        })}
      </svg>
    );

  const hero = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        flex: landscape ? 1.15 : 1,
        background: `linear-gradient(${landscape ? 90 : 180}deg, ${darken(kit.primary, 0.32)}, ${kit.primary})`,
        padding: pad,
        paddingBottom: landscape ? pad : 3 * u,
        paddingRight: landscape ? 3 * u : pad,
      }}
    >
      {decor}
      <HeroEdge kind={kind} horizontal={!landscape} length={landscape ? height : width} depth={depth} kit={kit} />
      <div style={{ display: "flex", flexDirection: "column", position: "relative", flex: 1, justifyContent: tall ? "center" : "space-between", gap: (tall ? 6 : 2.4) * u }}>
        {p.company}
        <Stack gap={2.2 * u}>
          {p.kicker}
          {p.title}
          {p.meta}
        </Stack>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: landscape ? "row" : "column", width: "100%", height: "100%" }}>
      {hero}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          flexGrow: landscape ? 1 : 0,
          flexShrink: landscape ? 1 : 0,
          flexBasis: landscape ? "0%" : "auto",
          padding: pad,
          paddingTop: landscape ? pad : depth + 2 * u,
          paddingLeft: landscape ? depth + 2.5 * u : pad,
        }}
      >
        {p.bottom}
      </div>
    </div>
  );
}

/** Statement: the headline as a huge faded watermark behind the title; details on a white card. */
function statementLayout(p: ArtParts) {
  const { kit, u, pad, landscape, tall, width, height } = p;
  const fg = readableTextOn(kit.primary);
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: -1.5 * u,
          top: (landscape ? 1 : tall ? 16 : 7) * u,
          width: width * 1.6,
          fontSize: (landscape ? 22 : 27) * u,
          fontWeight: 800,
          lineHeight: 0.92,
          letterSpacing: -0.4 * u,
          textTransform: "uppercase",
          color: alpha(fg, 0.1),
        }}
      >
        {p.headline}
      </div>
      <Art width={width} height={height}>
        <circle cx={rd(width)} cy={0} r={rd(15 * u)} fill={kit.accent} opacity={0.9} />
        {rings(width, 0, [22 * u, 29 * u], kit.accent, 0.5 * u, [0.5, 0.25])}
      </Art>
      <Layer style={{ justifyContent: p.spread, gap: 2.4 * u, padding: pad }}>
        <div style={{ display: "flex" }}>{p.company}</div>
        <Stack gap={2.4 * u} style={{ maxWidth: landscape ? "78%" : "100%" }}>
          {p.kicker}
          {p.title}
          {p.meta}
        </Stack>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: kit.background,
            borderRadius: 2.6 * u,
            padding: 3 * u,
            boxShadow: `0 ${rd(1.2 * u)}px ${rd(4 * u)}px rgba(0,0,0,0.25)`,
          }}
        >
          {p.bottom}
        </div>
      </Layer>
    </div>
  );
}

/** Card: a dotted brand backdrop with the company and kicker on top, everything else on a floating card. */
function cardLayout(p: ArtParts) {
  const { kit, u, landscape, tall, width, height } = p;
  const fg = readableTextOn(kit.primary);
  const gap = 4 * u;
  const outer = (landscape ? 4.5 : 5.5) * u;
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <Art width={width} height={height}>
        {dots(gap / 2, gap / 2, Math.ceil(width / gap), Math.ceil(height / gap), gap, 0.34 * u, fg, 0.22)}
        <circle cx={0} cy={rd(height)} r={rd(24 * u)} fill={kit.accent} opacity={0.3} />
        {rings(0, height, [34 * u], kit.accent, 1.4 * u, [0.9])}
        {rings(width, 0, [18 * u, 26 * u], fg, 0.45 * u, [0.22, 0.12])}
      </Art>
      <Layer style={{ gap: 3 * u, padding: outer }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 * u }}>
          {p.company}
          <div style={{ display: "flex" }}>{p.kicker}</div>
        </div>
        {/* The card takes its content's height, centred on the dotted backdrop. */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: (tall ? 6 : 3.5) * u,
              background: kit.background,
              borderRadius: 3 * u,
              padding: (landscape ? 4 : 4.5) * u,
              boxShadow: `0 ${rd(1.4 * u)}px ${rd(5 * u)}px rgba(0,0,0,0.28)`,
            }}
          >
            <Stack gap={2.4 * u}>
              {p.title}
              {p.meta}
            </Stack>
            {p.bottom}
          </div>
        </div>
      </Layer>
    </div>
  );
}

/** Orbit: a light page with a brand circle and rings in the corner. */
function orbitLayout(p: ArtParts) {
  const { kit, u, pad, landscape, width, height } = p;
  const cx = width - 3 * u;
  const cy = 3 * u;
  const at = (r: number, deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  const d1 = at(30 * u, 140);
  const d2 = at(38 * u, 100);
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <Art width={width} height={height}>
        <circle cx={0} cy={rd(height)} r={rd(34 * u)} fill={kit.primary} opacity={0.06} />
        {rings(cx, cy, [30 * u, 38 * u, 46 * u], kit.primary, 0.35 * u, [0.35, 0.2, 0.1])}
        <circle cx={rd(cx)} cy={rd(cy)} r={rd(22 * u)} fill={kit.primary} />
        <circle cx={rd(d1.x)} cy={rd(d1.y)} r={rd(2.4 * u)} fill={kit.accent} />
        <circle cx={rd(d2.x)} cy={rd(d2.y)} r={rd(1.2 * u)} fill={kit.accent} />
        {dots(2.2 * u, height * 0.38, 2, 6, 2.2 * u, 0.4 * u, kit.accent, 0.55)}
      </Art>
      <Layer style={{ justifyContent: p.spread, padding: pad, gap: 2.4 * u }}>
        <div style={{ display: "flex" }}>{p.company}</div>
        <Stack gap={2.6 * u} style={{ maxWidth: landscape ? "70%" : "86%" }}>
          {p.kicker}
          {p.title}
          <div style={{ display: "flex", width: 14 * u, height: 0.9 * u, background: kit.accent, borderRadius: u }} />
          {p.meta}
        </Stack>
        <div style={{ display: "flex", flexDirection: "column" }}>{p.bottom}</div>
      </Layer>
    </div>
  );
}

/** lucide "plane" (ISC), drawn in its 24×24 box. */
const PLANE =
  "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";

/** Global: a dark brand page with a globe wireframe and a dashed flight path, for jobs abroad. */
function globalLayout(p: ArtParts) {
  const { kit, u, pad, landscape, width, height } = p;
  const R = (landscape ? 34 : 30) * u;
  const gx = width - (landscape ? 16 : 12) * u;
  const gy = (landscape ? 30 : 20) * u;
  const line = { fill: "none", stroke: "#ffffff", strokeWidth: rd(0.3 * u) };
  const latitudes = [-0.55, 0, 0.55].map((o) => ({ cy: gy + o * R, rx: R * Math.sqrt(1 - o * o) }));
  const start = { x: width * (landscape ? 0.5 : 0.42), y: 9 * u };
  const end = { x: gx - R * 0.72, y: gy - R * 0.42 };
  const ctrl = { x: (start.x + end.x) / 2, y: -3 * u };
  const plane = 4.6 * u;
  // Corners and margins only, never under text.
  const stars: [number, number][] = [[0.33, 0.03], [0.58, 0.03], [0.96, 0.62], [0.97, 0.48], [0.035, 0.5], [0.03, 0.7]];
  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <Art width={width} height={height}>
        <circle cx={0} cy={rd(height)} r={rd(42 * u)} fill={kit.accent} opacity={0.14} />
        {stars.map(([x, y]) => (
          <circle key={`s${x}`} cx={rd(width * x)} cy={rd(height * y)} r={rd(0.4 * u)} fill="#ffffff" opacity={0.4} />
        ))}
        <circle cx={rd(gx)} cy={rd(gy)} r={rd(R)} fill="#ffffff" opacity={0.04} />
        <circle cx={rd(gx)} cy={rd(gy)} r={rd(R)} {...line} opacity={0.3} />
        {[0.32, 0.66].map((k) => (
          <ellipse key={`m${k}`} cx={rd(gx)} cy={rd(gy)} rx={rd(R * k)} ry={rd(R)} {...line} opacity={0.18} />
        ))}
        <path d={`M${rd(gx)} ${rd(gy - R)} L${rd(gx)} ${rd(gy + R)}`} {...line} opacity={0.18} />
        {latitudes.map((l) => (
          <ellipse key={`l${l.cy}`} cx={rd(gx)} cy={rd(l.cy)} rx={rd(l.rx)} ry={rd(l.rx * 0.14)} {...line} opacity={0.18} />
        ))}
        <path
          d={`M${rd(start.x)} ${rd(start.y)} Q${rd(ctrl.x)} ${rd(ctrl.y)} ${rd(end.x)} ${rd(end.y)}`}
          fill="none"
          stroke={kit.accent}
          strokeWidth={rd(0.45 * u)}
          strokeDasharray={`${rd(1.4 * u)} ${rd(1.2 * u)}`}
          strokeLinecap="round"
          opacity={0.85}
        />
        <circle cx={rd(end.x)} cy={rd(end.y)} r={rd(1.1 * u)} fill={kit.accent} />
        {rings(end.x, end.y, [2.2 * u], kit.accent, 0.3 * u, [0.6])}
        <path
          d={PLANE}
          transform={`translate(${rd(start.x - plane / 2)} ${rd(start.y - plane / 2)}) scale(${rd(plane / 24)})`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.8}
          strokeLinejoin="round"
          opacity={0.9}
        />
      </Art>
      <Layer style={{ justifyContent: p.spread, padding: pad, gap: 2.4 * u }}>
        <div style={{ display: "flex" }}>{p.kicker}</div>
        <Stack gap={2.6 * u} style={{ maxWidth: landscape ? "72%" : "100%" }}>
          {p.title}
          {p.meta}
          {p.company}
        </Stack>
        <div style={{ display: "flex", flexDirection: "column" }}>{p.bottom}</div>
      </Layer>
    </div>
  );
}

export function renderArtLayout(layout: ArtLayout, parts: ArtParts): ReactNode {
  switch (layout) {
    case "slant":
      return heroLayout("slant", parts);
    case "statement":
      return statementLayout(parts);
    case "card":
      return cardLayout(parts);
    case "orbit":
      return orbitLayout(parts);
    case "global":
      return globalLayout(parts);
    case "wave":
    default:
      return heroLayout("wave", parts);
  }
}
