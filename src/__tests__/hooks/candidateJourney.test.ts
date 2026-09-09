import { summarizeJourney } from "@/hooks/useCandidateJourney";

describe("summarizeJourney", () => {
  it("orders interviews by round and picks the newest offer and check", () => {
    const data = summarizeJourney(
      [
        { _id: "iv-2", interviewRound: 2, status: "scheduled", scheduledAt: "2026-09-12T09:00:00Z" },
        { _id: "iv-1", interviewRound: 1, status: "completed", outcome: "passed", scheduledAt: "2026-09-01T09:00:00Z" },
      ],
      [
        { _id: "of-old", status: "withdrawn", createdAt: "2026-09-02" },
        { _id: "of-new", status: "pending", expiresAt: "2026-09-14", createdAt: "2026-09-10" },
      ],
      [{ _id: "chk-1", status: "in_progress", createdAt: "2026-09-03" }],
      [],
    );
    expect(data.interviews.map((i) => i._id)).toEqual(["iv-1", "iv-2"]);
    expect(data.offer?._id).toBe("of-new");
    expect(data.check?._id).toBe("chk-1");
    expect(data.placement).toBeUndefined();
  });

  it("returns empty slots when nothing exists yet", () => {
    const data = summarizeJourney([], [], [], []);
    expect(data).toEqual({ interviews: [], offer: undefined, check: undefined, placement: undefined });
  });
});
