/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { LinkHiresDialog } from "@/app/[locale]/(dashboard)/admin/invoices/_components/LinkHiresDialog";

const mockMessages = {
  adminInvoices: {
    linkHiresDialogTitle: "Link hires to invoice lines",
    linkHiresDialogDescription: "Invoice {invoiceNumber}: link each unlinked line to the hire it bills",
    linkHiresNoUnlinkedLines: "All lines on this invoice are already linked to hires.",
    linkHiresSelectHire: "Hire",
    linkHiresSelectHirePlaceholder: "Choose a hire…",
    linkHiresNoApplicableHires: "No hires available for this line's job.",
    linkHiresReasonLabel: "Reason",
    linkHiresReasonPlaceholder: "e.g., Legacy invoice, Backfill",
    linkHiresButton: "Link",
    linkHiresErrorWrongEmployer: "That hire is not with this invoice's employer.",
    linkHiresErrorWrongJob: "That hire is on a different job than this line.",
    linkHiresErrorNoLine: "That line is not on this invoice.",
    linkHiresErrorAlreadyLinked: "That hire is already linked to another line.",
    linkHiresSuccess: "Hire linked successfully.",
    linking: "Linking…",
    failedToLoadData: "We couldn't load the invoice data.",
    loading: "Loading…",
    amount: "Amount",
    optional: "(optional)",
    startDate: "Start date",
    failed: "Failed",
  },
  common: {
    cancel: "Cancel",
  },
};

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: jest.fn(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={mockMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("LinkHiresDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders nothing when closed", () => {
    render(
      <Wrapper>
        <LinkHiresDialog invoiceId={null} open={false} onClose={jest.fn()} onSuccess={jest.fn()} />
      </Wrapper>
    );
    expect(screen.queryByText("Link hires to invoice lines")).not.toBeInTheDocument();
  });

  it("fetches and displays data when opened", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invoiceNumber: "INV-001",
        lines: [
          { index: 0, description: "Service", amount: 1000, jobId: "job-1", placementId: null },
        ],
        hires: [
          {
            id: "hire-1",
            jobId: "job-1",
            jobTitle: "Engineer",
            candidateName: "John Doe",
            startDate: "2026-01-01",
            status: "active",
            billedElsewhere: false,
          },
        ],
      }),
    });

    render(
      <Wrapper>
        <LinkHiresDialog
          invoiceId="invoice-123"
          open
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/INV-001/)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/invoices/invoice-123/link-hire"
    );
  });

  it("displays error when fetch fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invoice not found" }),
    });

    const { toast } = await import("sonner");

    render(
      <Wrapper>
        <LinkHiresDialog
          invoiceId="invoice-123"
          open
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it("shows the invoice line details", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invoiceNumber: "INV-001",
        lines: [
          { index: 0, description: "Service Fee", amount: 1000, jobId: "job-1", placementId: null },
        ],
        hires: [
          {
            id: "hire-1",
            jobId: "job-1",
            jobTitle: "Engineer",
            candidateName: "John Doe",
            startDate: "2026-01-01",
            status: "active",
            billedElsewhere: false,
          },
        ],
      }),
    });

    render(
      <Wrapper>
        <LinkHiresDialog
          invoiceId="invoice-123"
          open
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Service Fee")).toBeInTheDocument();
    });

    expect(screen.getByText(/INV-001/)).toBeInTheDocument();
  });

  it("displays 'no unlinked lines' message when all are linked", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        invoiceNumber: "INV-001",
        lines: [
          { index: 0, description: "Service", amount: 1000, jobId: "job-1", placementId: "hire-1" },
        ],
        hires: [],
      }),
    });

    render(
      <Wrapper>
        <LinkHiresDialog
          invoiceId="invoice-123"
          open
          onClose={jest.fn()}
          onSuccess={jest.fn()}
        />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("All lines on this invoice are already linked to hires.")).toBeInTheDocument();
    });
  });
});
