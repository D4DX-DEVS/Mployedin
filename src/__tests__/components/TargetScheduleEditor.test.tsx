/**
 * @jest-environment jsdom
 */
/**
 * The periods of a target, editable. Standard types show their own fixed
 * periods; a custom one lets the owner date, name, add and remove them.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { SchedulePeriodsEditor } from "@/components/features/targets/TargetScheduleEditor";
import { newDraft, withAddedPeriod, withPeriodField, withPeriodType, withPeriodAmount } from "@/lib/targets/scheduleDraft";

const YEAR = 2027;

function renderEditor(draft: ReturnType<typeof newDraft>, profitTarget = 1200, onChange = jest.fn()) {
  render(<SchedulePeriodsEditor draft={draft} year={YEAR} profitTarget={profitTarget} currency="AED" onChange={onChange} />);
  return onChange;
}

describe("SchedulePeriodsEditor", () => {
  it("shows twelve named months for a monthly target and confirms they add up", () => {
    renderEditor(newDraft(YEAR, 1200));

    expect(screen.getAllByRole("spinbutton")).toHaveLength(12);
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Months add up to AED 1,200")).toBeInTheDocument();
  });

  it("shows four quarters with their dates", () => {
    renderEditor(newDraft(YEAR, 1200, "quarterly"));

    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByText("Apr 1 – Jun 30")).toBeInTheDocument();
  });

  it("shows every calendar week of the year for a weekly target", () => {
    renderEditor(newDraft(YEAR, 5300, "weekly"));

    expect(screen.getAllByRole("spinbutton")).toHaveLength(53);
    expect(screen.getByText("W1")).toBeInTheDocument();
    expect(screen.getByText("Jan 1 – Jan 3")).toBeInTheDocument();
  });

  it("has nothing to type for an annual target: it is the whole year", () => {
    renderEditor(newDraft(YEAR, 1200, "annual"));

    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.getByText("One target for the whole of 2027.")).toBeInTheDocument();
  });

  it("makes typing a period's amount a manual split and says when the periods do not add up", () => {
    const onChange = renderEditor(newDraft(YEAR, 1200, "quarterly"));

    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "500" } });
    const next = onChange.mock.calls[0][0];

    expect(next.strategy).toBe("custom");
    expect(next.periods[0].profitTarget).toBe(500);

    // The same draft rendered: 500 + 900 ≠ 1200.
    render(<SchedulePeriodsEditor draft={next} year={YEAR} profitTarget={1200} currency="AED" onChange={jest.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Months add up to AED 1,400, not AED 1,200");
  });

  describe("custom periods", () => {
    const custom = () => withPeriodType(newDraft(YEAR, 1000), YEAR, 1000, "custom");

    it("lets the owner date, add and remove ranges", () => {
      const onChange = renderEditor(custom(), 1000);

      expect(screen.getByLabelText("From")).toHaveValue("2027-01-01");
      expect(screen.getByLabelText("To")).toHaveValue("2027-12-31");
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "2027-06-30" } });
      expect(onChange.mock.calls[0][0].periods[0].endDate).toBe("2027-06-30");

      fireEvent.click(screen.getByRole("button", { name: "Add period" }));
      expect(onChange.mock.calls[1][0].periods).toHaveLength(1); // no room left in a whole-year range
    });

    it("adds a range after the last one and can remove it again", () => {
      const half = withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30");
      const onChange = renderEditor(half, 1000);

      fireEvent.click(screen.getByRole("button", { name: "Add period" }));
      const added = onChange.mock.calls[0][0];
      expect(added.periods[1]).toMatchObject({ startDate: "2027-07-01", endDate: "2027-12-31" });
    });

    it("cannot remove the only period", () => {
      renderEditor(custom(), 1000);

      expect(screen.getByRole("button", { name: "Remove period" })).toBeDisabled();
    });

    it("explains overlapping ranges in words", () => {
      let draft = withAddedPeriod(withPeriodField(custom(), 1000, 0, "endDate", "2027-06-30"), YEAR, 1000);
      draft = withPeriodField(draft, 1000, 1, "startDate", "2027-06-15");
      renderEditor(draft, 1000);

      expect(screen.getByRole("alert")).toHaveTextContent("Periods may not overlap");
    });

    it("uses a period's name as typed, and a numbered placeholder when it has none", () => {
      const named = withPeriodField(custom(), 1000, 0, "label", "Spring push");
      renderEditor(named, 1000);

      expect(screen.getByDisplayValue("Spring push")).toBeInTheDocument();
    });

    it("types an amount into a range", () => {
      const onChange = renderEditor(custom(), 1000);

      fireEvent.change(within(screen.getByLabelText("Profit target").closest("div")!.parentElement as HTMLElement).getByLabelText("Profit target"), { target: { value: "250" } });
      expect(onChange.mock.calls[0][0]).toEqual(withPeriodAmount(custom(), 0, 250));
    });
  });
});
