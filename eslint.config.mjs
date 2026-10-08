import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      ".turbo/**",
      ".playwright-mcp/**",
      "playwright-report/**",
      "test-results/**",
      "public/sw.js",
      "public/workbox-*.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      // Accessibility (WCAG 2.2 AA / EN 301 549). Warnings repo-wide so the
      // existing backlog is visible without blocking; new a11y/consent code
      // is held to errors in the override below.
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, "warn"]),
      ),
      // Deprecated upstream (superseded by label-has-associated-control) and
      // flags valid <label><select/></label> nesting.
      "jsx-a11y/label-has-for": "off",
      // TypeScript rules
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // TypeScript already reports undefined names. The base JavaScript rules
      // otherwise duplicate or misclassify type-only and runtime globals.
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off",
      // These expressions intentionally sanitize control characters and accept
      // harmless legacy escapes; TypeScript and unit tests cover the behavior.
      "no-control-regex": "off",
      "no-useless-escape": "warn",
      "no-empty": "warn",
      // Next.js rules
      "@next/next/no-html-link-for-pages": "off",
      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],
    },
  },
  {
    files: [
      "src/components/shared/a11y/**/*.tsx",
      "src/components/shared/consent/**/*.tsx",
      "src/components/shared/CookieConsent.tsx",
      "src/app/[[]locale[]]/(public)/accessibility/**/*.tsx",
    ],
    rules: { ...jsxA11y.flatConfigs.recommended.rules, "jsx-a11y/label-has-for": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "off",
      "no-useless-escape": "warn",
    },
  },
];
