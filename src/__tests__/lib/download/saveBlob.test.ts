/**
 * @jest-environment jsdom
 *
 * saveBlob: the one way the browser is asked to save a file it just made (the
 * standardised CV in the viewer, and the seeker-side preview). The link is put
 * in the page for the click because some browsers ignore a detached one.
 */
import { saveBlob, SAVE_BLOB_REVOKE_DELAY_MS } from "@/lib/download/saveBlob";
import { downloadBlob } from "@/components/shared/CvExport/cvExportFiles";

describe("saveBlob", () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => "blob:saved");
    global.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("clicks a link to the blob named fileName and removes the link", () => {
    const seen: Array<{ href: string; download: string; inDocument: boolean }> = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ href: this.getAttribute("href") ?? "", download: this.download, inDocument: document.body.contains(this) });
    });

    saveBlob(new Blob(["pdf"]), "سارة أحمد - Standardised CV (Mployedin).pdf");

    expect(seen).toEqual([{ href: "blob:saved", download: "سارة أحمد - Standardised CV (Mployedin).pdf", inDocument: true }]);
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
  });

  it("keeps the object URL alive after the click (revoking at once can cancel the download) and frees it later", () => {
    jest.useFakeTimers();
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    saveBlob(new Blob(["pdf"]), "cv.pdf");

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(SAVE_BLOB_REVOKE_DELAY_MS - 1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:saved");
    expect(SAVE_BLOB_REVOKE_DELAY_MS).toBeGreaterThanOrEqual(30_000);
    click.mockRestore();
  });

  it("is the one helper: the CV export's downloadBlob is saveBlob", () => {
    expect(downloadBlob).toBe(saveBlob);
  });
});
