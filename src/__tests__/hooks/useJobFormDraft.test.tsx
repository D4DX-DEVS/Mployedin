/**
 * @jest-environment jsdom
 *
 * The job form's local draft mirror used to sit in localStorage under
 * `job-draft-<userId>` — created just by opening the form, and still there after
 * sign-out for the next person on a shared device. It is now tab-scoped
 * (sessionStorage, still enough to recover from a tab crash); the durable copy
 * stays on the server (/api/jobs/auto-draft, saveDraft).
 */
import { act, renderHook, waitFor } from "@testing-library/react";

import { useJobFormDraft } from "@/components/features/employer/job-form/useJobFormDraft";
import { migrateLegacyDraft } from "@/components/features/employer/job-form/jobDraftStorage";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

// SessionProvider has no initial session on a hard reload: `data` is undefined
// until the session request resolves, then the user.
let mockSession: { user: { id: string } } | undefined;
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: mockSession }),
}));

const KEY = "job-draft-u1";
const values = { title: "QA Automation Tester" } as unknown as JobFormValues;
const stored = (draftId: string | null, savedAt = Date.now()) => JSON.stringify({ draftId, values, savedAt });

afterEach(() => resetSignOutInProgress());

beforeEach(() => {
  mockSession = { user: { id: "u1" } };
  localStorage.clear();
  sessionStorage.clear();
});

describe("useJobFormDraft storage", () => {
  it("autosaves into sessionStorage and never into localStorage", () => {
    const { result } = renderHook(() => useJobFormDraft("en"));

    act(() => result.current.autosaveLocal(values));

    expect(JSON.parse(sessionStorage.getItem(KEY)!).values).toEqual(values);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("loads the draft back from sessionStorage", () => {
    sessionStorage.setItem(KEY, stored("d1"));
    const { result } = renderHook(() => useJobFormDraft("en"));

    expect(result.current.loadDraft()?.values).toEqual(values);
  });

  it("clears the draft from sessionStorage", () => {
    sessionStorage.setItem(KEY, stored("d1"));
    const { result } = renderHook(() => useJobFormDraft("en"));

    act(() => result.current.clearDraft());

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("saveDraft mirrors into sessionStorage, not localStorage", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job: { _id: "job-9" } }),
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useJobFormDraft("en"));

    await act(async () => {
      await result.current.saveDraft({
        ...values,
        location: { country: "AE", city: "Dubai", isRemote: false },
      } as unknown as JobFormValues);
    });

    expect(JSON.parse(sessionStorage.getItem(KEY)!).draftId).toBe("job-9");
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("after sign-out has started", () => {
  // The debounced autosave can fire after logoutCleanup() has wiped the tab and
  // before the page navigates away; it must not put the draft back.
  it("autosaveLocal does not write the draft back", () => {
    const { result } = renderHook(() => useJobFormDraft("en"));
    markSignOutStarted();

    act(() => result.current.autosaveLocal(values));

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("saveDraft does not write the local mirror back", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const { result } = renderHook(() => useJobFormDraft("en"));
    markSignOutStarted();

    await act(async () => {
      await result.current.saveDraft({
        ...values,
        location: { country: "AE", city: "Dubai", isRemote: false },
      } as unknown as JobFormValues);
    });

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe("moving a draft written by an older build", () => {
  it("moves the signed-in user's old localStorage draft to sessionStorage and deletes the old copy", async () => {
    localStorage.setItem(KEY, stored("d-old"));

    const { result } = renderHook(() => useJobFormDraft("en"));

    await waitFor(() => expect(result.current.draftId).toBe("d-old"));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(KEY)!).draftId).toBe("d-old");
    expect(result.current.loadDraft()?.values).toEqual(values);
  });

  it("deletes other people's old drafts from localStorage without adopting them", () => {
    localStorage.setItem("job-draft-someone-else", stored("d-other"));
    localStorage.setItem("job-draft-anonymous", stored("d-anon"));

    renderHook(() => useJobFormDraft("en"));

    expect(Object.keys(localStorage)).toEqual([]);
    expect(sessionStorage.getItem("job-draft-someone-else")).toBeNull();
    expect(sessionStorage.getItem("job-draft-anonymous")).toBeNull();
  });
});

describe("a hard reload, before the session has loaded", () => {
  it("leaves the old drafts alone until it knows whose they are, then moves the signed-in user's", async () => {
    localStorage.setItem(KEY, stored("d-old"));
    localStorage.setItem("job-draft-someone-else", stored("d-other"));
    mockSession = undefined;

    const { result, rerender } = renderHook(() => useJobFormDraft("en"));

    // Anonymous: nothing is migrated and nothing is purged.
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem("job-draft-someone-else")).not.toBeNull();
    expect(result.current.loadDraft()).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();

    // The session resolves.
    mockSession = { user: { id: "u1" } };
    rerender();

    await waitFor(() => expect(result.current.draftId).toBe("d-old"));
    expect(JSON.parse(sessionStorage.getItem(KEY)!).draftId).toBe("d-old");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem("job-draft-someone-else")).toBeNull();
    expect(result.current.loadDraft()?.values).toEqual(values);
  });
});

describe("migrateLegacyDraft", () => {
  it("keeps a newer sessionStorage draft over the old one, and still deletes the old one", () => {
    localStorage.setItem(KEY, stored("d-old"));
    sessionStorage.setItem(KEY, stored("d-new"));

    migrateLegacyDraft(KEY, localStorage, sessionStorage);

    expect(JSON.parse(sessionStorage.getItem(KEY)!).draftId).toBe("d-new");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("does nothing when there is no old draft", () => {
    migrateLegacyDraft(KEY, localStorage, sessionStorage);

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("leaves unrelated localStorage keys alone", () => {
    localStorage.setItem("mployedin_remember_email", "me@example.com");
    localStorage.setItem("copilot-fab-pos", "{}");

    migrateLegacyDraft(KEY, localStorage, sessionStorage);

    expect(localStorage.getItem("mployedin_remember_email")).toBe("me@example.com");
    expect(localStorage.getItem("copilot-fab-pos")).toBe("{}");
  });
});
