import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  // Use jsdom by default for React component tests;
  // API tests override to "node" via docblock: @jest-environment node
  testEnvironment: "jsdom",
  transformIgnorePatterns: [
    "/node_modules/(?!(next-intl|use-intl|@formatjs|intl-messageformat|next-auth|@auth/core|oauth4webapi|@panva)/)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^next-intl$": "<rootDir>/src/__mocks__/next-intl.ts",
    "^use-intl/react$": "<rootDir>/src/__mocks__/use-intl/react.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/src/test-utils/setup.ts"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.tsx",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/e2e/",
    "/\\.next/",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/types.ts",
    "!src/test-utils/**",
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: -10,
    },
  },
};

const jestConfig = async () => {
  const nextConfig = await createJestConfig(config)();
  return {
    ...nextConfig,
    transformIgnorePatterns: [
      "/node_modules/(?!(next-intl|use-intl|@formatjs|intl-messageformat|next/dist/client|next/dist/shared/lib|next/src/client|next/src/shared/lib|geist)/)",
      "^.+\\.module\\.(css|sass|scss)$",
    ],
  };
};

export default jestConfig;
