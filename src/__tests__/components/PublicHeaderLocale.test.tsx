/**
 * @jest-environment jsdom
 *
 * The public header's language links remember the choice in NEXT_LOCALE, by the
 * same rule as the signed-in LanguageSwitcher (rememberLocaleChoice): only while
 * preferences are allowed. They stay plain links, so the URL switches the
 * language with or without JavaScript and whatever the visitor chose.
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/jobs",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault(); // jsdom cannot navigate
      }}
    >
      {children}
    </a>
  ),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));

import PublicHeader from "@/components/shared/PublicHeader";
import { writeConsent } from "@/lib/consent/client";
import { rememberLocaleChoice } from "@/lib/consent/rememberLocale";

function clearCookies() {
  for (const part of document.cookie.split("; ")) {
    const name = part.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

beforeEach(clearCookies);

function arabicLinks(): HTMLAnchorElement[] {
  return screen.getAllByRole("link", { name: "العربية" }) as HTMLAnchorElement[];
}

describe("public header language links", () => {
  it("write NEXT_LOCALE on click when preferences were accepted (desktop and mobile)", () => {
    render(<PublicHeader locale="en" />);
    writeConsent({ preferences: true, media: false });
    fireEvent.click(arabicLinks()[0]);
    expect(document.cookie).toContain("NEXT_LOCALE=ar");

    clearCookies();
    writeConsent({ preferences: true, media: false });
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    const mobile = arabicLinks().at(-1)!;
    fireEvent.click(mobile);
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
  });

  it("write NEXT_LOCALE before any choice (D1: display settings are kept unless the visitor objects)", () => {
    render(<PublicHeader locale="en" />);
    fireEvent.click(arabicLinks()[0]);
    expect(document.cookie).toContain("NEXT_LOCALE=ar");
  });

  it("write no cookie after the visitor objected to preferences", () => {
    writeConsent({ preferences: false, media: false });
    render(<PublicHeader locale="en" />);
    fireEvent.click(arabicLinks()[0]);
    expect(document.cookie).not.toContain("NEXT_LOCALE");
  });

  it("stay real links to the other locale", () => {
    render(<PublicHeader locale="en" />);
    expect(arabicLinks()[0].getAttribute("href")).toBe("/ar");
  });
});

describe("rememberLocaleChoice (shared with LanguageSwitcher)", () => {
  it("writes a 12-month NEXT_LOCALE only while preferences are allowed", () => {
    writeConsent({ preferences: true, media: false });
    expect(rememberLocaleChoice("ar")).toBe(true);
    expect(document.cookie).toContain("NEXT_LOCALE=ar");

    clearCookies();
    writeConsent({ preferences: false, media: false });
    expect(rememberLocaleChoice("ar")).toBe(false);
    expect(document.cookie).not.toContain("NEXT_LOCALE");
  });

  it("ignores anything that is not a supported locale", () => {
    writeConsent({ preferences: true, media: false });
    expect(rememberLocaleChoice("fr")).toBe(false);
    expect(rememberLocaleChoice("ar;domain=evil.example")).toBe(false);
    expect(document.cookie).not.toContain("NEXT_LOCALE");
  });
});
