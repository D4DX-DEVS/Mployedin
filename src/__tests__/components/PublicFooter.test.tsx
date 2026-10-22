/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import PublicFooter from "@/components/shared/PublicFooter";
import { OPEN_SETTINGS_EVENT } from "@/lib/consent/client";

const enMessages: Record<string, string> = {
  digitalPlatform: "Digital hiring platform",
  description: "MPLOYEDIN brings job discovery, AI matching, and employer workflows into one cleaner hiring experience for Gulf markets.",
  aiMatching: "AI-powered matching",
  fasterScreening: "Faster candidate screening",
  smarterHiring: "Smarter Gulf hiring",
  browseJobs: "Browse jobs",
  forEmployers: "For employers",
  followUs: "Follow us",
  allRights: "All rights reserved.",
  platform: "Platform",
  discoverJobs: "Discover jobs",
  buildProfile: "Build your profile",
  hiringSolutions: "Hiring solutions",
  workspaceLogin: "Workspace login",
  resources: "Resources",
  blogLink: "Blog",
  faqLink: "FAQ",
  talkToUs: "Talk to us",
  company: "Company",
  privacy: "Privacy",
  cookies: "Cookies",
  cookieSettings: "Cookie settings",
  terms: "Terms",
  gdpr: "GDPR",
  accessibility: "Accessibility",
  support: "Support",
  homepage: "Homepage",
};

const arMessages: Record<string, string> = {
  digitalPlatform: "منصة توظيف رقمية",
  resources: "الموارد",
  followUs: "تابعنا",
  platform: "المنصة",
  company: "الشركة",
  aiMatching: "مطابقة مدعومة بالذكاء الاصطناعي",
  fasterScreening: "فرز أسرع للمرشحين",
  smarterHiring: "توظيف أذكى في الخليج",
  browseJobs: "تصفح الوظائف",
  forEmployers: "لأصحاب العمل",
  allRights: "جميع الحقوق محفوظة.",
  description: "توفر MPLOYEDIN اكتشاف الوظائف والمطابقة الذكية وسير عمل أصحاب العمل في تجربة توظيف واحدة لأسواق الخليج.",
  discoverJobs: "اكتشف الوظائف",
  buildProfile: "أنشئ ملفك",
  hiringSolutions: "حلول التوظيف",
  workspaceLogin: "دخول مساحة العمل",
  blogLink: "المدونة",
  faqLink: "الأسئلة الشائعة",
  talkToUs: "تواصل معنا",
  privacy: "الخصوصية",
  cookies: "ملفات تعريف الارتباط",
  terms: "الشروط",
  gdpr: "GDPR",
  support: "الدعم",
  homepage: "الصفحة الرئيسية",
};

let activeMessages = enMessages;

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => activeMessages[key] ?? key,
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

describe("PublicFooter", () => {
  beforeEach(() => {
    activeMessages = enMessages;
  });

  it("renders a compact product-first footer instead of the old sitemap sections", () => {
    render(<PublicFooter locale="en" />);

    expect(screen.getByText("Digital hiring platform")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hiring solutions" })).toHaveAttribute("href", "/en/employer-register");
    expect(screen.getByText(/Greenleaf Walk/i)).toBeInTheDocument();
    expect(screen.getByText("support@mployedin.com")).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp")).toHaveAttribute("href", expect.stringContaining("whatsapp.com"));
    expect(screen.getByLabelText("Instagram")).toHaveAttribute("href", expect.stringContaining("instagram.com"));
    expect(screen.getByText("AI-powered matching")).toBeInTheDocument();
    expect(screen.queryByText("Jobs By Functional Area")).not.toBeInTheDocument();
    expect(screen.queryByText("Jobs By Industry")).not.toBeInTheDocument();
  });

  it("links the accessibility statement next to the other legal pages once it is published", () => {
    render(<PublicFooter locale="ar" showAccessibilityLink />);

    expect(screen.getByRole("link", { name: "Accessibility" })).toHaveAttribute("href", "/ar/accessibility");
  });

  it("leaves the accessibility link out while the statement is unpublished", () => {
    render(<PublicFooter locale="en" />);

    expect(screen.queryByRole("link", { name: "Accessibility" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });

  it("uses the smaller embedded variant without the extra highlight content", () => {
    render(<PublicFooter locale="en" variant="embedded" />);

    expect(screen.getByRole("link", { name: "Workspace login" })).toHaveAttribute("href", "/en/login");
    expect(screen.queryByText("AI-powered matching")).not.toBeInTheDocument();
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
  });

  it("offers Cookie settings right after the Cookie Policy link", () => {
    const opened = jest.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    render(<PublicFooter locale="en" />);

    const policy = screen.getByRole("link", { name: "Cookies" });
    const settings = screen.getByRole("button", { name: "Cookie settings" });
    expect(policy.closest("li")?.nextElementSibling).toBe(settings.closest("li"));
    fireEvent.click(settings);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
  });

  // Final review M3: the embedded footer hides its Company column below 640px, which took the Cookie
  // Policy and Cookie settings with it on phones (onboarding, the job pages inside the app shell).
  it("keeps the Cookie Policy and Cookie settings reachable on phones in the embedded footer", () => {
    const opened = jest.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, opened);
    render(<PublicFooter locale="ar" variant="embedded" />);

    const phoneRow = screen.getByTestId("footer-phone-legal");
    expect(phoneRow).toHaveClass("sm:hidden");
    expect(phoneRow.closest(".hidden")).toBeNull();
    expect(within(phoneRow).getByRole("link", { name: "Cookies" })).toHaveAttribute("href", "/ar/cookies");
    const settings = within(phoneRow).getByRole("button", { name: "Cookie settings" });
    for (const target of [within(phoneRow).getByRole("link", { name: "Cookies" }), settings]) {
      expect(target).toHaveClass("min-h-11");
    }
    fireEvent.click(settings);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
  });

  it("leaves the phone legal row out of the full footer, whose Company column shows on phones", () => {
    render(<PublicFooter locale="en" />);
    expect(screen.queryByTestId("footer-phone-legal")).not.toBeInTheDocument();
  });

  it("renders the localized Arabic footer content", () => {
    activeMessages = arMessages;
    render(<PublicFooter locale="ar" />);

    expect(screen.getByText("منصة توظيف رقمية")).toBeInTheDocument();
    expect(screen.getByText("الموارد")).toBeInTheDocument();
    expect(screen.getByText("تابعنا")).toBeInTheDocument();
  });
});
