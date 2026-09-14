/**
 * @jest-environment node
 */
/**
 * POST-LOGIN-REDIRECT tests: ensure callback URLs are honored and the product
 * decision ("a valid callback always wins") is enforced.
 */
import { GET } from "@/app/api/auth/post-login-redirect/route";

// Mock auth configuration
jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(async () => {
    return {
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: false,
      },
    };
  }),
}));

// Mock getDashboardPath
jest.mock("@/lib/permissions/matrix", () => ({
  getDashboardPath: jest.fn((role: string, locale: string) => {
    const paths: Record<string, string> = {
      job_seeker: "job-seeker",
      employer: "employer",
      admin: "admin",
      agent: "agent",
      super_agent: "super-agent",
    };
    return `/${locale}/${paths[role] ?? "job-seeker"}`;
  }),
}));

describe("GET /api/auth/post-login-redirect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it("redirects to callback when job_seeker, not onboarded, callback present (REGRESSION GUARD)", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: false,
      },
    });

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect?callbackUrl=%2Fen%2Fjobs%2Fabc123", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/en/jobs/abc123");
  });

  it("redirects to onboarding when job_seeker, not onboarded, no callback", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: false,
      },
    });

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/en/onboarding");
  });

  it("redirects to dashboard when job_seeker, onboarded, no callback", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: true,
      },
    });

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/en/job-seeker");
  });

  it("ignores off-origin callback and uses normal destination", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: false,
      },
    });

    const request = new Request(
      "http://localhost:3000/api/auth/post-login-redirect?callbackUrl=https%3A%2F%2Fevil.com%2Fen%2Fjobs%2F1",
      {
        method: "GET",
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    // Should redirect to onboarding, not the evil.com URL
    expect(location).toContain("/en/onboarding");
    expect(location).not.toContain("evil.com");
  });

  it("redirects to login when no session", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce(null);

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/en/login");
  });

  it("uses correct dashboard path for employer role", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "employer",
        locale: "en",
        isOnboarded: true,
      },
    });

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/en/employer");
  });

  it("respects locale from session", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "ar",
        isOnboarded: false,
      },
    });

    const request = new Request("http://localhost:3000/api/auth/post-login-redirect", {
      method: "GET",
    });

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/ar/onboarding");
  });

  it("validates callback is safe for the session locale", async () => {
    const mockAuth = require("@/lib/auth/config").auth;
    mockAuth.mockResolvedValueOnce({
      user: {
        id: "user_1",
        role: "job_seeker",
        locale: "en",
        isOnboarded: false,
      },
    });

    // Callback is for /ar, session locale is /en
    const request = new Request(
      "http://localhost:3000/api/auth/post-login-redirect?callbackUrl=%2Far%2Fjobs%2Fabc123",
      {
        method: "GET",
      }
    );

    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    // Should reject the mismatched locale callback and use default
    expect(location).toContain("/en/onboarding");
  });
});
