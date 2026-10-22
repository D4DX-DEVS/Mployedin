/**
 * @jest-environment jsdom
 *
 * `getGoogleIdToken` is the one place the Google-button click turns into a
 * Firebase ID token. Firebase is loaded by dynamic import inside it, and
 * whatever happens (token, closed popup, blocked popup, network) Firebase is
 * disposed afterwards. `preloadGoogleSignIn` only warms our own chunks.
 */

const getFirebaseAuth = jest.fn();
const disposeFirebase = jest.fn();
const whenFirebaseDisposed = jest.fn();
const signInWithPopup = jest.fn();

jest.mock("@/lib/firebase/client", () => ({
  getFirebaseAuth: (...args: unknown[]) => getFirebaseAuth(...args),
  disposeFirebase: (...args: unknown[]) => disposeFirebase(...args),
  whenFirebaseDisposed: (...args: unknown[]) => whenFirebaseDisposed(...args),
}));
jest.mock("firebase/auth", () => {
  // On globalThis, not a local: this factory can run while the imports below are
  // still being evaluated, before any `const` in this file exists.
  const g = globalThis as { __firebaseAuthEvaluations?: number };
  g.__firebaseAuthEvaluations = (g.__firebaseAuthEvaluations ?? 0) + 1;
  return { signInWithPopup: (...args: unknown[]) => signInWithPopup(...args) };
});

import {
  getGoogleIdToken,
  preloadGoogleSignIn,
  GooglePopupBlockedError as HelperGooglePopupBlockedError,
} from "@/lib/firebase/googleSignIn";
import { GooglePopupBlockedError } from "@/lib/firebase/googlePopupBlocked";

const evaluationsAtImport = (globalThis as { __firebaseAuthEvaluations?: number }).__firebaseAuthEvaluations ?? 0;

// A new Auth instance per test: the helper remembers which instance a blocked attempt left alive.
let authStub = { stub: "auth" };
const providerStub = { stub: "provider" };

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps queued "once" results: a failed test must not leak them into the next.
  signInWithPopup.mockReset();
  getFirebaseAuth.mockReset();
  authStub = { stub: "auth" };
  getFirebaseAuth.mockReturnValue({ auth: authStub, provider: providerStub });
  disposeFirebase.mockResolvedValue(undefined);
  whenFirebaseDisposed.mockReset();
  whenFirebaseDisposed.mockResolvedValue(undefined);
  signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => "id-token" } });
});

