/**
 * @jest-environment jsdom
 *
 * WhatsApp messages start only after the user sends START, with their personal
 * code, from the phone saved on their profile. The job-seeker notification
 * settings show what to do (and the text to send) as soon as a WhatsApp channel
 * is on, from the `whatsappVerification` the GET reports, and confirm a verified
 * number.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useParams: () => ({ locale: "en" }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/hooks/useBackNavigation", () => ({ useBackNavigation: () => ({ goBack: jest.fn() }) }));

import NotificationSettingsPage from "@/app/[locale]/(dashboard)/job-seeker/settings/notifications/page";

const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
const CODE = "K7P4QX";
const WHATSAPP_ON = { interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] } };
const WHATSAPP_OFF = { interviews: { enabled: true, channels: ["in_app", "email"] } };

let getBody: unknown;
const respond = (categories: object, whatsappVerification: unknown) => {
  getBody = {
    success: true,
    data: { emailFrequency: "daily", categories, unsubscribedAll: false, dailyDigestTime: "09:00", timezone: "Asia/Dubai", updatedAt: "2026-10-02T09:00:00.000Z" },
    whatsappVerification,
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => getBody })) as unknown as typeof fetch;
});

const loaded = () => screen.findByRole("button", { name: /^Weekly Summary/ });

describe("job-seeker notification settings — WhatsApp verification", () => {
  it("unverified with a link: tells the user to send START with their code, shows that text, and links to WhatsApp", async () => {
    respond(WHATSAPP_ON, { verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    expect(screen.getByText(/It only works from that phone/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Message us on WhatsApp" });
    expect(link).toHaveAttribute("href", LINK);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("unverified with no link (mock mode): the instructions and the text to send without a button, and a line saying the button isn't available right now", async () => {
    respond(WHATSAPP_ON, { verified: false, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
    expect(screen.getByText("The WhatsApp button isn't available right now. Please try again later.")).toBeInTheDocument();
  });

  it("verified: a Verified note with the masked number, no instructions", async () => {
    respond(WHATSAPP_ON, { verified: true, waLink: null, phoneLast4: "4567", phoneValid: true, startCode: null });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp messages go to •••• 4567.")).toBeInTheDocument();
    expect(screen.queryByText("Send START to get WhatsApp messages")).toBeNull();
    expect(screen.queryByText(/^Send START /)).toBeNull();
  });

  // F6: a phone with no country code can never be verified; the page says to fix it, with no START button.
  it("a phone with no country code: asks for the country code on the profile, no button", async () => {
    respond(WHATSAPP_ON, { verified: false, waLink: null, phoneLast4: "4567", phoneValid: false, startCode: null });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.getByText(/Add the country code \(for example \+971\) to the phone on your profile/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
  });

  it("no phone: says the profile has none, links nothing", async () => {
    respond(WHATSAPP_ON, { verified: false, waLink: null, phoneLast4: null, phoneValid: false, startCode: null });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.getByText(/Your profile has no phone number/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Message us on WhatsApp" })).toBeNull();
  });

  it("shows nothing while WhatsApp is off, and the instructions as soon as the user turns it on, before saving", async () => {
    const user = userEvent.setup();
    respond(WHATSAPP_OFF, { verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: CODE });
    render(<NotificationSettingsPage />);
    await loaded();
    expect(screen.queryByText("Send START to get WhatsApp messages")).toBeNull();
    expect(screen.queryByText("Send START K7P4QX")).toBeNull();
    // This page has the toggle: no invitation (that is for the pages without one).
    expect(screen.queryByText("Get your updates on WhatsApp")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "WhatsApp" })[0]);
    expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Message us on WhatsApp" })).toHaveAttribute("href", LINK);
  });
});
