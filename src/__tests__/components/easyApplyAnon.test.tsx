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
      // CaptchaNotice reads these from the common namespace; this mock serves one flat table.
      captchaNotice: "Protected by reCAPTCHA. Google's {privacy} and {terms} apply.",
      captchaPrivacyLink: "Privacy Policy",
      captchaTermsLink: "Terms",
      opensInNewTab: "(opens in a new tab)",
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
import { GooglePopupBlockedError } from "@/lib/firebase/googlePopupBlocked";

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

  describe("Google button: Firebase loads on click only", () => {
    const { getGoogleIdToken, preloadGoogleSignIn } = require("@/lib/firebase/googleSignIn");
    const googleButton = () => screen.getByRole("button", { name: "Continue with Google" });
    const renderCard = () =>
      render(<EasyApply jobId="test-job-id" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);

    it("does not start Firebase or warm anything just by rendering", () => {
      renderCard();

      expect(getGoogleIdToken).not.toHaveBeenCalled();
      expect(preloadGoogleSignIn).not.toHaveBeenCalled();
    });

    it("warms our own chunk on hover, focus and touch, and never starts the sign-in", () => {
      renderCard();

      fireEvent.pointerEnter(googleButton());
      fireEvent.focus(googleButton());
      fireEvent.touchStart(googleButton());

      expect(preloadGoogleSignIn).toHaveBeenCalledTimes(3);
      expect(getGoogleIdToken).not.toHaveBeenCalled();
      expect(signIn).not.toHaveBeenCalled();
    });

    it("gets the Google token through the helper on click and exchanges it for a session", async () => {
      getGoogleIdToken.mockResolvedValue("id-token");
      (signIn as jest.Mock).mockResolvedValue({ error: "AccessDenied", code: "account_inactive" });
      renderCard();

      fireEvent.click(googleButton());

      await waitFor(() =>
        expect(signIn).toHaveBeenCalledWith("firebase", expect.objectContaining({ idToken: "id-token", redirect: false })),
      );
      expect(getGoogleIdToken).toHaveBeenCalledTimes(1);
    });

    // Closing the Google window is a choice, not an error and not a blocked pop-up:
    // no message at all, the card is simply usable again. The codes and messages
    // below are the ones Firebase really throws.
    it.each([
      ["auth/popup-closed-by-user", "Firebase: Error (auth/popup-closed-by-user)."],
      ["auth/cancelled-popup-request", "Firebase: Error (auth/cancelled-popup-request)."],
    ])("says nothing when Firebase reports %s, and the card stays usable", async (code, message) => {
      getGoogleIdToken.mockRejectedValue(Object.assign(new Error(message), { code }));
      renderCard();

      fireEvent.click(googleButton());

      await waitFor(() => expect(getGoogleIdToken).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(googleButton()).toBeEnabled());
      expect(screen.queryByText("Google sign-in failed. Please try again.")).toBeNull();
      expect(screen.queryByText("Your browser blocked the Google sign-in popup. Try using email instead.")).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
      expect(require("@/lib/browser/navigateWithPageLoad").navigateWithPageLoad).not.toHaveBeenCalled();
    });

    it("shows the usual failure copy for any other error, and the card stays usable", async () => {
      getGoogleIdToken.mockRejectedValue(
        Object.assign(new Error("Firebase: Error (auth/network-request-failed)."), { code: "auth/network-request-failed" }),
      );
      renderCard();

      fireEvent.click(googleButton());

      expect(await screen.findByText("Google sign-in failed. Please try again.")).toBeInTheDocument();
      expect(screen.queryByText("Your browser blocked the Google sign-in popup. Try using email instead.")).toBeNull();
      expect(signIn).not.toHaveBeenCalled();
      expect(googleButton()).toBeEnabled();
    });

    it("does not read \"popup\" or \"blocked\" in an unrelated error as a blocked pop-up", async () => {
      getGoogleIdToken.mockRejectedValue(new Error("Request to the popup helper was blocked by the network"));
      renderCard();

      fireEvent.click(googleButton());

      expect(await screen.findByText("Google sign-in failed. Please try again.")).toBeInTheDocument();
      expect(screen.queryByText("Your browser blocked the Google sign-in popup. Try using email instead.")).toBeNull();
    });

    it("tells the visitor a Google window opens, and ties the notice to the button", () => {
      renderCard();

      const notice = screen.getByText("Continue with Google opens a Google window");
      expect(notice.id).not.toBe("");
      expect(googleButton().getAttribute("aria-describedby")).toBe(notice.id);
    });

    it("does not announce the neutral notice: the live region is in the page, but empty", () => {
      renderCard();

      expect(document.querySelector('[aria-live="polite"]')).toBeEmptyDOMElement();
      expect(screen.getByText("Continue with Google opens a Google window")).not.toHaveAttribute("aria-hidden");
    });

    describe("when the browser blocked the Google window", () => {
      const BLOCKED = "Your browser blocked the Google window. Press the Google button again.";
      const NOTICE = "Continue with Google opens a Google window";
      const noticeLine = () => document.getElementById("google-window-notice") as HTMLElement;
      const announced = () =>
        Array.from(document.querySelectorAll('[aria-live="polite"]'))
          .map((node) => node.textContent)
          .join("");
      /** The blocked message is on the line under the button and is what the live region announces. */
      const expectBlocked = async () => {
        await waitFor(() => expect(noticeLine()).toHaveTextContent(BLOCKED));
        expect(announced()).toBe(BLOCKED);
      };

      it("says so inline next to the button, in place of the notice, and does not log an error", async () => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
        getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
        renderCard();
        // A screen reader only announces text added to a live region it already knows about.
        const region = document.querySelector('[aria-live="polite"]');
        expect(region).toBeEmptyDOMElement();

        fireEvent.click(googleButton());

        await expectBlocked();
        expect(document.querySelector('[aria-live="polite"]')).toBe(region);
        const message = noticeLine();
        expect(message.id).not.toBe("");
        expect(googleButton().getAttribute("aria-describedby")).toBe(message.id);
        // The visible line is not read a second time.
        expect(message).toHaveAttribute("aria-hidden", "true");
        expect(screen.queryByText(NOTICE)).toBeNull();
        // Not the generic failure line, and nothing logged.
        expect(screen.queryByText("Google sign-in failed. Please try again.")).toBeNull();
        expect(consoleError).not.toHaveBeenCalled();
        expect(signIn).not.toHaveBeenCalled();
        expect(googleButton()).toBeEnabled();
        consoleError.mockRestore();
      });

      it("clears the message on the next click and calls the helper again", async () => {
        getGoogleIdToken.mockRejectedValueOnce(new GooglePopupBlockedError());
        renderCard();
        fireEvent.click(googleButton());
        await expectBlocked();

        // The retry is still waiting on Google: the old message must already be gone.
        getGoogleIdToken.mockReturnValueOnce(new Promise(() => {}));
        fireEvent.click(googleButton());

        await waitFor(() => expect(getGoogleIdToken).toHaveBeenCalledTimes(2));
        expect(screen.queryByText(BLOCKED)).toBeNull();
        expect(announced()).toBe("");
      });

      // The retry runs on the instance the first attempt kept, after the handshake
      // finished, so a second block in a row means the browser really blocks pop-ups. The helper then hands
      // back the Firebase error itself and the card gives its popup guidance
      // instead of asking to press the button a third time.
      it("gives the allow-pop-ups guidance, not another \"press again\", when the retry is blocked too", async () => {
        getGoogleIdToken
          .mockRejectedValueOnce(new GooglePopupBlockedError())
          .mockRejectedValueOnce(Object.assign(new Error("Firebase: Error (auth/popup-blocked)."), { code: "auth/popup-blocked" }));
        renderCard();
        fireEvent.click(googleButton());
        await expectBlocked();

        fireEvent.click(googleButton());

        expect(await screen.findByText("Your browser blocked the Google sign-in popup. Try using email instead.")).toBeInTheDocument();
        expect(screen.queryByText(BLOCKED)).toBeNull();
        expect(signIn).not.toHaveBeenCalled();
        expect(googleButton()).toBeEnabled();
      });
    });

    // The popup resolver keeps a hidden Google iframe and window.gapi until the
    // document unloads, and deleting the Firebase app does not remove them.
    describe("after a successful sign-in", () => {
      const { navigateWithPageLoad } = require("@/lib/browser/navigateWithPageLoad");
      const { getSession } = require("next-auth/react");

      beforeEach(() => {
        getGoogleIdToken.mockResolvedValue("id-token");
        (signIn as jest.Mock).mockResolvedValue({ error: null });
        getSession.mockResolvedValue({ user: { role: "job_seeker" } });
      });

      afterEach(() => {
        (global.fetch as unknown as jest.Mock).mockReset();
      });

      it("loads the job page again, so the Google iframe and gapi are gone, when no CV is held in memory", async () => {
        const update = jest.fn();
        (useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated", update });
        renderCard();

        fireEvent.click(googleButton());

        await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
        expect(navigateWithPageLoad).toHaveBeenCalledWith(window.location.pathname + window.location.search);
        expect(update).not.toHaveBeenCalled();
      });

      it("does NOT reload before the confirm step, while a CV the visitor picked is held in memory (a reload would drop it)", async () => {
        const { csrfFetch } = require("@/lib/security/csrf-client");
        csrfFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, extracted: {}, profileCompleteness: 10 }),
        });
        // The confirm step the CV flow reaches loads the country list for its phone field.
        (global.fetch as unknown as jest.Mock).mockResolvedValue({ ok: false, json: async () => null });
        renderCard();
        const cv = new File(["cv"], "cv.pdf", { type: "application/pdf" });
        fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [cv] } });

        fireEvent.click(googleButton());

        await waitFor(() => expect(csrfFetch).toHaveBeenCalledWith("/api/ai/cv-extract", expect.anything()));
        expect(navigateWithPageLoad).not.toHaveBeenCalled();
      });

      // With a CV the visitor goes through the confirm step first. Once that has
      // saved the profile (the CV is stored on the server) nothing in memory is
      // needed any more, so the page loads again and drops Firebase's iframe too.
      describe("with a CV, at the confirm step", () => {
        const { csrfFetch } = require("@/lib/security/csrf-client");

        async function reachConfirmStep(update: jest.Mock) {
          csrfFetch.mockReset();
          csrfFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ success: true, extracted: { fullName: "Test Person" }, profileCompleteness: 10 }),
          });
          (useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated", update });
          // The confirm step loads the country list for its phone field.
          (global.fetch as unknown as jest.Mock).mockResolvedValue({ ok: false, json: async () => null });
          renderCard();
          const cv = new File(["cv"], "cv.pdf", { type: "application/pdf" });
          fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [cv] } });
          fireEvent.click(googleButton());
          return screen.findByRole("button", { name: "looksGood" });
        }

        it("loads the job page again once the profile has been saved", async () => {
          const update = jest.fn();
          const confirm = await reachConfirmStep(update);
          expect(navigateWithPageLoad).not.toHaveBeenCalled();
          csrfFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

          fireEvent.click(confirm);

          await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
          expect(navigateWithPageLoad).toHaveBeenCalledWith(window.location.pathname + window.location.search);
          const [url, init] = csrfFetch.mock.calls[1];
          expect(url).toBe("/api/job-seekers/profile");
          expect(init.method).toBe("PATCH");
          expect(update).not.toHaveBeenCalled();
        });

        it("keeps the button busy while the page loads, so it cannot be pressed twice", async () => {
          const confirm = await reachConfirmStep(jest.fn());
          csrfFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

          fireEvent.click(confirm);

          await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
          expect(screen.getByRole("button", { name: "looksGood" })).toBeDisabled();
        });

        // The card goes back to its start (the error is shown there); nothing is loaded again.
        it("does not leave when the profile could not be saved, and shows the reason", async () => {
          const confirm = await reachConfirmStep(jest.fn());
          csrfFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Phone number is not valid" }) });

          fireEvent.click(confirm);

          expect(await screen.findByText("Phone number is not valid")).toBeInTheDocument();
          expect(navigateWithPageLoad).not.toHaveBeenCalled();
          expect(googleButton()).toBeEnabled();
        });

        it("does not leave when the save request itself fails, and says so", async () => {
          const confirm = await reachConfirmStep(jest.fn());
          csrfFetch.mockRejectedValueOnce(new Error("offline"));

          fireEvent.click(confirm);

          expect(await screen.findByText("We couldn't apply. Please try again.")).toBeInTheDocument();
          expect(navigateWithPageLoad).not.toHaveBeenCalled();
          expect(googleButton()).toBeEnabled();
        });
      });

      // The visitor picked a CV, then verifies an emailed code. `queued` are the
      // responses of the requests that follow the code request (CV extraction, save).
      async function verifyEmailCodeWithCv(update: jest.Mock, queued: unknown[]) {
        const { csrfFetch } = require("@/lib/security/csrf-client");
        csrfFetch.mockReset();
        csrfFetch.mockResolvedValueOnce(new Response(JSON.stringify({ sent: true }), { status: 200 }));
        for (const response of queued) csrfFetch.mockResolvedValueOnce(response);
        (useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated", update });
        (global.fetch as unknown as jest.Mock).mockResolvedValue({ ok: false, json: async () => null });
        const user = userEvent.setup();
        renderCard();
        const cv = new File(["cv"], "cv.pdf", { type: "application/pdf" });
        fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [cv] } });
        await user.click(screen.getByText("Continue with email"));
        await user.type(screen.getByPlaceholderText("Enter your email"), "test@example.com");
        await user.type(screen.getByPlaceholderText("Enter your full name"), "Test Person");
        await user.click(screen.getByText("Send code"));
        await user.type(await screen.findByPlaceholderText("000000"), "123456");
        await user.click(screen.getByText("Verify"));
        return { csrfFetch, user };
      }

      it("a sign-in with an emailed code, with a CV, does not leave through a page load (no Google iframe to drop)", async () => {
        const update = jest.fn();
        const { user } = await verifyEmailCodeWithCv(update, [
          { ok: true, json: async () => ({ success: true, extracted: {}, profileCompleteness: 10 }) },
          { ok: true, json: async () => ({}) },
        ]);
        const confirm = await screen.findByRole("button", { name: "looksGood" });

        await user.click(confirm);

        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(navigateWithPageLoad).not.toHaveBeenCalled();
        expect(getGoogleIdToken).not.toHaveBeenCalled();
      });

      // An existing employer or agent account is not a job seeker: there is no CV
      // to extract and no confirm step, the usual restriction shows once the page
      // has the new session. After a Google sign-in that is a page load as well,
      // since the hidden Google iframe is in this document either way.
      describe("when the Google account is an existing employer or agent, and a CV was picked", () => {
        it.each(["employer", "agent"])("an existing %s account: loads the job page again, without reading the CV", async (role) => {
          const { csrfFetch } = require("@/lib/security/csrf-client");
          csrfFetch.mockReset();
          getSession.mockResolvedValue({ user: { role } });
          const update = jest.fn();
          (useSession as jest.Mock).mockReturnValue({ data: null, status: "unauthenticated", update });
          renderCard();
          const cv = new File(["cv"], "cv.pdf", { type: "application/pdf" });
          fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [cv] } });

          fireEvent.click(googleButton());

          await waitFor(() => expect(navigateWithPageLoad).toHaveBeenCalledTimes(1));
          expect(navigateWithPageLoad).toHaveBeenCalledWith(window.location.pathname + window.location.search);
          expect(csrfFetch).not.toHaveBeenCalled();
          expect(update).not.toHaveBeenCalled();
          expect(screen.queryByRole("button", { name: "looksGood" })).toBeNull();
        });

        it("an employer who signs in with an emailed code instead just refreshes the session (no Google iframe to drop)", async () => {
          getSession.mockResolvedValue({ user: { role: "employer" } });
          const update = jest.fn();
          const { csrfFetch } = await verifyEmailCodeWithCv(update, []);

          await waitFor(() => expect(update).toHaveBeenCalled());
          expect(navigateWithPageLoad).not.toHaveBeenCalled();
          expect(csrfFetch).toHaveBeenCalledTimes(1); // only the code request: the CV is not read
        });
      });

      it("does not reload when the sign-in was refused", async () => {
        (signIn as jest.Mock).mockResolvedValue({ error: "AccessDenied", code: "account_inactive" });
        renderCard();

        fireEvent.click(googleButton());

        await waitFor(() => expect(signIn).toHaveBeenCalled());
        expect(navigateWithPageLoad).not.toHaveBeenCalled();
      });
    });
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

    describe("'Protected by reCAPTCHA' notice", () => {
      const NOTICE = "Protected by reCAPTCHA. Google's Privacy Policy (opens in a new tab) and Terms (opens in a new tab) apply.";
      const { isRecaptchaEnabled } = require("@/lib/browser/recaptcha");
      const { isInAppBrowser } = require("@/lib/browser/inAppBrowser");

      afterEach(() => {
        isRecaptchaEnabled.mockReturnValue(false);
        isInAppBrowser.mockReturnValue(false);
      });

      function noticeNode() {
        return screen.queryByText((_, el) => el?.tagName === "P" && el.textContent === NOTICE);
      }

      it("sits directly under Send code on the email step when captcha is on", async () => {
        isRecaptchaEnabled.mockReturnValue(true);
        const user = userEvent.setup();
        render(<EasyApply jobId="test-job-id" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);
        await user.click(screen.getByText("Continue with email"));

        const notice = noticeNode() as HTMLElement;
        const send = screen.getByText("Send code").closest("button") as HTMLElement;
        expect(notice).toBeInTheDocument();
        expect(send.nextElementSibling).toBe(notice);
        expect(screen.getByRole("link", { name: "Privacy Policy (opens in a new tab)" })).toHaveAttribute("href", "https://policies.google.com/privacy");
        expect(screen.getByRole("link", { name: "Terms (opens in a new tab)" })).toHaveAttribute("href", "https://policies.google.com/terms");
      });

      it("sits under Send code in the in-app-browser layout too", async () => {
        isRecaptchaEnabled.mockReturnValue(true);
        isInAppBrowser.mockReturnValue(true);
        render(<EasyApply jobId="test-job-id" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);

        const notice = noticeNode() as HTMLElement;
        const send = screen.getByText("Send code").closest("button") as HTMLElement;
        expect(notice).toBeInTheDocument();
        expect(send.nextElementSibling).toBe(notice);
      });

      it("is not shown when captcha is off", async () => {
        const user = userEvent.setup();
        render(<EasyApply jobId="test-job-id" jobTitle="Test Job" locale="en" screeningQuestions={[]} />);
        await user.click(screen.getByText("Continue with email"));

        expect(screen.getByText("Send code")).toBeInTheDocument();
        expect(noticeNode()).toBeNull();
      });
    });
  });
});
