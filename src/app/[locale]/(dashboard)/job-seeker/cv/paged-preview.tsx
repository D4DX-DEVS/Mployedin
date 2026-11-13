"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { FormattingOptions } from "./types";
import { getMarginPx, getPageWidthPx } from "./types";

/** Never end a page before this share of it is filled. */
const MIN_FILL = 0.4;
/** A title this close above a page end counts as stranded there. */
const HEADING_GAP = 28;
/** Safety cap on sheets. */
const MAX_PAGES = 20;

interface PagedPreviewProps {
  children: ReactNode;
  formatting: FormattingOptions;
  /** Template prints edge to edge (no page margin), like the Modern PDF. */
  bleed?: boolean;
  /** Label under each sheet, e.g. "Page 2". */
  pageLabel: (n: number) => string;
}

/** Height ÷ width of the page. A4 = 297/210, Letter = 11/8.5. */
function pageRatio(formatting: FormattingOptions): number {
  return formatting.pageFormat === "letter" ? 11 / 8.5 : 297 / 210;
}

/**
 * Shows the CV as separate sheets the way the downloaded PDF reads.
 *
 * The CV is laid out at the real paper width (A4 or Letter at 96dpi) with the
 * chosen page margin, then scaled down to fit the panel, so lines wrap where
 * they wrap on paper instead of wherever the panel happens to be. One hidden
 * copy finds where each page ends: a page stops above any line, heading or
 * entry that would cross the bottom margin, so nothing is sliced in half.
 * Each sheet then shows its own window of that same layout.
 */
export function PagedPreview({ children, formatting, bleed = false, pageLabel }: PagedPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [breaks, setBreaks] = useState<number[]>([0]);
  const [contentHeight, setContentHeight] = useState(0);

  const pageWidth = getPageWidthPx(formatting);
  const pageHeight = Math.round(pageWidth * pageRatio(formatting));
  const margin = bleed ? 0 : getMarginPx(formatting);
  const pageBody = pageHeight - margin * 2;
  const scale = frameWidth > 0 ? frameWidth / pageWidth : 0;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setFrameWidth(host.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Re-find the page ends whenever the laid-out CV changes size.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || pageBody <= 0) return;
    const compute = () => {
      const total = el.scrollHeight;
      const origin = el.getBoundingClientRect().top;
      // Pieces that must stay whole: elements holding text, and leaf boxes.
      const blocks: { top: number; bottom: number }[] = [];
      el.querySelectorAll<HTMLElement>("*").forEach((node) => {
        if (node.children.length > 0 && !hasDirectText(node)) return;
        const r = node.getBoundingClientRect();
        if (r.height <= 0 || r.height > pageBody * 0.5) return;
        blocks.push({ top: r.top - origin, bottom: r.bottom - origin });
      });
      const headings = [...el.querySelectorAll<HTMLElement>("h2, h3, h4")].map((node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top - origin, bottom: r.bottom - origin };
      });
      const next: number[] = [0];
      let start = 0;
      while (start + pageBody < total && next.length < MAX_PAGES) {
        const limit = start + pageBody;
        let cut = limit;
        for (const b of blocks) {
          if (b.top < cut && b.bottom > limit && b.top > start + pageBody * MIN_FILL) cut = b.top;
        }
        // Never end a page on a section title: move it to the next page with
        // its first entry, as the PDF does (KeepWithFirst).
        for (const h of headings) {
          if (h.bottom <= cut && h.bottom > cut - HEADING_GAP && h.top > start + pageBody * MIN_FILL) cut = h.top;
        }
        cut = Math.floor(cut);
        next.push(cut);
        start = cut;
      }
      setContentHeight(total);
      setBreaks((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageBody, pageWidth, margin, children]);

  return (
    <div ref={hostRef} className="relative w-full">
      {/* Unscaled copy at paper width, used only for measuring. */}
      <div aria-hidden="true" inert className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden">
        <div ref={measureRef} className="bg-white" style={{ width: pageWidth - margin * 2 }}>
          {children}
        </div>
      </div>

      {scale > 0 && (
        <div className="space-y-3">
          {breaks.map((start, i) => {
            const end = breaks[i + 1] ?? contentHeight;
            return (
              <div key={i}>
                <div
                  className="relative overflow-hidden bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.06)] ring-1 ring-black/5"
                  style={{ width: frameWidth, height: pageHeight * scale }}
                  // Only the first sheet is read out; the rest repeat the same CV.
                  aria-hidden={i > 0 ? true : undefined}
                  inert={i > 0 ? true : undefined}
                >
                  <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{ width: pageWidth, height: pageHeight, transform: `scale(${scale})` }}
                  >
                    <div
                      className="absolute overflow-hidden"
                      style={{ top: margin, left: margin, right: margin, height: Math.max(0, end - start) }}
                    >
                      <div style={{ transform: `translateY(${-start}px)` }}>{children}</div>
                    </div>
                  </div>
                </div>
                {breaks.length > 1 && (
                  <p className="pt-1 text-center text-[0.65rem] text-muted-foreground">{pageLabel(i + 1)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function hasDirectText(node: HTMLElement): boolean {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return true;
  }
  return false;
}
