import "server-only";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { BrandPoster, POSTER_SIZES, type PosterSize } from "@/components/features/poster/BrandPoster";
import { loadBrandPosterBySlug, buildBrandPosterData } from "@/lib/poster/brandPosters.server";
import { posterFonts } from "@/lib/poster/ogFonts.server";
import { buildQrTrackingUrl } from "@/lib/composer/branding";
import { MPLOYEDIN_LOGO_URL } from "@/lib/brand/brandKit";
import { posterImageDataUrl } from "@/lib/poster/posterImages.server";

const ARABIC = /[؀-ۿ]/;

export function parsePosterSize(value: string | null | undefined): PosterSize {
  return value && value in POSTER_SIZES ? (value as PosterSize) : "square";
}

/**
 * A saved brand poster drawn as a PNG response, or null when the slug isn't a
 * brand poster. Drawn by the same BrandPoster component the maker previews; the
 * QR code goes through the tracking redirect so scans count and land on the
 * job's apply page.
 */
export async function renderBrandPosterImage(slug: string, size: PosterSize): Promise<ImageResponse | null> {
  const loaded = await loadBrandPosterBySlug(slug);
  if (!loaded) return null;
  const { width, height } = POSTER_SIZES[size];

  const qrDataUrl = await QRCode.toDataURL(buildQrTrackingUrl(slug), { margin: 1, width: 360 });
  const data = buildBrandPosterData(loaded.job, {
    look: loaded.spec.look,
    locale: loaded.spec.locale,
    headline: loaded.spec.headline,
    companyName: loaded.companyName,
    contact: loaded.contact,
    qrDataUrl,
  });
  const needsArabic =
    ARABIC.test(`${data.title} ${data.headline} ${data.companyName} ${data.details.join(" ")} ${(data.requirements ?? []).join(" ")}`) || loaded.spec.locale === "ar";
  // Images go in as data URLs: next/og won't fetch our own host, and fetch errors
  // inside its stream can't be turned into a clean response.
  const [{ fonts, family }, logoUrl, platformLogoUrl] = await Promise.all([
    posterFonts(loaded.kit.font, needsArabic),
    posterImageDataUrl(loaded.logoUrl),
    posterImageDataUrl(MPLOYEDIN_LOGO_URL),
  ]);

  return new ImageResponse(
    (
      <BrandPoster
        data={data}
        kit={loaded.kit}
        layout={loaded.spec.layout}
        look={loaded.spec.look}
        width={width}
        height={height}
        logoUrl={logoUrl}
        platformLogoUrl={platformLogoUrl}
        fontFamily={family}
      />
    ),
    { width, height, ...(fonts.length ? { fonts } : {}) },
  );
}

/** The poster as base64 PNG bytes (for the MCP connector, which returns images inline). */
export async function renderBrandPosterBase64(slug: string, size: PosterSize): Promise<string | null> {
  const image = await renderBrandPosterImage(slug, size);
  if (!image) return null;
  return Buffer.from(await image.arrayBuffer()).toString("base64");
}
