import { test, expect, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import IntlMessageFormat from "intl-messageformat";

/**
 * Regression cover for the "Add Employer just says it failed" bug.
 *
 * An admin typed the password `78965412` and got one fixed sentence — "We
 * couldn't save your changes" — with no way to learn that the policy wants 12
 * characters plus an upper-case letter and a symbol. CrudModal was discarding
 * every message its callers threw (commit 83aae8ca), and the employers page
 * carried its own hard-coded English rules that an Arabic admin could not read.
 *
 * Jest already pins the pure logic (getPasswordIssues, formErrorFromResponse).
 * What jest cannot show is the part that was actually broken: whether the
 * sentence survives the round trip through a real dialog, a real API rejection
 * and next-intl's own message compilation. So every expectation here is built
 * from messages/{en,ar}.json rather than a literal, which makes the spec fail
 * if a key is deleted, renamed, moved out of the `formErrors` namespace, has
 * broken ICU syntax, or is quietly replaced by hard-coded English.
 *
 * Nothing is created: a weak password never leaves the browser, a duplicate
 * email stops at 409, and the country payload is rejected at 400.
 */

/* ── Accounts (seeded; see memory "E2E environment") ─────────────────────── */

interface Credentials {
  email: string;
  password: string;
}

const ADMIN: Credentials = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@mployedin.com",
  password: process.env.E2E_ADMIN_PASS ?? "Admin@1234",
};
const SUPER_AGENT: Credentials = {
  email: process.env.E2E_SA_EMAIL ?? "superagent@mployedin.com",
  password: process.env.E2E_SA_PASS ?? "SuperAgent@1234",
};
const AGENT: Credentials = {
  email: process.env.E2E_AGENT_EMAIL ?? "agent@mployedin.com",
  password: process.env.E2E_AGENT_PASS ?? "Agent@1234",
};

/** The exact password from the bug report: 8 characters, digits only. */
const WEAK_PASSWORD = "78965412";
/** Satisfies every rule, so a create attempt reaches the server. */
const STRONG_PASSWORD = "Test@Employer2026!";
/** Seeded employer login — creating against it must come back as a conflict. */
const TAKEN_EMAIL = process.env.E2E_TAKEN_EMAIL ?? "employer@test.mployedin.com";

const PASSWORD_MIN_LENGTH = 12;

type Locale = "en" | "ar";

/* ── Message helpers ─────────────────────────────────────────────────────── */

const messageCache: Partial<Record<Locale, Record<string, unknown>>> = {};

function messages(locale: Locale): Record<string, unknown> {
  if (!messageCache[locale]) {
    const file = path.join(process.cwd(), "messages", `${locale}.json`);
    messageCache[locale] = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  }
  return messageCache[locale]!;
}

/** Reads a dotted key out of the shipped locale file and compiles its ICU. */
function t(locale: Locale, dottedKey: string, vars?: Record<string, string | number>): string {
  const raw = dottedKey
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], messages(locale));
  if (typeof raw !== "string") {
    throw new Error(`messages/${locale}.json is missing "${dottedKey}" — the UI would throw on this key.`);
  }
  return String(new IntlMessageFormat(raw, locale).format(vars ?? {}));
}

/**
 * What the policy must say about WEAK_PASSWORD: too short, and missing a
 * lower-case letter, an upper-case letter and a symbol — named in one sentence
 * rather than one rule per failed attempt.
 */
function expectedWeakPasswordMessage(locale: Locale): string {
  const rules = [
    t(locale, "formErrors.passwordRuleLowercase"),
    t(locale, "formErrors.passwordRuleUppercase"),
    t(locale, "formErrors.passwordRuleSymbol"),
  ];
  const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(rules);
  return [
    t(locale, "formErrors.passwordTooShort", { min: PASSWORD_MIN_LENGTH, count: WEAK_PASSWORD.length }),
    t(locale, "formErrors.passwordMissing", { rules: list }),
  ].join(" ");
}

/**
 * Strings that only ever come from a server payload or a thrown exception.
 * The old code pasted these straight into the banner; none may appear again.
 */
