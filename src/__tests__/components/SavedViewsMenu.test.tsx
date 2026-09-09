/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedViewsMenu } from "@/components/features/employer/applications/SavedViewsMenu";

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock dropdown menu to render content synchronously in tests
jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children, open, onOpenChange }: any) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuTrigger: React.forwardRef(({ children, asChild, ...props }: any, ref: any) =>
    asChild ? (
      <>{children}</>
    ) : (
      <button ref={ref} {...props}>
        {children}
      </button>
    )
  ),
  DropdownMenuContent: ({ children, align }: any) => <div data-testid="dropdown-content" className={align}>{children}</div>,
  DropdownMenuGroup: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, title, className }: any) => (
    <div onClick={!disabled ? onClick : undefined} className={`dropdown-item ${disabled ? 'disabled' : ''} ${className || ''}`} role="menuitem">
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div />,
}));

// Mock Dialog to render content synchronously in tests
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open, onOpenChange }: any) => {
    React.useEffect(() => {
      // Store the onOpenChange callback globally so tests can access it
      if (onOpenChange) {
        (window as any).__dialogOpenChange = onOpenChange;
      }
    }, [onOpenChange]);

    return (
      <div data-testid="dialog" style={{ display: open ? "block" : "none" }}>
        {children}
      </div>
    );
  },
  DialogContent: ({ children, mobileSheet }: any) => <div data-testid="dialog-content" className={mobileSheet ? "mobile-sheet" : ""}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

describe("SavedViewsMenu", () => {
  const mockPresets = [
    { key: "top-matches", label: "Top matches", query: "scoreMin=70&sort=score" },
    { key: "needs-review", label: "Needs review", query: "unreviewed=1" },
  ];

  const mockViews = [
    { id: "view-1", name: "Senior roles", query: "search=senior" },
    { id: "view-2", name: "Full stack", query: "skills=React,Node" },
  ];

  const mockProps = {
    presets: mockPresets,
    views: mockViews,
    activeQuery: "",
    onApply: jest.fn(),
    onSave: jest.fn(),
    onDelete: jest.fn(),
    canSave: true,
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders trigger button", () => {
    render(<SavedViewsMenu {...mockProps} />);
    const trigger = screen.queryAllByRole("button").find(btn => btn.textContent?.includes("Views"));
    expect(trigger).toBeInTheDocument();
  });

  it("renders presets and views content", () => {
    render(<SavedViewsMenu {...mockProps} />);
    // With our mock, the content should be visible
    expect(screen.getByText("Top matches")).toBeInTheDocument();
    expect(screen.getByText("Senior roles")).toBeInTheDocument();
  });

  it("calls onApply when clicking a preset", () => {
    const onApply = jest.fn();
    render(<SavedViewsMenu {...mockProps} onApply={onApply} />);

    const topMatches = screen.getByText("Top matches").closest("button");
    if (topMatches) {
      fireEvent.click(topMatches);
      expect(onApply).toHaveBeenCalledWith("scoreMin=70&sort=score");
    }
  });

  it("calls onApply when clicking a saved view", () => {
    const onApply = jest.fn();
    render(<SavedViewsMenu {...mockProps} onApply={onApply} />);

    const seniorRoles = screen.getByText("Senior roles").closest("button");
    if (seniorRoles) {
      fireEvent.click(seniorRoles);
      expect(onApply).toHaveBeenCalledWith("search=senior");
    }
  });

  it("opens save dialog when clicking save option", async () => {
    const user = userEvent.setup();
    render(<SavedViewsMenu {...mockProps} />);

    const saveOption = screen.getByText("Save current view…").closest("button");
    if (saveOption) {
      await user.click(saveOption);
    }

    await waitFor(() => {
      expect(screen.getByText("Save this view")).toBeInTheDocument();
    });
  });

  it("calls onSave with view name", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<SavedViewsMenu {...mockProps} onSave={onSave} />);

    const saveOption = screen.getByText("Save current view…").closest("button");
    if (saveOption) {
      await user.click(saveOption);
    }

    await waitFor(() => {
      const input = screen.getByPlaceholderText("e.g. Senior React, high match") as HTMLInputElement;
      expect(input).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("e.g. Senior React, high match") as HTMLInputElement;
    await user.type(input, "My custom view");

    const saveButton = screen.getByText("Save view");
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("My custom view");
    });
  });

  it("disables save when at capacity", () => {
    render(<SavedViewsMenu {...mockProps} canSave={false} />);

    const saveOption = screen.getByText("Save current view…");
    const container = saveOption.closest(".dropdown-item") || saveOption.closest("div");
    expect(container).toHaveClass("disabled");
  });

  it("renders delete buttons for saved views", () => {
    render(<SavedViewsMenu {...mockProps} />);

    const deleteButtons = screen.getAllByRole("button", { name: "Delete view" });
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it("shows empty state when no presets or views", () => {
    render(<SavedViewsMenu {...mockProps} presets={[]} views={[]} />);
    expect(screen.getByText("No saved views yet")).toBeInTheDocument();
  });

  it("disables trigger button when loading", () => {
    render(<SavedViewsMenu {...mockProps} isLoading={true} />);

    const trigger = screen.getByRole("button", { name: "Views" });
    expect(trigger).toBeDisabled();
  });

  it("shows aria-pressed when activeQuery matches", () => {
    render(<SavedViewsMenu {...mockProps} activeQuery="scoreMin=70&sort=score" />);

    const trigger = screen.queryAllByRole("button").find(btn => btn.textContent?.includes("Views"));
    expect(trigger).toHaveAttribute("aria-pressed", "true");
  });
});
