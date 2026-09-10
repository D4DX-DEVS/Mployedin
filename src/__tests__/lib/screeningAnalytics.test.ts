/**
 * @jest-environment node
 */
/**
 * Screening answer aggregation.
 *
 * Two defects motivated pulling this out of the route: a checkbox answer is
 * stored as a real array (the answer field is Schema.Types.Mixed), so testing
 * it against the option map stringified it to "React,Node" and dropped every
 * multi-select response into "Other"; and a date question had no branch at
 * all, so "earliest start date" summarised to a bare response count. The
 * apply form also posts "" for every optional question left blank, which was
 * being counted as a response.
 */
import { aggregateScreeningAnswers } from "@/lib/screeningAnalytics";

const app = (answers: { questionId: string; answer: unknown }[]) => ({
  screeningAnswers: answers as { questionId: string; answer: string | string[] | boolean }[],
});

describe("aggregateScreeningAnswers", () => {
  describe("choice questions", () => {
    const question = {
      id: "q1",
      label: "Which stacks?",
      type: "checkbox",
      options: ["React", "Node", "Go"],
    };

    it("counts each option of a multi-select answer on its own", () => {
      const [result] = aggregateScreeningAnswers(
        [question],
        [app([{ questionId: "q1", answer: ["React", "Node"] }]), app([{ questionId: "q1", answer: ["React"] }])]
      );

      expect(result.distribution).toEqual({ React: 2, Node: 1, Go: 0 });
    });

    it("does not invent an Other bucket for answers that are all known options", () => {
      const [result] = aggregateScreeningAnswers(
        [question],
        [app([{ questionId: "q1", answer: ["React", "Go"] }])]
      );

      expect(result.distribution).not.toHaveProperty("Other");
    });

    it("still buckets genuinely unknown options under Other", () => {
      const [result] = aggregateScreeningAnswers(
        [question],
        [app([{ questionId: "q1", answer: ["React", "COBOL"] }])]
      );

      expect(result.distribution).toEqual({ React: 1, Node: 0, Go: 0, Other: 1 });
    });

    it("handles a single-select answer stored as a bare string", () => {
      const [result] = aggregateScreeningAnswers(
        [{ id: "q1", label: "Stack?", type: "radio", options: ["React", "Node"] }],
        [app([{ questionId: "q1", answer: "Node" }])]
      );

      expect(result.distribution).toEqual({ React: 0, Node: 1 });
    });

    it("counts one respondent once even when they pick several options", () => {
      // The bars read as "share of respondents who picked this", so the
      // denominator is people, not selections — three ticks from one applicant
      // is still one response.
      const [result] = aggregateScreeningAnswers(
        [question],
        [app([{ questionId: "q1", answer: ["React", "Node", "Go"] }])]
      );

      expect(result.totalResponses).toBe(1);
    });
  });

  describe("blank answers", () => {
    it("ignores the empty strings the apply form posts for skipped optional questions", () => {
      const [result] = aggregateScreeningAnswers(
        [{ id: "q1", label: "Notice period?", type: "text" }],
        [
          app([{ questionId: "q1", answer: "2 weeks" }]),
          app([{ questionId: "q1", answer: "" }]),
          app([{ questionId: "q1", answer: [] }]),
        ]
      );

      expect(result.totalResponses).toBe(1);
      expect(result.sampleAnswers).toEqual(["2 weeks"]);
    });
  });

  describe("date questions", () => {
    const question = { id: "q1", label: "Earliest start date?", type: "date" };

    it("reports the earliest and latest date given", () => {
      const [result] = aggregateScreeningAnswers(
        [question],
        [
          app([{ questionId: "q1", answer: "2026-11-01" }]),
          app([{ questionId: "q1", answer: "2026-09-15" }]),
          app([{ questionId: "q1", answer: "2026-10-02" }]),
        ]
      );

      expect(result.dateStats).toEqual({ earliest: "2026-09-15", latest: "2026-11-01" });
    });

    it("leaves dateStats undefined when nothing parses as a date", () => {
      const [result] = aggregateScreeningAnswers(
        [question],
        [app([{ questionId: "q1", answer: "whenever you need me" }])]
      );

      expect(result.dateStats).toBeUndefined();
    });
  });

  describe("number questions", () => {
    it("averages only the values that parse", () => {
      const [result] = aggregateScreeningAnswers(
        [{ id: "q1", label: "Years?", type: "number" }],
        [
          app([{ questionId: "q1", answer: "5" }]),
          app([{ questionId: "q1", answer: "3" }]),
          app([{ questionId: "q1", answer: "not sure" }]),
        ]
      );

      expect(result.numericStats).toEqual({ avg: 4, min: 3, max: 5 });
    });
  });

  describe("text questions", () => {
    it("caps the sample at ten answers", () => {
      const applications = Array.from({ length: 14 }, (_, i) =>
        app([{ questionId: "q1", answer: `answer ${i}` }])
      );
      const [result] = aggregateScreeningAnswers(
        [{ id: "q1", label: "Why us?", type: "textarea" }],
        applications
      );

      expect(result.totalResponses).toBe(14);
      expect(result.sampleAnswers).toHaveLength(10);
    });
  });

  it("returns every question, including ones nobody answered", () => {
    const results = aggregateScreeningAnswers(
      [
        { id: "q1", label: "Answered", type: "text" },
        { id: "q2", label: "Untouched", type: "text" },
      ],
      [app([{ questionId: "q1", answer: "yes" }])]
    );

    expect(results.map((r) => r.totalResponses)).toEqual([1, 0]);
  });
});
