/**
 * @jest-environment jsdom
 *
 * A referral code held in page memory is cleared by sign-out like everything
 * else a session leaves on the device (logoutCleanup runs before every signOut).
 */
const csrfFetch = jest.fn();
jest.mock("@/lib/security/csrf-client", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetch(...args),
}));
jest.mock("@/lib/browser/indexedDb", () => ({ deleteIndexedDb: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/pwa/serviceWorkerCleanup", () => ({ deleteLegacyRuntimeCaches: jest.fn().mockResolvedValue(undefined) }));

import { logoutCleanup } from "@/lib/consent/logoutCleanup";
import { resetSignOutInProgress } from "@/lib/consent/deviceStorage";
import { clearPendingReferral, getPendingReferral, setPendingReferral } from "@/lib/referrals/pendingReferral";

beforeEach(() => {
  resetSignOutInProgress();
  csrfFetch.mockReset().mockResolvedValue({ ok: true });
  clearPendingReferral();
});

it("forgets the referral code held in memory", async () => {
  setPendingReferral("MPL-1A2B3C4D5E6F7A8B");
  expect(getPendingReferral()).toBe("MPL-1A2B3C4D5E6F7A8B");
  await logoutCleanup();
  expect(getPendingReferral()).toBe("");
});

it("clears it in the synchronous part, before any slow step can hold things up", () => {
  setPendingReferral("MPL-1A2B3C4D5E6F7A8B");
  void logoutCleanup();
  expect(getPendingReferral()).toBe("");
});
