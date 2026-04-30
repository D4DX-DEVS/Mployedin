/* Global mock for next-intl in Jest tests */
import * as fs from "fs";
import * as path from "path";

// Load actual English translations
let messages: Record<string, unknown> = {};
try {
  const msgPath = path.resolve(__dirname, "../../messages/en.json");
  messages = JSON.parse(fs.readFileSync(msgPath, "utf-8"));
} catch {
  // fallback: empty messages
}

function resolve(obj: unknown, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Fallback: convert camelCase key to readable text.
 */
function keyToReadable(key: string): string {
  const segment = key.includes(".") ? key.split(".").pop()! : key;
  const spaced = segment.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const useTranslations = (namespace?: string) => {
  const nsObj = namespace ? resolve(messages, namespace) : messages;
  const t = (key: string, params?: Record<string, unknown>) => {
    // Try resolving from actual messages
    let text: string | undefined;
    if (nsObj && typeof nsObj === "object") {
      text = resolve(nsObj, key);
    }
    if (!text) {
      // Try full path namespace.key
      text = resolve(messages, namespace ? `${namespace}.${key}` : key);
    }
    if (!text) {
      text = keyToReadable(key);
    }
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text!.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };
  t.rich = (key: string) => {
    const text = nsObj && typeof nsObj === "object" ? resolve(nsObj, key) : undefined;
    return text || keyToReadable(key);
  };
  t.raw = (key: string) => key;
  t.has = () => true;
  return t;
};

const useLocale = () => "en";
const useMessages = () => ({});
const useNow = () => new Date();
const useTimeZone = () => "UTC";
const useFormatter = () => ({
  number: (v: number) => String(v),
  dateTime: (v: Date) => v.toISOString(),
  relativeTime: () => "now",
});

const NextIntlClientProvider = ({ children }: { children: React.ReactNode }) => children;
const IntlProvider = ({ children }: { children: React.ReactNode }) => children;

export {
  useTranslations,
  useLocale,
  useMessages,
  useNow,
  useTimeZone,
  useFormatter,
  NextIntlClientProvider,
  IntlProvider,
};
