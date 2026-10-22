/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/jobs/abc",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

import PublicHeader from "@/components/shared/PublicHeader";
import PublicFooter from "@/components/shared/PublicFooter";
import { clearPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

const CODE = "MPL-1A2B3C4D5E6F7A8B";

afterEach(() => clearPendingReferral());

function registerLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter((a) =>
    /\/en\/register(\?|$)/.test(a.getAttribute("href") ?? ""),
  );
}

describe("public header register link", () => {
  it("is the plain register page when no referral code was seen", () => {
    render(<PublicHeader locale="en" />);
    expect(registerLinks().map((a) => a.getAttribute("href"))).toEqual(["/en/register"]);
  });

  it("carries the referral code seen on the job page, desktop and mobile", () => {
    render(<PublicHeader locale="en" />);
    act(() => setPendingReferral(CODE));
    expect(registerLinks().map((a) => a.getAttribute("href"))).toEqual([`/en/register?ref=${CODE}`]);

    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    expect(registerLinks().map((a) => a.getAttribute("href"))).toEqual([
      `/en/register?ref=${CODE}`,
      `/en/register?ref=${CODE}`,
    ]);
  });

  it("never touches the employer registration link", () => {
    render(<PublicHeader locale="en" />);
    act(() => setPendingReferral(CODE));
    const employer = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter((a) =>
      (a.getAttribute("href") ?? "").includes("employer-register"),
    );
    expect(employer.length).toBeGreaterThan(0);
    employer.forEach((a) => expect(a.getAttribute("href")).toBe("/en/employer-register"));
  });
});

describe("public footer register link", () => {
  it("follows the same code", () => {
    render(<PublicFooter locale="en" />);
    expect(registerLinks().map((a) => a.getAttribute("href"))).toEqual(["/en/register"]);
    act(() => setPendingReferral(CODE));
    expect(registerLinks().map((a) => a.getAttribute("href"))).toEqual([`/en/register?ref=${CODE}`]);
  });
});
