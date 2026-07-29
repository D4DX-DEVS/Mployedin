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

describe("CommandMenu", () => {
  beforeEach(() => {
    pushMock.mockReset();
    global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  it("renders all employer menu sections and routes in the command menu", async () => {
    const navGroups = getNavGroups("employer", "en");

    render(<CommandMenu navGroups={navGroups} locale="en" />);

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
});
