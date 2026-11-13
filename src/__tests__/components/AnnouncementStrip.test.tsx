import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AnnouncementStrip } from "@/components/shared/AnnouncementStrip";
import type { IBanner } from "@/models/Banner";

// Mock next-intl
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, opts?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      dismiss: "Dismiss",
      count: `${opts?.current} of ${opts?.total}`,
    };
    return translations[key] || key;
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("AnnouncementStrip", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("should render nothing when there are no announcements", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: [] }),
      } as unknown as Response),
    );

    const { container } = render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("should render nothing while loading", () => {
    global.fetch = jest.fn(() => new Promise(() => {})); // Never resolves

    const { container } = render(<AnnouncementStrip locale="en" />);

    expect(container.firstChild).toBeNull();
  });

  it("should render the first announcement when available", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test Banner",
        titleAr: "بانر اختبار",
        subtitle: "This is a test announcement",
        subtitleAr: "هذا هو إعلان اختبار",
        image: "https://example.com/image.jpg",
        linkUrl: "https://example.com",
        linkText: "Learn more",
        linkTextAr: "اعرف المزيد",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      expect(screen.getByText("This is a test announcement")).toBeInTheDocument();
    });
  });

  it("should show Arabic text when locale is ar", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test Banner",
        titleAr: "بانر اختبار",
        subtitle: "English text",
        subtitleAr: "النص العربي",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    render(<AnnouncementStrip locale="ar" />);

    await waitFor(() => {
      expect(screen.getByText("النص العربي")).toBeInTheDocument();
      expect(screen.queryByText("English text")).not.toBeInTheDocument();
    });
  });

  it("should show dismiss button when dismissible is true", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test Banner",
        titleAr: "",
        subtitle: "Dismissible announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      expect(dismissButton).toBeInTheDocument();
    });
  });

  it("should dismiss announcement when dismiss button is clicked", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test Banner",
        titleAr: "",
        subtitle: "Dismissible announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    const { container } = render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      fireEvent.click(dismissButton);
    });

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("should persist dismissal in localStorage", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "banner-1",
        title: "Test Banner",
        titleAr: "",
        subtitle: "Dismissible announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      const dismissButton = screen.getByRole("button", { name: "Dismiss" });
      fireEvent.click(dismissButton);
    });

    await waitFor(() => {
      const stored = localStorage.getItem("mployedin:dismissed-announcements");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored || "[]");
      expect(parsed).toContain("banner-1");
    });
  });

  it("should apply correct style colors based on style prop", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test Banner",
        titleAr: "",
        subtitle: "Warning announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "warning",
        dismissible: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    const { container } = render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      const stripDiv = container.querySelector('[role="status"]');
      expect(stripDiv).toHaveClass("bg-amber-50");
    });
  });

  it("should show count when multiple announcements exist", async () => {
    const mockAnnouncements: IBanner[] = [
      {
        _id: "1",
        title: "Test 1",
        titleAr: "",
        subtitle: "First announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
      {
        _id: "2",
        title: "Test 2",
        titleAr: "",
        subtitle: "Second announcement",
        subtitleAr: "",
        image: "https://example.com/image.jpg",
        linkUrl: "",
        linkText: "",
        linkTextAr: "",
        sortOrder: 0,
        isActive: true,
        placement: ["in-app-announcement"],
        audienceRoles: ["all"],
        style: "info",
        dismissible: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as IBanner,
    ];

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ announcements: mockAnnouncements }),
      } as Response),
    );

    render(<AnnouncementStrip locale="en" />);

    await waitFor(() => {
      expect(screen.getByText("1 of 2")).toBeInTheDocument();
    });
  });
});
