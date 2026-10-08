/* global expect */

import { describe, it } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResponsiveTables } from "@/components/shared/ResponsiveTables";

describe("ResponsiveTables", () => {
  // The initial sweep is deferred by a macrotask so it cannot rewrite markup
  // React is still hydrating, so the enhancement lands asynchronously — the
  // same way it does for rows streamed in later, covered by the next test.
  it("labels native table cells from their semantic headers", async () => {
    const { container } = render(
      <>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ada</td>
              <td>Active</td>
            </tr>
          </tbody>
        </table>
        <ResponsiveTables />
      </>
    );

    await waitFor(() => {
      expect(container.querySelector("table")).toHaveClass("responsive-card-table");
    });

    const cells = container.querySelectorAll("tbody td");
    expect(cells[0]).toHaveAttribute("data-label", "Name");
    expect(cells[1]).toHaveAttribute("data-label", "Status");
  });

  it("enhances rows added after the initial render", async () => {
    const { container, rerender } = render(
      <>
        <table>
          <thead>
            <tr>
              <th>Email</th>
            </tr>
          </thead>
          <tbody />
        </table>
        <ResponsiveTables />
      </>
    );

    rerender(
      <>
        <table>
          <thead>
            <tr>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ada@example.com</td>
            </tr>
          </tbody>
        </table>
        <ResponsiveTables />
      </>
    );

    await waitFor(() => {
      expect(container.querySelector("tbody td")).toHaveAttribute(
        "data-label",
        "Email"
      );
    });
  });

  it("preserves manual labels and supports the scroll opt-out", () => {
    const { container } = render(
      <>
        <table>
          <thead>
            <tr>
              <th>Generated label</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Custom label">Value</td>
            </tr>
          </tbody>
        </table>
        <table data-mobile-table="scroll">
          <tbody>
            <tr>
              <td>Matrix value</td>
            </tr>
          </tbody>
        </table>
        <ResponsiveTables />
      </>
    );

    const tables = container.querySelectorAll("table");
    expect(tables[0].querySelector("td")).toHaveAttribute(
      "data-label",
      "Custom label"
    );
    expect(tables[1]).not.toHaveClass("responsive-card-table");
  });

  it("makes the row an accessible, keyboard-operable disclosure control", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(max-width: 639px)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      }),
    });

    render(
      <>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Email</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ada</td>
              <td>Active</td>
              <td>ada@example.com</td>
              <td>Gulf</td>
            </tr>
          </tbody>
        </table>
        <ResponsiveTables />
      </>
    );

    // aria-expanded is only valid on treegrid rows, so the disclosure is a real
    // <button> in a summary cell, not attributes on the <tr> (axe:
    // aria-conditional-attr).
    const button = await screen.findByRole("button", { name: "Show details" });
    const row = button.closest("tr") as HTMLTableRowElement;
    expect(button).toHaveAttribute("data-mobile-disclosure");
    expect(button).toHaveAttribute("type", "button");
    expect(row.cells[0]).toContainElement(button);
    expect(row).toHaveAttribute("data-mobile-collapsible");
    expect(row).not.toHaveAttribute("aria-expanded");
    expect(row).not.toHaveAttribute("aria-controls");
    expect(row).not.toHaveAttribute("tabindex");

    const controlledIds = button.getAttribute("aria-controls")?.split(" ") ?? [];
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(controlledIds).toHaveLength(2);
    controlledIds.forEach((id) => expect(document.getElementById(id)).toBeTruthy());
    expect(button).toHaveAccessibleDescription("Ada");

    // Native button: Enter/Space activation reaches the handler as a click.
    fireEvent.click(button);
    expect(row).toHaveAttribute("data-mobile-expanded");
    expect(button).toHaveAttribute("aria-expanded", "true");

    // Tapping elsewhere on the card still toggles.
    fireEvent.click(row.cells[1]);
    expect(row).not.toHaveAttribute("data-mobile-expanded");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("does not inject into rows React has not hydrated yet", async () => {
    const { container } = render(
      <>
        <div id="boundary" />
        <ResponsiveTables />
      </>
    );

    // Server markup React has not claimed: no __reactFiber$ key on the row,
    // but its container is React-owned.
    container.querySelector("#boundary")!.innerHTML = `
      <table>
        <thead><tr><th>Name</th><th>Status</th><th>Email</th><th>Region</th></tr></thead>
        <tbody><tr><td>Ada</td><td>Active</td><td>ada@example.com</td><td>Gulf</td></tr></tbody>
      </table>`;

    await waitFor(() => {
      expect(container.querySelector("table")).toHaveClass("responsive-card-table");
    });
    expect(container.querySelector("button[data-mobile-disclosure]")).toBeNull();
    expect(container.querySelector("tr[data-mobile-collapsible]")).toBeNull();

    // Retries give up and inject eventually (markup React will never hydrate).
    await waitFor(
      () => expect(container.querySelector("button[data-mobile-disclosure]")).not.toBeNull(),
      { timeout: 8000 }
    );
  }, 10000);
});
