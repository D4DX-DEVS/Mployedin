/**
 * @jest-environment jsdom
 *
 * /api/public/blogs/[slug] answers { post }, but the page stored the wrapper as
 * the post, so every article rendered an empty title and body (audit
 * 2026-09-24 re-audit, PUB-03).
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
jest.mock("next/navigation", () => ({ usePathname: () => "/en/blog/hiring-in-dubai" }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import BlogDetailPage from "@/app/[locale]/(public)/blog/[slug]/page";

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
}

it("renders the post the API returns", async () => {
  mockFetch(200, {
    post: {
      _id: "1", slug: "hiring-in-dubai", title: "Hiring in Dubai", titleAr: "", body: "<p>Article body</p>", bodyAr: "",
      coverImage: "", author: "Editor", tags: ["hiring"], publishedAt: "2026-09-01T00:00:00.000Z",
    },
  });
  render(<BlogDetailPage />);

  expect(await screen.findByRole("heading", { level: 1, name: "Hiring in Dubai" })).toBeInTheDocument();
  expect(screen.getByText("Article body")).toBeInTheDocument();
});

it("shows the not-found state for an unknown slug", async () => {
  mockFetch(404, { error: "Blog post not found" });
  render(<BlogDetailPage />);

  expect(await screen.findByRole("heading", { level: 1, name: "articleNotFoundHeading" })).toBeInTheDocument();
});

it("shows the not-found state when the response has no post", async () => {
  mockFetch(200, {});
  render(<BlogDetailPage />);

  expect(await screen.findByRole("heading", { level: 1, name: "articleNotFoundHeading" })).toBeInTheDocument();
});
