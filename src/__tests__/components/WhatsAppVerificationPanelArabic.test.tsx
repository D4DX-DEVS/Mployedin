/**
 * @jest-environment jsdom
 *
 * The WhatsApp verification panel in Arabic. The text to send, `START <code>`,
 * is Latin inside right-to-left copy: without directional isolates the
 * bidirectional algorithm can reorder it ("K7P4QX START"), and a user typing
 * what they see would send something that verifies nothing. START and the code
 * sit together in one LTR isolate (U+2066 … U+2069) in every state that shows
 * them. The English panel is covered in WhatsAppVerificationPanel.test.tsx.
 */
import { render, screen } from "@testing-library/react";

// The global next-intl mock serves English; this suite renders the real Arabic messages instead.
jest.mock("next-intl", () => {
  const IntlMessageFormat = jest.requireActual("intl-messageformat").default;
  const ar = jest.requireActual("../../../messages/ar.json") as Record<string, Record<string, string>>;
  return {
    useTranslations: (ns: string) => (key: string, params?: Record<string, unknown>) => {
      const message = ar[ns]?.[key];
      // A missing key takes the page down in production (next-intl throws): fail the test the same way.
      if (typeof message !== "string") throw new Error(`missing Arabic message ${ns}.${key}`);
      return String(new IntlMessageFormat(message, "ar").format(params as never));
    },
  };
});

import { WhatsAppVerificationPanel } from "@/components/features/settings/WhatsAppVerificationPanel";

const LINK = "https://wa.me/15551234567?text=START%20K7P4QX";
const UNVERIFIED = { verified: false, waLink: LINK, phoneLast4: "4567", phoneValid: true, startCode: "K7P4QX" };
/** START and the code together, inside one left-to-right isolate. */
const ISOLATED = "⁦START K7P4QX⁩";
const SEND = `أرسل ${ISOLATED}`;

describe("WhatsAppVerificationPanel in Arabic", () => {
  it("unverified: shows the text to send with START and the code in one LTR isolate, and the WhatsApp button", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={UNVERIFIED} />);
    expect(screen.getByText(SEND)).toBeInTheDocument();
    // It must come from the profile phone, whose last digits are isolated too.
    expect(screen.getByText(/من الهاتف المحفوظ في ملفك الشخصي \(المنتهي بـ ⁦4567⁩\)\. لا تعمل إلا من ذلك الهاتف/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "راسلنا على واتساب" })).toHaveAttribute("href", LINK);
  });

  it("unverified in mock mode: the text to send without the button", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...UNVERIFIED, waLink: null }} />);
    expect(screen.getByText(SEND)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("زر واتساب غير متاح حالياً. يرجى المحاولة مرة أخرى لاحقاً.")).toBeInTheDocument();
  });

  it("the invitation: the same text to send, in the same isolate", () => {
    render(<WhatsAppVerificationPanel invite whatsAppOn={false} verification={UNVERIFIED} phoneEditPlace="settingsProfileTab" />);
    expect(screen.getByText("احصل على تحديثاتك عبر واتساب")).toBeInTheDocument();
    expect(screen.getByText(SEND)).toBeInTheDocument();
    expect(screen.getByText(/من الهاتف المحفوظ في حسابك \(المنتهي بـ ⁦4567⁩\)\. لا تعمل إلا من ذلك الهاتف/)).toBeInTheDocument();
  });

  it("verified: no text to send", () => {
    render(<WhatsAppVerificationPanel whatsAppOn verification={{ ...UNVERIFIED, verified: true, waLink: null, startCode: null }} />);
    expect(screen.getByText("موثّق")).toBeInTheDocument();
    expect(screen.queryByText(/START/)).toBeNull();
  });

  it("never leaves START or the code outside the isolate", () => {
    const { container } = render(<WhatsAppVerificationPanel whatsAppOn verification={UNVERIFIED} />);
    const text = container.textContent ?? "";
    expect(text).toContain(ISOLATED);
    // Remove every isolated run: no Latin keyword or code may remain in the Arabic copy.
    expect(text.replace(/⁦[^⁩]*⁩/g, "")).not.toMatch(/START|K7P4QX/);
  });
});
