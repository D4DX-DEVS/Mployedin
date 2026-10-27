/**
 * @jest-environment node
 */
import sharp from "sharp";
import { imageOptimizationEnabled, isOptimizableImage, optimizeImage } from "@/lib/storage/optimizeImage";

/** A JPEG carrying EXIF (camera make, GPS) and an orientation tag, like a phone photo. */
async function phonePhoto(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "PhoneCo", Model: "X1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "25/1 12/1 0/1" },
    })
    .toBuffer();
}

describe("optimizeImage", () => {
  it("strips EXIF/GPS, applies the orientation and caps the long edge", async () => {
    const input = await phonePhoto(3000, 2000);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await optimizeImage(input, 512);
    expect(out).not.toBeNull();
    const meta = await sharp(out!.buffer).metadata();
    expect(out!.contentType).toBe("image/jpeg");
    expect(out!.ext).toBe(".jpg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    // Orientation 6 = rotated 90°: the 3000×2000 landscape becomes portrait, long edge 512.
    expect(meta.height).toBe(512);
    expect(meta.width).toBeLessThan(512);
  });

  it("never enlarges a small image", async () => {
    const small = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#fff" } }).png().toBuffer();
    const meta = await sharp((await optimizeImage(small, 512))!.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  it("keeps transparency as PNG (logos)", async () => {
    const logo = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const out = await optimizeImage(logo);
    expect(out?.contentType).toBe("image/png");
    expect((await sharp(out!.buffer).metadata()).hasAlpha).toBe(true);
  });

  it("leaves an animated image as sent (re-encoding would keep one frame)", async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background } }).png().toBuffer();
    const animated = await sharp([await frame("#f00"), await frame("#0f0")], { join: { animated: true } })
      .gif({ loop: 0 })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    expect(await optimizeImage(animated)).toBeNull();
  });

  it("refuses bytes that are not an image, with a FileValidationError", async () => {
    await expect(optimizeImage(Buffer.from("%PDF-1.7 not an image"))).rejects.toMatchObject({
      name: "FileValidationError",
      message: "This image couldn't be read. Try a JPEG or PNG file.",
    });
  });

  it("is switched off only by IMAGE_UPLOAD_OPTIMIZE=off, and only for raster types", () => {
    expect(imageOptimizationEnabled({})).toBe(true);
    expect(imageOptimizationEnabled({ IMAGE_UPLOAD_OPTIMIZE: "OFF" })).toBe(false);
    expect(isOptimizableImage("image/JPEG")).toBe(true);
    expect(isOptimizableImage("image/svg+xml")).toBe(false);
    expect(isOptimizableImage("application/pdf")).toBe(false);
    expect(isOptimizableImage(undefined)).toBe(false);
  });
});
