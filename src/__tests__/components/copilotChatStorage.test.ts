/**
 * @jest-environment jsdom
 *
 * Copilot chat history can hold candidate names, salaries and other people's
 * data. It used to sit in localStorage and survive sign-out; it is now kept in
 * the tab (sessionStorage) and wiped on sign-out. Chats an older build left in
 * localStorage are deleted on load, not carried over.
 */
import {
  CHATS_KEY,
  MAX_SAVED_CHATS,
  loadChats,
  persistChats,
  removeLegacyChats,
  type SavedChat,
} from "@/components/shared/Copilot/chatStorage";
import { markSignOutStarted, resetSignOutInProgress } from "@/lib/consent/deviceStorage";

const chat = (id: string): SavedChat => ({
  id,
  title: `chat ${id}`,
  updatedAt: 1,
  transcript: [],
  history: [],
});

beforeEach(() => {
  resetSignOutInProgress();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Copilot chat storage", () => {
  it("keeps chats under the copilot-chats key in sessionStorage, not localStorage", () => {
    persistChats([chat("a")]);

    expect(CHATS_KEY).toBe("copilot-chats");
    expect(JSON.parse(sessionStorage.getItem("copilot-chats")!)).toEqual([chat("a")]);
    expect(localStorage.getItem("copilot-chats")).toBeNull();
  });

  it("reads them back, newest-first order untouched", () => {
    persistChats([chat("b"), chat("a")]);

    expect(loadChats().map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("keeps only the most recent MAX_SAVED_CHATS", () => {
    persistChats(Array.from({ length: MAX_SAVED_CHATS + 3 }, (_, i) => chat(String(i))));

    expect(loadChats()).toHaveLength(MAX_SAVED_CHATS);
    expect(loadChats()[0].id).toBe("0");
  });

  it("returns an empty list for missing, corrupt or non-array storage", () => {
    expect(loadChats()).toEqual([]);
    sessionStorage.setItem(CHATS_KEY, "{not json");
    expect(loadChats()).toEqual([]);
    sessionStorage.setItem(CHATS_KEY, JSON.stringify({ not: "an array" }));
    expect(loadChats()).toEqual([]);
  });

  it("does not throw when storage is unavailable", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => persistChats([chat("a")])).not.toThrow();

    spy.mockRestore();
  });
});

describe("after sign-out has started", () => {
  // The Copilot auto-saves on every transcript change; one landing after the
  // wipe would put the previous user's chat back on the device.
  it("persistChats does not write", () => {
    markSignOutStarted();

    persistChats([chat("a")]);

    expect(sessionStorage.getItem(CHATS_KEY)).toBeNull();
  });
});

describe("chats left in localStorage by an older build", () => {
  it("are deleted, and not read into the new history", () => {
    localStorage.setItem(CHATS_KEY, JSON.stringify([chat("old")]));

    removeLegacyChats();

    expect(localStorage.getItem(CHATS_KEY)).toBeNull();
    expect(loadChats()).toEqual([]);
  });

  it("leave the copilot button position alone", () => {
    localStorage.setItem("copilot-fab-pos", JSON.stringify({ x: 1, y: 2 }));
    localStorage.setItem(CHATS_KEY, "[]");

    removeLegacyChats();

    expect(localStorage.getItem("copilot-fab-pos")).toBe(JSON.stringify({ x: 1, y: 2 }));
  });
});
