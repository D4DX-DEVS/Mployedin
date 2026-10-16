import { render } from "@testing-library/react";

jest.mock("@/lib/features/posterFeature", () => ({ POSTERS_ENABLED: false }));

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  useParams: () => ({ id: "job1", locale: "en" }),
}));

const reached = jest.fn(() => {
  throw new Error("page reached past the gate");
});
jest.mock("@/lib/db/mongoose", () => ({ connectDB: () => reached() }));
jest.mock("@/models/PosterGeneration", () => ({ __esModule: true, default: { findOne: () => reached(), findOneAndUpdate: () => reached() } }));
jest.mock("@/lib/auth/requireCompanyFunction", () => ({ requireCompanyFunction: () => reached() }));
jest.mock("@/components/features/employer/poster/CreatePosterPage", () => ({ CreatePosterPage: () => null }));
jest.mock("@/components/features/employer/poster/MyPostersPage", () => ({ MyPostersPage: () => null }));
jest.mock("@/components/features/employer/poster/PosterShareView", () => ({ PosterShareView: () => null }));
jest.mock("next-intl/server", () => ({ getMessages: () => reached() }));

import PosterPage from "@/app/[locale]/(dashboard)/employer/jobs/[id]/poster/page";
import MyPostersRoute from "@/app/[locale]/(dashboard)/employer/my-posters/page";
import PosterSharePage, { generateMetadata } from "@/app/[locale]/poster/[slug]/page";

const params = Promise.resolve({ slug: "abc", locale: "en" });

describe("poster pages while posters are hidden", () => {
  beforeEach(() => reached.mockClear());

  it("the composer page 404s", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PosterPage />)).toThrow(NOT_FOUND);
  });

  it("My posters 404s before the permission check", async () => {
    await expect(MyPostersRoute()).rejects.toBe(NOT_FOUND);
    expect(reached).not.toHaveBeenCalled();
  });

  it("the public share page 404s without counting a view", async () => {
    await expect(PosterSharePage({ params })).rejects.toBe(NOT_FOUND);
    expect(reached).not.toHaveBeenCalled();
  });

  it("share-page metadata 404s without a DB read", async () => {
    await expect(generateMetadata({ params })).rejects.toBe(NOT_FOUND);
    expect(reached).not.toHaveBeenCalled();
  });
});
