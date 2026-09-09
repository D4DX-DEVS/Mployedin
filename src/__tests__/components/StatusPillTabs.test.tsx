/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatusPillTabs } from "@/components/features/job-seeker/StatusPillTabs";

jest.mock("framer-motion", () => ({
  motion: {
    span: ({ children, layoutId: _l, transition: _t, ...props }: React.HTMLAttributes<HTMLSpanElement> & Record<string, unknown>) => (
      <span {...props}>{children}</span>
    ),
  },
}));

const TABS = ["all", "applied", "hired"] as const;

describe("StatusPillTabs", () => {
  it("renders an accessible tablist with the active tab selected", () => {
    render(
      <StatusPillTabs tabs={TABS} active="applied" onChange={() => {}} label="Application status filters" renderLabel={(t) => t.toUpperCase()} idPrefix="applications" />
    );
    expect(screen.getByRole("tablist", { name: "Application status filters" })).toBeInTheDocument();
    const applied = screen.getByRole("tab", { name: "APPLIED" });
    expect(applied).toHaveAttribute("aria-selected", "true");
    expect(applied).toHaveAttribute("id", "applications-tab-applied");
    expect(applied).toHaveAttribute("aria-controls", "applications-panel-applied");
    expect(screen.getByRole("tab", { name: "ALL" })).toHaveAttribute("aria-selected", "false");
  });

  it("reports the clicked tab", async () => {
    const onChange = jest.fn();
    render(
      <StatusPillTabs tabs={TABS} active="all" onChange={onChange} label="x" renderLabel={(t) => t} idPrefix="p" />
    );
    await userEvent.click(screen.getByRole("tab", { name: "hired" }));
    expect(onChange).toHaveBeenCalledWith("hired");
  });

  describe("keyboard navigation", () => {
    function renderTabs(active: (typeof TABS)[number]) {
      const onChange = jest.fn();
      const utils = render(
        <StatusPillTabs tabs={TABS} active={active} onChange={onChange} label="x" renderLabel={(t) => t} idPrefix="p" />
      );
      return { onChange, ...utils };
    }

    // Renders inside a `dir="rtl"` container (appended to `document.body`,
    // mirroring the app's real `<html dir="rtl">` for the `ar` locale) so the
    // component's own direction detection is genuinely exercised, not assumed.
    function renderTabsRtl(active: (typeof TABS)[number]) {
      const onChange = jest.fn();
      const container = document.createElement("div");
      container.setAttribute("dir", "rtl");
      document.body.appendChild(container);
      const utils = render(
        <StatusPillTabs tabs={TABS} active={active} onChange={onChange} label="x" renderLabel={(t) => t} idPrefix="p" />,
        { container }
      );
      return { onChange, ...utils };
    }

    it("keeps only the active tab in the Tab order, and follows `active` when it changes", () => {
      const { onChange, rerender } = renderTabs("applied");
      expect(screen.getByRole("tab", { name: "all" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "applied" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByRole("tab", { name: "hired" })).toHaveAttribute("tabindex", "-1");

      rerender(
        <StatusPillTabs tabs={TABS} active="hired" onChange={onChange} label="x" renderLabel={(t) => t} idPrefix="p" />
      );
      expect(screen.getByRole("tab", { name: "all" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "applied" })).toHaveAttribute("tabindex", "-1");
      expect(screen.getByRole("tab", { name: "hired" })).toHaveAttribute("tabindex", "0");
    });

    it("moves to the next tab and calls onChange on ArrowRight", async () => {
      const { onChange } = renderTabs("applied");
      screen.getByRole("tab", { name: "applied" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith("hired");
      expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
    });

    it("moves to the previous tab and calls onChange on ArrowLeft", async () => {
      const { onChange } = renderTabs("applied");
      screen.getByRole("tab", { name: "applied" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith("all");
      expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();
    });

    it("wraps from the last tab to the first on ArrowRight", async () => {
      const { onChange } = renderTabs("hired");
      screen.getByRole("tab", { name: "hired" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith("all");
      expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();
    });

    it("wraps from the first tab to the last on ArrowLeft", async () => {
      const { onChange } = renderTabs("all");
      screen.getByRole("tab", { name: "all" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(onChange).toHaveBeenCalledWith("hired");
      expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
    });

    it("moves to the first tab on Home and the last tab on End", async () => {
      const { onChange } = renderTabs("applied");
      screen.getByRole("tab", { name: "applied" }).focus();
      await userEvent.keyboard("{Home}");
      expect(onChange).toHaveBeenCalledWith("all");
      expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();

      onChange.mockClear();
      screen.getByRole("tab", { name: "applied" }).focus();
      await userEvent.keyboard("{End}");
      expect(onChange).toHaveBeenCalledWith("hired");
      expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
    });

    it("does not call onChange for a key it does not handle", async () => {
      const { onChange } = renderTabs("applied");
      screen.getByRole("tab", { name: "applied" }).focus();
      await userEvent.keyboard("a");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("resolves every handled key to the already-active tab when there is only one tab", async () => {
      const onChange = jest.fn();
      const SINGLE = ["only"] as const;
      render(
        <StatusPillTabs tabs={SINGLE} active="only" onChange={onChange} label="x" renderLabel={(t) => t} idPrefix="p" />
      );
      const only = screen.getByRole("tab", { name: "only" });
      only.focus();

      for (const key of ["{ArrowRight}", "{ArrowLeft}", "{Home}", "{End}"]) {
        await userEvent.keyboard(key);
        expect(onChange).toHaveBeenLastCalledWith("only");
        expect(only).toHaveFocus();
      }

      expect(onChange).toHaveBeenCalledTimes(4);
    });

    describe('right-to-left reading direction (dir="rtl")', () => {
      it("moves to the previous tab and calls onChange on ArrowRight", async () => {
        const { onChange } = renderTabsRtl("applied");
        screen.getByRole("tab", { name: "applied" }).focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(onChange).toHaveBeenCalledWith("all");
        expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();
      });

      it("moves to the next tab and calls onChange on ArrowLeft", async () => {
        const { onChange } = renderTabsRtl("applied");
        screen.getByRole("tab", { name: "applied" }).focus();
        await userEvent.keyboard("{ArrowLeft}");
        expect(onChange).toHaveBeenCalledWith("hired");
        expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
      });

      it("wraps from the first tab to the last on ArrowRight", async () => {
        const { onChange } = renderTabsRtl("all");
        screen.getByRole("tab", { name: "all" }).focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(onChange).toHaveBeenCalledWith("hired");
        expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
      });

      it("wraps from the last tab to the first on ArrowLeft", async () => {
        const { onChange } = renderTabsRtl("hired");
        screen.getByRole("tab", { name: "hired" }).focus();
        await userEvent.keyboard("{ArrowLeft}");
        expect(onChange).toHaveBeenCalledWith("all");
        expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();
      });

      it("still moves to the first tab on Home and the last tab on End", async () => {
        const { onChange } = renderTabsRtl("applied");
        screen.getByRole("tab", { name: "applied" }).focus();
        await userEvent.keyboard("{Home}");
        expect(onChange).toHaveBeenCalledWith("all");
        expect(screen.getByRole("tab", { name: "all" })).toHaveFocus();

        onChange.mockClear();
        screen.getByRole("tab", { name: "applied" }).focus();
        await userEvent.keyboard("{End}");
        expect(onChange).toHaveBeenCalledWith("hired");
        expect(screen.getByRole("tab", { name: "hired" })).toHaveFocus();
      });
    });
  });
});
