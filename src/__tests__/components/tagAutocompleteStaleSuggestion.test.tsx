/**
 * @jest-environment jsdom
 *
 * Typing "React" and pressing Enter at once added "JavaScript" — the top
 * suggestion for the previous query, still on screen during the debounce and
 * highlighted because the pointer rested over it (audit 2026-09-24, ONB-04).
 * Enter may only act on suggestions that answer what is typed now.
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
jest.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
import { TagAutocomplete } from "@/components/ui/tag-autocomplete";

const answers: Record<string, string[]> = {
  jav: ["JavaScript", "Java"],
  react: ["React", "React Native"],
  rea: ["React", "Realm"],
};

beforeEach(() => {
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: string) => {
    const q = new URL(url, "http://localhost").searchParams.get("q")?.toLowerCase() ?? "";
    return { ok: true, json: async () => ({ items: answers[q] ?? [] }) };
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Let the 200 ms debounce elapse and the mocked request resolve. */
async function settle() {
  await act(async () => {
    jest.advanceTimersByTime(250);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

function setup(allowCustom = true) {
  const onChange = jest.fn();
  render(<TagAutocomplete type="skills" value={[]} onChange={onChange} allowCustom={allowCustom} />);
  const input = screen.getByRole("textbox");
  return { onChange, input };
}

it("adds the typed text, not a stale highlighted suggestion", async () => {
  const { onChange, input } = setup();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Jav" } });
  await settle();
  expect(screen.getByText("JavaScript")).toBeInTheDocument();

  // Type the next word and press Enter before its suggestions arrive, with the
  // pointer resting on the old top row.
  fireEvent.change(input, { target: { value: "React" } });
  fireEvent.mouseEnter(screen.getByText("JavaScript"));
  fireEvent.keyDown(input, { key: "Enter" });

  expect(onChange).toHaveBeenCalledWith(["React"]);
});

it("uses the canonical spelling when the current suggestions contain the typed text", async () => {
  const { onChange, input } = setup();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "react" } });
  await settle();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(["React"]);
});

it("an arrowed-to current suggestion still wins", async () => {
  const { onChange, input } = setup();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Rea" } });
  await settle();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(["Realm"]);
});

it("a closed list never picks a suggestion for an older query", async () => {
  const { onChange, input } = setup(false);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Jav" } });
  await settle();
  fireEvent.change(input, { target: { value: "Rea" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();

  await settle();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith(["React"]);
});
