/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Radix returns focus on close only to a <DialogTrigger>. Almost every dialog
 * here is opened from state (a button's onClick → setOpen(true)), so closing
 * one dropped keyboard focus on <body> and a keyboard or screen-reader user
 * lost their place on the page.
 */

function StateOpened({
  conditional = false,
  autoFocusField = false,
  onCloseAutoFocus,
}: {
  conditional?: boolean;
  autoFocusField?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [open, setOpen] = useState(false);
  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle>Add FAQ</DialogTitle>
        <input aria-label="Question" autoFocus={autoFocusField} />
      </DialogContent>
    </Dialog>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Add New
      </button>
      {/* CmsPage mounts its CrudModal only while open: `{showAdd && <CrudModal/>}`. */}
      {conditional ? open && dialog : dialog}
    </>
  );
}

async function openFrom(button: HTMLElement) {
  button.focus();
  await act(async () => {
    fireEvent.click(button);
  });
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
}

async function pressEscape() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("DialogContent focus return", () => {
  it("moves focus into the dialog and back to the button that opened it", async () => {
    render(<StateOpened />);
    const opener = screen.getByRole("button", { name: "Add New" });

    await openFrom(opener);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);

    await pressEscape();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("returns focus when the dialog is unmounted on close, as CmsPage does", async () => {
    render(<StateOpened conditional />);
    const opener = screen.getByRole("button", { name: "Add New" });

    await openFrom(opener);
    await pressEscape();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  // An autoFocus field takes focus before Radix looks, and Radix then skips
  // onOpenAutoFocus — so the opener has to be noted while the dialog renders.
  it("returns focus when a field inside the dialog has autoFocus", async () => {
    render(<StateOpened autoFocusField />);
    const opener = screen.getByRole("button", { name: "Add New" });

    await openFrom(opener);
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveFocus();

    await pressEscape();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  // A row menu's item is gone once the menu closes; the menu button stands in.
  it("returns focus to the menu button when a menu item opened the dialog", async () => {
    const user = userEvent.setup();
    function RowMenu() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger>Row actions</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setOpen(true)}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Delete this row?</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<RowMenu />);
    const menuButton = screen.getByRole("button", { name: "Row actions" });

    menuButton.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await pressEscape();
    await waitFor(() => expect(menuButton).toHaveFocus());
  });

  it("leaves focus alone when the caller handles onCloseAutoFocus itself", async () => {
    const onCloseAutoFocus = jest.fn((event: Event) => event.preventDefault());
    render(<StateOpened onCloseAutoFocus={onCloseAutoFocus} />);
    const opener = screen.getByRole("button", { name: "Add New" });

    await openFrom(opener);
    await pressEscape();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(onCloseAutoFocus).toHaveBeenCalled();
    expect(opener).not.toHaveFocus();
  });

  it("still returns focus to a DialogTrigger", async () => {
    render(
      <Dialog>
        <DialogTrigger>Open details</DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Details</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole("button", { name: "Open details" });

    await openFrom(trigger);
    await pressEscape();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
