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
const workbookWriteMock = jest.fn(() => new ArrayBuffer(16));
const workbookAppendSheetMock = jest.fn();
const workbookNewMock = jest.fn(() => ({}));
const worksheetFromAoaMock = jest.fn(() => ({}));
const pdfSaveMock = jest.fn();
const autoTableMock = jest.fn();
const toastErrorMock = jest.fn();

jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

jest.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (...args: unknown[]) => worksheetFromAoaMock(...args),
    book_new: () => workbookNewMock(),
    book_append_sheet: (...args: unknown[]) => workbookAppendSheetMock(...args),
  },
  write: (...args: unknown[]) => workbookWriteMock(...args),
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
    workbookWriteMock.mockClear();
    workbookAppendSheetMock.mockClear();
    workbookNewMock.mockClear();
    worksheetFromAoaMock.mockClear();
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

    const heroSection = screen.getByRole("heading", { name: /analytics & insights/i }).closest("section");
    const templatesSection = screen.getByRole("heading", { name: /start from a prompt template that matches the workday/i }).closest("section");
    const querySection = screen.getByRole("heading", { name: /custom analytics query/i }).closest("section");

    expect(heroSection).toHaveClass("workspace-hero-surface");
    expect(screen.getByText(/ai analytics/i)).toHaveClass("workspace-glass-panel");
    expect(templatesSection).toHaveClass("workspace-panel-surface");
    expect(querySection).toHaveClass("workspace-panel-surface");
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /platform growth this month/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/ai/report", expect.objectContaining({
        method: "POST",
      }));
    });

    expect(await screen.findByText("AI generated report content")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: /analytics report/i })).toHaveLength(2);
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

    await user.click(screen.getByRole("button", { name: /platform growth this month/i }));
    await screen.findByText("AI generated report content");

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /export as excel/i }));

    await waitFor(() => {
      expect(workbookWriteMock).toHaveBeenCalled();
    });

    expect(createdAnchors.at(-1)?.download).toMatch(/^admin-analytics-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(URL.createObjectURL).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /export/i }));
    await user.click(await screen.findByRole("menuitem", { name: /export as pdf/i }));

    await waitFor(() => {
      expect(autoTableMock).toHaveBeenCalled();
      expect(pdfSaveMock).toHaveBeenCalledWith(expect.stringMatching(/^admin-analytics-\d{4}-\d{2}-\d{2}\.pdf$/));
    });
  });
});