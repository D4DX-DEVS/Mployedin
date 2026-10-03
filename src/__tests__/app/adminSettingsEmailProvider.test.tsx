/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/admin/settings",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("@/components/features/settings/TwoFactorCard", () => ({ TwoFactorCard: () => null }));
jest.mock("@/components/features/settings/ChangeEmailCard", () => ({ ChangeEmailCard: () => null }));
jest.mock("@/app/[locale]/(dashboard)/admin/settings/_components/CommissionCountryRules", () => ({
  CommissionCountryRules: () => null,
  commissionRuleProblem: () => null,
}));

import AdminSettingsPage from "@/app/[locale]/(dashboard)/admin/settings/page";

// Heavy user-event flows (typing, Radix selects): a single test can pass 5 s when the whole suite runs in parallel.
jest.setTimeout(20_000);

// What the settings API sends in place of a stored secret (SECRET_MASK in src/lib/validators/settings.ts).
// The page keeps its own copy: importing the validators module would pull next/server into the client
// bundle, and cannot load under jsdom. adminSettingsSecretMask.test.ts pins the copies together.
const MASK = "••••••••";

const sesSettings = { region: "eu-west-1", accessKeyId: "AKIA1", secretAccessKey: MASK, fromEmail: "noreply@mployedin.com", fromName: "MPLOYEDIN", configurationSet: "" };
const settings = {
  platformName: "MPLOYEDIN", supportEmail: "support@mployedin.com", maintenanceMode: false, defaultCurrency: "AED",
  smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: MASK, smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false },
  email: { provider: "ses", ses: sesSettings },
  invoiceIssuer: {}, commissionOverrides: [],
};

let loaded: unknown = settings;
let saveResponse: { ok: boolean; status?: number; body: unknown } = { ok: true, body: { settings } };
let testResponse: { ok: boolean; status?: number; body: unknown } = {
  ok: true,
  body: { message: "Test email sent successfully via Amazon SES to noreply@mployedin.com" },
};
const fetchMock = jest.fn();

function postsTo(url: string, method = "POST") {
  return fetchMock.mock.calls.filter(([u, init]) => u === url && (init as RequestInit | undefined)?.method === method) as [string, RequestInit][];
}

