/**
 * @jest-environment jsdom
 *
 * The real helper on top of the real Firebase client, with only the Firebase
 * libraries and IndexedDB mocked. Safari can block the Google window when the
 * handshake that now starts at the click eats the short user-activation window.
 * The handshake is done by then, so the helper keeps the in-memory Auth
 * instance and the next click opens the window at once, on that same instance.
 * A second block in a row is the browser's pop-up blocker: the original error
 * comes back (callers show "allow pop-ups") and Firebase is disposed.
 */

// A module, not a global script, so its top-level names do not clash with other test files' under tsc.
export {};

const initializeApp = jest.fn();
const getApps = jest.fn();
const deleteApp = jest.fn();
const initializeAuth = jest.fn();
const signInWithPopup = jest.fn();
const deleteIndexedDb = jest.fn();
const signOut = jest.fn();

class FakeGoogleAuthProvider {}

jest.mock("firebase/app", () => ({
  initializeApp: (...args: unknown[]) => initializeApp(...args),
  getApps: (...args: unknown[]) => getApps(...args),
  deleteApp: (...args: unknown[]) => deleteApp(...args),
}));
jest.mock("firebase/auth", () => ({
  initializeAuth: (...args: unknown[]) => initializeAuth(...args),
  signInWithPopup: (...args: unknown[]) => signInWithPopup(...args),
  inMemoryPersistence: { type: "NONE" },
  browserPopupRedirectResolver: { resolver: true },
  GoogleAuthProvider: FakeGoogleAuthProvider,
}));
jest.mock("@/lib/browser/indexedDb", () => ({
  deleteIndexedDb: (...args: unknown[]) => deleteIndexedDb(...args),
}));

type HelperModule = typeof import("@/lib/firebase/googleSignIn");

const fakeApp = { name: "[DEFAULT]" };
const blocked = () => Object.assign(new Error("blocked"), { code: "auth/popup-blocked" });

/** A fresh module registry per test: the client keeps its Auth instance at module level. */
function loadHelper(): HelperModule {
  jest.resetModules();
  return require("@/lib/firebase/googleSignIn");
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  // Let a "page is going away" sweep left by an earlier test finish before the mocks are cleared.
  window.dispatchEvent(new Event("pagehide"));
  await flush();
  jest.clearAllMocks();
  getApps.mockReturnValue([]);
  initializeApp.mockReturnValue(fakeApp);
  deleteApp.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  initializeAuth.mockImplementation(() => ({ signOut }));
  deleteIndexedDb.mockResolvedValue(undefined);
  signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => "id-token" } });
});

afterEach(async () => {
  window.dispatchEvent(new Event("pagehide"));
  await flush();
});

describe("a blocked Google window, then a retry", () => {
  it("keeps Firebase alive after the block: the app is not deleted and no database is removed", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup.mockRejectedValueOnce(blocked());

    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(deleteApp).not.toHaveBeenCalled();
    expect(deleteIndexedDb).not.toHaveBeenCalled();
  });

  it("runs the retry on the very same Auth instance (initializeAuth once), then disposes", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup.mockRejectedValueOnce(blocked());
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

    await expect(getGoogleIdToken()).resolves.toBe("id-token");

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    const [firstAuth] = signInWithPopup.mock.calls[0];
    const [secondAuth] = signInWithPopup.mock.calls[1];
    expect(secondAuth).toBe(firstAuth);
    expect(deleteApp).toHaveBeenCalledTimes(1);
    expect(deleteApp).toHaveBeenCalledWith(fakeApp);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });

  it("still disposes straight away for every other outcome", async () => {
    const { getGoogleIdToken } = loadHelper();
    const closed = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
    signInWithPopup.mockRejectedValueOnce(closed);

    await expect(getGoogleIdToken()).rejects.toBe(closed);

    expect(deleteApp).toHaveBeenCalledTimes(1);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
  });

  it("creates a new Auth after a success that followed a block", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup.mockRejectedValueOnce(blocked());
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
    await getGoogleIdToken();

    await getGoogleIdToken();

    expect(initializeAuth).toHaveBeenCalledTimes(2);
  });

  // The retry runs on the kept instance, after the handshake finished. Blocked
  // anyway = the browser blocks pop-ups: stop asking to "press again".
  it("a second block in a row is a real blocker: the original error comes back and Firebase is disposed", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    const second = blocked();
    signInWithPopup.mockRejectedValueOnce(blocked()).mockRejectedValueOnce(second);
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

    const thrown = await getGoogleIdToken().catch((error: unknown) => error);

    expect(thrown).toBe(second);
    expect(thrown).not.toBeInstanceOf(GooglePopupBlockedError);
    expect((thrown as { code?: string }).code).toBe("auth/popup-blocked");
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(deleteApp).toHaveBeenCalledTimes(1);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
  });

  it("after a real blocker the next click starts on a new instance and is treated as a first block", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup
      .mockRejectedValueOnce(blocked())
      .mockRejectedValueOnce(blocked())
      .mockRejectedValueOnce(blocked());
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
    await expect(getGoogleIdToken()).rejects.not.toBeInstanceOf(GooglePopupBlockedError);
    deleteApp.mockClear();

    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

    expect(initializeAuth).toHaveBeenCalledTimes(2);
    expect(deleteApp).not.toHaveBeenCalled();
  });

  it("a page restored from the back/forward cache starts clean: its first block is a first block", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup.mockRejectedValueOnce(blocked()).mockRejectedValueOnce(blocked());
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
    window.dispatchEvent(new Event("pagehide"));
    await flush();

    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
  });

  it("a quick second click waits for the first success's clean-up and gets a fresh instance, not the dying one", async () => {
    const { getGoogleIdToken } = loadHelper();
    const state = require("@/lib/firebase/state") as typeof import("@/lib/firebase/state");
    let finishSignOut: () => void = () => {};
    signOut.mockImplementationOnce(() => new Promise<void>((resolve) => (finishSignOut = resolve)));
    const aliveDuringSecondSignIn: boolean[] = [];
    await expect(getGoogleIdToken()).resolves.toBe("id-token");
    signInWithPopup.mockImplementationOnce(async () => {
      aliveDuringSecondSignIn.push(state.isFirebaseActive());
      return { user: { getIdToken: async () => "second-token" } };
    });

    // The first clean-up is stuck signing out; the visitor clicks again.
    const second = getGoogleIdToken();
    await flush();
    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(initializeAuth).toHaveBeenCalledTimes(1);
    expect(deleteApp).not.toHaveBeenCalled();

    finishSignOut();
    await expect(second).resolves.toBe("second-token");

    expect(initializeAuth).toHaveBeenCalledTimes(2);
    expect(signInWithPopup.mock.calls[1][0]).not.toBe(signInWithPopup.mock.calls[0][0]);
    // The first clean-up finished before the second sign-in began, so it could not
    // delete the new app or clear the flag the page-load sweep reads.
    expect(aliveDuringSecondSignIn).toEqual([true]);
    await flush();
    expect(deleteApp).toHaveBeenCalledTimes(2);
    expect(state.isFirebaseActive()).toBe(false);
  });

  it("disposes the kept instance when the page goes away without another click", async () => {
    const { getGoogleIdToken, GooglePopupBlockedError } = loadHelper();
    signInWithPopup.mockRejectedValueOnce(blocked());
    await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
    expect(deleteApp).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("pagehide"));
    await flush();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deleteApp).toHaveBeenCalledWith(fakeApp);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });
});
