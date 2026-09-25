/**
 * @jest-environment node
 */
import { toolDataEntry, stripToolDataEcho, prepareHistoryForModel } from "@/lib/ai/copilot/historyToolData";

const JOBS = '[{"jobId":"6a508f0b19d8720776edf044","title":"Accountant","skills":["MS Excel","Financial Reporting"]}]';

describe("stripToolDataEcho", () => {
  it("removes a tool-data blob the model echoed ahead of its reply", () => {
    expect(stripToolDataEcho(`[data from search_jobs] ${JOBS}Here are matching jobs:`)).toBe("Here are matching jobs:");
  });

  it("respects brackets and escaped quotes inside JSON strings", () => {
    const tricky = '{"title":"C++ [Senior] \\"Lead\\"","tags":["a]","{b"]}';
    expect(stripToolDataEcho(`Intro. [data from get_job] ${tricky} Outro.`)).toBe("Intro. Outro.");
  });

  it("drops an unterminated (truncated or still-streaming) blob only to the end of its line", () => {
    expect(stripToolDataEcho('[data from search_jobs] [{"jobId":"6a5\nSecond line')).toBe("\nSecond line");
  });

  it("leaves ordinary replies untouched", () => {
    const reply = "You have **3** open [applications](/en/job-seeker/applications).";
    expect(stripToolDataEcho(reply)).toBe(reply);
  });
});

describe("prepareHistoryForModel", () => {
  it("moves tool data out of the assistant's voice into a reference note", () => {
    const out = prepareHistoryForModel([
      { role: "user", content: "show me jobs" },
      { role: "assistant", content: toolDataEntry("search_jobs", JOBS) },
      { role: "assistant", content: "Here are matching jobs:" },
    ]);

    expect(out).toHaveLength(3);
    expect(out[1].role).toBe("user");
    expect(out[1].content).toContain("search_jobs");
    expect(out[1].content).toContain(JOBS);
    expect(out[1].content).not.toMatch(/^\[data from/);
    expect(out.filter((m) => m.role === "assistant").every((m) => !m.content.includes("[data from"))).toBe(true);
  });

  it("cleans a saved assistant reply that already echoed the blob", () => {
    const out = prepareHistoryForModel([
      { role: "assistant", content: `[data from search_jobs] ${JOBS}Here are matching jobs:` },
    ]);
    expect(out).toEqual([{ role: "assistant", content: "Here are matching jobs:" }]);
  });

  it("passes user messages through unchanged", () => {
    const msg = { role: "user", content: "what does [data from x] mean?" };
    expect(prepareHistoryForModel([msg])).toEqual([msg]);
  });
});
