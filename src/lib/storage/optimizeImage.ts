import sharp from "sharp";
import { FileValidationError } from "@/lib/storage/uploadErrors";
import type { Env } from "@/lib/storage/storageConfig";

/**
 * Cleans a PUBLIC image once, at upload, before it is stored:
 *   - turns it upright from its EXIF orientation, then drops ALL metadata
 *     (GPS position, camera, owner name): public objects are downloadable by
 *     anyone with the URL;
 *   - caps the long edge (avatars 512 px, everything else 2560 px), never enlarging;
 *   - re-encodes as JPEG, or PNG when the image has transparency.
 *
 * JPEG/PNG rather than WebP on purpose: the CV PDF (@react-pdf/renderer) only
 * renders JPEG and PNG. Browsers still get AVIF/WebP: the CDN converts on
 * delivery (lib/images/cdnImage.ts).
 *
 * Animated images are returned unchanged (re-encoding would keep one frame).
 * Set IMAGE_UPLOAD_OPTIMIZE=off to store uploads as sent.
 */

const OPTIMIZABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Decompression-bomb guard: refuse to decode anything larger than this. */
const MAX_INPUT_PIXELS = 25_000_000;

export const AVATAR_MAX_EDGE = 512;
export const DEFAULT_MAX_EDGE = 2560;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png";
  ext: ".jpg" | ".png";
}

export function imageOptimizationEnabled(env: Env = process.env): boolean {
  return env.IMAGE_UPLOAD_OPTIMIZE?.trim().toLowerCase() !== "off";
}

export function isOptimizableImage(contentType: string | undefined): boolean {
  return Boolean(contentType && OPTIMIZABLE_TYPES.has(contentType.toLowerCase()));
}

/**
 * Returns the cleaned image, or null when it is left as sent (animated).
 * Throws FileValidationError when the bytes do not decode as an image.
 */
export async function optimizeImage(input: Buffer, maxEdge: number = DEFAULT_MAX_EDGE): Promise<OptimizedImage | null> {
  let meta: { pages?: number; hasAlpha?: boolean };
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new FileValidationError("This image couldn't be read. Try a JPEG or PNG file.");
  }
  if ((meta.pages ?? 1) > 1) return null;

  const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });

  try {
    if (meta.hasAlpha) {
      return { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), contentType: "image/png", ext: ".png" };
    }
    return {
      buffer: await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
      contentType: "image/jpeg",
      ext: ".jpg",
    };
  } catch {
    throw new FileValidationError("This image couldn't be read. Try a JPEG or PNG file.");
  }
}
