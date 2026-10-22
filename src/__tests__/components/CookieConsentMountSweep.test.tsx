/**
 * @jest-environment jsdom
 *
 * CookieConsentMount is the one component every route group (public, auth,
 * onboarding, dashboards) already renders, so it is where the page-load
 * Firebase clean-up (StorageSweep) is mounted. This pins that, without touching
 * CookieConsent itself.
 */
import React from "react";

jest.mock("@/lib/consent/server", () => ({ getConsent: jest.fn().mockResolvedValue(null) }));
jest.mock("@/components/shared/CookieConsent", () => ({ __esModule: true, default: () => null }));

import StorageSweep from "@/components/shared/StorageSweep";
import CookieConsent from "@/components/shared/CookieConsent";
import { CookieConsentMount } from "@/components/shared/CookieConsentMount";

describe("CookieConsentMount", () => {
  it("mounts StorageSweep beside the banner, so every route group sweeps once per page load", async () => {
    const tree = await CookieConsentMount({ locale: "en" });

    const children = React.Children.toArray((tree.props as { children: React.ReactNode }).children) as React.ReactElement[];
    expect(children.map((child) => child.type)).toEqual([StorageSweep, CookieConsent]);
  });
});
