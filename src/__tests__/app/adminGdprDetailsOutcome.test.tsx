/**
 * @jest-environment jsdom
 */
/**
 * The details dialog says what was asked, the user's own reason, what the team
 * did, what was not done and why, and the internal notes. Empty fields are
 * hidden, not shown as dashes. It never offers the export itself.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";

import { GdprRequestDetailsDialog } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/GdprRequestDetailsDialog";
import type { GdprRequestRow, GdprRequestType } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/types";

const base: GdprRequestRow = {
  _id: "64d000000000000000000005",
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "delete",
  status: "pending",
  createdAt: "2026-09-01T10:00:00Z",
  handledByName: null,
};

function open(request: Partial<GdprRequestRow>) {
  render(<GdprRequestDetailsDialog request={{ ...base, ...request }} open onClose={jest.fn()} actions={[]} />);
  return screen.getByRole("dialog", { name: "Data request" });
}

describe("details: what was asked", () => {
  it.each<[GdprRequestType, string]>([
    ["export", "Asked for a copy of their personal data"],
    ["delete", "Asked for their account and personal data to be deleted"],
    ["rectification", "Asked for incorrect personal data to be corrected"],
    ["restrict", "Asked for the use of their personal data to be restricted"],
  ])("describes a %s request in words", (requestType, text) => {
    const dialog = open({ requestType });

    expect(within(dialog).getByText("What was asked")).toBeInTheDocument();
    expect(within(dialog).getByText(text)).toBeInTheDocument();
  });
});

describe("details: the user's own reason", () => {
  it("is labelled 'Reason given by the user' when there is one", () => {
    const dialog = open({ notes: "Moving abroad" });

    expect(within(dialog).getByText("Reason given by the user")).toBeInTheDocument();
    expect(within(dialog).getByText("Moving abroad")).toBeInTheDocument();
  });

  it("is hidden when there is none, even for a deletion request", () => {
    const dialog = open({ requestType: "delete", notes: undefined });

    expect(within(dialog).queryByText("Reason given by the user")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/no reason given/i)).not.toBeInTheDocument();
  });
});

describe("details: what the team did", () => {
  it("shows what was done, what was not and why, and the internal notes, each under its label", () => {
    const dialog = open({
      status: "completed",
      completedAt: "2026-09-02T10:00:00Z",
      outcome: "Sent the export by email",
      outcomeReason: "Invoices were kept: the law requires it",
      adminNotes: "Checked with legal",
    });

    expect(within(dialog).getByText("What was done")).toBeInTheDocument();
    expect(within(dialog).getByText("Sent the export by email")).toBeInTheDocument();
    expect(within(dialog).getByText("Not done / reason")).toBeInTheDocument();
    expect(within(dialog).getByText("Invoices were kept: the law requires it")).toBeInTheDocument();
    expect(within(dialog).getByText("Internal notes")).toBeInTheDocument();
    expect(within(dialog).getByText("Checked with legal")).toBeInTheDocument();
    expect(within(dialog).getByText("Only admins see this")).toBeInTheDocument();
  });

  it("shows a refusal's reason under 'Not done / reason' and no 'What was done'", () => {
    const dialog = open({ status: "rejected", outcomeReason: "We could not verify who you are." });

    expect(within(dialog).getByText("Not done / reason")).toBeInTheDocument();
    expect(within(dialog).getByText("We could not verify who you are.")).toBeInTheDocument();
    expect(within(dialog).queryByText("What was done")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Internal notes")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Only admins see this")).not.toBeInTheDocument();
  });

  it("hides every empty field instead of showing a dash", () => {
    const dialog = open({ status: "in_progress", outcome: "", outcomeReason: "  ", adminNotes: undefined });

    for (const label of ["What was done", "Not done / reason", "Internal notes", "Only admins see this"]) {
      expect(within(dialog).queryByText(label)).not.toBeInTheDocument();
    }
    // The two dashes left are the older grid's (no Completed date, nobody handled it yet), as before.
    expect(within(dialog).getAllByText("—")).toHaveLength(2);
  });

  it("keeps line breaks in what the team wrote", () => {
    const dialog = open({ status: "completed", completedAt: "2026-09-02T10:00:00Z", adminNotes: "Line one\nLine two" });

    const notes = within(dialog).getByText(/Line one/);
    expect(notes).toHaveClass("whitespace-pre-wrap");
  });
});

describe("details: a self-service export", () => {
  const exported: Partial<GdprRequestRow> = {
    requestType: "export",
    status: "completed",
    completedAt: "2026-09-01T10:00:01Z",
    userName: "Omar Khan",
    userEmail: "omar@example.com",
  };

  it("says the user downloaded it themselves, with the time, when no outcome was recorded", () => {
    const dialog = open(exported);

    const done = within(dialog).getByText("What was done").closest("div") as HTMLElement;
    expect(within(done).getByText("The user downloaded their own data export.")).toBeInTheDocument();
    expect(done).toHaveTextContent(/2026/);
  });

  it("never offers the export data or a download", () => {
    const dialog = open(exported);

    expect(within(dialog).queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(dialog.querySelector("a[download], a[href]")).toBeNull();
  });

  it("shows an outcome an admin did record instead of the derived text", () => {
    const dialog = open({ ...exported, outcome: "Re-sent by email on request" });

    expect(within(dialog).getByText("Re-sent by email on request")).toBeInTheDocument();
    expect(within(dialog).queryByText("The user downloaded their own data export.")).not.toBeInTheDocument();
  });

  it("does not claim a self-service download for an export an admin handled", () => {
    const dialog = open({ ...exported, handledByName: "Super Admin" });

    expect(within(dialog).queryByText("The user downloaded their own data export.")).not.toBeInTheDocument();
  });

  it("does not claim a download for an export that is still open or was refused", () => {
    const dialog = open({ ...exported, status: "rejected", completedAt: undefined });
    expect(within(dialog).queryByText("The user downloaded their own data export.")).not.toBeInTheDocument();
  });
});
