/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SocialShare from "@/components/features/public/SocialShare";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

describe("SocialShare", () => {
  const props = {
    url: "https://mployedin.com/jobs/123",
    title: "Software Engineer at Acme",
    description: "Join our team",
  };

  it("renders the share button", () => {
    render(<SocialShare {...props} />);
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("shows sharing options when clicked", () => {
    render(<SocialShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Twitter")).toBeInTheDocument();
    expect(screen.getByText("Facebook")).toBeInTheDocument();
  });

  it("has correct share URLs with encoded params", () => {
    render(<SocialShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    const linkedinLink = screen.getByText("LinkedIn").closest("a");
    expect(linkedinLink).toHaveAttribute("href", expect.stringContaining("linkedin.com/sharing"));
    expect(linkedinLink).toHaveAttribute("href", expect.stringContaining(encodeURIComponent(props.url)));

    const whatsappLink = screen.getByText("WhatsApp").closest("a");
    expect(whatsappLink).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });

  it("has copy link button", () => {
    render(<SocialShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));

    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });

  it("copies URL to clipboard when copy link is clicked", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });

    render(<SocialShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(props.url);
  });
});