const RAW_SERVER_TEXT = [
  "Validation failed",
  "Email already in use",
  "expected string",
  "Unprocessable",
  "Internal Server Error",
  "TypeError",
  "Failed to",
  "undefined",
];

function expectNoRawServerText(message: string): void {
  for (const fragment of RAW_SERVER_TEXT) {
    expect(message, `banner leaked server/exception text: ${fragment}`).not.toContain(fragment);
  }
}

/* ── Page helpers ────────────────────────────────────────────────────────── */

async function login(page: Page, credentials: Credentials, landing: RegExp): Promise<void> {
  // networkidle, not domcontentloaded: filling before React hydrates leaves the
  // controlled inputs empty and the submit silently does nothing. Login also
  // stalls intermittently against a dev server, hence the retry.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/en/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(credentials.email);
    await page.locator("#password").fill(credentials.password);
    await page.locator('button[type="submit"]').first().click();
    try {
      await page.waitForURL(landing, { timeout: 60_000 });
      return;
    } catch {
      if (attempt === 3) throw new Error(`login failed for ${credentials.email}`);
    }
  }
}

async function openDialog(page: Page, url: string, triggerName: string): Promise<Locator> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: triggerName }).first();
  // Generous: the first hit on a route compiles it, which alone can exceed
  // Playwright's default timeout on a dev server.
  await trigger.waitFor({ timeout: 120_000 });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 20_000 });
  return dialog;
}

