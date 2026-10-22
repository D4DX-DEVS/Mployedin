import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      ".next/**",
      ".next-e2e/**",
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
    },
    rules: {
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
    // Firebase must start only on a "Continue with Google" click (PECR): a stray
    // import creates its IndexedDB databases and contacts Google on page load.
    // Only src/lib/firebase/** may import it; everything else goes through
    // getGoogleIdToken() in src/lib/firebase/googleSignIn.ts, which loads it
    // lazily. Tests are exempt (they mock the SDK). Regexes, not gitignore-style
    // groups: "firebase/*" would also match our own @/lib/firebase/admin.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/firebase/**", "src/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^firebase(/.*)?$",
              message:
                "Do not import the Firebase SDK here: it must load only on a Google-button click. Use getGoogleIdToken() from '@/lib/firebase/googleSignIn' (src/lib/firebase/googleSignIn.ts).",
            },
            {
              regex: "(^|/)firebase/client$",
              message:
                "Do not import the Firebase client here: it pulls the SDK in. Use getGoogleIdToken() from '@/lib/firebase/googleSignIn' (src/lib/firebase/googleSignIn.ts).",
            },
          ],
        },
      ],
      // no-restricted-imports does not look at import("...") or require("...").
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/^firebase(\\/.*)?$/]",
          message:
            "Do not import the Firebase SDK here: it must load only on a Google-button click. Use getGoogleIdToken() from '@/lib/firebase/googleSignIn' (src/lib/firebase/googleSignIn.ts).",
        },
        {
          selector: "ImportExpression[source.value=/(^|\\/)firebase\\/client$/]",
          message:
            "Do not import the Firebase client here: it pulls the SDK in. Use getGoogleIdToken() from '@/lib/firebase/googleSignIn' (src/lib/firebase/googleSignIn.ts).",
        },
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/^firebase(\\/.*)?$|(^|\\/)firebase\\/client$/]",
          message:
            "Do not require the Firebase SDK or client here. Use getGoogleIdToken() from '@/lib/firebase/googleSignIn' (src/lib/firebase/googleSignIn.ts).",
        },
      ],
    },
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
