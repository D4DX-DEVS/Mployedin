/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import { JobSeekerTopNav, JobSeekerTopNavMobile } from "@/components/shared/JobSeekerTopNav";

const translations: Record<string, Record<string, string>> = {
  nav: {
    home: "الرئيسية",
    jobs: "الوظائف",
    applications: "الطلبات",
    messages: "الرسائل",
    profile: "الملف الشخصي",
  },
};

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/ar/job-seeker",
}));

jest.mock("next-intl", () => ({
  useTranslations: (namespace: keyof typeof translations) => (key: string) => translations[namespace]?.[key] ?? key,
}));

jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, layoutId: _layoutId, ...props }: React.HTMLAttributes<HTMLSpanElement> & { layoutId?: string }) => <span {...props}>{children}</span>,
  },
}));

describe("JobSeekerTopNav", () => {
  it("renders Arabic labels on desktop nav", () => {
    render(<JobSeekerTopNav locale="ar" />);

    expect(screen.getByText("الرئيسية")).toBeInTheDocument();
    expect(screen.getByText("الوظائف")).toBeInTheDocument();
    expect(screen.getByText("الطلبات")).toBeInTheDocument();
    expect(screen.getByText("الرسائل")).toBeInTheDocument();
    expect(screen.getByText("الملف الشخصي")).toBeInTheDocument();
  });

  it("renders Arabic labels on mobile nav", () => {
    render(<JobSeekerTopNavMobile locale="ar" />);

    expect(screen.getByText("الرئيسية")).toBeInTheDocument();
    expect(screen.getByText("الوظائف")).toBeInTheDocument();
    expect(screen.getByText("الطلبات")).toBeInTheDocument();
    expect(screen.getByText("الرسائل")).toBeInTheDocument();
    expect(screen.getByText("الملف الشخصي")).toBeInTheDocument();
  });
});