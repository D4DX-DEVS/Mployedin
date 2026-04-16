/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminCmsOverviewPage from "@/app/[locale]/(dashboard)/admin/cms/page";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/cms",
}));

describe("AdminCmsOverviewPage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 4 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 6 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 3 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 5 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 7 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pagination: { total: 8 } }) });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the modern CMS workspace shell and loads section totals", async () => {
    render(<AdminCmsOverviewPage />);

    expect(screen.getByRole("heading", { level: 1, name: "CMS / Landing Page" })).toBeInTheDocument();
    expect(screen.getByText(/cms workspace/i, { selector: "div.workspace-glass-panel" })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/cms/faqs?limit=1");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/cms/contact-submissions?limit=1");

    expect(await screen.findByText("35 content records")).toBeInTheDocument();
    expect(screen.getByText("7 modules available")).toBeInTheDocument();
    expect(screen.getByText("FAQs")).toBeInTheDocument();
    expect(screen.getByText("Contact Inbox")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /jump directly into the cms surfaces that need work/i }).closest("section")).toHaveClass("workspace-panel-surface");
  });
});