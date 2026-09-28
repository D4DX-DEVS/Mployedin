/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlansList } from "@/app/[locale]/(dashboard)/admin/subscription-plans/_components/PlansList";
import type { SubscriptionPlanItem } from "@/hooks/useSubscriptionPlans";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/en/admin/subscription-plans",
  useParams: () => ({ locale: "en" }),
}));

function employerPlan(overrides: Partial<SubscriptionPlanItem> = {}): SubscriptionPlanItem {
  return {
    _id: "plan-silver",
    name: "Silver",
    targetRole: "employer",
    tier: 1,
    price: 99,
    currency: "AED",
    billingCycle: "monthly",
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    subscriptionCount: 0,
    employerLimits: {
      maxActiveJobs: 10,
      maxApplicationsViewPerMonth: 200,
      maxTeamMembers: 1,
      aiFeatures: [
        { feature: "ai_chat", enabled: true, monthlyLimit: 50 },
        { feature: "ai_job_matching", enabled: false, monthlyLimit: 0 },
      ],
      analyticsLevel: "basic",
      dataExport: true,
      commTemplates: false,
      scorecardEvaluations: false,
      matchingWeightCustomization: false,
      workflowCustomization: false,
      prioritySupport: false,
      featuredJobListings: -1,
      brandedCompanyPage: false,
    },
    ...overrides,
  } as SubscriptionPlanItem;
}

function renderList(plans: SubscriptionPlanItem[], handlers: Partial<Record<"onEdit" | "onDuplicate" | "onDeactivate" | "onReactivate" | "onDestroy", jest.Mock>> = {}) {
  const props = {
    onEdit: jest.fn(),
    onDuplicate: jest.fn(),
    onDeactivate: jest.fn(),
    onReactivate: jest.fn(),
    onDestroy: jest.fn(),
    ...handlers,
  };
  render(<PlansList plans={plans} systemCurrency="AED" pendingId={null} {...props} />);
  return props;
}

describe("admin subscription plans list", () => {
  it("labels what a plan includes, in the right number", () => {
    renderList([employerPlan()]);
    const row = screen.getByRole("article");
    expect(within(row).getByText("10 jobs")).toBeInTheDocument();
    // "1 seats" was the old copy.
    expect(within(row).getByText("1 seat")).toBeInTheDocument();
    expect(within(row).getByText("1 AI feature")).toBeInTheDocument();
    expect(within(row).getByText("No subscriptions")).toBeInTheDocument();
    expect(within(row).getByText("Monthly")).toBeInTheDocument();
  });

  it("edits with the pen and keeps the rest behind a labelled More menu", async () => {
    const user = userEvent.setup();
    const plan = employerPlan();
    const { onEdit, onDuplicate, onDeactivate } = renderList([plan]);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(plan);

    await user.click(screen.getByRole("button", { name: "More actions for Silver" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicate).toHaveBeenCalledWith(plan);

    await user.click(screen.getByRole("button", { name: "More actions for Silver" }));
    await user.click(await screen.findByRole("menuitem", { name: "Deactivate" }));
    expect(onDeactivate).toHaveBeenCalledWith(plan);
  });

  it("says why an inactive plan with subscriptions cannot be deleted", async () => {
    const user = userEvent.setup();
    renderList([employerPlan({ isActive: false, subscriptionCount: 3 })]);

    await user.click(screen.getByRole("button", { name: "More actions for Silver" }));
    expect(await screen.findByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Deactivate" })).not.toBeInTheDocument();
    // Radix blocks the click with pointer-events CSS, which jsdom does not
    // apply, so the disabled state is asserted rather than clicked.
    const blocked = screen.getByRole("menuitem", { name: /3 subscription\(s\) reference this plan/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
  });

  it("offers a permanent delete on an unused inactive plan", async () => {
    const user = userEvent.setup();
    const plan = employerPlan({ isActive: false, subscriptionCount: 0 });
    const { onDestroy } = renderList([plan]);

    await user.click(screen.getByRole("button", { name: "More actions for Silver" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete permanently" }));
    expect(onDestroy).toHaveBeenCalledWith(plan);
  });

  it("opens the details from the row and the chevron, not from its buttons", async () => {
    const user = userEvent.setup();
    renderList([employerPlan()]);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByText("Team Seats")).not.toBeInTheDocument();

    await user.click(screen.getByText("Silver"));
    expect(screen.getByText("Team Seats")).toBeInTheDocument();
    // Featured jobs -1 = unlimited; AI chat carries its monthly cap.
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
    expect(screen.getByText("50/mo")).toBeInTheDocument();
    // Only what the plan grants: no crossed-out "not included" chips.
    expect(screen.getByText("Data Export")).toBeInTheDocument();
    expect(screen.getByText("AI Chat")).toBeInTheDocument();
    expect(screen.queryByText("Comm Templates")).not.toBeInTheDocument();
    expect(screen.queryByText("Job Matching")).not.toBeInTheDocument();

    // Clicking inside the open details leaves them open.
    await user.click(screen.getByText("Team Seats"));
    expect(screen.getByText("Team Seats")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Team Seats")).not.toBeInTheDocument();
  });
});
