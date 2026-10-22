/**
 * @jest-environment jsdom
 *
 * Firebase Auth used to start on module load, so every public page that merely
 * imported it created IndexedDB databases and contacted Google before the
 * visitor did anything. `client.ts` now does nothing until `getFirebaseAuth()`
 * is called from a Google-button click, keeps the signed-in user in memory
 * only, and `disposeFirebase()` leaves nothing behind.
 */

// A module, not a global script, so its top-level names do not clash with other test files' under tsc.
export {};

const initializeApp = jest.fn();
const getApps = jest.fn();
const deleteApp = jest.fn();
const initializeAuth = jest.fn();
const getAuth = jest.fn();
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
  getAuth: (...args: unknown[]) => getAuth(...args),
  inMemoryPersistence: { type: "NONE" },
  browserPopupRedirectResolver: { resolver: true },
  GoogleAuthProvider: FakeGoogleAuthProvider,
}));
jest.mock("@/lib/browser/indexedDb", () => ({
  deleteIndexedDb: (...args: unknown[]) => deleteIndexedDb(...args),
}));

type ClientModule = typeof import("@/lib/firebase/client");

function loadClient(): ClientModule {
  let mod: ClientModule | undefined;
  jest.isolateModules(() => {
    mod = require("@/lib/firebase/client");
  });
  return mod as ClientModule;
}

const fakeApp = { name: "[DEFAULT]" };

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  // Let any "page is going away" sweep left by an earlier test fire, and finish
  // (it may also dispose an instance that test left alive), before the mocks
  // are cleared, so none of it can leak into this one.
  window.dispatchEvent(new Event("pagehide"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  jest.clearAllMocks();
  getApps.mockReturnValue([]);
  initializeApp.mockReturnValue(fakeApp);
  deleteApp.mockResolvedValue(undefined);
  signOut.mockResolvedValue(undefined);
  initializeAuth.mockImplementation(() => ({ signOut }));
  deleteIndexedDb.mockResolvedValue(undefined);
});

