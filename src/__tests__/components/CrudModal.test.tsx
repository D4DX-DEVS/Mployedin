/**
 * @jest-environment jsdom
 *
 * CrudModal swallowed every error thrown by onSubmit and replaced it with a
 * fixed sentence, so an admin could not tell a weak password from a duplicate
 * email. The modal must surface a FormError's message verbatim and keep the
 * generic copy for anything else (raw exceptions must never reach the UI).
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CrudModal, type CrudField } from "@/components/shared/CrudModal";
import { FormError } from "@/lib/errors/form-error";

const GENERIC = /We couldn't save your changes/;

const fields: CrudField[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "password", label: "Password", type: "text", required: true, hint: "At least 12 characters, with a symbol." },
];

async function submitWith(onSubmit: (values: Record<string, string>) => Promise<void>) {
  const user = userEvent.setup();
  render(<CrudModal open onClose={() => {}} title="Add employer" fields={fields} onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText(/Name/), "test");
  await user.type(screen.getByLabelText(/Password/), "78965412");
  await user.click(screen.getByRole("button", { name: "Create" }));
}

describe("CrudModal error surfacing", () => {
  it("shows a FormError's message verbatim", async () => {
    await submitWith(async () => { throw new FormError("Password must be at least 12 characters long. This one has 8."); });
    await waitFor(() => {
      expect(screen.getByText("Password must be at least 12 characters long. This one has 8.")).toBeInTheDocument();
    });
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it("keeps the generic copy for a plain Error (raw exception text must not leak)", async () => {
    await submitWith(async () => { throw new Error("TypeError: Failed to fetch"); });
    await waitFor(() => {
      expect(screen.getByText(GENERIC)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
  });

  it("keeps the generic copy when a FormError carries no text", async () => {
    await submitWith(async () => { throw new FormError("   "); });
    await waitFor(() => {
      expect(screen.getByText(GENERIC)).toBeInTheDocument();
    });
  });

  it("keeps the generic copy for non-Error rejections", async () => {
    await submitWith(async () => { throw "boom"; });
    await waitFor(() => {
      expect(screen.getByText(GENERIC)).toBeInTheDocument();
    });
  });

  it("keeps typed values when the parent re-renders with a structurally equal fields array", async () => {
    // Callers routinely rebuild `fields` (and edit `initialValues`) inline on
    // every render. A list fetch finishing while the modal is open used to
    // reset every input to blank, so the submit hit HTML "required" errors.
    const user = userEvent.setup();
    const makeFields = (): CrudField[] => [{ name: "name", label: "Name", type: "text", required: true }];
    const { rerender } = render(<CrudModal open onClose={() => {}} title="Add" fields={makeFields()} onSubmit={async () => {}} />);
    await user.type(screen.getByLabelText(/Name/), "Probeland");
    rerender(<CrudModal open onClose={() => {}} title="Add" fields={makeFields()} onSubmit={async () => {}} />);
    expect(screen.getByLabelText(/Name/)).toHaveValue("Probeland");
  });

  it("keeps edits when the parent re-renders with an equal inline initialValues object", async () => {
    const user = userEvent.setup();
    const fieldsOnce: CrudField[] = [{ name: "name", label: "Name", type: "text" }];
    const { rerender } = render(<CrudModal open onClose={() => {}} title="Edit" fields={fieldsOnce} initialValues={{ name: "Old" }} onSubmit={async () => {}} />);
    await user.clear(screen.getByLabelText(/Name/));
    await user.type(screen.getByLabelText(/Name/), "New");
    rerender(<CrudModal open onClose={() => {}} title="Edit" fields={fieldsOnce} initialValues={{ name: "Old" }} onSubmit={async () => {}} />);
    expect(screen.getByLabelText(/Name/)).toHaveValue("New");
  });

  it("re-initialises when a different record is opened for editing", () => {
    const fieldsOnce: CrudField[] = [{ name: "name", label: "Name", type: "text" }];
    const { rerender } = render(<CrudModal open onClose={() => {}} title="Edit" fields={fieldsOnce} initialValues={{ name: "First" }} onSubmit={async () => {}} />);
    rerender(<CrudModal open onClose={() => {}} title="Edit" fields={fieldsOnce} initialValues={{ name: "Second" }} onSubmit={async () => {}} />);
    expect(screen.getByLabelText(/Name/)).toHaveValue("Second");
  });

  it("renders a field hint under the input and links it for assistive tech", () => {
    render(<CrudModal open onClose={() => {}} title="Add employer" fields={fields} onSubmit={async () => {}} />);
    const input = screen.getByLabelText(/Password/);
    const hint = screen.getByText("At least 12 characters, with a symbol.");
    expect(input).toHaveAttribute("aria-describedby", hint.id);
  });
});
