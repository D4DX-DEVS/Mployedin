/**
 * planCvExportEntries: what the export does for each selected candidate before
 * a single file is fetched. Pure, so the rules are pinned here rather than
 * through the hook.
 */
import { computeCounts, planCvExportEntries, type CvExportNotes } from "@/components/shared/CvExport/cvExportFiles";
import type { CvExportManifestItem } from "@/lib/cv/cvExportTypes";
import { allowed, denied, seekerId } from "@/__tests__/helpers/cvExportFixtures";

const notes: CvExportNotes = {
  noProfileDetails: "no profile details",
  noUploadedFile: "no uploaded file",
  noAccess: "no access note",
  notFound: "not found",
  downloadError: "download error",
  buildError: "build error",
  standardisedAlreadyIncluded: "already included",
};

const itemsFor = (rows: CvExportManifestItem[]) => rows.map((r) => ({ seekerId: r.seekerId }));

describe("planCvExportEntries", () => {
  it("gives every candidate an entry, in input order, keyed by the item's seekerId", () => {
    const rows = [allowed(1), denied(2), allowed(3)];
    const { entries } = planCvExportEntries(rows, itemsFor(rows), "both", notes);
    expect(entries.map((e) => e.id)).toEqual([seekerId(1), seekerId(2), seekerId(3)]);
  });

  it("keys the entry by what the caller sent even if the manifest names another id", () => {
    const rows = [allowed(1, { seekerId: seekerId(9) })];
    const { entries } = planCvExportEntries(rows, [{ seekerId: seekerId(1) }], "original", notes);
    expect(entries[0].id).toBe(seekerId(1));
  });

  it("queues a candidate with a file of the chosen kind, and leaves that result for the fetch", () => {
    const rows = [allowed(1)];
    const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "both", notes);
    expect(work).toEqual([0]);
    expect(entries[0].standardised).toBeUndefined();
    expect(entries[0].original).toBeUndefined();
  });

  describe("standardised mode", () => {
    it("settles a missing standardised CV now, with a note, and does not queue the candidate", () => {
      const rows = [allowed(1, { hasStandardised: false })];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "standardised", notes);
      expect(work).toEqual([]);
      expect(entries[0].standardised).toEqual({ status: "missing", note: notes.noProfileDetails });
      expect(entries[0].original).toBeUndefined();
    });

    it("ignores an original that is not there", () => {
      const rows = [allowed(1, { hasOriginal: false })];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "standardised", notes);
      expect(work).toEqual([0]);
      expect(entries[0].original).toBeUndefined();
    });
  });

  describe("original mode", () => {
    it("settles a missing upload now, with a note, and does not queue the candidate", () => {
      const rows = [allowed(1, { hasOriginal: false })];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "original", notes);
      expect(work).toEqual([]);
      expect(entries[0].original).toEqual({ status: "missing", note: notes.noUploadedFile });
      expect(entries[0].standardised).toBeUndefined();
    });
  });

  describe("both mode", () => {
    it("queues a candidate with only one of the two, settling the other as missing", () => {
      const rows = [allowed(1, { hasStandardised: false }), allowed(2, { hasOriginal: false })];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "both", notes);
      expect(work).toEqual([0, 1]);
      expect(entries[0].standardised).toEqual({ status: "missing", note: notes.noProfileDetails });
      expect(entries[0].original).toBeUndefined();
      expect(entries[1].original).toEqual({ status: "missing", note: notes.noUploadedFile });
      expect(entries[1].standardised).toBeUndefined();
    });

    it("does not queue a candidate with neither", () => {
      const rows = [allowed(1, { hasStandardised: false, hasOriginal: false }), allowed(2)];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "both", notes);
      expect(work).toEqual([1]);
      expect(entries[0].standardised?.status).toBe("missing");
      expect(entries[0].original?.status).toBe("missing");
    });
  });

  describe("a candidate the person may not open", () => {
    it("is never queued and is 'no access' on the original side, whatever the mode asks for", () => {
      const rows = [denied(1)];
      const { entries, work } = planCvExportEntries(rows, itemsFor(rows), "both", notes);
      expect(work).toEqual([]);
      expect(entries[0].original).toEqual({ status: "no access" });
      expect(entries[0].standardised).toEqual({ status: "missing", note: notes.noAccess });
    });

    it("only fills in the side the mode asks for", () => {
      const rows = [denied(1)];
      const standardisedOnly = planCvExportEntries(rows, itemsFor(rows), "standardised", notes).entries[0];
      expect(standardisedOnly.standardised).toMatchObject({ status: "missing" });
      expect(standardisedOnly.original).toBeUndefined();

      const originalOnly = planCvExportEntries(rows, itemsFor(rows), "original", notes).entries[0];
      expect(originalOnly.original).toMatchObject({ status: "no access" });
      expect(originalOnly.standardised).toBeUndefined();
    });
  });

  describe("the name the ZIP uses", () => {
    it("prefers the manifest's name, then the list's, then nothing (the ZIP then names it from the id)", () => {
      const rows = [allowed(1, { name: "From Manifest" }), allowed(2, { name: "" }), allowed(3, { name: "  " })];
      const items = [
        { seekerId: seekerId(1), name: "From List" },
        { seekerId: seekerId(2), name: "From List" },
        { seekerId: seekerId(3) },
      ];
      const { entries } = planCvExportEntries(rows, items, "original", notes);
      expect(entries.map((e) => e.name)).toEqual(["From Manifest", "From List", ""]);
    });

    it("uses the list's name for a candidate the manifest would not name", () => {
      const rows = [denied(1)];
      const { entries } = planCvExportEntries(rows, [{ seekerId: seekerId(1), name: "Sara Ahmed" }], "original", notes);
      expect(entries[0].name).toBe("Sara Ahmed");
    });
  });
});

describe("two items of one candidate (two applications)", () => {
  const sameSeeker = [
    { seekerId: seekerId(1), applicationId: "a".repeat(24) },
    { seekerId: seekerId(1), applicationId: "b".repeat(24) },
    { seekerId: seekerId(2), applicationId: "c".repeat(24) },
  ];
  const rows = [allowed(1), allowed(1), allowed(2)];

  it("queues the standardised CV once per seeker and notes the repeat in the report", () => {
    const { entries, work } = planCvExportEntries(rows, sameSeeker, "standardised", notes);
    expect(work).toEqual([0, 2]);
    expect(entries[1].standardised).toEqual({ status: "missing", note: "already included" });
    expect(entries[0].standardised).toBeUndefined();
  });

  it("keeps the originals per application", () => {
    const { entries, work } = planCvExportEntries(rows, sameSeeker, "both", notes);
    expect(work).toEqual([0, 1, 2]);
    expect(entries[1].standardised).toEqual({ status: "missing", note: "already included" });
    expect(entries[1].original).toBeUndefined();
  });

  it("original mode is untouched", () => {
    const { entries, work } = planCvExportEntries(rows, sameSeeker, "original", notes);
    expect(work).toEqual([0, 1, 2]);
    expect(entries[1].standardised).toBeUndefined();
  });

  it("does not count the repeat as a missing or extra standardised CV", () => {
    const counts = computeCounts(rows, sameSeeker, "standardised", (id) => id);
    expect(counts).toMatchObject({ total: 3, allowed: 3, missingStandardised: 0, exportable: 2 });
  });
});
