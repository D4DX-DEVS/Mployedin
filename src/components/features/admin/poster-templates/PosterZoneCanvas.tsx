"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Move, ScanLine } from "lucide-react";
import type { TextZone } from "@/hooks/usePosterTemplates";

const CANVAS_SIZES = {
  landscape: { w: 640, h: 360 },
  square: { w: 480, h: 480 },
  story: { w: 360, h: 640 },
} as const;

function snap(value: number) {
  return Math.round(value / 2) * 2;
}

const ZONE_LABELS: Record<string, string> = {
  title: "Title",
  tagline: "Tagline",
  company: "Company",
  location: "Location",
  salary: "Salary",
  skills: "Skills",
  cta: "CTA",
  qr: "QR Code",
  logo: "Logo",
  experience: "Experience",
  workMode: "Work Mode",
  watermark: "Watermark",
};

interface Props {
  bgUrl?: string;
  size: "landscape" | "square" | "story";
  zones: TextZone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onUpdateZone: (id: string, update: Partial<TextZone>) => void;
}

export default function PosterZoneCanvas({
  bgUrl,
  size,
  zones,
  selectedZoneId,
  onSelectZone,
  onUpdateZone,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const { w: canvasW, h: canvasH } = CANVAS_SIZES[size];
  const visibleZones = zones.filter((zone) => zone.visible);
  const [frameWidth, setFrameWidth] = useState<number>(canvasW);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth > 0) {
        setFrameWidth(nextWidth);
      }
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);

      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [canvasW]);

  const scale = Math.min(1, frameWidth / canvasW);
  const displayW = Math.max(1, Math.round(canvasW * scale));
  const displayH = Math.max(1, Math.round(canvasH * scale));

  const toPixel = useCallback(
    (pct: number, axis: "x" | "y") => (pct / 100) * (axis === "x" ? displayW : displayH),
    [displayH, displayW]
  );
  const toPct = useCallback(
    (px: number, axis: "x" | "y") => snap((px / (axis === "x" ? displayW : displayH)) * 100),
    [displayH, displayW]
  );

  return (
    <div ref={frameRef} className="flex w-full flex-col items-center gap-3">
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(241,245,249,0.95))] shadow-[0_32px_70px_-46px_rgba(15,23,42,0.45)]"
        style={{ width: displayW, height: displayH }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onSelectZone(null);
          }
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
          <div className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm backdrop-blur">
            {size}
          </div>
          <div className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm backdrop-blur">
            {visibleZones.length} visible zone{visibleZones.length === 1 ? "" : "s"}
          </div>
        </div>

        {bgUrl && (
          <img
            src={bgUrl}
            alt="Template background"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        )}

        {!bgUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(226,232,240,0.86))]">
            <div className="max-w-[270px] rounded-[28px] border border-white/80 bg-white/85 px-6 py-7 text-center shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <ImagePlus className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-950">Upload a background to start designing</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                You can still add zones now, but the image preview makes spacing, alignment, and contrast much easier to judge.
              </p>
            </div>
          </div>
        )}

        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]">
          {Array.from({ length: 49 }, (_, index) => {
            const pct = (index + 1) * 2;

            return (
              <g key={index}>
                <line x1={`${pct}%`} y1="0" x2={`${pct}%`} y2="100%" stroke="#888" strokeWidth="0.5" />
                <line x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke="#888" strokeWidth="0.5" />
              </g>
            );
          })}
        </svg>

        {visibleZones.map((zone) => (
          <DraggableZone
            key={zone.id}
            zone={zone}
            canvasW={displayW}
            canvasH={displayH}
            isSelected={zone.id === selectedZoneId}
            onSelect={() => onSelectZone(zone.id)}
            toPixel={toPixel}
            toPct={toPct}
            onUpdate={(update) => onUpdateZone(zone.id, update)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag to position. Resize from the lower-right handle. Snap spacing follows a 2% grid.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-1">
          <Move className="h-3.5 w-3.5" />
          Move layers directly on the canvas
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-1">
          <ScanLine className="h-3.5 w-3.5" />
          Grid helps keep margins consistent
        </span>
      </div>
    </div>
  );
}

function DraggableZone({
  zone,
  canvasW,
  canvasH,
  isSelected,
  onSelect,
  toPixel,
  toPct,
  onUpdate,
}: {
  zone: TextZone;
  canvasW: number;
  canvasH: number;
  isSelected: boolean;
  onSelect: () => void;
  toPixel: (pct: number, axis: "x" | "y") => number;
  toPct: (px: number, axis: "x" | "y") => number;
  onUpdate: (u: Partial<TextZone>) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);

  const px = toPixel(zone.x, "x");
  const py = toPixel(zone.y, "y");
  const pw = toPixel(zone.w, "x");
  const ph = toPixel(zone.h, "y");

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return (
    <motion.div
      className={`absolute group flex cursor-move select-none items-center justify-center ${
        isSelected
          ? "z-20 ring-2 ring-sky-500 ring-offset-2 ring-offset-white/40"
          : "z-10 ring-1 ring-white/50 hover:ring-white/80"
      }`}
      style={{
        left: px,
        top: py,
        width: pw,
        height: ph,
        backgroundColor: isSelected ? "rgba(14,165,233,0.18)" : "rgba(255,255,255,0.12)",
        backdropFilter: "blur(4px)",
        borderRadius: 18,
        border: isSelected
          ? "1px solid rgba(14,165,233,0.45)"
          : "1px solid rgba(255,255,255,0.35)",
        boxShadow:
          isDragging || isResizing
            ? "0 20px 40px -26px rgba(15,23,42,0.55)"
            : "0 16px 30px -24px rgba(15,23,42,0.45)",
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      drag
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{
        left: -px,
        top: -py,
        right: canvasW - px - pw,
        bottom: canvasH - py - ph,
      }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={(_, info) => {
        setIsDragging(false);
        const newX = toPct(px + info.offset.x, "x");
        const newY = toPct(py + info.offset.y, "y");
        onUpdate({
          x: Math.max(0, Math.min(100 - zone.w, newX)),
          y: Math.max(0, Math.min(100 - zone.h, newY)),
        });
      }}
    >
      <span
        className="pointer-events-none truncate rounded-full border border-white/30 bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white drop-shadow-md"
        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
      >
        {ZONE_LABELS[zone.field] ?? zone.field}
      </span>

      {isSelected && (
        <div
          className="absolute bottom-1.5 right-1.5 z-30 h-4 w-4 cursor-nwse-resize rounded-full border border-white/60 bg-sky-500 shadow-md"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
            setIsResizing(true);
            startRef.current = { x: event.clientX, y: event.clientY, w: pw, h: ph };
            const zoneElement = event.currentTarget.parentElement;

            const onMove = (moveEvent: PointerEvent) => {
              const newW = Math.max(30, startRef.current.w + (moveEvent.clientX - startRef.current.x));
              const newH = Math.max(20, startRef.current.h + (moveEvent.clientY - startRef.current.y));
              if (zoneElement) {
                zoneElement.style.width = `${newW}px`;
                zoneElement.style.height = `${newH}px`;
              }
            };

            const cleanup = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };

            const onUp = (upEvent: PointerEvent) => {
              setIsResizing(false);
              cleanup();
              cleanupRef.current = null;
              const finalW = toPct(
                Math.max(30, startRef.current.w + (upEvent.clientX - startRef.current.x)),
                "x"
              );
              const finalH = toPct(
                Math.max(20, startRef.current.h + (upEvent.clientY - startRef.current.y)),
                "y"
              );
              onUpdate({
                w: Math.min(100 - zone.x, finalW),
                h: Math.min(100 - zone.y, finalH),
              });
            };

            cleanupRef.current = cleanup;
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      )}
    </motion.div>
  );
}
