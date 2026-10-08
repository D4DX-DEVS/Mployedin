/**
 * @jest-environment node
 *
 * 2026-09-28 OWASP assessment H-03: "Print interview questions" wrote the
 * candidate name and AI output unescaped into a same-origin popup via
 * document.write — stored XSS in the employer's session, triggered by a job
 * seeker's display name or a prompt-injected CV.
 */
import { buildInterviewQuestionsPrintHtml } from "@/lib/export/interviewQuestionsPrint";

const PAYLOAD = `<img src=x onerror=alert(document.domain)>`;
const SCRIPT = `</title><script>alert(1)</script>`;

describe("buildInterviewQuestionsPrintHtml", () => {
  const html = buildInterviewQuestionsPrintHtml({
    title: `Interview Questions — ${SCRIPT}`,
    meta: `Candidate: ${PAYLOAD} · technical · 1 questions`,
    labels: { tests: "Tests", strongAnswer: "Strong answer", redFlag: "Red flag" },
    questions: [
      { question: PAYLOAD, tests: `<svg onload=alert(1)>`, strongAnswer: `"><b>x</b>`, redFlag: `<iframe src=javascript:alert(1)>` },
    ],
  });

  it("escapes candidate name, title and every AI field", () => {
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<svg\b/i);
    expect(html).not.toMatch(/<iframe\b/i);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img src=x onerror=alert(document.domain)&gt;");
  });

  it("still renders the document structure", () => {
    expect(html).toContain("<h1>");
    expect((html.match(/class="q"/g) ?? []).length).toBe(1);
  });
});
