import { composeHires } from "@/hooks/useJobHires";

describe("composeHires", () => {
  it("joins hired applications with their placement and latest check, newest hire first", () => {
    const rows = composeHires(
      [
        { _id: "app-1", updatedAt: "2026-09-01T00:00:00Z", jobSeekerId: { userId: { name: "Amina Noor" } } },
        { _id: "app-2", updatedAt: "2026-09-05T00:00:00Z", jobSeekerId: { fullName: "Omar Said" } },
      ],
      [{ _id: "pl-1", applicationId: "app-1", status: "active", visaStatus: "pending", startDate: "2026-10-01" }],
      [
        { _id: "chk-old", applicationId: "app-1", status: "cancelled", createdAt: "2026-08-01" },
        { _id: "chk-new", applicationId: { _id: "app-1" }, status: "in_progress", createdAt: "2026-08-20", references: [{ status: "responded" }, { status: "requested" }] },
      ],
    );
    expect(rows.map((r) => r.applicationId)).toEqual(["app-2", "app-1"]);
    const amina = rows[1];
    expect(amina.candidateName).toBe("Amina Noor");
    expect(amina.placement).toEqual({ _id: "pl-1", status: "active", visaStatus: "pending", startDate: "2026-10-01" });
    expect(amina.check).toEqual({ _id: "chk-new", status: "in_progress", checkType: undefined, referencesTotal: 2, referencesReplied: 1 });
    expect(rows[0].candidateName).toBe("Omar Said");
    expect(rows[0].placement).toBeUndefined();
    expect(rows[0].check).toBeUndefined();
  });

  it("keeps a placement whose application is not in the hired list as its own row", () => {
    const rows = composeHires([], [{ _id: "pl-9", applicationId: "app-9", status: "completed", candidateName: "Lina", placedAt: "2026-07-01" }], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ applicationId: "app-9", candidateName: "Lina", placement: { _id: "pl-9", status: "completed" } });
  });
});
