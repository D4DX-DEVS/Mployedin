import JSZip from "jszip";
import { normalizeExcelFilename, xlsxBlobFromRows, XLSX_MIME } from "@/lib/export";

function blobToBuffer(blob: Blob): Promise<Buffer> {
  // jsdom Blob has no arrayBuffer() — FileReader does exist.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("BUG-15: genuine XLSX export", () => {
  it("normalizes legacy .xls names to .xlsx", () => {
    expect(normalizeExcelFilename("leads.xls")).toBe("leads.xlsx");
    expect(normalizeExcelFilename("report.xlsx")).toBe("report.xlsx");
    expect(normalizeExcelFilename("export")).toBe("export.xlsx");
  });

  it("builds a real OOXML workbook, not HTML", async () => {
    const blob = await xlsxBlobFromRows(
      [
        ["Name", "Email"],
        ["Sara <QA>", "sara@example.com"],
      ],
      "Leads",
    );
    expect(blob.type).toBe(XLSX_MIME);
    const zip = await JSZip.loadAsync(await blobToBuffer(blob));
    const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
    expect(sheet).toBeDefined();
    expect(sheet).not.toContain("<!doctype");
    expect(sheet).toContain("Sara &lt;QA&gt;");
    expect(sheet).toContain("sara@example.com");
    const workbook = await zip.file("xl/workbook.xml")?.async("string");
    expect(workbook).toContain('name="Leads"');
  });

  it("escapes sheet names illegal in Excel", async () => {
    const blob = await xlsxBlobFromRows([["a"]], "A/B:C*D?E[F]G");
    const zip = await JSZip.loadAsync(await blobToBuffer(blob));
    const workbook = await zip.file("xl/workbook.xml")?.async("string");
    expect(workbook).not.toContain("A/B");
  });
});
