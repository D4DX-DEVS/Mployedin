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

    expect(screen.getByRole("heading", { level: 1, name: "CMS Overview" })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(7);
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/cms/faqs?limit=1");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/cms/contact-submissions?limit=1");

    expect((await screen.findAllByText((content) => content.includes("35"))).length).toBeGreaterThan(0);
    expect(screen.getByText("FAQs")).toBeInTheDocument();
    expect(screen.getByText("Contact Inbox")).toBeInTheDocument();
  });
});