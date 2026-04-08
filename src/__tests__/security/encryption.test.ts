/**
 * @jest-environment node
 */
import { encrypt, decrypt, hash, encryptIfPlain } from "@/lib/security/encryption";

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
