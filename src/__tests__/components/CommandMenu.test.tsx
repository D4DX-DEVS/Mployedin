/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommandMenu } from "@/components/shared/CommandMenu";
import { getNavGroups } from "@/lib/nav/menuConfig";

const pushMock = jest.fn();

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => "/en/employer",
}));

// The palette reads permissions to decide which quick actions to offer.
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { role: "employer" } },
    status: "authenticated",
  }),
}));

// Entity hits are an addition to the palette; the nav assertions below run
// against a lookup that returns nothing.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: async () => ({ jobs: [], candidates: [] }) })
) as unknown as typeof fetch;

describe("CommandMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
    global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("renders all employer menu sections and routes in the command menu", async () => {
    const navGroups = getNavGroups("employer", "en");

    render(<CommandMenu navGroups={navGroups} locale="en" userRole="employer" />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    await waitFor(() => {
      expect(dialogScope.getByText("General")).toBeInTheDocument();
    });

    const standaloneItems = navGroups.flatMap((group) =>
      group.items.filter((item) => !item.children)
    );
    const groupedItems = navGroups.flatMap((group) =>
      group.items.filter((item) => item.children && item.children.length > 0)
    );

    for (const item of standaloneItems) {
      expect(dialogScope.getAllByText(item.title).length).toBeGreaterThan(0);
    }

    for (const parent of groupedItems) {
      expect(dialogScope.getAllByText(parent.title).length).toBeGreaterThan(0);

      for (const child of parent.children ?? []) {
        expect(dialogScope.getAllByText(child.title).length).toBeGreaterThan(0);
      }
    }
  });

  it("offers actions, not only destinations", async () => {
    render(
      <CommandMenu navGroups={getNavGroups("employer", "en")} locale="en" userRole="employer" />
    );
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);

    await waitFor(() => {
      expect(dialogScope.getByText("Actions")).toBeInTheDocument();
    });
    // The manual job form is otherwise reachable only by knowing ?mode=manual.
    expect(dialogScope.getByText("Write a job myself")).toBeInTheDocument();

    fireEvent.click(dialogScope.getByText("Write a job myself"));
    expect(pushMock).toHaveBeenCalledWith("/en/employer/jobs/new?mode=manual");
  });
});
