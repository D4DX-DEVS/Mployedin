/**
 * @jest-environment jsdom
 *
 * The CV viewer's source control in Arabic: the real Arabic messages, on a
 * right-to-left page. The control is plain buttons (not Radix Tabs, which would
 * stamp dir="ltr" on it) and uses logical spacing only, so it flips with the
 * page and nothing runs out of the row. English is in ResumeViewerModal.test.tsx.
 */
import { render, screen, within } from "@testing-library/react";

// The global next-intl mock serves English; this suite renders the real Arabic messages instead.
jest.mock("next-intl", () => {
  const IntlMessageFormat = jest.requireActual("intl-messageformat").default;
  const ar = jest.requireActual("../../../messages/ar.json") as Record<string, unknown>;
  const lookup = (namespace: string, key: string): unknown =>
    `${namespace}.${key}`.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), ar);
  return {
    useLocale: () => "ar",
    useTranslations: (namespace: string) => {
      const t = (key: string, params?: Record<string, unknown>) => {
        const message = lookup(namespace, key);
        // A missing key takes the page down in production (next-intl throws): fail the test the same way.
        if (typeof message !== "string") throw new Error(`missing Arabic message ${namespace}.${key}`);
        return String(new IntlMessageFormat(message, "ar").format(params as never));
      };
      return t;
    },
  };
});
jest.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ role: "agent", can: () => true, session: null }) }));
jest.mock("@/hooks/useCandidates", () => ({ useAtsCheck: () => ({ mutateAsync: jest.fn(), isPending: false }) }));
jest.mock("@/components/features/matching/RequirementReport", () => ({ RequirementReport: () => null }));
jest.mock("next/dynamic", () => () => function BuiltCvViewStub() { return <div data-testid="built-cv-view" />; });

import { ResumeViewerModal } from "@/components/shared/ResumeViewerModal";

const SEEKER_ID = "64b000000000000000000001";
const CV_URL = `/api/employers/candidates/${SEEKER_ID}/cv#cv.pdf`;

function mockBackend(built: "ok" | "empty" | "error" | "notFound" = "ok", file: "ok" | "missing" | "notFound" = "ok") {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("kind=built")) {
      if (built === "error") return { ok: false, status: 500, json: async () => ({}) };
      if (built === "notFound") return { ok: false, status: 404, json: async () => ({ error: "Candidate not found" }) };
      return { ok: true, status: 200, json: async () => ({ hasContent: built === "ok", identity: { fullName: "سارة", email: "", phone: "" }, profile: {} }) };
    }
    if (file === "missing") return { ok: false, status: 404, json: async () => ({ code: "NO_CV" }) };
    if (file === "notFound") return { ok: false, status: 404, json: async () => ({ error: "Candidate not found" }) };
    return { ok: true, status: 200, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) };
  }) as unknown as typeof fetch;
}

const PHYSICAL_DIRECTION = /(^|\s)(-?m[lr]-|-?p[lr]-|left-|right-|text-left|text-right|float-left|float-right|rounded-[lr]-|border-[lr](-|\s|$))/;

