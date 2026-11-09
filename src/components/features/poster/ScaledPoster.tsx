"use client";

import { useEffect, useRef, useState } from "react";
import { BrandPoster, type BrandPosterProps } from "./BrandPoster";

/**
 * A BrandPoster drawn at its real pixel size and scaled down to the box it
 * sits in, so the preview is exactly what the PNG export and the server image
 * produce: same component, same numbers, only a CSS transform in between.
 */
export function ScaledPoster(props: BrandPosterProps & { className?: string; label?: string }) {
  const { className, label, ...poster } = props;
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / poster.width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [poster.width]);

  return (
    <div
      ref={box}
      role="img"
      aria-label={label}
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: `${poster.width} / ${poster.height}` }}
    >
      {scale > 0 && (
        <div aria-hidden style={{ position: "absolute", left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <BrandPoster {...poster} />
        </div>
      )}
    </div>
  );
}
