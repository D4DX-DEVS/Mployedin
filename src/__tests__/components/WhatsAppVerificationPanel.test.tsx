/**
 * @jest-environment jsdom
 *
 * WhatsApp messages start only after the user sends START from the phone saved
 * on their profile. The panel tells a user with a WhatsApp channel on what to
 * do, links to WhatsApp with `START <code>` typed (the account's personal
 * code), shows that text for anyone who cannot use the button, and confirms a
 * verified number. On the pages with no WhatsApp toggle (employer, agent,
 * super-agent) it also invites an unverified user to send START, which is how
 * they turn it on.
 */
import { render, screen } from "@testing-library/react";
import { WhatsAppVerificationPanel, hasWhatsAppOn } from "@/components/features/settings/WhatsAppVerificationPanel";

const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
const UNVERIFIED = { verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: "K7P4QX" };
/** What the GET reports once verified, or for a phone START cannot verify: no code. */
const NO_CODE = { ...UNVERIFIED, startCode: null };

describe("WhatsAppVerificationPanel", () => {
  it("unverified with a link: shows the text to send, says it must come from the profile phone, and links to WhatsApp in a new tab", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={UNVERIFIED} />);
    expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
    expect(screen.getByText(/send the message below to our WhatsApp number from the phone saved on your profile \(ending in 4567\)\. It only works from that phone\./)).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Message us on WhatsApp" });
    expect(link).toHaveAttribute("href", LINK);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    // A tap target, not a text link.
    expect(link.className).toContain("min-h-11");
    expect(screen.queryByText(/isn't available right now/)).toBeNull();
  });

  // F7: a null link is mock mode, Meta unreachable, or a lookup slower than the page waits: one wording fits all.
  it("unverified with no link (mock mode): the same instructions and the text to send, no button, and a line that fits every reason the button is missing", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...UNVERIFIED, waLink: null }} />);
    expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
    expect(screen.getByText(/ending in 4567/)).toBeInTheDocument();
    expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("The WhatsApp button isn't available right now. Please try again later.")).toBeInTheDocument();
    expect(screen.queryByText(/isn't connected yet/)).toBeNull();
  });

  it("unverified with no code (it could not be made): the plain instructions, no text to send, no button", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...NO_CODE, waLink: null }} />);
    expect(screen.getByText(/send START to our WhatsApp number from the phone saved on your profile \(ending in 4567\)/)).toBeInTheDocument();
    expect(screen.queryByText(/^Send START [A-Z0-9]{6}$/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("The WhatsApp button isn't available right now. Please try again later.")).toBeInTheDocument();
  });

  it("verified: a small Verified note with the number masked to its last 4 digits, and no instructions or code", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...NO_CODE, verified: true, waLink: null }} />);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp messages go to •••• 4567.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Send START to get WhatsApp messages")).toBeNull();
    expect(screen.queryByText(/^Send START /)).toBeNull();
  });

  it("no phone: says the profile has none and links nothing", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...NO_CODE, phoneLast4: null, phoneValid: false, waLink: null }} />);
    expect(screen.getByText(/Your profile has no phone number/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Send START to get WhatsApp messages")).toBeNull();
    expect(screen.queryByText(/^Send START /)).toBeNull();
  });

  // F6: a phone with no country code can never be dialled or verified, so no "send START from the phone ending in X".
  it("a phone with no country code: asks for the country code on the profile, and offers no START button or code", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...NO_CODE, phoneValid: false, waLink: null }} />);
    expect(screen.getByText(/has no country code/)).toBeInTheDocument();
    expect(screen.getByText(/Add the country code \(for example \+971\) to the phone on your profile/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/ending in 4567/)).toBeNull();
    expect(screen.queryByText(/^Send START /)).toBeNull();
  });

  it("shows nothing while no WhatsApp channel is on, or before the state has loaded", () => {
    const { container, rerender } = render(<WhatsAppVerificationPanel whatsAppOn={false} verification={UNVERIFIED} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WhatsAppVerificationPanel whatsAppOn verification={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // F4: the employer, agent and super-agent pages have no WhatsApp toggle; START is how those accounts turn it on.
  describe("invitation, for pages without a WhatsApp toggle", () => {
    it("invites an unverified user with no WhatsApp channel on to send START with their code, with the same button", () => {
      render(<WhatsAppVerificationPanel invite whatsAppOn={false} verification={UNVERIFIED} phoneEditPlace="settingsProfileTab" />);
      expect(screen.getByText("Get your updates on WhatsApp")).toBeInTheDocument();
      expect(screen.getByText(/You can also get these updates on WhatsApp\. Send the message below to our WhatsApp number from the phone saved on your account \(ending in 4567\)\. It only works from that phone/)).toBeInTheDocument();
      expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Message us on WhatsApp" })).toHaveAttribute("href", LINK);
      expect(screen.queryByText("Send START to get WhatsApp messages")).toBeNull();
    });

    it("shows the code in the invitation in mock mode too, without the button", () => {
      render(<WhatsAppVerificationPanel invite whatsAppOn={false} verification={{ ...UNVERIFIED, waLink: null }} />);
      expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("hides the invitation once the number is verified", () => {
      const { container } = render(<WhatsAppVerificationPanel invite whatsAppOn={false} verification={{ ...NO_CODE, verified: true }} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("keeps the usual instructions and the Verified note once a channel is on", () => {
      const { rerender } = render(<WhatsAppVerificationPanel invite whatsAppOn verification={UNVERIFIED} />);
      expect(screen.getByText("Send START to get WhatsApp messages")).toBeInTheDocument();
      expect(screen.getByText("Send START K7P4QX")).toBeInTheDocument();
      rerender(<WhatsAppVerificationPanel invite whatsAppOn verification={{ ...NO_CODE, verified: true }} />);
      expect(screen.getByText("Verified")).toBeInTheDocument();
    });

    // J3: an invitation the user cannot act on (no phone, or one with no country code; an employer cannot even edit
    // their login phone) would sit on the page for good. It shows nothing instead.
    it.each([
      ["no phone", { phoneLast4: null, phoneValid: false }],
      ["a phone with no country code", { phoneValid: false }],
    ])("shows nothing in the invitation state for %s, on every page", (_label, phone) => {
      for (const place of ["profile", "settingsProfileTab", "none"] as const) {
        const { container, unmount } = render(<WhatsAppVerificationPanel invite whatsAppOn={false} verification={{ ...NO_CODE, waLink: null, ...phone }} phoneEditPlace={place} />);
        expect([place, container.innerHTML]).toEqual([place, ""]);
        unmount();
      }
    });

    it("says where to add the phone, per page, once a WhatsApp channel is on: these settings' profile section for agents and super-agents", () => {
      render(<WhatsAppVerificationPanel invite whatsAppOn verification={{ ...NO_CODE, phoneLast4: null, phoneValid: false, waLink: null }} phoneEditPlace="settingsProfileTab" />);
      expect(screen.getByText("Your account has no phone number. Add one under Profile & Avatar in these settings, then send START from it to receive WhatsApp messages.")).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    });

    it("promises no place to add it where the user cannot edit their own phone (employers), once a WhatsApp channel is on", () => {
      render(<WhatsAppVerificationPanel invite whatsAppOn verification={{ ...NO_CODE, phoneLast4: null, phoneValid: false, waLink: null }} phoneEditPlace="none" />);
      expect(screen.getByText("Your account has no phone number, so we can't send you WhatsApp messages yet.")).toBeInTheDocument();
    });

    it("asks for the country code in the right place, or nowhere, per page, once a WhatsApp channel is on", () => {
      const { rerender } = render(<WhatsAppVerificationPanel invite whatsAppOn verification={{ ...NO_CODE, phoneValid: false, waLink: null }} phoneEditPlace="settingsProfileTab" />);
      expect(screen.getByText(/Add the country code \(for example \+971\) under Profile & Avatar in these settings/)).toBeInTheDocument();
      rerender(<WhatsAppVerificationPanel invite whatsAppOn verification={{ ...NO_CODE, phoneValid: false, waLink: null }} phoneEditPlace="none" />);
      expect(screen.getByText("The phone on your account has no country code, so we can't send you WhatsApp messages yet.")).toBeInTheDocument();
      expect(screen.queryByRole("link")).toBeNull();
    });
  });
});

describe("hasWhatsAppOn", () => {
  it("is true only for a category that is on and lists whatsapp", () => {
    expect(hasWhatsAppOn({ jobs: { enabled: true, channels: ["in_app"] }, offers: { enabled: true, channels: ["email", "whatsapp"] } })).toBe(true);
    // The channel row is hidden while its category is off, so it does not count.
    expect(hasWhatsAppOn({ offers: { enabled: false, channels: ["whatsapp"] } })).toBe(false);
    expect(hasWhatsAppOn({ jobs: { enabled: true, channels: ["in_app", "email"] } })).toBe(false);
    expect(hasWhatsAppOn({})).toBe(false);
  });
});
