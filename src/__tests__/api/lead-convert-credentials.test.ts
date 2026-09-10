/**
 * @jest-environment node
 */
/**
 * Converting a lead has to hand the agent something they can pass on.
 *
 * The route used to generate a random password, hash it, and never reveal it —
 * the employer's only way in was a 24-hour setup link, so an agent sitting with
 * the client could not get them signed in, and nobody was told when that email
 * failed to send. The password now comes back once in the response and goes out
 * in the welcome email, while still being stored only as a bcrypt hash.
 */
import fs from "fs";
import path from "path";
import { generateShareablePassword } from "@/lib/security/tempPassword";
import { getPasswordIssues, PASSWORD_MIN_LENGTH } from "@/lib/security/passwordPolicy";

const source = fs.readFileSync(
  path.join(process.cwd(), "src", "app", "api", "leads", "[id]", "convert", "route.ts"),
  "utf8",
);

describe("shareable temporary password", () => {
  it("always satisfies the platform password policy", () => {
    for (let i = 0; i < 300; i++) {
      const password = generateShareablePassword();
      expect({ password, issues: getPasswordIssues(password) }).toEqual({ password, issues: [] });
    }
  });

  it("is longer than the policy minimum", () => {
    expect(generateShareablePassword().length).toBeGreaterThan(PASSWORD_MIN_LENGTH);
  });

  it("omits the characters people misread when it is dictated", () => {
    for (let i = 0; i < 300; i++) {
      expect(generateShareablePassword()).not.toMatch(/[Il1O0]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateShareablePassword());
    expect(seen.size).toBe(500);
  });

  it("shuffles, so the guaranteed classes are not always in the first four slots", () => {
    // Unshuffled, every password began upper/lower/digit/symbol — a pattern
    // that removes real entropy from the first four characters.
    const shapes = new Set<string>();
    for (let i = 0; i < 300; i++) {
      shapes.add(
        generateShareablePassword()
          .slice(0, 4)
          .replace(/[A-Z]/g, "U")
          .replace(/[a-z]/g, "l")
          .replace(/[0-9]/g, "d")
          .replace(/[^Uld]/g, "s"),
      );
    }
    expect(shapes.size).toBeGreaterThan(1);
  });
});

describe("lead conversion response", () => {
  it("stores only the hash, never the plaintext", () => {
    expect(source).toContain("const passwordHash = await bcrypt.hash(tempPassword, 12);");
    // The User document receives `passwordHash`, and no field holding the
    // plaintext is written alongside it.
    const createBlock = source.slice(source.indexOf("await User.create({"), source.indexOf("// Create Employer profile"));
    expect(createBlock).toContain("passwordHash,");
    expect(createBlock).not.toContain("tempPassword");
  });

  it("returns the credentials to the agent once", () => {
    expect(source).toMatch(/credentials:\s*\{[\s\S]*?email: contactEmail,[\s\S]*?password: tempPassword,/);
  });

  it("reports whether the welcome email actually went out", () => {
    expect(source).toContain('const welcomeEmailSent = welcomeResult.status === "fulfilled";');
    expect(source).toContain("emailSent: welcomeEmailSent,");
  });

  it("emails the same password to the employer", () => {
    expect(source).toContain(
      "EmailTemplates.employerWelcome(contactPerson, contactEmail, tempPassword, setupUrl, convertedByName, loginUrl)",
    );
  });

  it("still issues the setup link, so the password can be replaced", () => {
    expect(source).toContain("passwordResetToken: hashedSetupToken,");
    expect(source).toContain("/en/reset-password?token=");
  });
});