describe("getGoogleIdToken", () => {
  it("opens the Google popup and returns the ID token", async () => {
    await expect(getGoogleIdToken()).resolves.toBe("id-token");

    expect(signInWithPopup).toHaveBeenCalledWith(authStub, providerStub);
  });

  it("waits for a clean-up that is still running before it asks for the Auth instance", async () => {
    let finishCleanup: () => void = () => {};
    whenFirebaseDisposed.mockReturnValue(new Promise<void>((resolve) => (finishCleanup = resolve)));

    const attempt = getGoogleIdToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getFirebaseAuth).not.toHaveBeenCalled();
    expect(signInWithPopup).not.toHaveBeenCalled();

    finishCleanup();
    await expect(attempt).resolves.toBe("id-token");
    expect(getFirebaseAuth).toHaveBeenCalledTimes(1);
  });

  it("disposes Firebase after the token was read", async () => {
    await getGoogleIdToken();

    expect(disposeFirebase).toHaveBeenCalledTimes(1);
  });

  it("returns the token without waiting for the clean-up (the caller only needs the string)", async () => {
    disposeFirebase.mockReturnValue(new Promise<void>(() => {}));

    await expect(getGoogleIdToken()).resolves.toBe("id-token");

    expect(disposeFirebase).toHaveBeenCalledTimes(1);
  });

  it("does not let a failing clean-up become an unhandled rejection after a success", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    disposeFirebase.mockRejectedValue(new Error("cleanup"));

    await expect(getGoogleIdToken()).resolves.toBe("id-token");
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", record);

    expect(unhandled).toEqual([]);
  });

  it("waits for the clean-up before reporting a failure, so a quick second click never meets a half-deleted app", async () => {
    let finishCleanup: () => void = () => {};
    disposeFirebase.mockReturnValue(new Promise<void>((resolve) => (finishCleanup = resolve)));
    const failure = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
    signInWithPopup.mockRejectedValueOnce(failure);
    let settled = false;

    const attempt = getGoogleIdToken().catch((error: unknown) => {
      settled = true;
      return error;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    finishCleanup();
    await expect(attempt).resolves.toBe(failure);
  });

  it("disposes Firebase when the popup is closed, and rethrows the error", async () => {
    const closed = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
    signInWithPopup.mockRejectedValueOnce(closed);

    await expect(getGoogleIdToken()).rejects.toBe(closed);
    expect(disposeFirebase).toHaveBeenCalledTimes(1);
  });

  it("disposes Firebase on any other Firebase error, and rethrows it unchanged", async () => {
    for (const code of ["auth/network-request-failed", "auth/cancelled-popup-request", "auth/internal-error"]) {
      disposeFirebase.mockClear();
      const failure = Object.assign(new Error(code), { code });
      signInWithPopup.mockRejectedValueOnce(failure);

      await expect(getGoogleIdToken()).rejects.toBe(failure);
      expect(disposeFirebase).toHaveBeenCalledTimes(1);
    }
  });

  describe("when the browser blocks the Google window (Safari's short user-activation window)", () => {
    // Firebase starts its Google handshake at the click, so on a slow connection
    // the activation can run out before window.open. The handshake is then done
    // (the popup resolver caches it for the page), so the next click reaches
    // window.open at once. The in-memory Auth instance is kept (nothing is
    // persisted, nobody is signed in) so a block on it can be told from a slow
    // first click.
    const blockedError = () => Object.assign(new Error("blocked"), { code: "auth/popup-blocked" });

    it("throws a GooglePopupBlockedError that keeps the Firebase code and the original error", async () => {
      const original = blockedError();
      signInWithPopup.mockRejectedValueOnce(original);

      const thrown = await getGoogleIdToken().catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(GooglePopupBlockedError);
      expect((thrown as GooglePopupBlockedError).code).toBe("auth/popup-blocked");
      expect((thrown as GooglePopupBlockedError).cause).toBe(original);
    });

    it("does NOT dispose Firebase", async () => {
      signInWithPopup.mockRejectedValueOnce(blockedError());

      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

      expect(disposeFirebase).not.toHaveBeenCalled();
    });

    it("reuses the same Auth instance on the next click, and disposes once that succeeds", async () => {
      signInWithPopup.mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

      await expect(getGoogleIdToken()).resolves.toBe("id-token");

      expect(signInWithPopup).toHaveBeenCalledTimes(2);
      expect(signInWithPopup.mock.calls[0][0]).toBe(authStub);
      expect(signInWithPopup.mock.calls[1][0]).toBe(authStub);
      expect(disposeFirebase).toHaveBeenCalledTimes(1);
    });

    // The retry runs on the instance the first attempt kept, after the handshake
    // finished. If it is blocked anyway, the browser really blocks pop-ups:
    // asking to "press again" would loop for ever. The helper hands back the
    // original Firebase error instead (callers show their "allow pop-ups"
    // message for code auth/popup-blocked) and disposes.
    it("a second block in a row on the kept instance is a real blocker: rethrows the Firebase error and disposes", async () => {
      const second = blockedError();
      signInWithPopup.mockRejectedValueOnce(blockedError()).mockRejectedValueOnce(second);
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
      expect(disposeFirebase).not.toHaveBeenCalled();

      const thrown = await getGoogleIdToken().catch((error: unknown) => error);

      expect(thrown).toBe(second);
      expect(thrown).not.toBeInstanceOf(GooglePopupBlockedError);
      expect((thrown as { code?: string }).code).toBe("auth/popup-blocked");
      expect(disposeFirebase).toHaveBeenCalledTimes(1);
    });

    it("treats the next block after that as a first block again (kept for a retry)", async () => {
      signInWithPopup
        .mockRejectedValueOnce(blockedError())
        .mockRejectedValueOnce(blockedError())
        .mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
      await expect(getGoogleIdToken()).rejects.not.toBeInstanceOf(GooglePopupBlockedError);
      disposeFirebase.mockClear();

      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

      expect(disposeFirebase).not.toHaveBeenCalled();
    });

    it("a block on a different Auth instance than the kept one is a first block (page restored, instance replaced)", async () => {
      signInWithPopup.mockRejectedValueOnce(blockedError()).mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
      getFirebaseAuth.mockReturnValue({ auth: { stub: "a new auth" }, provider: providerStub });

      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

      expect(disposeFirebase).not.toHaveBeenCalled();
    });

    it("a success or another failure in between resets it: block, closed, block is two first blocks", async () => {
      const closed = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
      signInWithPopup
        .mockRejectedValueOnce(blockedError())
        .mockRejectedValueOnce(closed)
        .mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
      await expect(getGoogleIdToken()).rejects.toBe(closed);

      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
    });

    it("disposes when the visitor then closes the window", async () => {
      signInWithPopup.mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);
      expect(disposeFirebase).not.toHaveBeenCalled();

      const closed = Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" });
      signInWithPopup.mockRejectedValueOnce(closed);
      await expect(getGoogleIdToken()).rejects.toBe(closed);

      expect(disposeFirebase).toHaveBeenCalledTimes(1);
    });

    it("disposes when the retry fails some other way", async () => {
      signInWithPopup.mockRejectedValueOnce(blockedError());
      await expect(getGoogleIdToken()).rejects.toBeInstanceOf(GooglePopupBlockedError);

      const failure = new Error("token");
      signInWithPopup.mockResolvedValueOnce({ user: { getIdToken: async () => { throw failure; } } });
      await expect(getGoogleIdToken()).rejects.toBe(failure);

      expect(disposeFirebase).toHaveBeenCalledTimes(1);
    });

    it("is also exported from the helper module", () => {
      expect(HelperGooglePopupBlockedError).toBe(GooglePopupBlockedError);
    });
  });

  it("disposes Firebase when reading the ID token fails", async () => {
    const failure = new Error("token");
    signInWithPopup.mockResolvedValueOnce({ user: { getIdToken: async () => { throw failure; } } });

    await expect(getGoogleIdToken()).rejects.toBe(failure);
    expect(disposeFirebase).toHaveBeenCalledTimes(1);
  });

  it("disposes Firebase when it could not even be initialised", async () => {
    const failure = new Error("init");
    getFirebaseAuth.mockImplementationOnce(() => { throw failure; });

    await expect(getGoogleIdToken()).rejects.toBe(failure);
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(disposeFirebase).toHaveBeenCalledTimes(1);
  });

  it("surfaces the real error even if the clean-up itself rejects", async () => {
    const failure = new Error("popup");
    signInWithPopup.mockRejectedValueOnce(failure);
    disposeFirebase.mockRejectedValueOnce(new Error("cleanup"));

    await expect(getGoogleIdToken()).rejects.toBe(failure);
  });
});