/** The inline error banner. `div` (not `*`) skips the red required-field asterisks. */
async function bannerText(dialog: Locator): Promise<string> {
  const banner = dialog.locator("div.text-destructive").first();
  await banner.waitFor({ timeout: 30_000 });
  return ((await banner.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

async function fillById(dialog: Locator, values: Record<string, string>): Promise<void> {
  for (const [id, value] of Object.entries(values)) {
    await dialog.locator(`#${id}`).fill(value);
  }
}

/**
 * Submits and returns the status the API actually gave.
 *
 * `/api/employers` allows three writes a minute per admin (rateLimit.ts:46) and
 * that budget is shared with anything else touching this dev server — the other
 * Playwright project, or a person clicking around. A 429 is a different branch
 * than the conflict tests are about, so wait out the window the response itself
 * advertises and try once more instead of asserting on whichever arrived first.
 */
async function submitExpectingStatus(
  page: Page,
  submit: Locator,
  apiPath: string,
  expectedStatus: number,
): Promise<void> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const responded = page
      .waitForResponse((r) => r.url().includes(apiPath) && r.request().method() === "POST", { timeout: 60_000 })
      .catch(() => null);
    await submit.click();
    const response = await responded;
    const status = response?.status();

    if (status !== 429) {
      expect(status, `POST ${apiPath} status`).toBe(expectedStatus);
      return;
    }
    if (attempt === 2) throw new Error(`POST ${apiPath} still rate limited after waiting out the window`);
    const retryAfter = Number(response?.headers()["retry-after"] ?? 60);
    await page.waitForTimeout((Math.min(retryAfter, 60) + 2) * 1000);
  }
}

test.describe("form error copy", () => {
  test.describe.configure({ timeout: 180_000 });

  /* ── The reported bug ──────────────────────────────────────────────────── */

  test("admin: Add Employer names every unmet password rule and shows them up front (en)", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    const dialog = await openDialog(page, "/en/admin/employers", t("en", "adminEmployers.addEmployerButton"));

    // The rules are readable before anything is submitted, and tied to the
    // input so a screen reader announces them with the field.
    const password = dialog.locator("#password");
    await expect(password).toHaveAttribute("placeholder", t("en", "formErrors.passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }));
    await expect(password).toHaveAttribute("aria-describedby", "password-hint");
    await expect(dialog.locator("#password-hint")).toHaveText(t("en", "formErrors.passwordHint", { min: PASSWORD_MIN_LENGTH }));

    await fillById(dialog, {
      name: "Probe Contact",
      email: "probe-weak-password@example.com",
      password: WEAK_PASSWORD,
      companyName: "Probe Co",
    });
    await dialog.getByRole("button", { name: t("en", "common.create") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("en"));
    expectNoRawServerText(message);
  });

  test("admin: Add Employer is fully Arabic for an Arabic admin (ar)", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    const dialog = await openDialog(page, "/ar/admin/employers", t("ar", "adminEmployers.addEmployerButton"));

    // The modal's own chrome used to be hard-coded English inside an RTL page.
    await expect(dialog.getByRole("button", { name: t("ar", "common.cancel") })).toBeVisible();
    await expect(dialog.locator("#password")).toHaveAttribute("placeholder", t("ar", "formErrors.passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }));

    await fillById(dialog, {
      name: "Probe Contact",
      email: "probe-weak-password-ar@example.com",
      password: WEAK_PASSWORD,
      companyName: "Probe Co",
    });
    await dialog.getByRole("button", { name: t("ar", "common.create") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("ar"));
    // The Arabic sentence names the character classes as "(A-Z)" and "(a-z)";
    // any longer Latin run would be untranslated English that leaked through.
    expect(message).not.toMatch(/[A-Za-z]{4,}/);
  });

  for (const locale of ["en", "ar"] as const) {
    test(`admin: a duplicate email is reported in the admin's language, not the server's (${locale})`, async ({ page }) => {
      await login(page, ADMIN, /\/admin/);
      const dialog = await openDialog(page, `/${locale}/admin/employers`, t(locale, "adminEmployers.addEmployerButton"));
      await fillById(dialog, {
        name: "Probe Contact",
        email: TAKEN_EMAIL,
        password: STRONG_PASSWORD,
        companyName: "Probe Co",
      });

      // The server answers 409 with the English string "Email already in use";
      // what reaches the admin must be the translated sentence instead.
      await submitExpectingStatus(page, dialog.getByRole("button", { name: t(locale, "common.create") }), "/api/employers", 409);

      const message = await bannerText(dialog);
      expect(message).toBe(t(locale, "formErrors.emailInUse"));
      expectNoRawServerText(message);
    });
  }

  /* ── Server-side rejection, and the reset bug this spec exposed ────────── */

  test("admin: a rejected field is named, and typed values survive the list refresh", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    await page.goto("/en/admin/location-data/countries", { waitUntil: "domcontentloaded" });

    // Registered before the dialog opens: CrudModal used to re-initialise on
    // every parent render, so the list fetch landing mid-typing blanked the
    // form and the admin then hit "Please fill out this field" on their own input.
    const listSettled = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/admin/location-data/countries") && response.request().method() === "GET",
        { timeout: 30_000 },
      )
      .catch(() => null);

    const trigger = page.getByRole("button", { name: t("en", "adminLocationData.addNew") }).first();
    await trigger.waitFor({ timeout: 120_000 });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 20_000 });

    await fillById(dialog, { name: "Probeland", code: "TOOLONG" });
    await listSettled;
    await expect(dialog.locator("#name")).toHaveValue("Probeland");
    await expect(dialog.locator("#code")).toHaveValue("TOOLONG");

    // `code` is capped at 3 characters server-side, so this is a real 400 whose
    // zod path has to be translated back into the field's on-screen label.
    await dialog.getByRole("button", { name: t("en", "common.create") }).click();
    const message = await bannerText(dialog);
    expect(message).toBe(t("en", "formErrors.invalidFields", { fields: t("en", "adminLocationData.shortName") }));
    expectNoRawServerText(message);
  });

  /* ── The same policy on the hand-rolled dialogs ────────────────────────── */

  test("admin: Add Agent applies the shared policy and copy", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    const dialog = await openDialog(page, "/en/admin/agents", t("en", "adminAgents.addAgent"));

    await expect(dialog.locator("#add-agent-password-hint")).toHaveText(
      t("en", "formErrors.passwordHint", { min: PASSWORD_MIN_LENGTH }),
    );
    await dialog.locator("input").first().fill("Probe Agent");
    await dialog.locator("input[type=email]").fill("probe-new-agent@example.com");
    await dialog.locator("input[aria-describedby='add-agent-password-hint']").fill(WEAK_PASSWORD);
    await dialog.getByRole("button", { name: t("en", "adminAgents.createAgent") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("en"));
    expectNoRawServerText(message);
  });

  test("admin: Create User applies the shared policy, and a taken email comes back translated", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    const dialog = await openDialog(page, "/en/admin/users", t("en", "adminUsers.createUser"));

    await expect(dialog.locator("#create-password-hint")).toHaveText(
      t("en", "formErrors.passwordHint", { min: PASSWORD_MIN_LENGTH }),
    );
    await fillById(dialog, { "create-name": "Probe User", "create-email": ADMIN.email, "create-password": WEAK_PASSWORD });
    const submit = dialog.getByRole("button", { name: t("en", "adminUsers.create") });
    await submit.click();

    const weak = await bannerText(dialog);
    expect(weak).toBe(expectedWeakPasswordMessage("en"));

    // Same dialog, now a real request: the admin's own address is taken. The
    // banner must swap from the password sentence to the conflict sentence.
    await dialog.locator("#create-password").fill(STRONG_PASSWORD);
    await submitExpectingStatus(page, submit, "/api/admin/users", 409);
    await expect(dialog.locator("div.text-destructive").first()).toHaveText(t("en", "formErrors.emailInUse"), {
      timeout: 30_000,
    });
    expectNoRawServerText(await bannerText(dialog));
  });

  test("admin: Add Super Agent applies the shared policy (ar)", async ({ page }) => {
    await login(page, ADMIN, /\/admin/);
    const dialog = await openDialog(page, "/ar/admin/super-agents", t("ar", "adminSuperAgents.addButtonLabel"));

    const password = dialog.locator("input[type=password]");
    await expect(password).toHaveAttribute("placeholder", t("ar", "formErrors.passwordPlaceholder", { min: PASSWORD_MIN_LENGTH }));
    await dialog.locator("input").first().fill("Probe Super Agent");
    await dialog.locator("input[type=email]").fill("probe-new-super-agent@example.com");
    await password.fill(WEAK_PASSWORD);
    await dialog.getByRole("button", { name: t("ar", "adminSuperAgents.createButtonLabel") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("ar"));
    expect(message).not.toMatch(/[A-Za-z]{4,}/);
  });

  /* ── Other roles reach the same code path ──────────────────────────────── */

  test("super-agent: Add Agent applies the shared policy", async ({ page }) => {
    await login(page, SUPER_AGENT, /\/super-agent/);
    const dialog = await openDialog(page, "/en/super-agent/agents", t("en", "superAgentAgents.addAgent"));

    await expect(dialog.locator("#create-agent-password-hint")).toHaveText(
      t("en", "formErrors.passwordHint", { min: PASSWORD_MIN_LENGTH }),
    );
    await dialog.locator(`input[placeholder="${t("en", "superAgentAgents.formPlaceholderAgentFullName")}"]`).fill("Probe Agent");
    await dialog.locator(`input[placeholder="${t("en", "superAgentAgents.formPlaceholderEmail")}"]`).fill("probe-sa-agent@example.com");
    await dialog.locator("input[type=password]").fill(WEAK_PASSWORD);
    await dialog.getByRole("button", { name: t("en", "superAgentAgents.buttonCreateAgent") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("en"));
    expectNoRawServerText(message);
  });

  test("agent: employer onboarding applies the shared policy", async ({ page }) => {
    await login(page, AGENT, /\/agent/);
    const dialog = await openDialog(page, "/en/agent/employers", t("en", "agentEmployers.onboardEmployerButton"));

    await expect(dialog.locator("#password-hint")).toHaveText(
      t("en", "formErrors.passwordHint", { min: PASSWORD_MIN_LENGTH }),
    );
    await fillById(dialog, {
      name: "Probe Contact",
      email: "probe-agent-onboard@example.com",
      password: WEAK_PASSWORD,
      companyName: "Probe Co",
    });
    await dialog.getByRole("button", { name: t("en", "common.create") }).click();

    const message = await bannerText(dialog);
    expect(message).toBe(expectedWeakPasswordMessage("en"));
    expectNoRawServerText(message);
  });
});
