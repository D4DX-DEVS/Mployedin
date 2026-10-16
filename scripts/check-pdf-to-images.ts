/**
 * Smoke check: can this machine render a PDF page to PNG?
 *
 * jest cannot load pdf.js (it needs --experimental-vm-modules), so this runs
 * under tsx instead. Run it on any new deploy target before scanned CVs reach
 * it: it fails loudly when @napi-rs/canvas has no binary for the platform.
 *
 *   npx tsx scripts/check-pdf-to-images.ts
 */
import { pdfToImages } from "../src/lib/cv/pdfToImages";

const ONE_PAGE_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

async function main(): Promise<void> {
  const { pages, totalPages } = await pdfToImages(ONE_PAGE_PDF, { desiredWidth: 400 });
  const signature = pages[0] ? Buffer.from(pages[0].png).subarray(1, 4).toString("ascii") : "";
  if (totalPages !== 1 || pages.length !== 1 || pages[0].width !== 400 || signature !== "PNG") {
    throw new Error(`unexpected render: ${JSON.stringify({ totalPages, count: pages.length, width: pages[0]?.width, signature })}`);
  }
  console.log("OK: 1 page rendered to a 400px PNG");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAIL:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