beforeEach(() => {
  jest.clearAllMocks();
  loaded = settings;
  saveResponse = { ok: true, body: { settings } };
  testResponse = { ok: true, body: { message: "Test email sent successfully via Amazon SES to noreply@mployedin.com" } };
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const reply = (r: { ok: boolean; status?: number; body: unknown }) =>
      Promise.resolve({ ok: r.ok, status: r.status ?? (r.ok ? 200 : 400), json: async () => r.body });
    if (u === "/api/admin/settings/test-email") return reply(testResponse);
    if (u === "/api/admin/settings" && init?.method === "POST") return reply(saveResponse);
    if (u === "/api/admin/settings") return reply({ ok: true, body: { settings: loaded } });
    return reply({ ok: true, body: {} });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("admin settings email provider", () => {
  it("loads the SES provider, shows its fields and tests over SES", async () => {
    render(<AdminSettingsPage />);
    expect(await screen.findByLabelText("Amazon SES (Amazon's email sending service)")).toBeChecked();
    expect(screen.getByLabelText("Amazon region")).toHaveValue("eu-west-1");
    expect(screen.getByLabelText("Secret access key")).toHaveValue(MASK);

    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
    await waitFor(() => expect(postsTo("/api/admin/settings/test-email")).toHaveLength(1));
    expect(JSON.parse(String(postsTo("/api/admin/settings/test-email")[0][1].body))).toEqual({ provider: "ses", ses: sesSettings });
    // Localized, with the From address the route defaults to; the route's English string is not shown.
    expect(await screen.findByText("Test email sent to noreply@mployedin.com.")).toBeInTheDocument();
    expect(screen.queryByText(/Test email sent successfully/)).not.toBeInTheDocument();
  });

  it("sends the optional recipient with the test", async () => {
    render(<AdminSettingsPage />);
    await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
    await userEvent.type(screen.getByLabelText("Send the test email to (optional)"), " verified@mployedin.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
    await waitFor(() => expect(postsTo("/api/admin/settings/test-email")).toHaveLength(1));
    expect(JSON.parse(String(postsTo("/api/admin/settings/test-email")[0][1].body)).to).toBe("verified@mployedin.com");
    expect(await screen.findByText("Test email sent to verified@mployedin.com.")).toBeInTheDocument();
  });

  it("tests over SMTP with the provider named when SMTP is selected", async () => {
    loaded = { ...settings, smtp: { ...settings.smtp, smtpAppPassword: "typed-app-password" }, email: { provider: "smtp" } };
    testResponse = { ok: true, body: { message: "Test email sent successfully to smtp@mployedin.com" } };
    render(<AdminSettingsPage />);
    expect(await screen.findByLabelText("Your email account (SMTP), such as Gmail or Google Workspace")).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
    await waitFor(() => expect(postsTo("/api/admin/settings/test-email")).toHaveLength(1));
    expect(JSON.parse(String(postsTo("/api/admin/settings/test-email")[0][1].body))).toEqual({
      provider: "smtp",
      smtp: { smtpEmail: "smtp@mployedin.com", smtpAppPassword: "typed-app-password", smtpHost: "smtp.gmail.com", smtpPort: 587, smtpSecure: false },
    });
    expect(await screen.findByText("Test email sent to smtp@mployedin.com.")).toBeInTheDocument();
  });

  it("loads when the server has no email block yet (provider unset, no ses): nothing is pre-checked", async () => {
    loaded = { ...settings, email: undefined };
    render(<AdminSettingsPage />);
    const smtp = await screen.findByLabelText("Your email account (SMTP), such as Gmail or Google Workspace");
    expect(smtp).not.toBeChecked();
    expect(screen.getByLabelText("Amazon SES (Amazon's email sending service)")).not.toBeChecked();
    expect(screen.getByText(/Not chosen yet/)).toHaveTextContent(/the default email setup your technical team configured/);
    expect(screen.queryByText(/environment/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amazon region")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Amazon SES (Amazon's email sending service)"));
    expect(screen.queryByText(/Not chosen yet/)).not.toBeInTheDocument();
    // The setup help says who gets the details, and names only the fields the admin pastes.
    expect(screen.getByText(/Your technical team gets these details from Amazon Web Services \(SES\): the region, the access key ID and the secret/)).toBeInTheDocument();
    expect(screen.queryByText(/IAM|ses:SendEmail|ARN|sandbox/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amazon region")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send test email" })).toBeDisabled();
  });

  describe("the email block is sent only when the email section changed", () => {
    function savedBody() {
      return JSON.parse(String(postsTo("/api/admin/settings")[0][1].body));
    }

    it("saving the platform name sends no email key", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Platform Name"), "X");
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      expect(savedBody().platformName).toBe("MPLOYEDINX");
      expect(savedBody()).not.toHaveProperty("email");
    });

    it("with no provider saved, saving another section still picks none", async () => {
      loaded = { ...settings, email: undefined };
      render(<AdminSettingsPage />);
      await screen.findByText(/Not chosen yet/);
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      expect(savedBody()).not.toHaveProperty("email");
    });

    it("choosing a provider sends it", async () => {
      loaded = { ...settings, email: undefined };
      render(<AdminSettingsPage />);
      await screen.findByText(/Not chosen yet/);
      await userEvent.click(screen.getByLabelText("Your email account (SMTP), such as Gmail or Google Workspace"));
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      expect(savedBody().email.provider).toBe("smtp");
    });

    it("editing an SES field sends the email block", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Sender name"), "!");
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      expect(savedBody().email).toMatchObject({ provider: "ses", ses: { fromName: "MPLOYEDIN!", secretAccessKey: MASK } });
    });

    it("switching away and back to the saved provider sends nothing", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByLabelText("Your email account (SMTP), such as Gmail or Google Workspace"));
      await userEvent.click(screen.getByLabelText("Amazon SES (Amazon's email sending service)"));
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      expect(savedBody()).not.toHaveProperty("email");
    });
  });

  it("trims a pasted SES secret", async () => {
    render(<AdminSettingsPage />);
    await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
    await userEvent.type(screen.getByLabelText("Access key ID"), "2");
    await userEvent.click(screen.getByLabelText("Secret access key"));
    await userEvent.paste("  new-secret\n");
    expect(screen.getByLabelText("Secret access key")).toHaveValue("new-secret");
  });

  describe("the SES region", () => {
    it("is lowercased as it is typed", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      const region = screen.getByLabelText("Amazon region");
      await userEvent.clear(region);
      await userEvent.type(region, "EU-West-1");
      expect(region).toHaveValue("eu-west-1");
      await userEvent.tab();
      expect(screen.queryByText("Enter the region exactly as your technical team gave it, for example eu-west-1.")).not.toBeInTheDocument();
    });

    it("shows an inline error for a malformed region once the field is left, and does not save", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      const region = screen.getByLabelText("Amazon region");
      await userEvent.clear(region);
      await userEvent.type(region, "eu-west");
      expect(screen.queryByText("Enter the region exactly as your technical team gave it, for example eu-west-1.")).not.toBeInTheDocument();
      await userEvent.tab();
      expect(screen.getByText("Enter the region exactly as your technical team gave it, for example eu-west-1.")).toBeInTheDocument();
      expect(region).toHaveAttribute("aria-invalid", "true");

      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      expect(postsTo("/api/admin/settings")).toHaveLength(0);
      expect(toast.error).toHaveBeenCalledWith("Enter the region exactly as your technical team gave it, for example eu-west-1.");
      expect(region).toHaveFocus();
    });

    it("a malformed region left behind when switching to SMTP is not sent", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.clear(screen.getByLabelText("Amazon region"));
      await userEvent.type(screen.getByLabelText("Amazon region"), "eu-west");
      await userEvent.click(screen.getByLabelText("Your email account (SMTP), such as Gmail or Google Workspace"));
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      const sent = JSON.parse(String(postsTo("/api/admin/settings")[0][1].body)).email;
      expect(sent.provider).toBe("smtp");
      expect(sent.ses).not.toHaveProperty("region");
    });
  });

  it("switching to SMTP hides the SES fields and saves the provider", async () => {
    render(<AdminSettingsPage />);
    await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
    await userEvent.click(screen.getByLabelText("Your email account (SMTP), such as Gmail or Google Workspace"));
    expect(screen.queryByLabelText("Amazon region")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
    expect(JSON.parse(String(postsTo("/api/admin/settings")[0][1].body)).email.provider).toBe("smtp");
  });

  it("warns when the server says the SES settings are incomplete", async () => {
    saveResponse = { ok: true, body: { settings, warning: "ses_incomplete" } };
    render(<AdminSettingsPage />);
    await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("some Amazon SES details are missing")));
    expect(toast.success).toHaveBeenCalled();
  });

  describe("the access key ID and secret are a pair", () => {
    it("editing the access key ID while the secret is the mask clears the secret and marks it required", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      const secret = screen.getByLabelText("Secret access key");
      expect(secret).not.toBeRequired();

      await userEvent.type(screen.getByLabelText("Access key ID"), "2");

      expect(secret).toHaveValue("");
      expect(secret).toBeRequired();
      expect(secret).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Enter the secret access key that belongs to this access key ID.")).toBeInTheDocument();
      // Nothing to send over SES until the secret is typed: the stored one belongs to the old key.
      expect(screen.getByRole("button", { name: "Send test email" })).toBeDisabled();
    });

    it("does not save a new access key ID without its secret, then saves once the secret is typed", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Access key ID"), "2");

      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      expect(postsTo("/api/admin/settings")).toHaveLength(0);
      expect(toast.error).toHaveBeenCalledWith("Enter the secret access key that belongs to this access key ID.");
      expect(screen.getByLabelText("Secret access key")).toHaveFocus();

      await userEvent.type(screen.getByLabelText("Secret access key"), "new-secret");
      expect(screen.getByLabelText("Secret access key")).not.toBeRequired();
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      const sent = JSON.parse(String(postsTo("/api/admin/settings")[0][1].body)).email.ses;
      expect(sent).toMatchObject({ accessKeyId: "AKIA12", secretAccessKey: "new-secret" });
    });

    it("typing the original access key ID back restores the stored secret", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      const keyId = screen.getByLabelText("Access key ID");
      await userEvent.type(keyId, "2");
      expect(screen.getByLabelText("Secret access key")).toBeRequired();
      await userEvent.type(keyId, "{backspace}");
      expect(screen.getByLabelText("Secret access key")).not.toBeRequired();
      expect(screen.getByLabelText("Secret access key")).toHaveValue(MASK);
    });

    it("a secret typed for a new key is kept when the key ID is edited again", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Access key ID"), "2");
      await userEvent.type(screen.getByLabelText("Secret access key"), "new-secret");
      await userEvent.type(screen.getByLabelText("Access key ID"), "3");
      expect(screen.getByLabelText("Secret access key")).toHaveValue("new-secret");
    });

    it("after a successful save the typed secret goes back to the mask (the server's view)", async () => {
      saveResponse = { ok: true, body: { settings: { ...settings, email: { provider: "ses", ses: { ...sesSettings, accessKeyId: "AKIA12" } } } } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Access key ID"), "2");
      await userEvent.type(screen.getByLabelText("Secret access key"), "new-secret");
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(screen.getByLabelText("Secret access key")).toHaveValue(MASK));
      expect(screen.getByLabelText("Access key ID")).toHaveValue("AKIA12");
      expect(screen.getByLabelText("Secret access key")).not.toBeRequired();
    });

    it("an unpaired access key ID edit never reaches the server while SES is not the provider", async () => {
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.type(screen.getByLabelText("Access key ID"), "2");
      await userEvent.click(screen.getByLabelText("Your email account (SMTP), such as Gmail or Google Workspace"));
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(postsTo("/api/admin/settings")).toHaveLength(1));
      const sent = JSON.parse(String(postsTo("/api/admin/settings")[0][1].body)).email;
      expect(sent.provider).toBe("smtp");
      expect(sent.ses).not.toHaveProperty("accessKeyId");
      // An empty secret is ignored by the route, so the stored one is left alone.
      expect(sent.ses.secretAccessKey).toBe("");
    });
  });

  describe("localized copy instead of raw server text", () => {
    it("shows localized copy for a validation 400 (no message in the body)", async () => {
      testResponse = { ok: false, status: 400, body: { error: "Validation failed", details: [{ path: "ses.region", message: "Enter an AWS region such as eu-west-1" }] } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      expect(await screen.findByText("We couldn't send the test email. Check the email settings above, or ask your technical team.")).toBeInTheDocument();
      expect(screen.queryByText(/Validation failed/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Enter an AWS region/)).not.toBeInTheDocument();
    });

    it("shows a plain sentence first and keeps the provider's reply in a closed 'Details for your technical team' disclosure (500)", async () => {
      testResponse = { ok: false, status: 500, body: { message: "SES Error: MessageRejected: Email address is not verified." } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      expect(await screen.findByText("We couldn't send the test email. Check the email settings above, or ask your technical team.")).toBeInTheDocument();

      // Collapsed: the admin sees the summary, not the English reply.
      const summary = screen.getByText("Details for your technical team");
      const details = summary.closest("details") as HTMLDetailsElement;
      expect(summary.tagName).toBe("SUMMARY");
      expect(details).not.toHaveAttribute("open");
      const reply = screen.getByText("SES Error: MessageRejected: Email address is not verified.");
      expect(reply).not.toBeVisible();
      expect(summary).toBeVisible();

      // Opened with the keyboard-reachable summary, it shows the reply as the service wrote it.
      await userEvent.click(summary);
      expect(details).toHaveAttribute("open");
      expect(reply).toBeVisible();
      expect(screen.getByText(/What the email service said:/)).toBeVisible();
      expect(reply).toHaveAttribute("dir", "auto");
      expect(reply).toHaveClass("break-words");
    });

    it("makes the disclosure keyboard reachable with a visible focus style", async () => {
      testResponse = { ok: false, status: 500, body: { message: "SES Error: MessageRejected: Email address is not verified." } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      const summary = (await screen.findByText("Details for your technical team")) as HTMLElement;
      expect(summary.className).toMatch(/focus-visible:ring/);
      summary.focus();
      expect(summary).toHaveFocus();
    });

    it("starts a new test with the disclosure closed again", async () => {
      testResponse = { ok: false, status: 500, body: { message: "SES Error: MessageRejected: Email address is not verified." } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      await userEvent.click(await screen.findByText("Details for your technical team"));
      expect(screen.getByText("SES Error: MessageRejected: Email address is not verified.")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      await waitFor(() => expect(screen.getByText("Details for your technical team").closest("details")).not.toHaveAttribute("open"));
      expect(screen.getByText("SES Error: MessageRejected: Email address is not verified.")).not.toBeVisible();
    });

    it("shows only the headline for a 500 that carries no message", async () => {
      testResponse = { ok: false, status: 500, body: {} };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      expect(await screen.findByText("We couldn't send the test email. Check the email settings above, or ask your technical team.")).toBeInTheDocument();
      expect(screen.queryByText(/What the email service said:/)).not.toBeInTheDocument();
      expect(screen.queryByText("Details for your technical team")).not.toBeInTheDocument();
    });

    // 4: handler-level answers carry a message too, but it is English text for the API, not copy for the admin.
    it.each([
      [400, { message: "Please enter the SES secret access key before testing" }],
      [403, { error: "Forbidden", message: "Forbidden: admin only" }],
    ])("does not render the message of a %i response raw", async (status, body) => {
      testResponse = { ok: false, status, body };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      expect(await screen.findByText("We couldn't send the test email. Check the email settings above, or ask your technical team.")).toBeInTheDocument();
      expect(screen.queryByText(/Please enter the SES secret access key/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Forbidden/)).not.toBeInTheDocument();
      expect(screen.queryByText(/What the email service said:/)).not.toBeInTheDocument();
      expect(screen.queryByText("Details for your technical team")).not.toBeInTheDocument();
    });

    it("explains the masked SMTP password locally instead of calling the server", async () => {
      loaded = { ...settings, email: { provider: "smtp" } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Your email account (SMTP), such as Gmail or Google Workspace");
      await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
      expect(await screen.findByText(/Type the app password again to send a test/)).toBeInTheDocument();
      expect(postsTo("/api/admin/settings/test-email")).toHaveLength(0);
    });

    // The server refuses the stored (masked) SMTP password with a changed host or user (S8): say why, on the field.
    it("maps the smtp_password_required 400 to a localized hint on the password field, not the generic toast", async () => {
      loaded = { ...settings, email: { provider: "smtp" } };
      saveResponse = { ok: false, status: 400, body: { error: "smtp_password_required" } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Your email account (SMTP), such as Gmail or Google Workspace");
      const password = screen.getByLabelText("App password");
      expect(password).not.toHaveAttribute("aria-invalid");
      await userEvent.clear(screen.getByLabelText("Mail server (SMTP host)"));
      await userEvent.type(screen.getByLabelText("Mail server (SMTP host)"), "smtp.example.com");
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      const hint = await screen.findByText("Type the password again when you change the mail server or the email address.");
      expect(password).toHaveAttribute("aria-invalid", "true");
      expect(password.getAttribute("aria-describedby")).toBe(hint.id);
      expect(password).toHaveFocus();
      expect(toast.error).not.toHaveBeenCalledWith("We couldn't save your settings. Please try again.");

      // Typing the password clears the hint.
      await userEvent.type(password, "new-app-password");
      expect(screen.queryByText("Type the password again when you change the mail server or the email address.")).not.toBeInTheDocument();
      expect(password).not.toHaveAttribute("aria-invalid");
    });

    it("never shows the raw server error when saving fails", async () => {
      saveResponse = { ok: false, status: 400, body: { error: "Validation failed", details: [] } };
      render(<AdminSettingsPage />);
      await screen.findByLabelText("Amazon SES (Amazon's email sending service)");
      await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("We couldn't save your settings. Please try again."));
      expect(toast.error).not.toHaveBeenCalledWith("Validation failed");
    });
  });
});