describe("firebase client module", () => {
  it("does nothing at import: no app, no auth, no IndexedDB", () => {
    loadClient();

    expect(initializeApp).not.toHaveBeenCalled();
    expect(getApps).not.toHaveBeenCalled();
    expect(initializeAuth).not.toHaveBeenCalled();
    expect(getAuth).not.toHaveBeenCalled();
    expect(deleteIndexedDb).not.toHaveBeenCalled();
  });

  it("initialises auth in memory only, with the popup resolver, on demand", () => {
    const { getFirebaseAuth } = loadClient();

    const { auth, provider } = getFirebaseAuth();

    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeAuth).toHaveBeenCalledWith(fakeApp, {
      persistence: { type: "NONE" },
      popupRedirectResolver: { resolver: true },
    });
    expect(getAuth).not.toHaveBeenCalled();
    expect(auth).toBeDefined();
    expect(provider).toBeInstanceOf(FakeGoogleAuthProvider);
  });

  it("reuses the same auth instance until it is disposed", () => {
    const { getFirebaseAuth } = loadClient();

    const first = getFirebaseAuth();
    const second = getFirebaseAuth();

    expect(second.auth).toBe(first.auth);
    expect(initializeAuth).toHaveBeenCalledTimes(1);
  });

  it("signs out, deletes the app and both Firebase databases on dispose", async () => {
    const { getFirebaseAuth, disposeFirebase } = loadClient();
    getFirebaseAuth();

    await disposeFirebase();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(deleteApp).toHaveBeenCalledWith(fakeApp);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });

  it("creates a new app and Auth on the next click after a dispose", async () => {
    const { getFirebaseAuth, disposeFirebase } = loadClient();
    getFirebaseAuth();
    await disposeFirebase();

    getFirebaseAuth();

    expect(initializeApp).toHaveBeenCalledTimes(2);
    expect(initializeAuth).toHaveBeenCalledTimes(2);
  });

  it("still removes the databases when sign-out or app deletion throws", async () => {
    signOut.mockRejectedValue(new Error("offline"));
    deleteApp.mockRejectedValue(new Error("boom"));
    const { getFirebaseAuth, disposeFirebase } = loadClient();
    getFirebaseAuth();

    await expect(disposeFirebase()).resolves.toBeUndefined();

    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });

  // After a success the helper cleans up in the background. A quick second click
  // must neither share the instance that is being deleted nor have the clean-up end
  // under it, so the helper waits for `whenFirebaseDisposed()` before asking for Auth.
  describe("a dispose that is still running", () => {
    it("whenFirebaseDisposed() resolves at once when nothing is being disposed", async () => {
      const { getFirebaseAuth, whenFirebaseDisposed } = loadClient();
      getFirebaseAuth();

      await expect(whenFirebaseDisposed()).resolves.toBeUndefined();
    });

    it("whenFirebaseDisposed() waits until the app has been deleted and the databases removed", async () => {
      const deletion = deferred();
      deleteApp.mockReturnValue(deletion.promise);
      const { getFirebaseAuth, disposeFirebase, whenFirebaseDisposed } = loadClient();
      getFirebaseAuth();
      void disposeFirebase();
      let waited = false;
      void whenFirebaseDisposed().then(() => (waited = true));

      await flush();
      expect(waited).toBe(false);
      expect(deleteIndexedDb).not.toHaveBeenCalled();

      deletion.resolve();
      await flush();
      expect(waited).toBe(true);
      expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
    });

    it("a second dispose request joins the one that is running (one sign-out, one app deletion)", async () => {
      const { getFirebaseAuth, disposeFirebase } = loadClient();
      getFirebaseAuth();

      const first = disposeFirebase();
      const second = disposeFirebase();
      await Promise.all([first, second]);

      expect(second).toBe(first);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(deleteApp).toHaveBeenCalledTimes(1);
    });

    it("the page going away during a dispose joins it too", async () => {
      const signingOut = deferred();
      signOut.mockReturnValue(signingOut.promise);
      const { getFirebaseAuth, disposeFirebase } = loadClient();
      getFirebaseAuth();
      void disposeFirebase();

      window.dispatchEvent(new Event("pagehide"));
      signingOut.resolve();
      await flush();

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(deleteApp).toHaveBeenCalledTimes(1);
    });

    it("a dispose asked for after the earlier one finished runs again, on the new instance", async () => {
      const { getFirebaseAuth, disposeFirebase } = loadClient();
      getFirebaseAuth();
      await disposeFirebase();
      getFirebaseAuth();

      await disposeFirebase();

      expect(signOut).toHaveBeenCalledTimes(2);
      expect(deleteApp).toHaveBeenCalledTimes(2);
    });

    it("keeps handing out the instance that is being disposed until it is deleted, then a new one", async () => {
      const deletion = deferred();
      deleteApp.mockReturnValue(deletion.promise);
      const { getFirebaseAuth, disposeFirebase, whenFirebaseDisposed } = loadClient();
      const first = getFirebaseAuth();
      void disposeFirebase();
      await flush();

      // Why callers wait: until the deletion is done this is still the dying instance.
      expect(getFirebaseAuth().auth).toBe(first.auth);
      expect(initializeAuth).toHaveBeenCalledTimes(1);

      deletion.resolve();
      await whenFirebaseDisposed();
      const second = getFirebaseAuth();

      expect(second.auth).not.toBe(first.auth);
      expect(initializeAuth).toHaveBeenCalledTimes(2);
    });
  });

  describe("when the page goes away", () => {
    // Firebase keeps its own connection to the heartbeat database open for as
    // long as the page lives, so a delete during dispose can be blocked, or the
    // library can re-create the database a moment later. One more delete as the
    // page goes lets the browser finish it once the connection closes.
    it("asks the browser to delete both databases once more", async () => {
      const { getFirebaseAuth, disposeFirebase } = loadClient();
      getFirebaseAuth();
      await disposeFirebase();
      deleteIndexedDb.mockClear();

      window.dispatchEvent(new Event("pagehide"));

      expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
      expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
    });

    it("does that only once, however many times Firebase was disposed", async () => {
      const { getFirebaseAuth, disposeFirebase } = loadClient();
      getFirebaseAuth();
      await disposeFirebase();
      getFirebaseAuth();
      await disposeFirebase();
      deleteIndexedDb.mockClear();

      window.dispatchEvent(new Event("pagehide"));
      window.dispatchEvent(new Event("pagehide"));

      expect(deleteIndexedDb).toHaveBeenCalledTimes(2);
    });

    it("does nothing if Firebase was never started", () => {
      loadClient();

      window.dispatchEvent(new Event("pagehide"));

      expect(deleteIndexedDb).not.toHaveBeenCalled();
    });

    // After a popup-blocked attempt the instance is kept for the retry; if the
    // visitor never clicks again, it must still go with the page.
    it("also disposes an instance that was kept alive (e.g. after a blocked popup)", async () => {
      const { getFirebaseAuth } = loadClient();
      getFirebaseAuth();
      expect(deleteApp).not.toHaveBeenCalled();

      window.dispatchEvent(new Event("pagehide"));
      // The databases are asked to go in the same task as the event itself.
      expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
      expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(deleteApp).toHaveBeenCalledWith(fakeApp);
    });

    it("creates a new app and Auth if the page comes back from the back/forward cache", async () => {
      const { getFirebaseAuth } = loadClient();
      getFirebaseAuth();
      window.dispatchEvent(new Event("pagehide"));
      await new Promise((resolve) => setTimeout(resolve, 0));

      getFirebaseAuth();

      expect(initializeAuth).toHaveBeenCalledTimes(2);
    });
  });

  it("clears the databases even if Firebase was never started (legacy leftovers)", async () => {
    const { disposeFirebase } = loadClient();

    await disposeFirebase();

    expect(initializeApp).not.toHaveBeenCalled();
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });
});

