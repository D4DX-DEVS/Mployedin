/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StickyApplyBar } from "@/components/features/public/StickyApplyBar";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      stickyApply: "Easy Apply",
    };
    return translations[key] || key;
  },
}));

describe("StickyApplyBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the component with job title and button", () => {
    render(
      <StickyApplyBar
        targetId="apply-card"
        jobTitle="Senior Developer"
      />
    );

    expect(screen.getByText("Senior Developer")).toBeInTheDocument();
    expect(screen.getByText("Easy Apply")).toBeInTheDocument();
  });

  it("renders salary line when provided", () => {
    render(
      <StickyApplyBar
        targetId="apply-card"
        jobTitle="Senior Developer"
        salaryLine="AED 5,000 - AED 8,000 / month"
      />
    );

    expect(screen.getByText("AED 5,000 - AED 8,000 / month")).toBeInTheDocument();
  });

  it("scrolls to target element when button is clicked", async () => {
    const user = userEvent.setup();
    const mockScrollIntoView = jest.fn();

    // Create a mock element with scrollIntoView
    const mockElement = document.createElement("div");
    mockElement.id = "apply-card";
    mockElement.scrollIntoView = mockScrollIntoView;
    document.body.appendChild(mockElement);

    render(
      <StickyApplyBar
        targetId="apply-card"
        jobTitle="Senior Developer"
      />
    );

    const button = screen.getByText("Easy Apply");
    await user.click(button);

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    document.body.removeChild(mockElement);
  });

  it("does not throw when IntersectionObserver is undefined", () => {
    const originalIO = global.IntersectionObserver;
    // @ts-expect-error - temporarily removing IntersectionObserver
    delete global.IntersectionObserver;

    expect(() => {
      render(
        <StickyApplyBar
          targetId="apply-card"
          jobTitle="Senior Developer"
        />
      );
    }).not.toThrow();

    global.IntersectionObserver = originalIO;
  });

  it("observes the target element when mounted", () => {
    const mockElement = document.createElement("div");
    mockElement.id = "apply-card";
    document.body.appendChild(mockElement);

    const mockObserve = jest.fn();
    const mockDisconnect = jest.fn();

    const mockIntersectionObserver = jest.fn((callback) => ({
      observe: mockObserve,
      unobserve: jest.fn(),
      disconnect: mockDisconnect,
    }));

    global.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;

    render(
      <StickyApplyBar
        targetId="apply-card"
        jobTitle="Senior Developer"
      />
    );

    expect(mockObserve).toHaveBeenCalledWith(mockElement);

    // Cleanup
    document.body.removeChild(mockElement);
  });
});
