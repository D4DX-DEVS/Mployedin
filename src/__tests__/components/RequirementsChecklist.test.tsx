import { render, screen } from "@testing-library/react";
import { RequirementsBadge, RequirementsChecklist, setsNoMustHaves } from "@/components/features/employer/applications/RequirementsChecklist";

describe("RequirementsChecklist — location", () => {
  it("names countries instead of showing the stored country keys", () => {
    // The location check stores keys: ISO codes for the candidate ("bh"),
    // the job's country as typed ("india").
    render(
      <RequirementsChecklist
        status="met"
        checks={[{ key: "location", status: "not_met", hard: false, required: "india", actual: "bh, sa" }]}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("India");
    expect(text).toContain("Bahrain, Saudi Arabia");
    expect(screen.queryByText(/\bBh\b/)).not.toBeInTheDocument();
  });
});

describe("RequirementsChecklist — the CV behind the score", () => {
  it("says the CV was read and names the file", () => {
    render(<RequirementsChecklist status="met" checks={[{ key: "cv", status: "met", hard: false, actual: "read", label: "Antony_CV.pdf" }]} />);
    expect(screen.getByText("CV")).toBeInTheDocument();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("Scored from Antony_CV.pdf and the profile")).toBeInTheDocument();
  });

  it("asks for a readable copy when the file could not be read", () => {
    render(<RequirementsChecklist status="met" checks={[{ key: "cv", status: "partial", hard: false, actual: "unreadable" }]} />);
    expect(screen.getByText("Couldn't read")).toBeInTheDocument();
    expect(screen.getByText("The CV couldn't be read — ask the candidate for a PDF or Word copy")).toBeInTheDocument();
  });

  it("covers a CV still being read and an application sent without one", () => {
    render(
      <RequirementsChecklist
        status="met"
        checks={[
          { key: "cv", status: "unknown", hard: false, actual: "reading" },
          { key: "cv", status: "unknown", hard: false, actual: "none", questionId: "second" },
        ]}
      />,
    );
    expect(screen.getByText("Still being read — the score updates when it's done")).toBeInTheDocument();
    expect(screen.getByText("No CV was sent — scored from the profile only")).toBeInTheDocument();
  });
});

describe("RequirementsChecklist — missing information (client report 2026-09-30)", () => {
  it("notes unstated experience on a job with no minimum, as a note rather than a requirement", () => {
    render(<RequirementsChecklist status="met" checks={[{ key: "experience", status: "unknown", hard: false }]} />);
    expect(screen.getByText("No minimum asked · the candidate hasn't stated their experience")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Asks + years");
  });

  it("names the must-have it checks in full, and is an icon beside the score in the list", () => {
    const { unmount } = render(<RequirementsBadge status="not_met" />);
    expect(screen.getByText("Missing a must-have")).toBeInTheDocument();
    unmount();
    // Owner 2026-10-07: the worded pill under every score was too big.
    const { container } = render(<RequirementsBadge status="not_met" compact />);
    expect(screen.getByText("Missing a must-have")).toHaveClass("sr-only");
    expect(container.firstElementChild).toHaveAttribute("title", expect.stringMatching(/^Missing a must-have — .*Shortlist Top/));
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByText("Not met")).not.toBeInTheDocument();
    expect(screen.queryByText("Fails")).not.toBeInTheDocument();
  });
});

describe("RequirementsBadge — a job with no must-haves (owner 2026-10-07)", () => {
  /** "Meets" under a 44% read as a verdict on the score; on a job with no
      must-haves it said nothing at all, since there was nothing to fail. */
  const softOnly = [{ key: "skills", status: "partial" as const, hard: false, required: "5", actual: "2" }];
  const withMustHave = [{ key: "experience", status: "met" as const, hard: true, required: "3", actual: "4" }];

  it("knows a checklist with no must-haves from one with any, and from one it hasn't seen", () => {
    expect(setsNoMustHaves(softOnly)).toBe(true);
    expect(setsNoMustHaves([])).toBe(true);
    expect(setsNoMustHaves(withMustHave)).toBe(false);
    expect(setsNoMustHaves(undefined)).toBe(false);
  });

  it("shows no badge when there is nothing to meet", () => {
    render(<RequirementsBadge status="met" noMustHaves compact />);
    expect(screen.queryByText("Must-haves met")).not.toBeInTheDocument();
  });

  it("says Must-haves met when the job has one", () => {
    render(<RequirementsBadge status="met" compact />);
    expect(screen.getByText("Must-haves met")).toHaveClass("sr-only");
    expect(screen.queryByText("Meets")).not.toBeInTheDocument();
  });

  it("tags each must-have in the checklist and says when the job set none", () => {
    const { unmount } = render(<RequirementsChecklist status="met" checks={withMustHave} />);
    expect(screen.getByText("Must-have")).toBeInTheDocument();
    expect(screen.getByText("Must-haves met")).toBeInTheDocument();
    unmount();
    render(<RequirementsChecklist status="met" checks={softOnly} />);
    expect(screen.getByText("No must-haves set")).toBeInTheDocument();
    expect(screen.queryByText("Must-haves met")).not.toBeInTheDocument();
  });
});
