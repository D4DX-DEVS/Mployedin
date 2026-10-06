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
      expect(dialogScope.getByRole("group", { name: "Actions" })).toBeInTheDocument();
    });
    // The manual job form is otherwise reachable only by knowing ?mode=manual.
    expect(dialogScope.getByText("Write a job myself")).toBeInTheDocument();

    fireEvent.click(dialogScope.getByText("Write a job myself"));
    expect(pushMock).toHaveBeenCalledWith("/en/employer/jobs/new?mode=manual");
  });

  it("offers the job and its applications inbox for every employer job hit", async () => {
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => ({ jobs: [{ id: "j1", title: "QA Engineer", status: "active" }], candidates: [] }) })
    );
    render(
      <CommandMenu navGroups={getNavGroups("employer", "en")} locale="en" userRole="employer" />
    );
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const dialog = await screen.findByRole("dialog");
    const dialogScope = within(dialog);
    fireEvent.change(dialogScope.getByRole("combobox"), { target: { value: "QA" } });

    const inbox = await dialogScope.findByText("Applications for QA Engineer");
    expect(dialogScope.getByText("QA Engineer")).toBeInTheDocument();
    fireEvent.click(inbox);
    expect(pushMock).toHaveBeenCalledWith("/en/employer/jobs/j1/applications");
  });

  describe("People / Pages / Actions filters", () => {
    async function openPalette(role: "employer" | "job_seeker" = "employer") {
      render(<CommandMenu navGroups={getNavGroups(role, "en")} locale="en" userRole={role} />);
      fireEvent.keyDown(document, { key: "k", ctrlKey: true });
      const dialog = within(await screen.findByRole("dialog"));
      await waitFor(() => expect(dialog.getByText("General")).toBeInTheDocument());
      return dialog;
    }

    it("narrows the list to actions, and back to everything on a second click", async () => {
      const dialog = await openPalette();
      const chip = dialog.getByRole("button", { name: "Actions" });

      fireEvent.click(chip);
      expect(chip).toHaveAttribute("aria-pressed", "true");
      expect(dialog.getByText("Write a job myself")).toBeInTheDocument();
      expect(dialog.queryByText("General")).not.toBeInTheDocument();

      fireEvent.click(chip);
      expect(chip).toHaveAttribute("aria-pressed", "false");
      expect(dialog.getByText("General")).toBeInTheDocument();
    });

    it("narrows the list to pages", async () => {
      const dialog = await openPalette();

      fireEvent.click(dialog.getByRole("button", { name: "Pages" }));

      expect(dialog.getByText("General")).toBeInTheDocument();
      expect(dialog.queryByText("Write a job myself")).not.toBeInTheDocument();
    });

    it("narrows the list to people, asking for a name until one is typed", async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            jobs: [{ id: "j1", title: "Sara's team lead", status: "active" }],
            candidates: [{ id: "c1", name: "Sara Ahmed", jobTitle: "QA Engineer", status: "new" }],
          }),
        })
      );
      const dialog = await openPalette();

      fireEvent.click(dialog.getByRole("button", { name: "People" }));
      expect(dialog.getByText("Type at least 2 letters of a name to find people.")).toBeInTheDocument();
      expect(dialog.queryByText("General")).not.toBeInTheDocument();

      fireEvent.change(dialog.getByRole("combobox"), { target: { value: "Sa" } });
      await dialog.findByText("Sara Ahmed");
      // A job is not a person.
      expect(dialog.queryByText("Sara's team lead")).not.toBeInTheDocument();

      fireEvent.click(dialog.getByText("Sara Ahmed"));
      expect(pushMock).toHaveBeenCalledWith("/en/employer/applications?search=Sara%20Ahmed");
    });

    it("says it is searching, not that nothing was found, while the lookup runs", async () => {
      (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
      const dialog = await openPalette();

      fireEvent.click(dialog.getByRole("button", { name: "People" }));
      fireEvent.change(dialog.getByRole("combobox"), { target: { value: "Sa" } });

      expect(await dialog.findByText("Searching…")).toBeInTheDocument();
      expect(dialog.queryByText("No results found.")).not.toBeInTheDocument();
    });

    it("toggles the chip on Enter instead of opening the highlighted row", async () => {
      const dialog = await openPalette();
      const chip = dialog.getByRole("button", { name: "Pages" });

      chip.focus();
      fireEvent.keyDown(chip, { key: "Enter" });

      expect(pushMock).not.toHaveBeenCalled();
    });

    it("offers no People filter to a job seeker, who has no people to find", async () => {
      const dialog = await openPalette("job_seeker");

      expect(dialog.queryByRole("button", { name: "People" })).not.toBeInTheDocument();
      expect(dialog.getByRole("button", { name: "Pages" })).toBeInTheDocument();
    });
  });
});

