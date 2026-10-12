/**
 * The job edit page sent the whole form on every save, so two colleagues with
 * the same job open overwrote each other: A saved a new title, B (opened
 * before A saved) changed the vacancies and silently put the old title back
 * (audit FUNC-017, reproduced live 2026-10-12). It now sends only the fields
 * changed since the page loaded, so edits to different fields both survive.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { changedFields } from "@/lib/jobs/changedFields";

const mutateAsync = jest.fn().mockResolvedValue({});
const JOB = {
  _id: "650000000000000000000700",
  title: "Senior Accountant",
  description: "Prepare monthly closings and reconciliations for the finance team.",
  category: "",
  status: "active",
  location: { country: "United Arab Emirates", city: "Dubai", isRemote: false },
  requirements: { skills: ["Excel"], preferredSkills: [], experienceMin: 2, experienceMax: 6 },
  salary: { min: 5000, max: 8000, currency: "AED", period: "monthly", isNegotiable: false },
  tags: [],
  vacancies: 1,
  screeningQuestions: [],
};

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }) }));
jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
jest.mock("@/hooks/useJobs", () => ({
  useJobDetail: () => ({ data: JOB, isLoading: false, isError: false, refetch: jest.fn() }),
  useUpdateJob: () => ({ mutateAsync, isPending: false }),
}));
jest.mock("@/hooks/useJobCategories", () => ({ useJobCategoryOptions: () => [] }));
jest.mock("@/hooks/useCountrySearch", () => ({ useCountrySearch: () => ({ data: [], isLoading: false }) }));
jest.mock("@/hooks/useFieldHighlight", () => ({ useFieldHighlight: () => undefined }));

describe("changedFields", () => {
  it("keeps only the keys whose value differs from what was loaded", () => {
    const base = { title: "A", vacancies: 1, salary: { min: 1, max: 2 }, tags: ["x"] };
    expect(changedFields({ title: "B", vacancies: 1, salary: { min: 1, max: 2 }, tags: ["x"] }, base)).toEqual({ title: "B" });
    expect(changedFields({ title: "A", vacancies: 3, salary: { min: 1, max: 9 }, tags: ["x"] }, base)).toEqual({ vacancies: 3, salary: { min: 1, max: 9 } });
  });

  it("sends a cleared value, and everything when nothing was loaded", () => {
    expect(changedFields({ expiresAt: null }, { expiresAt: "2026-12-01T00:00:00.000Z" })).toEqual({ expiresAt: null });
    expect(changedFields({ title: "A" }, null)).toEqual({ title: "A" });
  });
});

describe("Edit Job page", () => {
  it("sends only the title when only the title changed", async () => {
    const { SharedJobEditPage } = await import("@/components/features/jobs/SharedJobEditPage");
    render(<SharedJobEditPage id={JOB._id} backHref="/en/employer/jobs" afterSaveHref="/en/employer/jobs" />);

    const title = await screen.findByDisplayValue("Senior Accountant");
    fireEvent.change(title, { target: { value: "Senior Accountant (IFRS)" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Save Draft$/ })[0]);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toEqual({ jobId: JOB._id, updates: { title: "Senior Accountant (IFRS)" } });
  });
});
