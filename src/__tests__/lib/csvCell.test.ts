/**
 * @jest-environment node
 *
 * Server-side CSV cells. /api/admin/export/financial wrote employer-controlled
 * text (companyName, invoice description) straight into the file, so a company
 * named `=HYPERLINK(...)` became a live formula in the admin's spreadsheet.
 */
import { csvCell } from "@/lib/export/csvCell";

describe("csvCell", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1"])("neutralises a formula-leading cell %j", (v) => {
    expect(csvCell(v).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Acme, "Ltd"\nDubai')).toBe('"Acme, ""Ltd""\nDubai"');
  });

  it("guards and quotes together", () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  it("leaves ordinary text alone", () => {
    expect(csvCell("Acme Trading LLC")).toBe("Acme Trading LLC");
  });
});
