import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50: "#f2f7fc",
          100: "#d9e8f7",
          200: "#b5d0ec",
          300: "#8cb3df",
          400: "#618fd0",
          500: "#3f67bb",
          600: "#284595",
          700: "#21387a",
          800: "#1e2f6c",
          900: "#1b285b",
          950: "#131c3f",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        brand: {
          blue: "hsl(var(--brand-blue))",
          "blue-hover": "hsl(var(--brand-blue-hover))",
          "blue-light": "hsl(var(--brand-blue-light))",
          "blue-pale": "hsl(var(--brand-blue-pale))",
          "blue-dark": "hsl(var(--brand-blue-dark))",
          cyan: "hsl(var(--brand-cyan))",
        },
        sidebar: {
          bg: "hsl(var(--sidebar-bg))",
          fg: "hsl(var(--sidebar-fg))",
          "active-bg": "hsl(var(--sidebar-active-bg))",
          "active-fg": "hsl(var(--sidebar-active-fg))",
          "hover-bg": "hsl(var(--sidebar-hover-bg))",
          border: "hsl(var(--sidebar-border))",
          icon: "hsl(var(--sidebar-icon))",
        },
        status: {
          applied: "hsl(var(--status-applied))",
          "applied-bg": "hsl(var(--status-applied-bg))",
          shortlisted: "hsl(var(--status-shortlisted))",
          "shortlisted-bg": "hsl(var(--status-shortlisted-bg))",
          interview: "hsl(var(--status-interview))",
          "interview-bg": "hsl(var(--status-interview-bg))",
          selected: "hsl(var(--status-selected))",
          "selected-bg": "hsl(var(--status-selected-bg))",
          rejected: "hsl(var(--status-rejected))",
          "rejected-bg": "hsl(var(--status-rejected-bg))",
          pending: "hsl(var(--status-pending))",
          "pending-bg": "hsl(var(--status-pending-bg))",
        },
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        ai: {
          from: "hsl(var(--ai-gradient-from))",
          to: "hsl(var(--ai-gradient-to))",
          bubble: "hsl(var(--ai-bubble-bg))",
          sparkle: "hsl(var(--ai-sparkle))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Manrope", "system-ui", "sans-serif"],
        arabic: ["var(--font-arabic)", "Noto Sans Arabic", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      width: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed)",
      },
      spacing: {
        sidebar: "var(--sidebar-width)",
        "sidebar-collapsed": "var(--sidebar-collapsed)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200px 0" },
          to: { backgroundPosition: "calc(200px + 100%) 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "spin-slow": "spin-slow 2s linear infinite",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
      backgroundImage: {
        shimmer:
          "linear-gradient(90deg, hsl(var(--muted)) 0%, hsl(var(--surface-2)) 50%, hsl(var(--muted)) 100%)",
      },
      backgroundSize: {
        shimmer: "200px 100%",
      },
      boxShadow: {
        card: "0 2px 10px rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.02)",
        "card-hover": "0 12px 24px -4px rgb(0 0 0 / 0.08), 0 4px 8px -2px rgb(0 0 0 / 0.04)",
        sidebar: "4px 0 24px rgb(0 0 0 / 0.04)",
        "ai-glow": "0 0 30px hsl(var(--brand-blue) / 0.2)",
        soft: "0 4px 20px -2px rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
