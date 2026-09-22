import fs from "fs";
import path from "path";

let cachedLogoBase64: string | null | undefined;

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
  } catch {
    cachedLogoBase64 = null;
  }
  return cachedLogoBase64;
}
