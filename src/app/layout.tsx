import type { Metadata, Viewport } from "next";
import type React from "react";
import { Manrope, Noto_Sans_Arabic, Noto_Sans_Malayalam } from "next/font/google";
import { headers } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/shared/ServiceWorkerRegistration";
import { ResponsiveTables } from "@/components/shared/ResponsiveTables";
import { CspNonceProvider } from "@/components/shared/CspNonceProvider";
import "@/app/globals.css";
import { getStorageFallbackScript } from "@/lib/storage-fallback";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: true,
});
const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-arabic",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false, // loaded on-demand only for Arabic locale
});
// Variable font: one file per subset instead of four static weights.
const notoMalayalam = Noto_Sans_Malayalam({
  subsets: ["malayalam"],
  variable: "--font-noto-malayalam",
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "MPLOYEDIN",
  description: "AI-Powered International Recruitment Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MPLOYEDIN",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "color-scheme": "light dark",
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the nonce that middleware placed on the request headers.
  // Next.js App Router automatically attaches this nonce to the inline
  // scripts it generates (hydration, RSC payload, etc.), satisfying the
  // nonce-based Content-Security-Policy set by the middleware.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const locale = (await headers()).get("x-locale") ?? "en";
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* React only exempts *async* scripts from the "script tag inside
            component" client-render warning (it treats them as hoistable
            resources). Browsers ignore `async` on inline scripts — they still
            execute immediately during HTML parsing, so the no-FOUC theme init
            behavior is unchanged. suppressHydrationWarning is required because
            browsers blank out the nonce content attribute after load, which
            otherwise produces a server/client hydration mismatch. */}
        <script
          id="storage-fallback-init"
          async
          suppressHydrationWarning
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: getStorageFallbackScript() }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${manrope.variable} ${notoArabic.variable} ${notoMalayalam.variable} font-sans antialiased`}
        {...(nonce ? { "data-nonce": nonce } : {})}
      >
        {/* Publishes the nonce to runtime style injectors (react-style-singleton,
            which Radix uses for dialog/dropdown scroll-lock) before anything can
            open and inject a <style>. Setting window.__webpack_nonce__ from the
            inline script above did not work: webpack rewrites that identifier to
            __webpack_require__.nc at build time, so the value never reached
            get-nonce and prod logged a style-src-elem violation on every menu. */}
        <CspNonceProvider nonce={nonce} />
        {children}
        <ResponsiveTables />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
