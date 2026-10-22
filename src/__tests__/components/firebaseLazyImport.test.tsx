/**
 * @jest-environment jsdom
 *
 * Firebase Auth must not start just because a page was opened. The login page,
 * the register page and every public job page (EasyApply) used to import it at
 * the top of the file, which created IndexedDB databases and contacted Google
 * hosts before the visitor did anything. Importing these modules must now
 * evaluate neither `firebase/app` nor `firebase/auth`; they load on the
 * Google-button click only.
 */

// On globalThis, not locals: the factories run while a module graph is being
// evaluated, before any `const` in this file exists.
type Recorder = { __firebaseEvaluated?: string[] };
const recorder = globalThis as Recorder;

jest.mock("firebase/app", () => {
  (recorder.__firebaseEvaluated ??= []).push("firebase/app");
  return { initializeApp: jest.fn(), getApps: jest.fn(() => []), deleteApp: jest.fn() };
});
jest.mock("firebase/auth", () => {
  (recorder.__firebaseEvaluated ??= []).push("firebase/auth");
  return {
    initializeAuth: jest.fn(),
    getAuth: jest.fn(),
    signInWithPopup: jest.fn(),
    inMemoryPersistence: {},
    browserPopupRedirectResolver: {},
    GoogleAuthProvider: class {},
  };
});

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(() => ({ data: null, status: "unauthenticated", update: jest.fn() })),
  signIn: jest.fn(),
  getSession: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("next/link", () => ({ __esModule: true, default: () => null }));

const pages: Array<[string, () => unknown]> = [
  ["login page", () => require("@/app/[locale]/(auth)/login/page")],
  ["register page", () => require("@/app/[locale]/(auth)/register/page")],
  ["EasyApply", () => require("@/components/features/public/EasyApply")],
  ["the Google sign-in helper", () => require("@/lib/firebase/googleSignIn")],
  // Mounted on every page by CookieConsentMount: it must be free to import, so it
  // cannot reach the Firebase client (directly or through the alive flag).
  ["StorageSweep (page-load clean-up, every page)", () => require("@/components/shared/StorageSweep")],
  ["the Firebase alive flag", () => require("@/lib/firebase/state")],
  ["the page-load navigation helper", () => require("@/lib/browser/navigateWithPageLoad")],
];

describe("Firebase is not loaded on import", () => {
  beforeEach(() => {
    recorder.__firebaseEvaluated = [];
  });

  it.each(pages)("%s does not evaluate firebase/app or firebase/auth", (_name, load) => {
    jest.isolateModules(() => {
      load();
    });

    expect(recorder.__firebaseEvaluated).toEqual([]);
  });

  it("the Firebase client module is where Firebase gets evaluated, so the guard above can fail", () => {
    jest.isolateModules(() => {
      require("@/lib/firebase/client");
    });

    expect(recorder.__firebaseEvaluated).toEqual(expect.arrayContaining(["firebase/app", "firebase/auth"]));
  });
});
