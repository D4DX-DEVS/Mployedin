/**
 * @jest-environment jsdom
 */
/**
 * Final review M11 (WCAG 3.2.5 advisory; the ICO link is legal copy):
 * - every link that opens a new tab says so to a screen reader, with one shared
 *   `common.opensInNewTab` string;
 * - the facade's "Always play videos" box says that it changes the Cookie
 *   settings for the whole site, not just this video.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import en from "../../../messages/en.json";
import { YouTubeFacade, type YouTubeFacadeLabels } from "@/components/shared/ConsentManager/YouTubeFacade";
import { CookieSettingsDialog, type CookieSettingsDialogLabels } from "@/components/shared/ConsentManager/CookieSettingsDialog";
import { CaptchaNotice } from "@/components/shared/CaptchaNotice";
import { SETTINGS_COPY_KEYS } from "@/lib/consent/copy";

jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: jest.fn() }));
jest.mock("@/lib/browser/captcha", () => {
  const actual = jest.requireActual("@/lib/browser/captcha");
  return { ...actual, isCaptchaEnabled: () => true };
});

const NEW_TAB = "(opens in a new tab)";

function message(key: string): string {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en) as string;
}

describe("new-tab links and the Always play videos box", () => {
  it("has the shared string in both languages", () => {
    expect(en.common.opensInNewTab).toBe(NEW_TAB);
     
    const ar = require("../../../messages/ar.json") as typeof en;
    expect(ar.common.opensInNewTab).toBe("(يُفتح في علامة تبويب جديدة)");
    expect(en.landing.youtubeAlwaysHint).toBe("Changes your Cookie settings for the whole site");
    expect(ar.landing.youtubeAlwaysHint).toBe("يغيّر إعدادات ملفات تعريف الارتباط للموقع كله");
  });

  it("YouTube facade: the box describes its site-wide effect, and Watch on YouTube says it opens a new tab", () => {
    const labels: YouTubeFacadeLabels = {
      play: "Play video (loads YouTube)",
      watchOnYoutube: "Watch on YouTube",
      notice: "Playing loads content from YouTube (Google), which may set cookies.",
      always: "Always play videos",
      alwaysHint: en.landing.youtubeAlwaysHint,
      newTab: NEW_TAB,
    };
    render(<YouTubeFacade videoId="dQw4w9WgXcQ" title="How hiring works" labels={labels} locale="en" />);

    const box = screen.getByRole("checkbox", { name: "Always play videos" });
    expect(box).toHaveAccessibleDescription("Changes your Cookie settings for the whole site");
    expect(screen.getByRole("link", { name: `Watch on YouTube ${NEW_TAB}` })).toHaveAttribute("target", "_blank");
  });

  it("Cookie settings dialog: the Google controls link says it opens a new tab", () => {
    const settings = Object.fromEntries(Object.entries(SETTINGS_COPY_KEYS).map(([name, key]) => [name, message(key)]));
    const labels = {
      ...settings,
      policy: "Cookie Policy",
      rejectAll: "Reject all",
      acceptAll: "Accept all",
      newTab: NEW_TAB,
    } as CookieSettingsDialogLabels;
    render(
      <CookieSettingsDialog
        open
        onOpenChange={() => {}}
        current={null}
        labels={labels}
        items={{}}
        policyHref="/en/cookies"
        saving={false}
        onSave={() => {}}
      />,
    );

    const link = screen.getByRole("link", { name: `${en.consent.settings.mediaGoogleControls} ${NEW_TAB}` });
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("captcha notice: both Google policy links say they open a new tab", () => {
    render(<CaptchaNotice />);
    expect(screen.getByRole("link", { name: `Privacy Policy ${NEW_TAB}` })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: `Terms ${NEW_TAB}` })).toHaveAttribute("target", "_blank");
  });
});
