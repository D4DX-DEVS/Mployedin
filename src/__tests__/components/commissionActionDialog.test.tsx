/**
 * @jest-environment jsdom
 */
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CommissionActionDialog,
  type CommissionActionMode,
} from "@/app/[locale]/(dashboard)/admin/commissions/_components/CommissionActionDialog";

const target = { id: "c1", name: "Rajesh Kumar", amount: 8850, currency: "INR" };

function setup(mode: CommissionActionMode, onSubmit = jest.fn().mockResolvedValue(undefined)) {
  const onClose = jest.fn();
  render(<CommissionActionDialog mode={mode} target={target} onClose={onClose} onSubmit={onSubmit} />);
  return { onSubmit, onClose, user: userEvent.setup() };
}

describe("CommissionActionDialog", () => {
  it("renders nothing while closed", () => {
    render(<CommissionActionDialog mode={null} target={null} onClose={jest.fn()} onSubmit={jest.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dispute: demands a reason, then submits it trimmed and closes", async () => {
    const { onSubmit, onClose, user } = setup("dispute");

    expect(screen.getByRole("dialog", { name: "Open dispute" })).toBeInTheDocument();
    expect(screen.getByText("INR 8,850")).toBeInTheDocument();
    expect(screen.queryByLabelText(/amount to recover/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open dispute" }));
    expect(screen.getByText("Enter a reason.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/reason/i), "  Wrong rate applied  ");
    await user.click(screen.getByRole("button", { name: "Open dispute" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({ reason: "Wrong rate applied", clawbackAmount: undefined });
  });

  it("clawback: starts at the full amount and rejects more than it", async () => {
    const { onSubmit, user } = setup("clawback");

    const amount = screen.getByLabelText(/amount to recover \(INR\)/i);
    expect(amount).toHaveValue(8850);

    await user.type(screen.getByLabelText(/^reason/i), "Candidate left in guarantee period");
    await user.clear(amount);
    await user.type(amount, "9000");
    await user.click(screen.getByRole("button", { name: "Clawback" }));

    expect(screen.getByText("Enter an amount above 0 and no more than INR 8,850.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, "4000");
    await user.click(screen.getByRole("button", { name: "Clawback" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      reason: "Candidate left in guarantee period",
      clawbackAmount: 4000,
    }));
  });

  it("keeps the dialog open and shows the error when the request fails", async () => {
    const { onClose, user } = setup("dispute", jest.fn().mockRejectedValue(new Error("We couldn't dispute commission")));

    await user.type(screen.getByLabelText(/reason/i), "Duplicate record");
    await user.click(screen.getByRole("button", { name: "Open dispute" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't dispute commission");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open dispute" })).toBeEnabled();
  });

  it("the admin commissions page no longer uses the browser's native prompt()", () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, "../../app/[locale]/(dashboard)/admin/commissions/page.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/(^|[^.\w])(window\.)?prompt\(/m);
  });
});
