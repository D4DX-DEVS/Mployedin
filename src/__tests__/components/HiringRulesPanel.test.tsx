import { fireEvent, render, screen } from "@testing-library/react";
import { HiringRulesPanel } from "@/components/features/employer/workflow/HiringRulesPanel";
import { HIRING_RULE_DEFAULTS, type HiringRules } from "@/lib/hiring/workflowSettings";

function setup(overrides: Partial<HiringRules> = {}) {
  const onChange = jest.fn();
  const rules = { ...HIRING_RULE_DEFAULTS, ...overrides };
  render(<HiringRulesPanel rules={rules} onChange={onChange} />);
  return { onChange, rules };
}

describe("HiringRulesPanel", () => {
  it("renders exactly the three rules: shortlist target, auto-reject, candidate notifications", () => {
    setup();
    expect(screen.getByLabelText(/shortlist target/i)).toHaveValue(50);
    expect(screen.getByRole("switch", { name: /auto-reject on arrival/i })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: /tell candidates when they move stage/i })).toHaveAttribute("aria-checked", "true");
    // No stage editing, no auto-progress, no "manual review" copy.
    expect(screen.queryByText(/manual review/i)).toBeNull();
    expect(screen.queryByText(/auto progression/i)).toBeNull();
  });

  it("hides the threshold until auto-reject is switched on, then shows it with a plain warning", () => {
    const { onChange } = setup();
    expect(screen.queryByLabelText(/reject below/i)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: /auto-reject on arrival/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoRejectEnabled: true }));
  });

  it("shows the threshold slider and the warning when auto-reject is on", () => {
    setup({ autoRejectEnabled: true, autoRejectBelow: 55 });
    expect(screen.getByLabelText(/reject below/i)).toHaveValue("55");
    expect(screen.getByText(/rejects people automatically/i)).toBeInTheDocument();
  });

  it("clamps the shortlist target into 5–100 and reports the change", () => {
    const { onChange } = setup();
    const input = screen.getByLabelText(/shortlist target/i);
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shortlistTarget: 100 }));
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ shortlistTarget: 5 }));
  });

  it("toggles candidate notifications", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("switch", { name: /tell candidates when they move stage/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notifyOnStageChange: false }));
  });
});
