/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SubscriptionHero } from "@/components/features/subscription-dashboard/SubscriptionHero";

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
}));

describe("SubscriptionHero", () => {
  it("fires onRefresh and onExport when the hero buttons are clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = jest.fn();
    const onExport = jest.fn();

    render(<SubscriptionHero onRefresh={onRefresh} onExport={onExport} />);

    await user.click(screen.getByRole("button", { name: /refresh/i }));
    await user.click(screen.getByRole("button", { name: /export/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disables refresh while a refetch is in flight", () => {
    render(<SubscriptionHero onRefresh={jest.fn()} isRefreshing />);

    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("prefixes admin links with the active locale", () => {
    render(<SubscriptionHero />);

    expect(screen.getByRole("link", { name: /manage plans/i })).toHaveAttribute(
      "href",
      "/en/admin/subscription-plans",
    );
  });
});
