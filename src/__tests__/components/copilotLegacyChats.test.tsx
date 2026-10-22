/**
 * @jest-environment jsdom
 *
 * Opening any dashboard mounts the Copilot. It must delete the chat history an
 * older build left in localStorage — on mount, not only when the History panel
 * is opened — so the previous person's chats do not sit on a shared device.
 */
import React from "react";
import { render, waitFor } from "@testing-library/react";

import { Copilot } from "@/components/shared/Copilot";

jest.mock("next/navigation", () => ({
  usePathname: () => "/en/employer",
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: jest.fn() }));

describe("Copilot on mount", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("deletes the chats an older build left in localStorage, without reading them in", async () => {
    localStorage.setItem("copilot-chats", JSON.stringify([{ id: "old", title: "salary of Jane Doe" }]));
    localStorage.setItem("copilot-fab-pos", JSON.stringify({ x: 10, y: 10 }));

    render(<Copilot />);

    await waitFor(() => expect(localStorage.getItem("copilot-chats")).toBeNull());
    expect(sessionStorage.getItem("copilot-chats")).toBeNull();
    // Where the button sits is an appearance preference and stays — under the
    // ui: name; the unprefixed copy an older build left is moved, not lost.
    expect(localStorage.getItem("ui:copilot-fab-pos")).toBe(JSON.stringify({ x: 10, y: 10 }));
    expect(localStorage.getItem("copilot-fab-pos")).toBeNull();
  });
});
