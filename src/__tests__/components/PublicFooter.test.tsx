/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

import PublicFooter from "@/components/shared/PublicFooter";

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

  it("uses the smaller embedded variant without the extra highlight content", () => {
    render(<PublicFooter locale="en" variant="embedded" />);

    expect(screen.getByRole("link", { name: "Workspace login" })).toHaveAttribute("href", "/en/login");
    expect(screen.queryByText("AI-powered matching")).not.toBeInTheDocument();
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
  });

  it("renders the localized Arabic footer content", () => {
    render(<PublicFooter locale="ar" />);

    expect(screen.getByText("منصة توظيف رقمية")).toBeInTheDocument();
    expect(screen.getByText("الموارد")).toBeInTheDocument();
    expect(screen.getByText("تابعنا")).toBeInTheDocument();
  });
});