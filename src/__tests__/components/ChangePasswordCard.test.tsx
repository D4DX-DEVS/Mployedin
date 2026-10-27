/**
 * @jest-environment jsdom
 *
 * Client sheet: "job seeker — password setting conditions". Settings had no
 * way to change a password; POST /api/users/change-password had no screen.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";

const csrfFetchMock = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
}));
const toastSuccess = jest.fn();
jest.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: jest.fn() } }));

import { ChangePasswordCard } from "@/components/features/settings/ChangePasswordCard";

const GOOD = "Str0ng!Passw0rd";

function setup() {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ChangePasswordCard />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  const fill = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText(/^Current password/), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } });
    fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  };
  return { view, fill };
}

describe("ChangePasswordCard", () => {
  beforeEach(() => {
    csrfFetchMock.mockReset();
    toastSuccess.mockReset();
  });

  // Settings pages wrap each tab in their own <form>; a nested one submits the page.
  it("renders no <form> of its own", () => {
    const { view } = setup();
    expect(view.container.querySelector("form")).toBeNull();
  });

  it("checks the policy and the match before calling the API", () => {
    const { fill } = setup();
    fill("old", "short", "short");
    expect(screen.getByText(/at least 12 characters long/)).toBeInTheDocument();
    fill("old", GOOD, GOOD + "x");
    expect(screen.getByText("The new passwords don't match.")).toBeInTheDocument();
    fill(GOOD, GOOD, GOOD);
    expect(screen.getByText("Choose a password different from your current one.")).toBeInTheDocument();
    expect(csrfFetchMock).not.toHaveBeenCalled();
  });

  it("says the current password is wrong on 403", async () => {
    csrfFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const { fill } = setup();
    fill("WrongOne!123", GOOD, GOOD);
    expect(await screen.findByText("Your current password isn't right.")).toBeInTheDocument();
    expect(csrfFetchMock).toHaveBeenCalledWith("/api/users/change-password", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ currentPassword: "WrongOne!123", newPassword: GOOD }),
    }));
  });

  it("explains the hourly limit on 429", async () => {
    csrfFetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const { fill } = setup();
    fill("Old!Password1", GOOD, GOOD);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in an hour.");
  });

  it("toasts and closes on success", async () => {
    csrfFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const { fill } = setup();
    fill("Old!Password1", GOOD, GOOD);
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Your password has been changed."));
    expect(screen.queryByLabelText(/^Current password/)).toBeNull();
  });
});
