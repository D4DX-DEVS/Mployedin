/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A stray click on the backdrop used to close every dialog, so a half-filled
 * create/edit form (admin Add Commission was the reported case; every role's
 * CRUD dialogs shared it) vanished with what had been typed. A dialog holding
 * an editable field now closes only through its own Cancel / ✕ / Escape;
 * read-only dialogs keep closing on an outside click.
 */

function Harness({
  children,
  onInteractOutside,
  closeOnOutsideClick,
}: {
  children?: React.ReactNode;
  onInteractOutside?: (event: Event) => void;
  closeOnOutsideClick?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-describedby={undefined}
        onInteractOutside={onInteractOutside}
        closeOnOutsideClick={closeOnOutsideClick}
      >
        <DialogTitle>Dialog</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Radix registers its outside-pointer listener on the next tick. */
async function clickOutside() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    fireEvent.pointerDown(document.body);
  });
}

describe("DialogContent outside click", () => {
  it("still closes a read-only dialog", async () => {
    render(
      <Harness>
        <p>Details only</p>
      </Harness>
    );

    await clickOutside();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["an input", <input key="f" aria-label="Amount" />],
    ["a textarea", <textarea key="f" aria-label="Notes" />],
    ["a select", <select key="f" aria-label="Currency"><option>USD</option></select>],
    ["a combobox", <button key="f" type="button" role="combobox" aria-expanded="false" aria-controls="x">Type</button>],
  ])("keeps a dialog holding %s open", async (_label, field) => {
    render(<Harness>{field}</Harness>);

    await clickOutside();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ignores hidden inputs when deciding", async () => {
    render(
      <Harness>
        <input type="hidden" name="id" value="1" />
      </Harness>
    );

    await clickOutside();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets a caller opt a form dialog back into outside-click close", async () => {
    render(
      <Harness closeOnOutsideClick>
        <input aria-label="Search" />
      </Harness>
    );

    await clickOutside();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets a caller keep a read-only dialog open", async () => {
    render(
      <Harness closeOnOutsideClick={false}>
        <p>Details only</p>
      </Harness>
    );

    await clickOutside();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still runs the caller's own onInteractOutside", async () => {
    const onInteractOutside = jest.fn();
    render(
      <Harness onInteractOutside={onInteractOutside}>
        <input aria-label="Amount" />
      </Harness>
    );

    await clickOutside();

    expect(onInteractOutside).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still closes a form dialog on Escape", async () => {
    render(
      <Harness>
        <input aria-label="Amount" />
      </Harness>
    );

    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
