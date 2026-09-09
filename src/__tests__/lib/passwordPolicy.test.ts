/**
 * @jest-environment node
 *
 * The admin "Add employer" form used to reject a weak password with a message
 * that never reached the screen. These tests pin the rule checker and the
 * human-readable sentence it produces so an admin sees *which* rule failed.
 */
import {
  PASSWORD_MIN_LENGTH,
  getPasswordIssues,
  formatPasswordIssues,
  strongPasswordSchema,
} from "@/lib/security/passwordPolicy";

const t = (key: string, vars?: Record<string, string | number>) => {
  const table: Record<string, string> = {
    passwordTooShort: "Password must be at least {min} characters long. This one has {count}.",
    passwordMissing: "Password must include {rules}.",
    passwordTooCommon: "That password is too common. Choose a different one.",
    passwordRuleUppercase: "an uppercase letter",
    passwordRuleLowercase: "a lowercase letter",
    passwordRuleNumber: "a number",
    passwordRuleSymbol: "a symbol such as ! @ #",
  };
  let out = table[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) out = out.replace(`{${k}}`, String(v));
  return out;
};

describe("getPasswordIssues", () => {
  it("lists every unmet rule for an all-digit 8 char password", () => {
    expect(getPasswordIssues("78965412")).toEqual(["tooShort", "noLowercase", "noUppercase", "noSymbol"]);
  });

  it("returns nothing for a password that satisfies the policy", () => {
    expect(getPasswordIssues("Test@Employer2026!")).toEqual([]);
  });

  it("flags a common password even when it passes the shape rules", () => {
    expect(getPasswordIssues("Password123!")).toEqual(["common"]);
  });

  it("agrees with the zod schema the API enforces", () => {
    for (const pw of ["78965412", "Test@Employer2026!", "Password123!", "short1A!", "alllowercase123!"]) {
      expect(getPasswordIssues(pw).length === 0).toBe(strongPasswordSchema.safeParse(pw).success);
    }
  });

  it("exposes the minimum length used by the schema", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});

describe("formatPasswordIssues", () => {
  it("spells out length and each missing character class", () => {
    const msg = formatPasswordIssues(getPasswordIssues("78965412"), { password: "78965412", locale: "en", t });
    expect(msg).toBe(
      "Password must be at least 12 characters long. This one has 8. " +
      "Password must include a lowercase letter, an uppercase letter, and a symbol such as ! @ #."
    );
  });

  it("omits the length sentence when only a character class is missing", () => {
    const msg = formatPasswordIssues(getPasswordIssues("alllowercase123!"), { password: "alllowercase123!", locale: "en", t });
    expect(msg).toBe("Password must include an uppercase letter.");
  });

  it("uses the common-password sentence alone", () => {
    const msg = formatPasswordIssues(["common"], { password: "Password123!", locale: "en", t });
    expect(msg).toBe("That password is too common. Choose a different one.");
  });

  it("returns null when there are no issues", () => {
    expect(formatPasswordIssues([], { password: "Test@Employer2026!", locale: "en", t })).toBeNull();
  });
});
