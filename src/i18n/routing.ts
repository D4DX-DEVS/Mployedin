import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  // NEXT_LOCALE is a preference cookie. The proxy (src/proxy.ts) builds its own
  // middleware and decides per request whether it may be read; nothing here
  // should create it.
  localeCookie: false,
});
