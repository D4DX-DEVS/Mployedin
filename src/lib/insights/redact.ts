/**
 * PII redaction + secret stripping for everything the insights layer returns.
 *
 * Two independent passes, applied recursively to every output document:
 *   1. Secrets are ALWAYS removed (key-name match), whatever the caller's scopes.
 *      The entity registry already projects an allow-list, so this is a backstop
 *      for free-form objects such as AuditLog.meta / changes.
 *   2. Without `pii:read`, personal fields are masked (key-name match) and any
 *      string that looks like an e-mail address is masked wherever it appears.
 */

export type PiiKind = "email" | "phone" | "name" | "ip" | "text";

/** Keys that are never returned. */
const SECRET_KEY_RE =
  /(password|passwd|secret|token|hash|otp|twofactor|recoverycode|apikey|api_key|privatekey|iban|passport|nationalid|bankaccount|visanumber|smtpapppassword|cookie|authorization)/i;

/** Personal fields, keyed by (case-insensitive) property name. */
const PII_KEYS: Record<string, PiiKind> = {
  email: "email",
  companyemail: "email",
  contactemail: "email",
  pendingemail: "email",
  billingemail: "email",
  phone: "phone",
  contactphone: "phone",
  billingphone: "phone",
  mobile: "phone",
  whatsapp: "phone",
  name: "name",
  fullname: "name",
  contactperson: "name",
  billingcontactperson: "name",
  sendername: "name",
  actorname: "name",
  username: "name",
  ipaddress: "ip",
  ip: "ip",
  useragent: "text",
  address: "text",
  permanentaddress: "text",
  billingaddress: "text",
  pincode: "text",
  postalcode: "text",
  dateofbirth: "text",
  gender: "text",
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "[redacted]";
  return `${value[0]}***${value.slice(at)}`;
}

export function maskValue(kind: PiiKind, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;
  const str = String(value);
  switch (kind) {
    case "email":
      return maskEmail(str);
    case "phone": {
      const digits = str.replace(/\D/g, "");
      return digits.length >= 2 ? `***${digits.slice(-2)}` : "[redacted]";
    }
    case "name": {
      const initials = str
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => `${part[0]!.toUpperCase()}.`)
        .join(" ");
      return initials || "[redacted]";
    }
    case "ip": {
      if (str.includes(".")) return str.split(".").slice(0, 2).concat(["x", "x"]).join(".");
      if (str.includes(":")) return `${str.split(":").slice(0, 2).join(":")}:…`;
      return "[redacted]";
    }
    default:
      return "[redacted]";
  }
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

export function piiKindForKey(key: string): PiiKind | undefined {
  return PII_KEYS[key.toLowerCase()];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Turn ObjectIds / Dates / Buffers into JSON-friendly primitives. */
function normalizeLeaf(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const v = value as { _bsontype?: string; toHexString?: () => string; toString: () => string };
    if (v._bsontype === "ObjectId" || v._bsontype === "ObjectID") {
      return typeof v.toHexString === "function" ? v.toHexString() : v.toString();
    }
    if (v._bsontype === "Decimal128") return Number(v.toString());
  }
  return value;
}

/**
 * Recursively sanitize an output value. `pii=false` masks personal data.
 * Depth-limited so a pathological `meta` blob cannot blow the stack.
 */
export function sanitizeOutput(value: unknown, pii: boolean, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  const leaf = normalizeLeaf(value);
  if (leaf !== value) return leaf;

  if (Array.isArray(value)) return value.map((item) => sanitizeOutput(item, pii, depth + 1));

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (isSecretKey(key)) continue;
      const kind = pii ? undefined : piiKindForKey(key);
      if (kind && (typeof raw === "string" || typeof raw === "number")) {
        out[key] = maskValue(kind, raw);
      } else if (kind && raw instanceof Date) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeOutput(raw, pii, depth + 1);
      }
    }
    return out;
  }

  if (!pii && typeof value === "string" && value.includes("@")) {
    return value.replace(EMAIL_RE, (m) => maskEmail(m));
  }
  return value;
}
