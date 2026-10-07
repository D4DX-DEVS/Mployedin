/**
 * @jest-environment jsdom
 *
 * QA EMP-011 (2026-10-06): inviting "a@b" said "failed to send invite". The
 * browser's email check lets it through and the server refuses it, so the
 * dialog now names the problem at the field, before and after the request.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InviteMemberDialog } from "@/components/features/employer/team/InviteMemberDialog";

const mockMutateAsync = jest.fn();
const stableT = (key: string) => key;

jest.mock("next-intl", () => ({ useTranslations: () => stableT }));
jest.mock("next/navigation", () => ({ useParams: () => ({ locale: "en" }) }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/useTeam", () => {
  class TeamInviteError extends Error {
    constructor(message: string, readonly code?: string) {
      super(message);
    }
  }
  return {
    TeamInviteError,
    useInviteTeamMember: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  };
});

function renderDialog() {
  render(
    <InviteMemberDialog
      open
      onOpenChange={() => {}}
      roleOptions={[{ value: "hiring_manager", label: "Hiring manager" }]}
      jobOptions={[]}
      showJobAccessForRoles={() => false}
    />,
  );
}

function submitWith(email: string) {
  fireEvent.change(screen.getByLabelText("inviteModal.emailLabel"), { target: { value: email } });
  fireEvent.submit(screen.getByLabelText("inviteModal.emailLabel").closest("form")!);
}

beforeEach(() => mockMutateAsync.mockReset());

it("stops a partial address at the field and sends nothing", async () => {
  renderDialog();
  submitWith("a@b");
  expect(await screen.findByText("inviteModal.errors.invalidEmail")).toBeInTheDocument();
  expect(screen.getByLabelText("inviteModal.emailLabel")).toHaveAttribute("aria-invalid", "true");
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

it("sends a full address trimmed", async () => {
  mockMutateAsync.mockResolvedValue({});
  renderDialog();
  submitWith("  colleague@company.com ");
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  expect(mockMutateAsync.mock.calls[0][0]).toMatchObject({ email: "colleague@company.com" });
});

it("puts a server-side address rejection on the field too", async () => {
  const { TeamInviteError } = jest.requireMock("@/hooks/useTeam") as {
    TeamInviteError: new (m: string, c?: string) => Error;
  };
  mockMutateAsync.mockRejectedValue(new TeamInviteError("Validation failed", "invalid_email"));
  renderDialog();
  submitWith("someone@company.com");
  expect(await screen.findByText("inviteModal.errors.invalidEmail")).toBeInTheDocument();
  expect(screen.queryByText("failedToSendInvite")).not.toBeInTheDocument();
});
