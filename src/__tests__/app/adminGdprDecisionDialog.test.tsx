/**
 * @jest-environment jsdom
 */
/**
 * Completing or rejecting a data request opens a small form instead of a plain
 * confirm: what was done, what was not and why, and internal notes. A refusal
 * needs a reason, because the person is told why (UK GDPR Art 12(4)).
 */
import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckCircle2 } from "lucide-react";

import {
  GdprDecisionDialog,
  type GdprDecision,
  type GdprDecisionPayload,
} from "@/app/[locale]/(dashboard)/admin/gdpr/_components/GdprDecisionDialog";
import { GdprRequestDetailsDialog } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/GdprRequestDetailsDialog";
import type { GdprRequestRow } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/types";

const exportRequest: GdprRequestRow = {
  _id: "64d000000000000000000006",
  userId: "64d000000000000000000003",
  userName: "Omar Khan",
  userEmail: "omar@example.com",
  requestType: "export",
  status: "in_progress",
  createdAt: "2026-09-01T10:00:00Z",
};
const deleteRequest: GdprRequestRow = {
  ...exportRequest,
  _id: "64d000000000000000000005",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "delete",
};

interface HarnessProps {
  request?: GdprRequestRow;
  decision?: GdprDecision;
  onSubmit?: (payload: GdprDecisionPayload) => Promise<boolean>;
  onOpenChange?: (open: boolean) => void;
}

function Harness({ request = exportRequest, decision = "completed", onSubmit = async () => true, onOpenChange }: HarnessProps) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open again</button>
      <GdprDecisionDialog
        request={request}
        decision={decision}
        open={open}
        onOpenChange={(next) => { onOpenChange?.(next); setOpen(next); }}
        onSubmit={onSubmit}
      />
    </>
  );
}

describe("GdprDecisionDialog: Complete", () => {
  it("has three optional, labelled text areas", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    for (const label of ["What was done", "Anything not done, and why", "Internal notes (only admins see these)"]) {
      const field = within(dialog).getByLabelText(label);
      expect(field.tagName).toBe("TEXTAREA");
      expect(field).not.toBeRequired();
    }
    expect(within(dialog).queryByLabelText(/^Reason/)).not.toBeInTheDocument();
  });

  it("completes with none of them filled in", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ status: "completed" });
  });

  it("sends what was typed, trimmed, and leaves out what was not", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    await userEvent.type(within(dialog).getByLabelText("What was done"), "  Sent the export by email ");
    await userEvent.type(within(dialog).getByLabelText("Anything not done, and why"), "Invoices kept: the law requires it");
    await userEvent.type(within(dialog).getByLabelText("Internal notes (only admins see these)"), "Checked with legal");
    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      status: "completed",
      outcome: "Sent the export by email",
      outcomeReason: "Invoices kept: the law requires it",
      adminNotes: "Checked with legal",
    });
  });

  it("tells the admin that what they write under 'not done' is shown to the person, and that the notes are not", async () => {
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    expect(within(dialog).getByLabelText("Anything not done, and why")).toHaveAccessibleDescription(/the person will see it/i);
    expect(within(dialog).getByLabelText("Internal notes (only admins see these)")).not.toHaveAccessibleDescription(/will see/i);
  });

  it("refuses text longer than the server takes, naming the limit", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    // paste: typing 1,001 characters one by one is slow
    await userEvent.click(within(dialog).getByLabelText("What was done"));
    await userEvent.paste("x".repeat(1001));
    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/1000 characters/);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("GdprDecisionDialog: the erasure warning", () => {
  it("keeps the irreversible-erasure warning when completing a deletion request", async () => {
    render(<Harness request={deleteRequest} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    expect(within(dialog).getByText(/Completing this erases Sara Ahmed.s account/)).toBeInTheDocument();
    expect(within(dialog).getByText(/This can't be undone\./)).toBeInTheDocument();
  });

  it("shows the plain 'only when fulfilled' text for any other request", async () => {
    render(<Harness request={exportRequest} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    expect(within(dialog).getByText(/Only do this once Omar Khan.s request has actually been fulfilled/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/erases/)).not.toBeInTheDocument();
  });

  it("tells the admin not to put the person's name or contact details in the notes, since they outlive the account", async () => {
    render(<Harness request={deleteRequest} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    expect(within(dialog).getByText(/Don.t include the person.s name or contact details: this note is kept after their account is erased./)).toBeInTheDocument();
  });

  it("does not show that hint for other requests, or when a deletion request is rejected", async () => {
    const { unmount } = render(<Harness request={exportRequest} />);
    await screen.findByRole("dialog", { name: "Mark this request complete?" });
    expect(screen.queryByText(/kept after their account is erased/)).not.toBeInTheDocument();
    unmount();

    render(<Harness request={deleteRequest} decision="rejected" />);
    await screen.findByRole("dialog", { name: "Reject this request?" });
    expect(screen.queryByText(/kept after their account is erased/)).not.toBeInTheDocument();
  });

  it("does not warn about erasure when a deletion request is only rejected", async () => {
    render(<Harness request={deleteRequest} decision="rejected" />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });

    expect(within(dialog).queryByText(/erases/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Sara Ahmed.s request will be marked rejected/)).toBeInTheDocument();
  });
});

describe("GdprDecisionDialog: Reject", () => {
  it("asks for a required reason and optional internal notes, and nothing else", async () => {
    render(<Harness decision="rejected" />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });

    const reason = within(dialog).getByLabelText(/^Reason/);
    expect(reason.tagName).toBe("TEXTAREA");
    expect(reason).toBeRequired();
    expect(within(dialog).getByLabelText("Internal notes (only admins see these)")).not.toBeRequired();
    expect(within(dialog).queryByLabelText("What was done")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Anything not done, and why")).not.toBeInTheDocument();
    expect(reason).toHaveAccessibleDescription(/the person will see this reason/i);
  });

  it.each([["nothing", ""], ["only spaces", "   "]])("can't be submitted with %s as the reason: an inline error shows under the field", async (_label, typed) => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness decision="rejected" onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });
    const reason = within(dialog).getByLabelText(/^Reason/);
    if (typed) await userEvent.type(reason, typed);

    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));

    const error = await within(dialog).findByRole("alert");
    expect(error).toHaveTextContent(/Enter a reason/);
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(reason).toHaveAccessibleDescription(/Enter a reason/);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Reject this request?" })).toBeInTheDocument();
  });

  it("sends the reason, and the notes when there are some", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness decision="rejected" onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });

    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "We could not confirm who you are.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenLastCalledWith({ status: "rejected", outcomeReason: "We could not confirm who you are." });
  });

  it("sends the internal notes with the reason", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness decision="rejected" onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });

    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Not enough information");
    await userEvent.type(within(dialog).getByLabelText("Internal notes (only admins see these)"), "Asked twice by phone");
    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      status: "rejected",
      outcomeReason: "Not enough information",
      adminNotes: "Asked twice by phone",
    });
  });

  it("clears the error once a reason is typed", async () => {
    render(<Harness decision="rejected" />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
    await within(dialog).findByRole("alert");
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), "Because");

    await waitFor(() => expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument());
  });

  it("explains the * on the required field", async () => {
    render(<Harness decision="rejected" />);
    const dialog = await screen.findByRole("dialog", { name: "Reject this request?" });
    expect(within(dialog).getByText("Fields marked * are required.")).toBeInTheDocument();
  });
});