beforeEach(() => {
  document.documentElement.dir = "rtl";
  document.documentElement.lang = "ar";
  global.URL.createObjectURL = jest.fn(() => "blob:cv");
  global.URL.revokeObjectURL = jest.fn();
});
afterEach(() => {
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

describe("ResumeViewerModal source control in Arabic", () => {
  it("labels the tabs, the hint and the download in Arabic", async () => {
    mockBackend();
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);
    await screen.findByTestId("built-cv-view");

    const list = screen.getByRole("tablist", { name: "أي سيرة ذاتية" });
    expect(within(list).getByRole("tab", { name: "السيرة الذاتية الموحدة (Mployedin)" })).toHaveAttribute("aria-selected", "true");
    expect(within(list).getByRole("tab", { name: "السيرة الذاتية الأصلية (المرفوعة)" })).toBeInTheDocument();
    expect(screen.getByText("مُنشأة من الملف الشخصي الحالي للمرشح")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تنزيل" })).toBeInTheDocument();
  });

  it("names the second tab for the CV sent with the application", async () => {
    mockBackend();
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} applicationId="64b0000000000000000000aa" originalIsBuilt />);
    await screen.findByTestId("built-cv-view");

    expect(screen.getByRole("tab", { name: "السيرة المرسلة مع الطلب" })).toBeInTheDocument();
  });

  it("shows the unavailable reason in the page, on the tab's title and as its description, in Arabic", async () => {
    mockBackend("empty");
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);

    expect(await screen.findByText("السيرة الموحدة غير متاحة بعد")).toBeInTheDocument();
    const tab = screen.getByRole("tab", { name: "السيرة الذاتية الموحدة (Mployedin)" });
    expect(tab).toHaveAttribute("title", "السيرة الموحدة غير متاحة بعد");
    expect(document.getElementById(tab.getAttribute("aria-describedby") ?? "")).toHaveTextContent("السيرة الموحدة غير متاحة بعد");
  });

  it("says no file was uploaded, in the page, in Arabic", async () => {
    mockBackend("ok", "missing");
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);

    expect(await screen.findByText("لا يوجد ملف مرفوع")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "السيرة الذاتية الأصلية (المرفوعة)" })).toHaveAttribute("aria-disabled", "true");
  });

  it("tells a CV that cannot be found from a missing file, in Arabic", async () => {
    mockBackend("notFound", "notFound");
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);

    expect((await screen.findAllByText("تعذر العثور على السيرة الذاتية لهذا المرشح.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("لا يوجد ملف مرفوع")).toBeNull();
  });

  it("says a probe failed in a neutral voice, with Try again, in Arabic", async () => {
    mockBackend("error");
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);

    expect(await screen.findByText("تعذر تحميل السيرة الموحدة.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حاول مرة أخرى" })).toBeInTheDocument();
    expect(screen.queryByText("السيرة الموحدة غير متاحة بعد")).toBeNull();
  });

  it("has a short label per tab for phones, in Arabic", async () => {
    mockBackend();
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);
    await screen.findByTestId("built-cv-view");

    const tab = screen.getByRole("tab", { name: "السيرة الذاتية الموحدة (Mployedin)" });
    expect(within(tab).getByText("الموحدة", { exact: true }).className).toMatch(/\bsm:hidden\b/);
    expect(within(screen.getByRole("tab", { name: "السيرة الذاتية الأصلية (المرفوعة)" })).getByText("الأصلية", { exact: true })).toBeInTheDocument();
  });

  it("does not use Radix tabs, so nothing pins the control left-to-right", async () => {
    mockBackend();
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);
    await screen.findByTestId("built-cv-view");

    const list = screen.getByRole("tablist", { name: "أي سيرة ذاتية" });
    expect(list.closest("[dir]")).toBe(document.documentElement);
    expect(list.querySelector("[data-radix-collection-item]")).toBeNull();
    expect(list.className).not.toMatch(/overflow-x/);
  });

  it("lets each tab shrink and wrap inside the row instead of running out of it", async () => {
    mockBackend();
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);
    await screen.findByTestId("built-cv-view");

    for (const tab of within(screen.getByRole("tablist", { name: "أي سيرة ذاتية" })).getAllByRole("tab")) {
      expect(tab.className).toMatch(/\bmin-w-0\b/);
      expect(tab.className).toMatch(/\bflex-1\b/);
    }
    const row = screen.getByRole("tablist", { name: "أي سيرة ذاتية" }).parentElement as HTMLElement;
    expect(row.className).toMatch(/\bflex-wrap\b/);
  });

  it("uses logical spacing and alignment only, so the row mirrors with the page", async () => {
    mockBackend("empty");
    render(<ResumeViewerModal url={CV_URL} candidateName="سارة" onClose={jest.fn()} />);
    await screen.findByText("السيرة الموحدة غير متاحة بعد");

    const row = screen.getByRole("tablist", { name: "أي سيرة ذاتية" }).parentElement as HTMLElement;
    const classes = [row, ...Array.from(row.querySelectorAll("*"))].map((el) => el.getAttribute("class") ?? "");
    expect(classes.filter((c) => PHYSICAL_DIRECTION.test(c))).toEqual([]);
    expect(row.className).toMatch(/\bgap-/);
  });
});
