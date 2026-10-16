import { render, screen } from "@testing-library/react";
import JobPostingPage from "@/app/[locale]/(dashboard)/employer/jobs/[id]/posting/page";

jest.mock("@/lib/features/posterFeature", () => ({ POSTERS_ENABLED: false }));

const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en", id: "job1" }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams("create=1"),
}));
// One stable t across renders (memory: a new t per render loops effects that list t as a dep).
const t = (key: string) => key;
jest.mock("next-intl", () => ({ useTranslations: () => t }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
jest.mock("@/hooks/useJobs", () => ({
  useJobDetail: () => ({ data: { _id: "job1", status: "active", title: "Accountant" } }),
  useSaveAsTemplate: () => ({ mutateAsync: jest.fn() }),
  useJobTemplates: () => ({ data: [] }),
}));
jest.mock("@/components/features/employer/poster/MyPostersPage", () => ({
  MyPostersPage: () => <div data-testid="embedded-posters" />,
}));

describe("Posting tab while posters are hidden", () => {
  beforeEach(() => mockReplace.mockClear());

  it("shows the public listing and reuse sections but no Posters section", () => {
    render(<JobPostingPage />);
    expect(screen.getByText("postingPublicTitle")).toBeInTheDocument();
    expect(screen.getByText("postingTemplateTitle")).toBeInTheDocument();
    expect(screen.queryByText("postingPostersTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("postingCreatePoster")).not.toBeInTheDocument();
    expect(screen.queryByTestId("embedded-posters")).not.toBeInTheDocument();
  });

  it("ignores the legacy ?create=1 jump into the composer", () => {
    render(<JobPostingPage />);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
