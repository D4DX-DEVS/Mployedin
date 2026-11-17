/**
 * @jest-environment jsdom
 *
 * "Check your profile" window: the seeker taps a quick fix and applies the AI
 * suggestion. Only what it changed goes back to the profile the window saves;
 * jobs keep titles and dates; Undo restores the earlier text. Its words come
 * from easyApply only: the public pages ship no cvBuilderPage messages.
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import { CvReviewAssistant } from "@/components/features/public/CvReviewAssistant";
import type { SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";

jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));
import { csrfFetch } from "@/lib/security/csrf-client";

const profile: SeekerProfileData = {
  summary: "Developer with experiance in web apps.",
  skills: ["React", "Node.js"],
  experience: [
    { jobTitle: "Developer", company: "Acme", from: "2023-01-01T00:00:00.000Z", current: true, description: "Built pages." },
    { jobTitle: "Intern", company: "Beta", description: "Fixed bugs." },
  ],
};

function Harness() {
  const [p, setP] = React.useState(profile);
  return (
    <>
      <CvReviewAssistant profile={p} onChange={setP} />
      <output data-testid="state">{JSON.stringify(p)}</output>
    </>
  );
}

it("applies only what the suggestion changed, and Undo puts it back", async () => {
  (csrfFetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ reply: "Fixed the spelling.", changes: { summary: "Developer with experience in web apps.", experience: [{ index: 1, description: "Fixed bugs in the web app." }] } }),
  });
  // Only the easyApply namespace, as on the public job page.
  render(
    <NextIntlClientProvider locale="en" messages={{ easyApply: en.easyApply }}>
      <Harness />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ask AI to tidy your CV/ }));

  fireEvent.click(screen.getByRole("button", { name: "Fix grammar" }));
  const body = await waitFor(() => JSON.parse((csrfFetch as jest.Mock).mock.calls[0][1].body));
  expect(body.cv.projects).toEqual([]);

  fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
  let state = JSON.parse(screen.getByTestId("state").textContent!);
  expect(state.summary).toBe("Developer with experience in web apps.");
  expect(state.skills).toEqual(["React", "Node.js"]);
  expect(state.experience[0]).toEqual(profile.experience![0]);
  expect(state.experience[1]).toEqual({ ...profile.experience![1], description: "Fixed bugs in the web app." });

  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  state = JSON.parse(screen.getByTestId("state").textContent!);
  expect(state.summary).toBe(profile.summary);
  expect(state.experience[1].description).toBe("Fixed bugs.");
});

it("sends the chat so far with a follow-up, from the description box", async () => {
  (csrfFetch as jest.Mock).mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ reply: "Which job do you mean?", changes: {} }),
  });
  render(
    <NextIntlClientProvider locale="en" messages={{ easyApply: en.easyApply }}>
      <Harness />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ask AI to tidy your CV/ }));
  const box = screen.getByRole("textbox", { name: "Ask AI to change your CV" });
  expect(box.tagName).toBe("TEXTAREA");

  fireEvent.change(box, { target: { value: "Rewrite my job description" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await screen.findByText("Which job do you mean?");

  fireEvent.change(box, { target: { value: "The Acme one" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(csrfFetch).toHaveBeenCalledTimes(2));
  const second = JSON.parse((csrfFetch as jest.Mock).mock.calls[1][1].body);
  expect(second.instruction).toBe("The Acme one");
  expect(second.history).toEqual([
    { role: "user", content: "Rewrite my job description" },
    { role: "assistant", content: "Which job do you mean?" },
  ]);
});

it("Try again asks the same request anew and undoes an applied answer first", async () => {
  (csrfFetch as jest.Mock)
    .mockReset()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: "First try.", changes: { summary: "Version one." } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: "Second try.", changes: { summary: "Version two." } }) });
  render(
    <NextIntlClientProvider locale="en" messages={{ easyApply: en.easyApply }}>
      <Harness />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Ask AI to tidy your CV/ }));
  fireEvent.click(screen.getByRole("button", { name: "Improve wording" }));
  fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
  expect(JSON.parse(screen.getByTestId("state").textContent!).summary).toBe("Version one.");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  // The applied answer is undone before the new one arrives.
  expect(JSON.parse(screen.getByTestId("state").textContent!).summary).toBe(profile.summary);
  await screen.findByText("Second try.");
  expect(screen.queryByText("First try.")).toBeNull();
  const second = JSON.parse((csrfFetch as jest.Mock).mock.calls[1][1].body);
  expect(second.instruction).toBe(en.easyApply.reviewAi.prompt.improve);
  expect(second.history).toEqual([]);
});

it("stays closed until opened", () => {
  render(
    <NextIntlClientProvider locale="en" messages={{ easyApply: en.easyApply }}>
      <Harness />
    </NextIntlClientProvider>,
  );
  const toggle = screen.getByRole("button", { name: /Ask AI to tidy your CV/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Fix grammar" })).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "Fix grammar" })).toBeVisible();
});
