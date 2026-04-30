import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Only load Serwist for production builds — its webpack plugin
// conflicts with Turbopack used in development.
let withSerwist: (config: NextConfig) => NextConfig;
if (process.env.NODE_ENV === "production") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withSerwistInit = require("@serwist/next").default;
  withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
  });
} else {
  withSerwist = (config) => config;
}

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  // Vercel's nft (node-file-trace) can miss files whose paths contain special
  // characters like "[" or "(" (dynamic segments / route groups). Explicitly
  // include every App Router manifest so the serverless function bundle is complete.
  outputFileTracingIncludes: {
    "/**": [
      "./.next/server/app/**/*-manifest.js",
      "./.next/server/app/**/*.json",
    ],
  },

  experimental: {
    // Tree-shake barrel exports from heavy icon/UI packages — cuts initial JS by ~30-40 %
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
      "@radix-ui/react-icons",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "@radix-ui/react-avatar",
      "@radix-ui/react-accordion",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-label",
      "@radix-ui/react-progress",
      "@radix-ui/react-separator",
      "@radix-ui/react-switch",
      "@radix-ui/react-toast",
      "@tanstack/react-table",
      "cmdk",
      "zod",
    ],
  },

  // Stabilise file-watching on OneDrive / cloud-synced folders
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 3000,           // fall back to polling (3 s — reduces HMR noise on OneDrive)
        aggregateTimeout: 600, // batch changes within 600 ms
        ignored: /node_modules|\.next|\.git|\.tmp$|~\$/,
      };
    }
    return config;
  },
  serverExternalPackages: ["mongoose", "bcryptjs", "pdf-parse", "mammoth", "jsdom", "isomorphic-dompurify", "dompurify"],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      // DigitalOcean Spaces CDN
      { protocol: "https", hostname: "*.digitaloceanspaces.com" },
    ],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Restrict form submissions + framing; allow inline scripts/styles
            // required by Next.js hydration and Tailwind.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://res.cloudinary.com https://lh3.googleusercontent.com https://media.licdn.com https://*.digitaloceanspaces.com",
              "connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com https://*.pusher.com wss://*.pusher.com",
              "worker-src 'self'",
              "frame-src https://www.google.com https://www.youtube.com",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      // Static assets — long-lived immutable cache (production only)
      ...(isProd
        ? [
            {
              source: "/_next/static/(.*)",
              headers: [
                { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
              ],
            },
            {
              source: "/public/(.*)",
              headers: [
                { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
              ],
            },
            {
              // Service worker must never be cached by the browser
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
                { key: "Content-Type", value: "application/javascript; charset=utf-8" },
              ],
            },
          ]
        : []),
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
