/**
 * @jest-environment node
 *
 * Three routes build an HTML email from values a user typed. The company name
 * in particular reaches a third party: the domain verification mail goes to
 * admin@<domain>, a mailbox the requester does not own. Every typed value must
 * arrive escaped, so a name like `<a href="https://evil.example">x</a>` shows
 * as text and is never a link.
 */
import { NextRequest, NextResponse } from "next/server";

const EVIL = '<a href="https://evil.example">x</a>';
const ESCAPED = "&lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt;";

jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, routeCtx?: { params: Promise<Record<string, string>> }) => {
      const role = req.headers.get("x-test-role") ?? "employer";
      try {
        return await handler(req, { userId: "64b000000000000000000001", role, locale: "en" }, routeCtx ? await routeCtx.params : undefined);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }), RATE_LIMIT_CONFIGS: {} }));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m1" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

// verify-domain
let employerDoc: Record<string, unknown> = {};
const employerFindOne = jest.fn(() => {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.lean = async () => employerDoc;
  q.then = (resolve: (v: unknown) => unknown) => resolve(employerDoc);
  return q;
});
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: () => employerFindOne() } }));
jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: { findOne: () => ({ lean: async () => ({ companyRole: "owner" }) }) },
}));

// invoices/[id]/send
let invoiceLean: Record<string, unknown> = {};
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: () => {
      const q: Record<string, unknown> = {};
      q.populate = () => q;
      q.lean = async () => invoiceLean;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ ...invoiceLean, save: jest.fn().mockResolvedValue(undefined) });
      return q;
    },
  },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/invoices/access", () => ({ canAccessInvoice: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/invoices/generatePdf", () => ({ generateInvoicePdf: jest.fn(() => Buffer.from("pdf")) }));
jest.mock("@/lib/invoices/issuer", () => ({ getInvoiceIssuer: jest.fn().mockResolvedValue({}) }));
jest.mock("@/lib/invoices/billToFallback", () => ({ resolveBillToFallback: jest.fn().mockResolvedValue(null) }));

// employers/me/smtp/test
const sendMail = jest.fn().mockResolvedValue({});
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: () => ({ verify: jest.fn().mockResolvedValue(true), sendMail: (...a: unknown[]) => sendMail(...a) }) },
}));
jest.mock("@/lib/security/ssrf", () => ({ assertPublicHost: jest.fn().mockResolvedValue(undefined) }));

import { POST as verifyDomain } from "@/app/api/employers/verify-domain/route";
import { POST as sendInvoice } from "@/app/api/invoices/[id]/send/route";
import { POST as smtpTest } from "@/app/api/employers/me/smtp/test/route";

const json = (url: string, body: unknown, role = "employer") =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-test-role": role } });
const noParams = { params: Promise.resolve({}) } as never;

beforeEach(() => jest.clearAllMocks());

describe("POST /api/employers/verify-domain", () => {
  beforeEach(() => {
    employerDoc = { _id: "e1", companyName: EVIL, domainVerified: false, save: jest.fn().mockResolvedValue(undefined) };
  });

  it("escapes the company name in the mail sent to the third-party admin@ mailbox", async () => {
    const res = await verifyDomain(json("http://x/api/employers/verify-domain", { domain: "example.com" }), noParams);
    expect(res.status).toBe(200);
    const { html, to } = sendEmail.mock.calls[0][0] as { html: string; to: string };
    expect(to).toBe("admin@example.com");
    expect(html).toContain(`${ESCAPED} is requesting domain verification`);
    expect(html).not.toContain(EVIL);
  });

  it("escapes the typed domain too", async () => {
    employerDoc = { ...employerDoc, companyName: "Acme" };
    await verifyDomain(json("http://x/api/employers/verify-domain", { domain: 'ex"<b>ample.com' }), noParams);
    const { html } = sendEmail.mock.calls[0][0] as { html: string };
    expect(html).toContain("<strong>ex&quot;&lt;b&gt;ample.com</strong>");
    expect(html).not.toContain("<b>");
  });
});

describe("POST /api/invoices/[id]/send", () => {
  beforeEach(() => {
    invoiceLean = {
      _id: "507f1f77bcf86cd799439061",
      invoiceNumber: "INV-<i>1</i>",
      status: "issued",
      currency: "<u>AED</u>",
      totalAmount: 100,
      userId: "u1",
      billingDetails: { companyName: EVIL, email: "billing@example.com" },
      employerId: { companyName: "Acme", companyEmail: "acme@example.com" },
    };
  });

  it("escapes the billed company name, the invoice number and the currency", async () => {
    const res = await sendInvoice(json("http://x/api/invoices/507f1f77bcf86cd799439061/send", {}, "admin"), { params: Promise.resolve({ id: "507f1f77bcf86cd799439061" }) } as never);
    expect(res.status).toBe(200);
    const { html } = sendEmail.mock.calls[0][0] as { html: string };
    expect(html).toContain(`Dear ${ESCAPED},`);
    expect(html).not.toContain(EVIL);
    expect(html).toContain("INV-&lt;i&gt;1&lt;/i&gt;");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&lt;u&gt;AED&lt;/u&gt; 100.00");
    expect(html).not.toContain("<u>");
  });
});

describe("POST /api/employers/me/smtp/test", () => {
  beforeEach(() => {
    employerDoc = { _id: "e1", companyName: EVIL, subscriptionType: "premium" };
  });

  it("escapes the company name and the typed host in the test mail", async () => {
    const res = await smtpTest(
      json("http://x/api/employers/me/smtp/test", { smtp: { smtpEmail: "me@example.com", smtpAppPassword: "pw", smtpHost: 'smtp."<i>x</i>.example', smtpPort: 587 } }),
      noParams,
    );
    expect(res.status).toBe(200);
    const { html } = sendMail.mock.calls[0][0] as { html: string };
    expect(html).toContain(`>${ESCAPED}</h1>`);
    expect(html).not.toContain(EVIL);
    expect(html).toContain("Host: smtp.&quot;&lt;i&gt;x&lt;/i&gt;.example:587");
    expect(html).not.toContain("<i>");
  });
});
