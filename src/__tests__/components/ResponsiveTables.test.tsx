/* global expect */

import { describe, it } from "@jest/globals";
import { render, waitFor } from "@testing-library/react";
import { ResponsiveTables } from "@/components/shared/ResponsiveTables";

describe("ResponsiveTables", () => {
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

    const table = container.querySelector("table");
    const cells = container.querySelectorAll("tbody td");

    // Progressive enhancement must not mutate React's server-shaped markup
    // during the initial hydration/commit.
    expect(table).not.toHaveClass("responsive-card-table");
    expect(cells[0]).not.toHaveAttribute("data-label");

    await waitFor(() => {
      expect(table).toHaveClass("responsive-card-table");
      expect(cells[0]).toHaveAttribute("data-label", "Name");
      expect(cells[1]).toHaveAttribute("data-label", "Status");
    }, { timeout: 2_000 });
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
    }, { timeout: 2_000 });
  });

  it("marks the final interactive cell as mobile row actions", async () => {
    const { container } = render(
      <>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ada</td>
              <td>
                <button type="button" title="Edit user">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
        <ResponsiveTables />
      </>
    );

    await waitFor(() => {
      expect(container.querySelector("tbody td:last-child")).toHaveAttribute(
        "data-mobile-actions"
      );
    }, { timeout: 2_000 });
  });

  it("preserves manual labels and supports the scroll opt-out", async () => {
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
    await waitFor(() => {
      expect(tables[0].querySelector("td")).toHaveAttribute(
        "data-label",
        "Custom label"
      );
      expect(tables[1]).not.toHaveClass("responsive-card-table");
    }, { timeout: 2_000 });
  });
});
