import { accountFieldsError } from "@/lib/errors/account-fields";

// Echo the key so each branch is asserted by name, independent of copy.
const t = (key: string) => key;
const opts = { t, locale: "en" };

describe("accountFieldsError", () => {
  it("asks for the name first", () => {
    expect(accountFieldsError({ name: "  ", email: "a@b.co", password: "x" }, opts)).toBe("nameRequired");
  });

  it("asks for an email, then for a well-formed one", () => {
    expect(accountFieldsError({ name: "Asha", email: "" }, opts)).toBe("emailRequired");
    expect(accountFieldsError({ name: "Asha", email: "asha@example" }, opts)).toBe("emailInvalid");
  });

  it("applies the shared password policy when a password is part of the step", () => {
    expect(accountFieldsError({ name: "Asha", email: "asha@example.com", password: "" }, opts)).toBe("passwordRequired");
    expect(accountFieldsError({ name: "Asha", email: "asha@example.com", password: "78965412" }, opts)).not.toBeNull();
    expect(accountFieldsError({ name: "Asha", email: "asha@example.com", password: "Str0ng!Passw0rd#" }, opts)).toBeNull();
  });

  it("skips the password on edit forms", () => {
    expect(accountFieldsError({ name: "Asha", email: "asha@example.com" }, opts)).toBeNull();
  });
});
