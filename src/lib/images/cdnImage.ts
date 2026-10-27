import { r2PublicHost } from "@/lib/storage/storageConfig";

/**
 * Cloudflare Image Transformations for images on our R2 public host: the CDN
 * resizes on delivery and picks AVIF/WebP per browser (format=auto), so the app
 * server never resizes and the stored original stays JPEG/PNG (lib/storage/optimizeImage.ts).
 *
 * Off unless NEXT_PUBLIC_IMAGE_TRANSFORMS=cloudflare AND NEXT_PUBLIC_R2_PUBLIC_HOST
 * is set (the zone must have Image Transformations enabled). Off, or for any other
 * host, the URL is returned unchanged. Client-safe: env read literally so Next
 * inlines it.
 */

/** The only widths requested: few sizes = few billed transformations and high cache hit rates. */
export const CDN_IMAGE_WIDTHS = [64, 128, 256, 512, 768, 1280, 1920] as const;

export interface CdnImageOptions {
  /** CSS pixels needed × device pixel ratio; snapped up to CDN_IMAGE_WIDTHS. */
  width?: number;
  quality?: number;
}

export function cdnTransformsEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_IMAGE_TRANSFORMS,
  host: string | null = r2PublicHost(),
): boolean {
  return flag?.trim().toLowerCase() === "cloudflare" && Boolean(host);
}

function snapWidth(width: number): number {
  return CDN_IMAGE_WIDTHS.find((w) => w >= width) ?? CDN_IMAGE_WIDTHS[CDN_IMAGE_WIDTHS.length - 1];
}

export function cdnImageUrl(src: string, opts: CdnImageOptions = {}): string {
  const host = r2PublicHost();
  if (!cdnTransformsEnabled(undefined, host)) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== host) return src;
  if (url.pathname.startsWith("/cdn-cgi/")) return src;

  const params = [
    "format=auto",
    "metadata=none",
    "fit=scale-down",
    `quality=${Math.min(Math.max(Math.round(opts.quality ?? 80), 30), 95)}`,
    // A failed transformation serves the original instead of an error image.
    "onerror=redirect",
  ];
  if (opts.width && opts.width > 0) params.unshift(`width=${snapWidth(opts.width)}`);
  return `https://${host}/cdn-cgi/image/${params.join(",")}${url.pathname}`;
}
