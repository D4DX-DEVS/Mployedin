import fs from "fs";
import path from "path";

let cachedLogoBase64: string | null | undefined;
let cachedLogoRatio = 200 / 69;

/**
 * The platform logo as a base64 data URI, for embedding in generated PDFs.
 * Read once per process; `null` means the file was unreadable and the caller
 * should render without a logo.
 */
export function getLogoBase64(): string | null {
  if (cachedLogoBase64 !== undefined) return cachedLogoBase64;
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const logoData = fs.readFileSync(logoPath);
    cachedLogoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;
    // PNG header: width and height are big-endian at bytes 16 and 20.
    const w = logoData.readUInt32BE(16);
    const h = logoData.readUInt32BE(20);
    if (w > 0 && h > 0) cachedLogoRatio = w / h;
  } catch {
    cachedLogoBase64 = null;
  }
  return cachedLogoBase64;
}

/**
 * Box for the logo at a given width, keeping the file's own proportions —
 * a fixed width × height box squashed it (200×69 file drawn as 4:1).
 */
export function logoBox(width: number): { width: number; height: number } {
  getLogoBase64();
  return { width, height: width / cachedLogoRatio };
}
