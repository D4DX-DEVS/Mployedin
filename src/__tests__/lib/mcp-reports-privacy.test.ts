/**
 * @jest-environment node
 */

import { sanitizeReport } from "@/lib/mcp/reports/privacy";

describe("sanitizeReport — MCP reports never carry personal data", () => {
  it("drops names, contact details, ids and links at any depth", () => {
    const out = sanitizeReport({
      name: "Aisha Khan",
      fullName: "Aisha Khan",
      companyName: "Acme LLC",
      email: "aisha@example.com",
      phone: "+971 50 123 4567",
      mobileNumber: "0501234567",
      userId: "507f1f77bcf86cd799439011",
      agentIds: ["a1"],
      _id: "x",
      id: "y",
      cvUrl: "https://cdn/cv.pdf",
      profileLink: "https://x",
      logo: "https://logo",
      nested: { rows: [{ assigneeName: "Omar", count: 3 }] },
      total: 12,
    });
    expect(out).toEqual({ nested: { rows: [{ count: 3 }] }, total: 12 });
  });

  it("keeps job titles, statuses, counts, nulls and money-unrelated words that merely end in 'id'", () => {
    expect(
      sanitizeReport({
        jobTitle: "Senior React Developer",
        title: "QA Engineer",
        status: "interview",
        paid: 0,
        avgDaysToHire: null,
        ownership: "team",
      }),
    ).toEqual({
      jobTitle: "Senior React Developer",
      title: "QA Engineer",
      status: "interview",
      paid: 0,
      avgDaysToHire: null,
      ownership: "team",
    });
  });

  it("masks email addresses and phone numbers inside text, whatever the key", () => {
    expect(
      sanitizeReport({ note: "call +971 50 123 4567", contact: "omar@x.co", label: "Week 12", tags: ["a@b.co", "ok"] }),
    ).toEqual({ note: "call [hidden]", contact: "[hidden]", label: "Week 12", tags: ["[hidden]", "ok"] });
  });

  it("drops money keys and personal words anywhere in a key", () => {
    expect(
      sanitizeReport({
        pendingCommissions: 4,
        revenueThisMonth: 1200,
        avgSalary: 5000,
        amount: 10,
        currency: "AED",
        nameAr: "عائشة",
        addressLine1: "Villa 3",
        tokenHash: "abc",
        avatarURL: "https://x",
        feedbackCount: 2,
        activeJobs: 7,
      }),
    ).toEqual({ feedbackCount: 2, activeJobs: 7 });
  });

  it("keeps job titles readable while hiding amounts, links and numbers in them", () => {
    const titles = sanitizeReport([
      { jobTitle: "Driver - AED 3,000" },
      { jobTitle: "Sales Rep 3000 AED + $5k bonus" },
      { jobTitle: "Apply at acme.com/jobs or www.acme.ae" },
      { jobTitle: "Receptionist, call 0501234567" },
      { jobTitle: "Nurse 2024-2025 intake" },
      { jobTitle: "ASP.NET Developer" },
      { jobTitle: "Node.js Engineer (Level 2)" },
    ]);
    expect(titles).toEqual([
      { jobTitle: "Driver - [hidden]" },
      { jobTitle: "Sales Rep [hidden] + [hidden] bonus" },
      { jobTitle: "Apply at [hidden] or [hidden]" },
      { jobTitle: "Receptionist, call [hidden]" },
      { jobTitle: "Nurse 2024-2025 intake" },
      { jobTitle: "ASP.NET Developer" },
      { jobTitle: "Node.js Engineer (Level 2)" },
    ]);
  });

  it("drops undefined sections but keeps nulls", () => {
    expect(sanitizeReport({ agentActivity: undefined, avgDaysToHire: null, list: [undefined, 1] })).toEqual({
      avgDaysToHire: null,
      list: [1],
    });
  });

  it("keeps dates: Date objects become ISO strings and ISO strings survive the phone check", () => {
    expect(
      sanitizeReport({ generatedAt: new Date("2026-10-07T06:00:00.000Z"), from: "2026-09-07T06:00:00.000Z", month: "2026-09" }),
    ).toEqual({ generatedAt: "2026-10-07T06:00:00.000Z", from: "2026-09-07T06:00:00.000Z", month: "2026-09" });
  });
});