describe("GdprDecisionDialog: saving", () => {
  it("shows a pending state while the request runs: the confirm button is disabled, Cancel too, and the dialog won't close", async () => {
    let finish!: (ok: boolean) => void;
    const onSubmit = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const onOpenChange = jest.fn();
    render(<Harness onSubmit={onSubmit} onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));

    const confirm = await within(dialog).findByRole("button", { name: "Complete" });
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();

    // a second click and Escape both do nothing while it runs
    await userEvent.click(confirm);
    await userEvent.keyboard("{Escape}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Mark this request complete?" })).toBeInTheDocument();

    finish(true);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("stays open with the text kept when the change could not be saved, ready to try again", async () => {
    const onSubmit = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onOpenChange = jest.fn();
    render(<Harness onSubmit={onSubmit} onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    await userEvent.type(within(dialog).getByLabelText("What was done"), "Sent it");

    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Complete" })).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText("What was done")).toHaveValue("Sent it");

    await userEvent.click(within(dialog).getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("Cancel closes it and sends nothing", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<Harness onSubmit={onSubmit} />);
    const dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("starts empty every time it is opened", async () => {
    render(<Harness />);
    let dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    await userEvent.type(within(dialog).getByLabelText("What was done"), "Half written");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Open again" }));
    dialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    expect(within(dialog).getByLabelText("What was done")).toHaveValue("");
  });
});

describe("GdprDecisionDialog on top of the details", () => {
  function WithDetails({ onSubmit }: { onSubmit: (payload: GdprDecisionPayload) => Promise<boolean> }) {
    const [detailsOpen, setDetailsOpen] = useState(true);
    const [decisionOpen, setDecisionOpen] = useState(false);
    return (
      <>
        <GdprDecisionDialog
          request={deleteRequest}
          decision="completed"
          open={decisionOpen}
          onOpenChange={setDecisionOpen}
          onSubmit={async (payload) => { const ok = await onSubmit(payload); if (ok) setDetailsOpen(false); return ok; }}
        />
        <GdprRequestDetailsDialog
          request={deleteRequest}
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          actions={[{ key: "complete", label: "Complete", icon: CheckCircle2, onSelect: () => setDecisionOpen(true) }]}
        />
      </>
    );
  }

  it("a cancel lands back in the details, on the button that asked", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<WithDetails onSubmit={onSubmit} />);
    const details = await screen.findByRole("dialog", { name: "Data request" });
    const completeButton = within(details).getByRole("button", { name: "Complete" });

    await userEvent.click(completeButton);
    const form = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    await userEvent.click(within(form).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark this request complete?" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Data request" })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(completeButton));
  });

  it("closes both once the change is saved", async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    render(<WithDetails onSubmit={onSubmit} />);
    const details = await screen.findByRole("dialog", { name: "Data request" });

    await userEvent.click(within(details).getByRole("button", { name: "Complete" }));
    const form = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    await userEvent.click(within(form).getByRole("button", { name: "Complete" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: "completed" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
