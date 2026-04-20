import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic, Noto_Sans_Malayalam } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/shared/ThemeProvider";
import "@/app/globals.css";
import { getThemeInitializationScript } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
const notoMalayalam = Noto_Sans_Malayalam({
  subsets: ["malayalam"],
  variable: "--font-noto-malayalam",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "MPLOYEDIN",
  description: "AI-Powered International Recruitment Platform",
  other: {
    "color-scheme": "light dark",
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

  return (
    <html suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${notoArabic.variable} ${notoMalayalam.variable} font-sans antialiased`}
        {...(nonce ? { "data-nonce": nonce } : {})}
      >
        {/* Raw <script> is correct here – this is a Server Component so the
            script is emitted in the initial HTML and executes immediately.
            suppressHydrationWarning prevents the nonce-mismatch warning
            (browsers clear the nonce attribute after use for security). */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getThemeInitializationScript() }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
