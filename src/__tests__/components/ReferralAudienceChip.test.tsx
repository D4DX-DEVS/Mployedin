/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ReferralAudienceChip } from "@/components/shared/ReferralAudienceChip";

describe("ReferralAudienceChip", () => {
  // The next-intl mock renders the real English copy from messages/en.json.
  it("labels seeker links and treats a missing audience as employer", () => {
    const { rerender } = render(<ReferralAudienceChip audience="job_seeker" namespace="adminReferralLinks" />);
    expect(screen.getByText("Job-seeker link")).toBeInTheDocument();
    rerender(<ReferralAudienceChip namespace="adminReferralLinks" />);
    expect(screen.getByText("Employer link")).toBeInTheDocument();
  });

  it("reads its copy from the namespace it is given", () => {
    render(<ReferralAudienceChip audience="job_seeker" namespace="agentReferralLinks" />);
    expect(screen.getByText("Job-seeker link")).toBeInTheDocument();
  });
});
