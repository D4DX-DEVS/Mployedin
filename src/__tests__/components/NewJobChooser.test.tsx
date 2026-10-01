import { render, screen, waitFor } from "@testing-library/react";
import { NewJobChooser } from "@/components/features/employer/jobs/NewJobChooser";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/employer/jobs/new",
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
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

  describe("for an agent", () => {
    const EMPLOYER = "64a000000000000000000003";

    beforeEach(() => {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: jest.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ employers: [{ _id: EMPLOYER, companyName: "Gulf Care Clinic", assignedToMe: true }] }),
        }),
      });
    });

    it("asks for the employer first and holds the options until one is picked", async () => {
      render(<NewJobChooser locale="en" basePath="agent" />);

      expect(await screen.findByText("Choose the employer this job is for, then pick how to start.")).toBeInTheDocument();
      expect(screen.queryAllByRole("link")).toHaveLength(0);
      expect(screen.getByText("Describe it with AI").closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/api/employers?limit=500"));
    });

    it("offers the employer's four ways in, each carrying the picked employer", async () => {
      render(<NewJobChooser locale="en" basePath="agent" employerId={EMPLOYER} />);

      expect(await screen.findByText("Gulf Care Clinic")).toBeInTheDocument();
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        `/en/agent/jobs/ai-create?employer=${EMPLOYER}`,
        `/en/agent/jobs/new?mode=manual&employer=${EMPLOYER}`,
        `/en/agent/jobs/new?from=template&employer=${EMPLOYER}`,
        `/en/agent/jobs/ai-extract?employer=${EMPLOYER}`,
      ]);
    });
  });
});
