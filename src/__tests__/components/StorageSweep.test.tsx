/**
 * @jest-environment jsdom
 *
 * Firebase's own IndexedDB databases can be left on a device: by the old code,
 * which kept the signed-in Firebase user there, and by the library's heartbeat
 * database, which a browser may refuse to delete while the page that opened it
 * is alive (WebKit drops that delete). StorageSweep removes both names once per
 * full page load, from a module that never touches Firebase, and only while no
 * Firebase instance is alive in this page.
 */

import * as React from "react";
import { render } from "@testing-library/react";

const deleteIndexedDb = jest.fn();
jest.mock("@/lib/browser/indexedDb", () => ({
  deleteIndexedDb: (...args: unknown[]) => deleteIndexedDb(...args),
}));

type StateModule = typeof import("@/lib/firebase/state");

/**
 * A fresh module registry stands in for a fresh page load: the sweep remembers
 * that it ran in a module-level flag. The component gets this file's copy of
 * React, so Testing Library's renderer and its hooks agree.
 */
function loadPage() {
  let StorageSweep: () => null = () => null;
  let state = {} as StateModule;
  jest.isolateModules(() => {
    jest.doMock("react", () => React);
    StorageSweep = require("@/components/shared/StorageSweep").default;
    state = require("@/lib/firebase/state");
  });
  return { StorageSweep, state };
}

afterEach(() => {
  jest.dontMock("react");
});

beforeEach(() => {
  jest.clearAllMocks();
  deleteIndexedDb.mockResolvedValue(undefined);
});

describe("StorageSweep", () => {
  it("deletes both Firebase databases when the page loads", () => {
    const { StorageSweep } = loadPage();

    render(<StorageSweep />);

    expect(deleteIndexedDb).toHaveBeenCalledTimes(2);
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebaseLocalStorageDb");
    expect(deleteIndexedDb).toHaveBeenCalledWith("firebase-heartbeat-database");
  });

  it("renders nothing", () => {
    const { StorageSweep } = loadPage();

    const { container } = render(<StorageSweep />);

    expect(container).toBeEmptyDOMElement();
  });

  it("runs once per page load, however many layouts mount it", () => {
    const { StorageSweep } = loadPage();

    const first = render(<StorageSweep />);
    first.unmount();
    render(<StorageSweep />);
    render(<StorageSweep />);

    expect(deleteIndexedDb).toHaveBeenCalledTimes(2);
  });

  it("leaves the databases alone while a Firebase instance is alive in this page", () => {
    const { StorageSweep, state } = loadPage();
    state.markFirebaseActive();

    render(<StorageSweep />);

    expect(deleteIndexedDb).not.toHaveBeenCalled();
  });

  it("is not blocked by an instance that was already disposed", () => {
    const { StorageSweep, state } = loadPage();
    state.markFirebaseActive();
    state.markFirebaseInactive();

    render(<StorageSweep />);

    expect(deleteIndexedDb).toHaveBeenCalledTimes(2);
  });
});