describe("preloadGoogleSignIn", () => {
  it("never starts Firebase: no auth init, no popup, no clean-up", async () => {
    preloadGoogleSignIn();
    preloadGoogleSignIn();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getFirebaseAuth).not.toHaveBeenCalled();
    expect(signInWithPopup).not.toHaveBeenCalled();
    expect(disposeFirebase).not.toHaveBeenCalled();
  });

  it("does not throw or leave an unhandled rejection when a chunk cannot be fetched", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    let preloadWithBrokenChunks: () => void = () => {};
    jest.isolateModules(() => {
      // A chunk that fails to load (offline, a deploy replaced the file) throws when it is evaluated.
      jest.doMock("@/lib/firebase/client", () => {
        throw new Error("ChunkLoadError: Loading chunk failed");
      });
      jest.doMock("firebase/auth", () => {
        throw new Error("ChunkLoadError: Loading chunk failed");
      });
      preloadWithBrokenChunks = require("@/lib/firebase/googleSignIn").preloadGoogleSignIn;
    });

    expect(() => preloadWithBrokenChunks()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off("unhandledRejection", record);

    expect(unhandled).toEqual([]);
  });
});

describe("importing the helper", () => {
  it("does not evaluate firebase/auth", () => {
    // The mock factory above counts every time something requires firebase/auth.
    // The import at the top of this file must not have been enough to do so.
    expect(evaluationsAtImport).toBe(0);
  });
});
