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

    const { container } = render(
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

    // The row itself is the disclosure control. It used to be an injected
    // <button>, but injecting a node into a cell React owns raced hydration on
    // streamed Suspense boundaries ("Hydration failed ... extra child"). The
    // control is now attributes on the existing <tr>: nothing is added to the
    // DOM, `aria-expanded` is valid on role="row", and the whole row is the
    // target instead of a 44x44 corner.
    const row = await screen.findByRole("row", { name: "Show details" });
    expect(container.querySelector("button[data-mobile-disclosure]")).toBeNull();

    const controlledIds = row.getAttribute("aria-controls")?.split(" ") ?? [];
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(controlledIds).toHaveLength(2);
    controlledIds.forEach((id) => expect(document.getElementById(id)).toBeTruthy());

    fireEvent.click(row);
    expect(row).toHaveAttribute("data-mobile-expanded");
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveAccessibleName("Hide details");

    // Keyboard operable, since the row is now the control.
    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).not.toHaveAttribute("data-mobile-expanded");
    expect(row).toHaveAttribute("aria-expanded", "false");
  });
});
