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
  it("renders the rules: shortlist target, auto-reject, auto-shortlist, candidate notifications", () => {
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

  it("offers auto-shortlist, off by default, and reports it switched on", () => {
    const { onChange } = setup();
    const toggle = screen.getByRole("switch", { name: /auto-shortlist on arrival/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText(/shortlist at or above/i)).toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoShortlistEnabled: true }));
  });

  it("shows the shortlist line when on, and says auto-reject wins where the two overlap", () => {
    const { onChange } = setup({ autoShortlistEnabled: true, autoShortlistAbove: 75 });
    const slider = screen.getByLabelText(/shortlist at or above/i);
    expect(slider).toHaveValue("75");
    fireEvent.change(slider, { target: { value: "85" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoShortlistAbove: 85 }));
    expect(screen.queryByText(/auto-reject runs first/i)).toBeNull();
  });

  it("warns when the shortlist line sits under the reject line", () => {
    setup({ autoShortlistEnabled: true, autoShortlistAbove: 40, autoRejectEnabled: true, autoRejectBelow: 60 });
    expect(screen.getByText(/auto-reject runs first/i)).toBeInTheDocument();
  });

  it("toggles candidate notifications", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("switch", { name: /tell candidates when they move stage/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ notifyOnStageChange: false }));
  });
});
