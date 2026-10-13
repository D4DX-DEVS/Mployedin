/**
 * @jest-environment jsdom
 *
 * Client point #5 (2026-10-12): an agent shares a job-seeker referral link
 * straight from the Job Seekers page. Who joins through it is Premium and
 * credited to the agent.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferSeekerDialog } from "@/components/features/agent/ReferSeekerDialog";

const LINK = { _id: "l1", code: "MPL-ABCD1234EF56", audience: "job_seeker", usedCount: 3, isActive: true };
const URL_EN = `${window.location.origin}/en/register?ref=MPL-ABCD1234EF56`;

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
});

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body });

it("shows the newest live job-seeker link, with copy, WhatsApp and the sign-up count", async () => {
  fetchMock.mockImplementation(() => ok({ links: [LINK] }));
  render(<ReferSeekerDialog open onOpenChange={() => {}} locale="en" />);

  expect(await screen.findByDisplayValue(URL_EN)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith("/api/referral-links?audience=job_seeker&status=active&limit=1&sortBy=createdAt&sortOrder=desc&mine=1");
  expect(screen.getByText(/join as Premium/i)).toBeInTheDocument();
  expect(screen.getByText("3 job seekers joined through this link")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL_EN));
  expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();

  const whatsapp = screen.getByRole("link", { name: /Share on WhatsApp/ });
  expect(whatsapp.getAttribute("href")).toBe(
    `https://wa.me/?text=${encodeURIComponent(`Join Mployedin as a Premium job seeker: ${URL_EN}`)}`,
  );
  expect(screen.getByRole("link", { name: "Manage your links" })).toHaveAttribute("href", "/en/agent/referral-links");
});

it("creates a job-seeker link when the agent has none yet", async () => {
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? Promise.resolve({ ok: true, status: 201, json: async () => ({ link: { ...LINK, usedCount: 0 } }) }) : ok({ links: [] }),
  );
  render(<ReferSeekerDialog open onOpenChange={() => {}} locale="ar" />);

  expect(await screen.findByDisplayValue(`${window.location.origin}/ar/register?ref=MPL-ABCD1234EF56`)).toBeInTheDocument();
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(post[0]).toBe("/api/referral-links");
  expect(JSON.parse(String(post[1].body))).toEqual({ audience: "job_seeker", label: "Job Seekers page" });
});

it("says so, with a retry, when the link cannot be loaded", async () => {
  fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }))
    .mockImplementation(() => ok({ links: [LINK] }));
  render(<ReferSeekerDialog open onOpenChange={() => {}} locale="en" />);

  expect(await screen.findByText("We couldn't load your referral link.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  expect(await screen.findByDisplayValue(URL_EN)).toBeInTheDocument();
});

it("loads nothing while closed", () => {
  render(<ReferSeekerDialog open={false} onOpenChange={() => {}} locale="en" />);
  expect(fetchMock).not.toHaveBeenCalled();
});
