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

  it("adds an accessible disclosure button for collapsible mobile rows", async () => {
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

    const disclosure = await screen.findByRole("button", { name: "Show details" });
    const row = container.querySelector("tbody tr");
    const controlledIds = disclosure.getAttribute("aria-controls")?.split(" ") ?? [];

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(controlledIds).toHaveLength(2);
    controlledIds.forEach((id) => expect(document.getElementById(id)).toBeTruthy());

    fireEvent.click(disclosure);
    expect(row).toHaveAttribute("data-mobile-expanded");
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(disclosure).toHaveAccessibleName("Hide details");
  });
});