/**
 * StorageSweep (run once per page load, from a module that must not import
 * Firebase) deletes Firebase's databases only while no instance is alive. The
 * flag it reads lives in `lib/firebase/state.ts`, which this client keeps.
 */
describe("firebase client: the 'alive' flag the page-load sweep reads", () => {
  type StateModule = typeof import("@/lib/firebase/state");

  function loadClientAndState(): { client: ClientModule; state: StateModule } {
    let loaded: { client: ClientModule; state: StateModule } | undefined;
    jest.isolateModules(() => {
      loaded = {
        client: require("@/lib/firebase/client"),
        state: require("@/lib/firebase/state"),
      };
    });
    return loaded as { client: ClientModule; state: StateModule };
  }

  it("is not set by importing the client", () => {
    const { state } = loadClientAndState();

    expect(state.isFirebaseActive()).toBe(false);
  });

  it("is set as soon as an instance is created, and cleared once it is disposed", async () => {
    const { client, state } = loadClientAndState();

    client.getFirebaseAuth();
    expect(state.isFirebaseActive()).toBe(true);

    await client.disposeFirebase();
    expect(state.isFirebaseActive()).toBe(false);
  });

  it("stays set while the app is being deleted, and is cleared only when that is done", async () => {
    let finishDeletion: () => void = () => {};
    deleteApp.mockReturnValue(new Promise<void>((resolve) => (finishDeletion = resolve)));
    const { client, state } = loadClientAndState();
    client.getFirebaseAuth();

    const disposed = client.disposeFirebase();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.isFirebaseActive()).toBe(true);

    finishDeletion();
    await disposed;
    expect(state.isFirebaseActive()).toBe(false);
  });

  it("is set again for an instance created once the dispose has finished, and stays set", async () => {
    let finishDeletion: () => void = () => {};
    deleteApp.mockReturnValueOnce(new Promise<void>((resolve) => (finishDeletion = resolve)));
    const { client, state } = loadClientAndState();
    client.getFirebaseAuth();
    void client.disposeFirebase();

    finishDeletion();
    await client.whenFirebaseDisposed();
    client.getFirebaseAuth();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.isFirebaseActive()).toBe(true);
  });

  it("stays set when the app could not be deleted (a half-deleted app is still alive)", async () => {
    deleteApp.mockRejectedValue(new Error("boom"));
    const { client, state } = loadClientAndState();
    client.getFirebaseAuth();

    await client.disposeFirebase();

    expect(state.isFirebaseActive()).toBe(true);
  });

  it("is set even if initialising Firebase throws part-way", () => {
    initializeAuth.mockImplementation(() => {
      throw new Error("init");
    });
    const { client, state } = loadClientAndState();

    expect(() => client.getFirebaseAuth()).toThrow("init");

    expect(state.isFirebaseActive()).toBe(true);
  });

  it("is cleared when the page goes away and the kept instance is disposed", async () => {
    const { client, state } = loadClientAndState();
    client.getFirebaseAuth();

    window.dispatchEvent(new Event("pagehide"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.isFirebaseActive()).toBe(false);
  });

  it("names the same two databases the sweep deletes", () => {
    const { state } = loadClientAndState();

    expect([...state.FIREBASE_DATABASES].sort()).toEqual(["firebase-heartbeat-database", "firebaseLocalStorageDb"]);
  });
});
