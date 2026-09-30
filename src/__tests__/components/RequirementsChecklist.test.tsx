import { render, screen } from "@testing-library/react";
import { RequirementsBadge, RequirementsChecklist } from "@/components/features/employer/applications/RequirementsChecklist";

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

  it("warns 'Requirements not met' in full, and 'Not met' in the narrow list column", () => {
    const { unmount } = render(<RequirementsBadge status="not_met" />);
    expect(screen.getByText("Requirements not met")).toBeInTheDocument();
    unmount();
    render(<RequirementsBadge status="not_met" compact />);
    expect(screen.getByText("Not met")).toBeInTheDocument();
    expect(screen.getByText("Requirements not met")).toHaveClass("sr-only");
    expect(screen.queryByText("Fails")).not.toBeInTheDocument();
  });
});
