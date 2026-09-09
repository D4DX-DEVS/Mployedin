import { render, screen } from "@testing-library/react";
import { NewJobChooser } from "@/components/features/employer/jobs/NewJobChooser";

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/jobs/new",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
}));

describe("NewJobChooser", () => {
  it("offers the four ways to start, each as a plain link to its own route", () => {
    render(<NewJobChooser locale="en" />);

    expect(screen.getByRole("heading", { level: 1, name: "Post a job" })).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/en/employer/jobs/ai-create",
      "/en/employer/jobs/new?mode=manual",
      "/en/employer/jobs/new?from=template",
      "/en/employer/jobs/ai-extract",
    ]);
  });

  it("recommends the AI path and nothing else, and prefixes links with the locale", () => {
    // The next-intl test mock serves English for every locale; the locale
    // prop only shapes the hrefs here.
    render(<NewJobChooser locale="ar" />);

    expect(screen.getAllByText("Recommended")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Describe it with AI/ })).toHaveTextContent("Recommended");
    expect(screen.getByRole("link", { name: /Start from a template/ })).toHaveAttribute("href", "/ar/employer/jobs/new?from=template");
  });
});
