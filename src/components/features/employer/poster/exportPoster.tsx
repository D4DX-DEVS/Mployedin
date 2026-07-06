import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { PosterOverlay } from "./PosterOverlay";
import { proxiedImageUrl } from "@/lib/composer/branding";
import { FORMAT_DIMENSIONS } from "@/lib/composer/types";
import type { PosterFormat, PosterType, PosterLayout, ShowFields, PosterStyleOverrides } from "@/lib/composer/types";

type PosterJob = {
  title?: string;
  companyName?: string;
  logo?: string;
  location?: { city?: string; country?: string };
  salary?: { min?: number; max?: number; currency?: string };
  experienceMin?: number;
  experienceMax?: number;
  skills?: string[];
} | null;

interface ExportArgs {
  format: PosterFormat;
  backgroundUrl: string;
  job: PosterJob;
  posterType: PosterType;
  showFields: ShowFields;
  layout: PosterLayout;
  qrDataUrl?: string;
  style?: PosterStyleOverrides;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Resolve when the image is fully loaded. `required` images reject on error; optional ones resolve. */
function waitForImage(img: HTMLImageElement, required: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => img.decode().then(() => resolve(), () => resolve());
    if (img.complete) {
      if (img.naturalWidth > 0) return void done();
      if (required) return reject(new Error("Background image failed to load"));
      return resolve();
    }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => (required ? reject(new Error("Background image failed to load")) : resolve()), { once: true });
  });
}

/**
 * Render the poster off-screen at the format's real pixel dimensions and export a PNG.
 * Preview and export share the SAME PosterOverlay + data — only the render size differs.
 * The AI background is a real <img> (CSS background-image is unreliable in html-to-image);
 * if it can't load, the export aborts instead of silently producing a blank poster.
 */
export async function exportPosterPng(args: ExportArgs): Promise<string> {
  const { width, height } = FORMAT_DIMENSIONS[args.format];

  const container = document.createElement("div");
  // Off-screen but still rendered (display:none breaks DOM capture). Not scaled.
  container.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  document.body.appendChild(container);

  const stage = document.createElement("div");
  stage.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;container-type:size;background:#0b0b0f;`;
  container.appendChild(stage);

  const root = createRoot(stage);
  try {
    root.render(
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxiedImageUrl(args.backgroundUrl)}
          crossOrigin="anonymous"
          data-required="true"
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <PosterOverlay
          job={args.job}
          posterType={args.posterType}
          showFields={args.showFields}
          layout={args.layout}
          format={args.format}
          qrDataUrl={args.qrDataUrl}
          style={args.style}
        />
      </>,
    );

    await nextFrame();
    await (document.fonts?.ready ?? Promise.resolve());

    const imgs = Array.from(stage.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => waitForImage(img, img.dataset.required === "true")));

    return await toPng(stage, { width, height, pixelRatio: 1, cacheBust: false });
  } finally {
    root.unmount();
    container.remove();
  }
}
