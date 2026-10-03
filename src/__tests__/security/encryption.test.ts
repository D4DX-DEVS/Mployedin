/**
 * @jest-environment node
 */
import { encrypt, decrypt, hash, encryptIfPlain, decryptIfEncrypted } from "@/lib/security/encryption";

describe("Encryption utilities", () => {
  const testData = [
    "P12345678",                          // passport number
    "AE-1234-5678-9012",                  // national ID
    "IBAN AE12 3456 7890 1234 5678 90",  // IBAN
    "Hello, World!",                      // plain text
    "Special chars: @#$%^&*()",           // special characters
  ];

  describe("encrypt / decrypt roundtrip", () => {
    testData.forEach((plaintext) => {
      it(`should roundtrip: "${plaintext.slice(0, 20)}..."`, () => {
        const ciphertext = encrypt(plaintext);
        expect(ciphertext).not.toBe(plaintext);
        const decrypted = decrypt(ciphertext);
        expect(decrypted).toBe(plaintext);
      });
    });
  });

  it("should produce different ciphertext for the same plaintext (random IV)", () => {
    const pt = "same-plaintext";
    const ct1 = encrypt(pt);
    const ct2 = encrypt(pt);
    expect(ct1).not.toBe(ct2);
    expect(decrypt(ct1)).toBe(pt);
    expect(decrypt(ct2)).toBe(pt);
  });

  it("should throw on tampered ciphertext", () => {
    const ct = encrypt("sensitive-data");
    const tampered = ct.slice(0, -4) + "XXXX";
    expect(() => decrypt(tampered)).toThrow();
  });

  describe("hash", () => {
    it("should produce consistent SHA-256 hash", () => {
      expect(hash("test-value")).toBe(hash("test-value"));
    });
    it("should produce different hash for different values", () => {
      expect(hash("value1")).not.toBe(hash("value2"));
    });
    it("should return 64-character hex string", () => {
      expect(hash("abc")).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("decryptIfEncrypted", () => {
    it("decrypts a value in the ciphertext format", () => {
      expect(decryptIfEncrypted(encrypt("s3cr3t"))).toBe("s3cr3t");
      expect(decryptIfEncrypted(encrypt("x"))).toBe("x");
    });

    it("hands back plaintext unchanged (a model's read hook already decrypted it)", () => {
      for (const plain of [
        "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", // a 40-character AWS secret is base64-shaped but too short to be ciphertext
        "abcdefghijklmnop", // a Gmail app password
        "abcd efgh ijkl mnop",
        "pässwörd!",
        "",
      ]) {
        expect(decryptIfEncrypted(plain)).toBe(plain);
      }
    });

    it("still throws for a value in the ciphertext format that will not decrypt (a changed ENCRYPTION_KEY), so callers can warn", () => {
      const ct = encrypt("s3cr3t");
      const bytes = Buffer.from(ct, "base64");
      bytes[bytes.length - 1] ^= 0xff;
      expect(() => decryptIfEncrypted(bytes.toString("base64"))).toThrow();
    });

    // Known limit, not a behaviour to rely on: the format check is the shape of the string (base64 that decodes to more
    // than IV + tag = 32 bytes), and 44 base64 characters decode to 33 bytes, the shortest value that passes it. A plaintext
    // secret of exactly that shape is taken for ciphertext and throws instead of passing through. Callers already catch
    // the throw and use the stored value (and warn), so the cost is a spurious warning, not a failed send.
    it("known limit: a plaintext of 44 base64 characters is taken for ciphertext and throws", () => {
      const plain = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEYabcd";
      expect(plain).toHaveLength(44);
      expect(Buffer.from(plain, "base64").length).toBe(33);
      expect(() => decryptIfEncrypted(plain)).toThrow();
    });
  });

  describe("encryptIfPlain", () => {
    it("should encrypt plaintext values", () => {
      const result = encryptIfPlain("raw-value");
      expect(result).not.toBe("raw-value");
      expect(decrypt(result)).toBe("raw-value");
    });

    it("should not double-encrypt already encrypted values", () => {
      const ct = encrypt("raw-value");
      const result = encryptIfPlain(ct);
      expect(result).toBe(ct);
    });
  });
});
