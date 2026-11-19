/**
 * @jest-environment jsdom
 *
 * "Preview as employers see it" in Arabic: the real Arabic messages on a
 * right-to-left page. The dialog's own chrome uses logical spacing only so it
 * flips with the page; the CV inside draws itself in its own direction
 * (the Classic template handles right-to-left). English is in
 * EmployerViewPreview.test.tsx.
 */
import { render, screen, within, fireEvent } from "@testing-library/react";
import { STAFF_CV_TEMPLATE } from "@/lib/jobSeeker/cvDesign";

// The global next-intl mock serves English; this suite renders the real Arabic messages instead.
jest.mock("next-intl", () => {
  const IntlMessageFormat = jest.requireActual("intl-messageformat").default;
  const ar = jest.requireActual("../../../messages/ar.json") as Record<string, unknown>;
  const lookup = (namespace: string, key: string): unknown =>
    `${namespace}.${key}`.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), ar);
  return {
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

const viewProps = jest.fn();
jest.mock("next/dynamic", () => () => function MployedinCvViewStub(props: Record<string, unknown>) {
  viewProps(props);
  return <div data-testid="mployedin-cv-view" />;
});

import { EmployerViewPreview } from "@/app/[locale]/(dashboard)/job-seeker/cv/EmployerViewPreview";
import ar from "../../../messages/ar.json";

const SEEKER_ID = "64b000000000000000000001";
const PHYSICAL_DIRECTION = /(^|\s)(-?m[lr]-|-?p[lr]-|left-|right-|text-left|text-right|float-left|float-right|rounded-[lr]-|border-[lr](-|\s|$))/;
const copy = ar.cvBuilderPage.employerView;

function mockBuilt(hasContent: boolean) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ hasContent, identity: { fullName: "سارة أحمد", email: "", phone: "" }, profile: {} }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  viewProps.mockClear();
  document.documentElement.dir = "rtl";
  document.documentElement.lang = "ar";
});
afterEach(() => {
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

describe("EmployerViewPreview in Arabic", () => {
  it("labels the button, the dialog and the notes in Arabic", async () => {
    mockBuilt(true);
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile hasUnsavedChanges />);
    fireEvent.click(screen.getByRole("button", { name: copy.open }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(copy.title)).toBeInTheDocument();
    expect(within(dialog).getByText(copy.description)).toBeInTheDocument();
    expect(within(dialog).getByText(copy.uploadedFile)).toBeInTheDocument();
    expect(within(dialog).getByText(copy.unsaved)).toBeInTheDocument();
    await within(dialog).findByTestId("mployedin-cv-view");
    // The CV is the same fixed template in Arabic as in English.
    expect(viewProps).toHaveBeenLastCalledWith(expect.objectContaining({ templateOverride: STAFF_CV_TEMPLATE, showToolbar: false }));
  });

  it("gives the empty-profile note in Arabic", async () => {
    mockBuilt(false);
    render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile={false} />);
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it("uses logical spacing only, so the chrome flips with the page", async () => {
    mockBuilt(true);
    const { container } = render(<EmployerViewPreview seekerId={SEEKER_ID} hasUploadedFile hasUnsavedChanges />);
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByTestId("mployedin-cv-view");
    const classes = [container, dialog].flatMap((root) => [root, ...Array.from(root.querySelectorAll("[class]"))])
      .map((el) => el.getAttribute("class") ?? "");
    for (const cls of classes) {
      // The shared Dialog's own sm:left-[50%] centring is not ours.
      if (cls.includes("fixed")) continue;
      expect(cls).not.toMatch(PHYSICAL_DIRECTION);
    }
  });
});
