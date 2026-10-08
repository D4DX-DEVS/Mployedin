/**
 * @jest-environment jsdom
 *
 * The blog post page is server-rendered (JS-2): it reads the post with the
 * same visibility rule as /api/public/blogs/[slug], renders an <h1> and the
 * body on first paint, and calls notFound() for a missing slug so the 404 is
 * real and rendered inside the public layout.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

const t = (key: string) => key;
jest.mock("next-intl/server", () => ({ getTranslations: async () => t }));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
const notFound = jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
jest.mock("next/navigation", () => ({ notFound: () => notFound() }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));

const findOne = jest.fn();
jest.mock("@/models/BlogPost", () => ({
  __esModule: true,
  default: { findOne: (...args: unknown[]) => findOne(...args) },
}));

import BlogDetailPage, { generateMetadata } from "@/app/[locale]/(public)/blog/[slug]/page";

function mockPost(post: unknown) {
  findOne.mockReturnValue({ lean: () => Promise.resolve(post) });
}

const params = (slug: string, locale = "en") => ({ params: Promise.resolve({ locale, slug }) });

const POST = {
  title: "Hiring in Dubai", titleAr: "", excerpt: "", body: "<p>Article body</p>", bodyAr: "",
  coverImage: "", author: "Editor", tags: ["hiring"], publishedAt: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => { findOne.mockReset(); notFound.mockClear(); });

it("server-renders the published post with an h1", async () => {
  mockPost(POST);
  render(await BlogDetailPage(params("hiring-in-dubai")));

  expect(screen.getByRole("heading", { level: 1, name: "Hiring in Dubai" })).toBeInTheDocument();
  expect(screen.getByText("Article body")).toBeInTheDocument();
  expect(findOne).toHaveBeenCalledWith({ slug: "hiring-in-dubai", isActive: true, status: "published" });
});

it("calls notFound() for an unknown slug", async () => {
  mockPost(null);
  await expect(BlogDetailPage(params("missing"))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalled();
});

it("builds title, description and Open Graph metadata from the post", async () => {
  mockPost(POST);
  const meta = await generateMetadata(params("hiring-in-dubai"));

  expect(meta.title).toBe("Hiring in Dubai");
  expect(meta.description).toBe("Article body");
  expect(meta.openGraph).toMatchObject({ title: "Hiring in Dubai | MPLOYEDIN", type: "article" });
});
