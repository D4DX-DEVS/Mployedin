import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

// Mock Firebase BEFORE importing component
jest.mock("firebase/auth", () => ({
  signInWithPopup: jest.fn(),
}));

jest.mock("@/lib/firebase/client", () => ({
  firebaseAuth: {},
  googleProvider: {},
}));

// Mock next-intl
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      loading: "Loading…",
      quickApplyTitle: "Apply in seconds",
      quickApplyHint: "Upload your CV and we'll build your profile automatically — use email or sign in with Google to finish.",
      uploadYourCv: "Upload your CV (PDF or Word)",
      continueWithGoogle: "Continue with Google",
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

describe("EasyApply Anonymous Card", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: jest.fn(),
    });
    (useParams as jest.Mock).mockReturnValue({ locale: "en" });
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  it("renders the anonymous card when not authenticated", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    expect(screen.getByText("Apply in seconds")).toBeInTheDocument();
    expect(screen.getByText("Upload your CV (PDF or Word)")).toBeInTheDocument();
  });

  it("renders CV upload control", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const uploadButton = screen.getByText("Upload your CV (PDF or Word)");
    expect(uploadButton).toBeInTheDocument();
  });

  it("renders Google sign-in button", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const googleButton = screen.getByText("Continue with Google");
    expect(googleButton).toBeInTheDocument();
  });

  it("renders email sign-in button", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const emailButton = screen.getByText("Continue with email");
    expect(emailButton).toBeInTheDocument();
  });

  it("reveals email input when clicking email button", async () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const emailButton = screen.getByText("Continue with email");
    fireEvent.click(emailButton);

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText("Enter your email");
      expect(emailInput).toBeInTheDocument();
    });
  });

  it("calls csrfFetch when submitting email OTP", async () => {
    const { csrfFetch } = require("@/lib/security/csrf-client");
    csrfFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true }), { status: 200 })
    );

    const user = userEvent.setup();
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    // Click email button
    const emailButton = screen.getByText("Continue with email");
    await user.click(emailButton);

    // Enter email
    const emailInput = screen.getByPlaceholderText("Enter your email") as HTMLInputElement;
    await user.type(emailInput, "test@example.com");
    // The account is named after this, not the email's local part.
    await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");

    // Click send code button
    const sendCodeButton = screen.getByText("Send code");
    await user.click(sendCodeButton);

    await waitFor(() => {
      expect(csrfFetch).toHaveBeenCalledWith(
        "/api/auth/apply-otp/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "test@example.com", name: "Test Person" }),
        })
      );
    });
  });

  it("reveals OTP code input after successful email send", async () => {
    const { csrfFetch } = require("@/lib/security/csrf-client");
    csrfFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true }), { status: 200 })
    );

    const user = userEvent.setup();
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    // Click email button
    const emailButton = screen.getByText("Continue with email");
    await user.click(emailButton);

    // Enter email
    const emailInput = screen.getByPlaceholderText("Enter your email") as HTMLInputElement;
    await user.type(emailInput, "test@example.com");
    // The account is named after this, not the email's local part.
    await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");

    // Click send code button
    const sendCodeButton = screen.getByText("Send code");
    await user.click(sendCodeButton);

    // Wait for code input to appear
    await waitFor(() => {
      const codeInput = screen.getByPlaceholderText("000000");
      expect(codeInput).toBeInTheDocument();
    });
  });

  it("shows CV upload in email OTP flow", async () => {
    const { csrfFetch } = require("@/lib/security/csrf-client");
    csrfFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: true }), { status: 200 })
    );

    const user = userEvent.setup();
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    // Click email button
    const emailButton = screen.getByText("Continue with email");
    await user.click(emailButton);

    // Enter email
    const emailInput = screen.getByPlaceholderText("Enter your email") as HTMLInputElement;
    await user.type(emailInput, "test@example.com");
    // The account is named after this, not the email's local part.
    await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");

    // Click send code button
    const sendCodeButton = screen.getByText("Send code");
    await user.click(sendCodeButton);

    // Wait for CV upload to be visible in code entry screen
    await waitFor(() => {
      const uploadButtons = screen.getAllByText("Upload your CV (PDF or Word)");
      expect(uploadButtons.length).toBeGreaterThan(0);
    });
  });

  it("validates email input", async () => {
    const { csrfFetch } = require("@/lib/security/csrf-client");

    const user = userEvent.setup();
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    // Click email button
    const emailButton = screen.getByText("Continue with email");
    await user.click(emailButton);

    // Try to send without email
    const sendCodeButton = screen.getByText("Send code");
    await user.click(sendCodeButton);

    // Should not call csrfFetch without valid email
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  it("renders sign in instead link", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const signInLink = screen.getByText("Sign in to Apply");
    expect(signInLink).toBeInTheDocument();
  });

  it("renders copy link button", () => {
    render(
      <EasyApply
        jobId="test-job-id"
        jobTitle="Test Job"
        locale="en"
        screeningQuestions={[]}
      />
    );

    const copyLinkButtons = screen.getAllByText("Copy link");
    expect(copyLinkButtons.length).toBeGreaterThan(0);
  });

  describe("invisible reCAPTCHA on Send code", () => {
    async function sendCode() {
      const user = userEvent.setup();
      render(<EasyApply jobId="test-job-id" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);
      await user.click(screen.getByText("Continue with email"));
      await user.type(screen.getByPlaceholderText("Enter your email"), "test@example.com");
      await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");
      await user.click(screen.getByText("Send code"));
    }

    it("forwards the token Google minted alongside the email", async () => {
      const { getRecaptchaToken } = require("@/lib/browser/recaptcha");
      const { csrfFetch } = require("@/lib/security/csrf-client");
      getRecaptchaToken.mockResolvedValueOnce("tok-123");
      csrfFetch.mockResolvedValueOnce(new Response(JSON.stringify({ sent: true }), { status: 200 }));

      await sendCode();

      await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
      expect(getRecaptchaToken).toHaveBeenCalledWith("quick_apply");
      const [, init] = csrfFetch.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ email: "test@example.com", name: "Test Person", captchaToken: "tok-123" });
    });

    it("sends no token field at all when reCAPTCHA is not configured", async () => {
      const { csrfFetch } = require("@/lib/security/csrf-client");
      csrfFetch.mockResolvedValueOnce(new Response(JSON.stringify({ sent: true }), { status: 200 }));

      await sendCode();

      await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
      expect(JSON.parse(csrfFetch.mock.calls[0][1].body)).toEqual({ email: "test@example.com", name: "Test Person" });
    });

    it("shows the bot-check copy when the server refuses the token, and stays on the email step", async () => {
      const { csrfFetch } = require("@/lib/security/csrf-client");
      csrfFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "CAPTCHA_FAILED" }), { status: 403 }));

      await sendCode();

      expect(await screen.findByText("We couldn't confirm you're not a bot. Please try again.")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
    });

    it("shows the unavailable copy when Google cannot be reached (503)", async () => {
      const { csrfFetch } = require("@/lib/security/csrf-client");
      csrfFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "CAPTCHA_UNAVAILABLE" }), { status: 503 }));

      await sendCode();

      expect(await screen.findByText("The bot check is temporarily unavailable. Please try again in a moment.")).toBeInTheDocument();
    });
  });
});
