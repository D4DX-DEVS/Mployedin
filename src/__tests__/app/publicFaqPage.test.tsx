/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import FAQPage from "@/app/[locale]/(public)/faq/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/faq",
}));

describe("public FAQ page", () => {
  beforeEach(() => {
    const faq = (id: string, category: string) => ({
      _id: id, question: `Q ${id}`, questionAr: "", answer: "A", answerAr: "", category,
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ faqs: [faq("1", "job_seeker"), faq("2", "billing"), faq("3", "general")] }),
    }) as unknown as typeof fetch;
  });

  it("labels category tabs in words, never the stored key", async () => {
    render(<FAQPage />);

    expect(await screen.findByRole("button", { name: "Job seekers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Billing & plans" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "job_seeker" })).not.toBeInTheDocument();
  });

  it("orders the tabs by the fixed category list, not by which FAQ loaded first", async () => {
    render(<FAQPage />);

    await screen.findByRole("button", { name: "General" });
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels.slice(0, 4)).toEqual(["All", "General", "Job seekers", "Billing & plans"]);
  });
});
