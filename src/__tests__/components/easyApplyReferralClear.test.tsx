/* eslint-disable @typescript-eslint/no-explicit-any -- mock scaffolding copied from easyApplyAnon.test.tsx */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock fetch and Response globally before anything else
(global as any).fetch = jest.fn();
(global as any).Response = jest.fn((body: unknown, init?: ResponseInit) => ({
  ok: (init as any)?.status < 400,
  status: (init as any)?.status || 200,
  json: jest.fn().mockResolvedValue(typeof body === 'string' ? JSON.parse(body) : body),
})) as any;

(global as any).navigator = {
  clipboard: {
    writeText: jest.fn(),
  },
};

// Mock next-auth before importing component
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  getSession: jest.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  signOut: jest.fn(),
}));

// Now import the mocked modules so we can use them
import { useSession, signIn } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";

// Mock the Google sign-in helper BEFORE importing the component: it is what
// loads Firebase, and only on a click.
jest.mock("@/lib/firebase/googleSignIn", () => ({
  getGoogleIdToken: jest.fn(),
  preloadGoogleSignIn: jest.fn(),
}));

// The page-load navigation after a Google sign-in (jsdom cannot navigate).
jest.mock("@/lib/browser/navigateWithPageLoad", () => ({
  navigateWithPageLoad: jest.fn(),
}));

// Mock next-intl
jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      loading: "Loading…",
      quickApplyTitle: "Apply in seconds",
      quickApplyHint: "Upload your CV and we'll build your profile automatically — use email or sign in with Google to finish.",
      uploadYourCv: "Upload your CV (PDF or Word)",
      continueWithGoogle: "Continue with Google",
      googleWindowNotice: "Continue with Google opens a Google window",
      googleWindowBlocked: "Your browser blocked the Google window. Press the Google button again.",
      "errors.popupBlocked": "Your browser blocked the Google sign-in popup. Try using email instead.",
      continueWithEmail: "Continue with email",
      settingUpProfile: "Setting up your profile…",
      googleSignInFailed: "Google sign-in failed. Please try again.",
      signInApply: "Sign in to Apply",
      jobSeekersOnly: "Job seekers only can apply",
      applicationSubmitted: "Application submitted!",
      sentProfile: "We've sent your profile to the employer.",
      sendCode: "Send code",
      verify: "Verify",
      enterCode: "Enter the code",
      enterEmail: "Enter your email",
      fullName: "Full name",
      enterFullName: "Enter your full name",
      "errors.nameRequired": "Please enter your full name.",
      "errors.invalidEmail": "Please enter a valid email address.",
      "errors.couldNotExtract": "We couldn't read your CV automatically. You can still apply — add your details below.",
      "errors.applyFailed": "We couldn't apply. Please try again.",
      "errors.networkError": "Network error. Please try again.",
      "errors.captchaFailed": "We couldn't confirm you're not a bot. Please try again.",
      "errors.captchaUnavailable": "The bot check is temporarily unavailable. Please try again in a moment.",
      copyLink: "Copy link",
      applyingAs: "Applying as",
      profileCv: "CV / Resume",
    };
    const translated = translations[key] || key;
    if (values && typeof translated === "string") {
      return translated.replace(/\{(\w+)\}/g, (_, varName) => String(values[varName] || ""));
    }
    return translated;
  },
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useParams: jest.fn(),
}));

// Mock next/link
jest.mock("next/link", () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

// Mock csrf-client
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: jest.fn(),
}));

// Mock inAppBrowser
jest.mock("@/lib/browser/inAppBrowser", () => ({
  isInAppBrowser: jest.fn(() => false),
  inAppBrowserName: jest.fn(() => null),
}));

// Mock the invisible reCAPTCHA client. Hermetic on purpose: with a real site
// key in the developer's .env the real helper would inject Google's script into
// jsdom and "Send code" would wait on a load event that never fires.
jest.mock("@/lib/browser/recaptcha", () => ({
  getRecaptchaToken: jest.fn(async () => null),
  isRecaptchaEnabled: jest.fn(() => false),
}));

// Mock UI components
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@/components/ui/date-time-picker", () => ({
  DateTimePicker: (props: any) => <input {...props} />,
}));

// Now safe to import the component

import EasyApply from "@/components/features/public/EasyApply";
import { clearPendingReferral, getPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

const CODE = "MPL-1A2B3C4D5E6F7A8B";

describe("EasyApply: the held referral code", () => {
  const update = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    clearPendingReferral();
    (useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated", update });
    (useParams as jest.Mock).mockReturnValue({ locale: "en" });
    (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
    (signIn as jest.Mock).mockResolvedValue({ error: null });
    (require("next-auth/react").getSession as jest.Mock).mockResolvedValue({ user: { role: "job_seeker" } });
  });

  async function signInWithEmailCode() {
    const { csrfFetch } = require("@/lib/security/csrf-client");
    csrfFetch.mockResolvedValue(new Response(JSON.stringify({ sent: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<EasyApply jobId="job-1" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);
    await user.click(screen.getByText("Continue with email"));
    await user.type(screen.getByPlaceholderText("Enter your email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");
    await user.click(screen.getByText("Send code"));
    await user.type(await screen.findByPlaceholderText("000000"), "123456");
    await user.click(screen.getByText("Verify"));
  }

  it("sends the code held in memory with the e-mail-code sign-in, then forgets it", async () => {
    setPendingReferral(CODE);
    await signInWithEmailCode();

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("email-otp", expect.objectContaining({ referralCode: CODE, otp: "123456" })),
    );
    await waitFor(() => expect(getPendingReferral()).toBe(""));
  });

  it("sends no code when none is held", async () => {
    await signInWithEmailCode();
    await waitFor(() => expect(signIn).toHaveBeenCalledWith("email-otp", expect.anything()));
    const [, credentials] = (signIn as jest.Mock).mock.calls.find((c) => c[0] === "email-otp")!;
    expect(credentials).not.toHaveProperty("referralCode");
  });
});
