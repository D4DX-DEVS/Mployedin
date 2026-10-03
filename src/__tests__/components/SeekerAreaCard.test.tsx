/**
 * @jest-environment jsdom
 *
 * The job seeker's area on their profile page (client report 2026-09-30, #5).
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeekerAreaCard } from "@/components/features/job-seeker/SeekerAreaCard";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const respond = (area: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ profile: { area } }) });

it("asks for an area when none is set", async () => {
  respond(null);
  render(<SeekerAreaCard />);
  expect(await screen.findByText("Add your area so agents near you can help you find work.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add area" })).toBeEnabled();
});

it("shows the saved city and its country", async () => {
  respond({ cityId: "c1", cityName: "Kochi", countryCode: "IN" });
  render(<SeekerAreaCard />);
  expect(await screen.findByText("Kochi, India")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
});

it("shows a region-only area as the region and its country", async () => {
  respond({ cityId: null, cityName: null, stateId: "s1", stateName: "Kerala", countryCode: "IN" });
  render(<SeekerAreaCard />);
  expect(await screen.findByText("Kerala, India")).toBeInTheDocument();
});

it("won't save without a city or region picked from the list", async () => {
  respond(null);
  render(<SeekerAreaCard />);
  await userEvent.click(await screen.findByRole("button", { name: "Add area" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Pick your city, or your region if your city isn't listed.")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1); // the load only — no PATCH
});
