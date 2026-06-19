/* Global mock for next-intl/server (server APIs) in Jest tests.
 * Reuses the same message resolution as the next-intl client mock so that
 * server components rendered in tests resolve real strings from messages/en.json. */
import { useTranslations } from "./next-intl";

type GetTranslationsArg = string | { locale?: string; namespace?: string } | undefined;

function namespaceFrom(arg: GetTranslationsArg): string | undefined {
  if (typeof arg === "string") return arg;
  return arg?.namespace;
}

const getTranslations = async (arg?: GetTranslationsArg) =>
  useTranslations(namespaceFrom(arg));

const getLocale = async () => "en";
const getMessages = async () => ({});
const getNow = async () => new Date();
const getTimeZone = async () => "UTC";
const getFormatter = async () => ({
  number: (v: number) => String(v),
  dateTime: (v: Date) => v.toISOString(),
  relativeTime: () => "now",
});

export {
  getTranslations,
  getLocale,
  getMessages,
  getNow,
  getTimeZone,
  getFormatter,
};
