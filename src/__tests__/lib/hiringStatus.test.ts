import { computeHiringStatus, hiringStatusClassMap, hiringStatusLabelKeyMap } from "@/lib/jobseekers/hiringStatus";

describe("computeHiringStatus", () => {
  it("should return 'placed' when application has 'hired' status", () => {
    expect(computeHiringStatus(["applied", "hired"])).toBe("placed");
  });

  it("should return 'placed' even if there are other statuses", () => {
    expect(computeHiringStatus(["applied", "shortlisted", "hired"])).toBe("placed");
  });

  it("should return 'offer' when there's an offer but no hired", () => {
    expect(computeHiringStatus(["applied", "offer"])).toBe("offer");
  });

  it("should return 'interviewing' when there's interview_scheduled", () => {
    expect(computeHiringStatus(["applied", "interview_scheduled"])).toBe("interviewing");
  });

  it("should return 'interviewing' when there's 'selected' status", () => {
    expect(computeHiringStatus(["applied", "selected"])).toBe("interviewing");
  });

  it("should prefer 'interview_scheduled' over 'shortlisted'", () => {
    expect(computeHiringStatus(["applied", "shortlisted", "interview_scheduled"])).toBe("interviewing");
  });

  it("should return 'shortlisted' when only applied or shortlisted", () => {
    expect(computeHiringStatus(["applied", "shortlisted"])).toBe("shortlisted");
  });

  it("should return 'applied' when only 'applied' status", () => {
    expect(computeHiringStatus(["applied"])).toBe("applied");
  });

  it("should return 'notProgressed' when only rejected/withdrawn", () => {
    expect(computeHiringStatus(["rejected", "withdrawn"])).toBe("notProgressed");
  });

  it("should return 'waiting' when no applications", () => {
    expect(computeHiringStatus([])).toBe("waiting");
  });

  it("should return 'applied' even if there are rejected/withdrawn alongside applied", () => {
    expect(computeHiringStatus(["applied", "rejected"])).toBe("applied");
  });
});

describe("hiringStatusClassMap", () => {
  it("should have all status types", () => {
    const statuses: Array<keyof typeof hiringStatusClassMap> = [
      "placed",
      "offer",
      "interviewing",
      "shortlisted",
      "applied",
      "notProgressed",
      "waiting",
    ];
    statuses.forEach((status) => {
      expect(hiringStatusClassMap[status]).toBeDefined();
    });
  });

  it("should map to valid status classes", () => {
    expect(hiringStatusClassMap.placed).toBe("status-active");
    expect(hiringStatusClassMap.offer).toBe("status-premium");
    expect(hiringStatusClassMap.interviewing).toBe("status-interview");
    expect(hiringStatusClassMap.shortlisted).toBe("status-shortlisted");
    expect(hiringStatusClassMap.applied).toBe("status-applied");
    expect(hiringStatusClassMap.notProgressed).toBe("status-withdrawn");
    expect(hiringStatusClassMap.waiting).toBe("status-pending");
  });
});

describe("hiringStatusLabelKeyMap", () => {
  it("should have label keys for all statuses", () => {
    const statuses: Array<keyof typeof hiringStatusLabelKeyMap> = [
      "placed",
      "offer",
      "interviewing",
      "shortlisted",
      "applied",
      "notProgressed",
      "waiting",
    ];
    statuses.forEach((status) => {
      expect(hiringStatusLabelKeyMap[status]).toBeDefined();
    });
  });

  it("should map to translation keys", () => {
    expect(hiringStatusLabelKeyMap.placed).toBe("hiringStatus.placed");
    expect(hiringStatusLabelKeyMap.offer).toBe("hiringStatus.offer");
    expect(hiringStatusLabelKeyMap.interviewing).toBe("hiringStatus.interviewing");
    expect(hiringStatusLabelKeyMap.shortlisted).toBe("hiringStatus.shortlisted");
    expect(hiringStatusLabelKeyMap.applied).toBe("hiringStatus.applied");
    expect(hiringStatusLabelKeyMap.notProgressed).toBe("hiringStatus.notProgressed");
    expect(hiringStatusLabelKeyMap.waiting).toBe("hiringStatus.waiting");
  });
});
