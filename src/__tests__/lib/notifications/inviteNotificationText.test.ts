/**
 * @jest-environment node
 *
 * The invite-to-apply notification is rendered from these keys in the
 * candidate's language — by the bell and by the email
 * (notificationOrchestrator formats them with IntlMessageFormat) — so the
 * sender's language no longer decides it (rollout check 2026-10-28).
 */
import { IntlMessageFormat } from "intl-messageformat";
import en from "../../../../messages/en.json";
import ar from "../../../../messages/ar.json";

const PARAMS = { companyName: "d4dx", jobTitle: "DevOps Engineer", message: "Your AWS work fits." };

function render(locale: "en" | "ar", key: string): string {
  const template = (locale === "en" ? en : ar).notificationContent[key as keyof typeof en.notificationContent];
  return String(new IntlMessageFormat(template, locale).format(PARAMS));
}

describe("invite-to-apply notification text", () => {
  it.each(["en", "ar"] as const)("renders every invite key in %s with the company and job filled in", (locale) => {
    expect(render(locale, "applicationInviteTitle").length).toBeGreaterThan(0);
    for (const key of ["applicationInviteBody", "applicationInviteBodyWithMessage"]) {
      const text = render(locale, key);
      expect(text).toContain("d4dx");
      expect(text).toContain("\"DevOps Engineer\"");
      expect(text).not.toMatch(/[{}]/);
    }
    expect(render(locale, "applicationInviteBodyWithMessage")).toContain("\"Your AWS work fits.\"");
  });

  it("matches the English fallback text the API still stores", () => {
    expect(render("en", "applicationInviteTitle")).toBe("You've been invited to apply");
    expect(render("en", "applicationInviteBodyWithMessage")).toBe(
      "d4dx would like you to apply for \"DevOps Engineer\".\n\n\"Your AWS work fits.\"",
    );
  });

  it("reads Arabic to an Arabic-speaking candidate", () => {
    expect(render("ar", "applicationInviteTitle")).toBe("تمت دعوتك للتقديم");
  });
});
