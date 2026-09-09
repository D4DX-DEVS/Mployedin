/**
 * @jest-environment node
 *
 * formErrorFromResponse turns a failed API response into copy an admin can
 * act on — in their language, naming the rejected fields by their on-screen
 * labels — instead of echoing the server's English zod text or a fixed
 * "We couldn't save your changes" sentence. Uses the real en.json copy so the
 * assertions track what ships.
 */
import fs from "node:fs";
import path from "node:path";
import IntlMessageFormat from "intl-messageformat";
import { formErrorFromResponse, isFormError } from "@/lib/errors/form-error";
import { validatePasswordForForm } from "@/lib/security/passwordPolicy";

const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", "en.json"), "utf8")).formErrors as Record<string, string>;
const t = (key: string, vars?: Record<string, string | number>) => {
  if (!(key in en)) throw new Error(`missing formErrors.${key}`);
  return String(new IntlMessageFormat(en[key], "en").format(vars));
};

const response = (status: number, body?: unknown) =>
  new Response(body === undefined ? "not json" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fields = [
  { name: "name", label: "Contact Name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
];

describe("formErrorFromResponse", () => {
  it("returns a FormError so CrudModal will show it verbatim", async () => {
    const err = await formErrorFromResponse(response(500, { error: "boom" }), { t, locale: "en" });
    expect(isFormError(err)).toBe(true);
  });

  it("409 uses the caller's specific copy when given", async () => {
    const err = await formErrorFromResponse(response(409, { error: "Email already in use" }), { t, locale: "en", conflict: t("emailInUse") });
    expect(err.message).toBe("This email is already used by another account. Use a different email.");
  });

  it("409 falls back to the generic conflict copy", async () => {
    const err = await formErrorFromResponse(response(409, { error: "Duplicate" }), { t, locale: "en" });
    expect(err.message).toBe(en.conflict);
  });

  it("400 with zod details names the rejected fields by their labels", async () => {
    const body = { error: "Validation failed", details: [
      { path: "phone", message: "String must contain at most 20 character(s)" },
      { path: "email", message: "Invalid email" },
      { path: "phone", message: "duplicate issue for same field" },
    ] };
    const err = await formErrorFromResponse(response(400, body), { t, locale: "en", fieldLabels: fields });
    expect(err.message).toBe("Check these fields and try again: Phone and Email.");
  });

  it("accepts a plain label record and humanises unknown paths", async () => {
    const body = { error: "Validation failed", details: [{ path: "currencyCode", message: "x" }, { path: "address.city", message: "y" }, { path: "name", message: "z" }] };
    const err = await formErrorFromResponse(response(422, body), { t, locale: "en", fieldLabels: { name: "Full Name" } });
    expect(err.message).toBe("Check these fields and try again: Currency code, Address, and Full Name.");
  });

  it("joins field names in the caller's locale", async () => {
    const body = { error: "Validation failed", details: [{ path: "name", message: "x" }, { path: "email", message: "y" }] };
    const err = await formErrorFromResponse(response(400, body), { t, locale: "ar", fieldLabels: { name: "الاسم", email: "البريد" } });
    expect(err.message).toContain("الاسم والبريد");
  });

  it("400 without details uses the generic invalid copy", async () => {
    const err = await formErrorFromResponse(response(400, { error: "Invalid JSON body" }), { t, locale: "en" });
    expect(err.message).toBe(en.invalid);
  });

  it.each([[401, "permission"], [403, "permission"], [404, "notFound"], [429, "rateLimit"], [500, "fallback"], [502, "fallback"]])(
    "%s → formErrors.%s",
    async (status, key) => {
      const err = await formErrorFromResponse(response(status as number, { error: "server text" }), { t, locale: "en" });
      expect(err.message).toBe(en[key as string]);
    },
  );

  it("never surfaces raw server text", async () => {
    for (const status of [400, 401, 404, 409, 429, 500]) {
      const err = await formErrorFromResponse(response(status, { error: "TypeError: secret internal detail" }), { t, locale: "en" });
      expect(err.message).not.toContain("secret internal detail");
    }
  });

  it("copes with a non-JSON body", async () => {
    const err = await formErrorFromResponse(response(409), { t, locale: "en" });
    expect(err.message).toBe(en.conflict);
  });
});

/**
 * Thirteen forms across four roles now route their failures through these two
 * helpers, and only some of them are covered by the browser spec. next-intl
 * throws on an unknown key, so a key that exists in en.json but not ar.json
 * takes the whole page down for Arabic users rather than degrading.
 *
 * Rather than listing keys by hand, drive every branch of both helpers with a
 * translator that throws exactly the way next-intl does, once per locale.
 */
describe("every message these helpers can emit exists and compiles in both locales", () => {
  const strictTranslator = (locale: string) => {
    const namespace = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
    ).formErrors as Record<string, string> | undefined;
    if (!namespace) throw new Error(`messages/${locale}.json has no formErrors namespace`);
    return (key: string, vars?: Record<string, string | number>) => {
      if (!(key in namespace)) throw new Error(`missing formErrors.${key} in ${locale}`);
      return String(new IntlMessageFormat(namespace[key], locale).format(vars));
    };
  };

  it.each(["en", "ar"])("%s: every API status maps to real copy", async (locale) => {
    const translate = strictTranslator(locale);
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500, 502, 503]) {
      const withDetails = await formErrorFromResponse(
        new Response(JSON.stringify({ error: "x", details: [{ path: "phone", message: "y" }] }), { status }),
        { t: translate, locale, fieldLabels: { phone: "Phone" } },
      );
      const bare = await formErrorFromResponse(new Response(JSON.stringify({ error: "x" }), { status }), {
        t: translate,
        locale,
      });
      for (const message of [withDetails.message, bare.message]) {
        expect(message.length).toBeGreaterThan(0);
        expect(message).not.toContain("{");
      }
    }
    // The conflict copy callers pass in for a duplicate email.
    expect(translate("emailInUse").length).toBeGreaterThan(0);
  });

  it.each(["en", "ar"])("%s: every password outcome maps to real copy", (locale) => {
    const translate = strictTranslator(locale);
    const passwords = [
      "",            // required
      "   ",         // required (whitespace only)
      "78965412",    // short + no lower/upper/symbol
      "alllowercase123!", // no uppercase
      "ALLUPPERCASE123!", // no lowercase
      "NoDigitsHere!!!!",  // no number
      "NoSymbolsHere123",  // no symbol
      "Password123!",      // common
      "a".repeat(200) + "A1!", // too long
      "Test@Employer2026!",    // passes
    ];
    for (const password of passwords) {
      const message = validatePasswordForForm(password, { locale, t: translate });
      if (password.trim() === "Test@Employer2026!") {
        expect(message).toBeNull();
      } else {
        expect(message).toBeTruthy();
        expect(message).not.toContain("{");
      }
    }
    // Shown next to the field before anything is submitted.
    for (const key of ["passwordHint", "passwordPlaceholder"]) {
      expect(translate(key, { min: 12 })).not.toContain("{");
    }
  });

  it("CrudModal's own chrome is translated in both locales", () => {
    for (const locale of ["en", "ar"]) {
      const common = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ).common as Record<string, string>;
      for (const key of ["cancel", "create", "update", "saving"]) {
        // Message names the locale+key so a failure reads without a debugger.
        expect(`${locale}.common.${key}: ${typeof common[key]}`).toBe(`${locale}.common.${key}: string`);
        expect(common[key].length).toBeGreaterThan(0);
      }
    }
  });
});
