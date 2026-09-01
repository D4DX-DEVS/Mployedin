/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AdminAnalyticsPage from "@/app/[locale]/(dashboard)/admin/analytics/page";

const originalFetch = global.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalCreateElement = document.createElement.bind(document);
/* eslint-disable @typescript-eslint/no-explicit-any */
const pdfSaveMock = jest.fn((..._args: any[]) => {});
const autoTableMock = jest.fn();
const toastErrorMock = jest.fn((..._args: any[]) => {});
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock("jspdf", () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    text: jest.fn(),
    save: (...args: unknown[]) => pdfSaveMock(...args),
    internal: {
      pageSize: {
        getWidth: () => 595,
      },
    },
  })),
}));

jest.mock("jspdf-autotable", () => ({
  __esModule: true,
  default: (...args: unknown[]) => autoTableMock(...args),
}));

describe("AdminAnalyticsPage", () => {
  const createdAnchors: HTMLAnchorElement[] = [];
  let anchorClickSpy: jest.SpyInstance;

  beforeEach(() => {
    createdAnchors.length = 0;
    pdfSaveMock.mockClear();
    autoTableMock.mockClear();
    toastErrorMock.mockClear();

    URL.createObjectURL = jest.fn(() => "blob:analytics-report");
    URL.revokeObjectURL = jest.fn();
    anchorClickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    jest.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);

      if (tagName.toLowerCase() === "a") {
        createdAnchors.push(element as HTMLAnchorElement);
      }

      return element;
    }) as typeof document.createElement);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        report: [
          "# Analytics Report",
          "",
          "***",
          "",
          "1. AI generated report content",
        ].join("\n"),
      }),
    } as Response);
  });

  afterEach(() => {
    anchorClickSpy.mockRestore();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("uses workspace surfaces and keeps analytics generation working", async () => {
    const user = userEvent.setup();
    const view = render(<AdminAnalyticsPage />);

    const heroSection = screen.getByRole("region", { name: /analytics templates/i });
    const querySection = screen.getByRole("region", { name: /custom analytics query/i });

    expect(heroSection).toBeInTheDocument();
    expect(querySection).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /platform growth/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai/report", expect.objectContaining({
        method: "POST",
      }));
    });

    expect(await screen.findByText("AI generated report content")).toBeInTheDocument();
    // The output panel is titled after the tapped template; only the markdown
    // body still carries the generic "Analytics Report" heading.
    expect(screen.getByRole("heading", { name: /platform growth/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /analytics report/i })).toHaveLength(1);
    expect(screen.getByText("AI generated report content")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /export/i })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: /export/i }));

  expect(await screen.findByRole("menuitem", { name: /export as excel/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /export as pdf/i })).toBeInTheDocument();
  await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.queryByText("AI generated report content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();

    expect(view.container.innerHTML).not.toContain("card-base");
    expect(view.container.innerHTML).not.toContain("input-field");
    expect(view.container.innerHTML).not.toContain("btn-primary");
    expect(view.container.innerHTML).not.toContain("btn-outline");
  });

  it("exports the generated analytics report as Excel and PDF", async () => {
    const user = userEvent.setup();

    render(<AdminAnalyticsPage />);

    await user.click(screen.getByRole("button", { name: /platform growth/i }));
    await screen.findByText("AI generated report content");

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /export as excel/i }));

    await waitFor(() => expect(anchorClickSpy).toHaveBeenCalled());

    expect(createdAnchors.at(-1)?.download).toMatch(/^admin-analytics-\d{4}-\d{2}-\d{2}\.xls$/);
    expect(URL.createObjectURL).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /export as pdf/i }));

    await waitFor(() => {
      expect(autoTableMock).toHaveBeenCalled();
      expect(pdfSaveMock).toHaveBeenCalledWith(expect.stringMatching(/^admin-analytics-\d{4}-\d{2}-\d{2}\.pdf$/));
    });
  });
});