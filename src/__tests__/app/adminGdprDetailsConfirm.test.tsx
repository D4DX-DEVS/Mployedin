/**
 * @jest-environment jsdom
 */
/**
 * The GDPR details dialog stays open while Complete / Reject asks for
 * confirmation, so the real confirm dialog stacks on top of it. Uses the real
 * useConfirm and Dialog (the page test mocks both): a cancel must land back in
 * the details with focus on the button that asked, not on <body>.
 */
import React, { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckCircle2 } from "lucide-react";

import { GdprRequestDetailsDialog } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/GdprRequestDetailsDialog";
import type { GdprRequestRow } from "@/app/[locale]/(dashboard)/admin/gdpr/_components/types";
import { useConfirm } from "@/hooks/useConfirm";

const request: GdprRequestRow = {
  _id: "64d000000000000000000005",
  userId: "64d000000000000000000003",
  userName: "Sara Ahmed",
  userEmail: "sara@example.com",
  requestType: "delete",
  status: "in_progress",
  createdAt: "2026-09-01T10:00:00Z",
  handledByName: "Super Admin",
};

const saved = jest.fn();

function Harness() {
  const { confirm, ConfirmDialogNode } = useConfirm();
  const [open, setOpen] = useState(true);
  const complete = async () => {
    if (!(await confirm({ title: "Mark this request complete?", message: "Erases the account.", confirmLabel: "Complete" }))) return;
    saved();
    setOpen(false);
  };
  return (
    <>
      {ConfirmDialogNode}
      <GdprRequestDetailsDialog
        request={request}
        open={open}
        onClose={() => setOpen(false)}
        actions={[{ key: "complete", label: "Complete", icon: CheckCircle2, onSelect: complete }]}
      />
    </>
  );
}

beforeEach(() => saved.mockClear());

describe("GDPR details dialog with the real confirm", () => {
  it("stacks the confirm on top; cancelling returns to the details and its button", async () => {
    render(<Harness />);
    const details = await screen.findByRole("dialog", { name: "Data request" });
    const completeButton = within(details).getByRole("button", { name: "Complete" });

    await userEvent.click(completeButton);
    const confirmDialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    expect(confirmDialog).toBeInTheDocument();

    await userEvent.click(within(confirmDialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Mark this request complete?" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Data request" })).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(completeButton));
    expect(completeButton).toBeEnabled();
  });

  it("closes the details once the confirmed change is saved", async () => {
    render(<Harness />);
    const details = await screen.findByRole("dialog", { name: "Data request" });

    await userEvent.click(within(details).getByRole("button", { name: "Complete" }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Mark this request complete?" });
    await userEvent.click(within(confirmDialog).getByRole("button", { name: "Complete" }));

    expect(saved).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
