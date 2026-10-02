/**
 * @jest-environment jsdom
 */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import JobSeekerOnboardingPage from "@/app/[locale]/(onboarding)/onboarding/page";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} {...props} />,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "X Beat" } }, status: "authenticated", update: jest.fn() }),
}));

/**
 * 12th, 10th and Below 10th ask for no university, but the Education step sent
 * institution: "" anyway and the server turned it away, so a school-level
 * seeker could not get past this step.
 */
describe("onboarding education step for a school-level qualification", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    // The area is required on the first step; this seeker saved theirs earlier.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({
      profile: { area: { cityId: "c1", cityName: "Dubai", stateId: "s1", stateName: "Dubai", countryCode: "AE" } },
    }) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  const click = async (element: HTMLElement) => {
    await act(async () => { fireEvent.click(element); });
  };
  const saveAndContinue = () => screen.getByRole("button", { name: /save and continue/i });

  it("saves 12th without a university", async () => {
    await act(async () => { render(<JobSeekerOnboardingPage />); });

    await act(async () => {
      fireEvent.change(screen.getByRole("textbox", { name: /mobile number/i }), { target: { value: "501234567" } });
    });
    await click(screen.getByRole("button", { name: /i'm a fresher/i }));
    await click(saveAndContinue());
    await click(screen.getByRole("button", { name: /^skip$/i }));
    await click(screen.getByRole("button", { name: "12th" }));
    await click(saveAndContinue());

    const saves = fetchMock.mock.calls.filter(([url, init]) => url === "/api/job-seekers/profile" && init?.method === "PATCH");
    const body = JSON.parse(saves.at(-1)?.[1].body as string);
    expect(body.education).toEqual([{ degree: "12th" }]);
  });
});
