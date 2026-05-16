/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import LandingPage from "@/components/features/public/LandingPage";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useRouter: () => ({ push: jest.fn() }),
}));

describe("LandingPage", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => ({
        banners: [
          {
            _id: "banner-1",
            title: "Desktop banner",
            titleAr: "لافتة سطح المكتب",
            subtitle: "Primary hero banner",
            subtitleAr: "لافتة رئيسية",
            image: "/desktop-banner.jpg",
            imageMobile: "/mobile-banner.jpg",
            linkUrl: "/en/jobs",
            linkText: "Explore now",
            linkTextAr: "استكشف الآن",
          },
        ],
        faqs: [],
        testimonials: [],
        videos: [],
        recentPosts: [],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("renders the banner image when the backend provides banner data", async () => {
    render(<LandingPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/public/landing");
    });

    const bannerImage = await screen.findByAltText("Desktop banner");

    expect(bannerImage).toHaveAttribute("src", "/desktop-banner.jpg");
  });
});