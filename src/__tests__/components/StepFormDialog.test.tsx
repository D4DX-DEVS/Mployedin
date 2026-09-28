/**
 * @jest-environment jsdom
 *
 * Add Agent / Add Super Agent outgrew the screen once the region picker opened,
 * so they were split into steps on the Add Employer frame. The step shell must
 * never let a user skip a step's checks, never submit on the click that only
 * meant "Next", and must bring a server error back to the step it is about.
 */
import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StepFormDialog, type FormStep } from "@/components/shared/StepFormDialog";

interface HarnessProps {
  onSubmit?: () => void;
  error?: string;
  errorStep?: number;
  onErrorDismiss?: () => void;
  initialOpen?: boolean;
}

function Harness({ onSubmit = jest.fn(), error, errorStep, onErrorDismiss, initialOpen = true }: HarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [name, setName] = useState("");
  const steps: FormStep[] = [
    {
      label: "Account",
      validate: () => (name.trim() ? null : "Enter a name."),
      content: (
        <>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </>
      ),
    },
    { label: "Region", content: <p>Region step body</p> },
  ];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Reopen</button>
      <StepFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add Agent"
        steps={steps}
        error={error}
        errorStep={errorStep}
        onErrorDismiss={onErrorDismiss}
        submitLabel="Create Agent"
        submittingLabel="Creating..."
        submitting={false}
        onSubmit={onSubmit}
      />
    </>
  );
}

describe("StepFormDialog", () => {
  it("shows only the first step, with Cancel and Next", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Region step body")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Agent" })).not.toBeInTheDocument();
  });

  it("keeps the user on a step whose check fails and says why", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a name.");
    expect(screen.queryByText("Region step body")).not.toBeInTheDocument();
  });

  it("advances on Next without submitting, then submits once on the last step", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Region step body")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create Agent" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("treats Enter in a field as Next", async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText("Name"), "Asha{Enter}");
    expect(screen.getByText("Region step body")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("goes back without losing what was typed", async () => {
    const user = userEvent.setup();
    const onErrorDismiss = jest.fn();
    render(<Harness onErrorDismiss={onErrorDismiss} />);
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Asha");
    expect(onErrorDismiss).toHaveBeenCalledTimes(2);
  });

  it("moves to the step a caller error belongs to", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Region step body")).toBeInTheDocument();

    rerender(<Harness error="That email is already in use." errorStep={0} />);
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("That email is already in use.");
    // Focus follows the jump rather than falling off the unmounted submit button.
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
  });

  it("starts from the first step when reopened", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(await screen.findByLabelText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Region step body")).not.toBeInTheDocument();
  });

  it("announces progress for screen readers", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/Step 1 of 2: Account/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/Step 2 of 2: Region/)).toBeInTheDocument();
  });
});
