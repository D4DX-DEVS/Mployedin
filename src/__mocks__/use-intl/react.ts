/* Global mock for use-intl/react in Jest tests */
const useTranslations = () => {
  const t = (key: string) => key;
  t.rich = (key: string) => key;
  t.raw = (key: string) => key;
  t.has = () => true;
  return t;
};
const useLocale = () => "en";
const useMessages = () => ({});
const useNow = () => new Date();
const useTimeZone = () => "UTC";
const IntlProvider = ({ children }: { children: React.ReactNode }) => children;
const useExtracted = () => ({});
export { useTranslations, useLocale, useMessages, useNow, useTimeZone, IntlProvider, useExtracted };
