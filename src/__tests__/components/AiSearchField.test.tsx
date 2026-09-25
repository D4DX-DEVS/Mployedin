/**
 * @jest-environment jsdom
 */
import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiSearchField, AiSearchResultLine } from "@/components/shared/AiSearchField";
import { useAiFilterSearch } from "@/hooks/useAiFilterSearch";

interface Filters { search?: string; status?: string }

/**
 * A page in miniature: one keyword and one status filter, wired through the
 * hook exactly the way the applications pages wire theirs.
 */
function Harness() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const ai = useAiFilterSearch<Filters, { search: string; status: string }>({
    endpoint: "/api/ai/application-search-filters",
    snapshot: () => ({ search, status }),
    restore: (s) => { setSearch(s.search); setStatus(s.status); },
    apply: (f) => {
      setSearch(f.search ?? "");
      setStatus(f.status ?? "");
      return [f.status, f.search].filter((v): v is string => Boolean(v));
    },
    searchAsKeyword: (q) => setSearch(q),
  });
  return (
    <>
      <AiSearchField
        value={search}
        onValueChange={setSearch}
        placeholder="Search or describe"
        onAskAi={ai.askAi}
        pending={ai.pending}
      />
      <AiSearchResultLine result={ai.result} onUndo={ai.undo} onDismiss={ai.dismiss} />
      <span data-testid="status">{status}</span>
    </>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("AiSearchField + useAiFilterSearch", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("types a live keyword without calling AI", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText("Search or describe"), "maria");

    expect(screen.getByPlaceholderText("Search or describe")).toHaveValue("maria");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables Ask AI until something is typed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const ask = screen.getByRole("button", { name: /ask ai/i });
    expect(ask).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Search or describe"), "rejected");
    expect(ask).toBeEnabled();
  });

  it("turns the sentence into filters, lists them, and Undo puts the sentence back", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ filters: { status: "rejected", search: "d4dx" }, degraded: false }));
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("Search or describe");
    await user.type(input, "rejected applications from d4dx");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("rejected"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/application-search-filters",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ query: "rejected applications from d4dx" }) }),
    );
    expect(input).toHaveValue("d4dx");
    const line = screen.getByRole("status");
    expect(line).toHaveTextContent("AI applied");
    expect(line).toHaveTextContent("rejected");

    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(input).toHaveValue("rejected applications from d4dx");
    expect(screen.getByTestId("status")).toHaveTextContent("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to a keyword search when AI is degraded", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ filters: { search: "x" }, degraded: true }));
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("Search or describe");
    await user.type(input, "react people");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/isn't available/i));
    expect(input).toHaveValue("react people");
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
  });

  it("says the limit was reached on a 429", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "AI_DAILY_LIMIT_EXCEEDED" }, 429));
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText("Search or describe"), "shortlisted");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/limit/i));
  });

  it("keeps the sentence as a keyword when AI finds no filters in it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ filters: {}, degraded: false }));
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText("Search or describe");
    await user.type(input, "hello there");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no filters/i));
    expect(input).toHaveValue("hello there");
  });

  it("treats a network failure as unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText("Search or describe"), "offers");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/isn't available/i));
  });

  it("Dismiss hides the line but keeps the filters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ filters: { status: "hired" }, degraded: false }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText("Search or describe"), "hired");
    await user.click(screen.getByRole("button", { name: /ask ai/i }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByTestId("status")).toHaveTextContent("hired");
  });
});
