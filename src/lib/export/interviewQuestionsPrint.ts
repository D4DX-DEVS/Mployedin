import { escapeHtml } from "@/lib/security/html-escape";

export interface PrintableQuestion {
  question: string;
  tests: string;
  strongAnswer: string;
  redFlag: string;
}

export interface InterviewQuestionsPrintInput {
  /** Already-translated strings. Every value below is treated as untrusted text. */
  title: string;
  meta: string;
  labels: { tests: string; strongAnswer: string; redFlag: string };
  questions: PrintableQuestion[];
}

/**
 * HTML for the "Print interview questions" window.
 *
 * The window is opened with window.open("") and document.write, so it runs in
 * the app's origin: anything interpolated unescaped executes as the employer.
 * The candidate name is seeker-controlled and the questions are model output
 * (steerable from a CV), so every value is escaped here.
 */
export function buildInterviewQuestionsPrintHtml(input: InterviewQuestionsPrintInput): string {
  const e = escapeHtml;
  const questions = input.questions
    .map(
      (q, i) => `
        <div class="q">
          <h3>Q${i + 1}: ${e(q.question)}</h3>
          <div class="label">${e(input.labels.tests)}</div><div class="val">${e(q.tests)}</div>
          <div class="label">${e(input.labels.strongAnswer)}</div><div class="val">${e(q.strongAnswer)}</div>
          <div class="label redflag">${e(input.labels.redFlag)}</div><div class="val">${e(q.redFlag)}</div>
        </div>`,
    )
    .join("");

  return `
      <html><head><title>${e(input.title)}</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:700px;margin:auto}
      h1{font-size:18px;margin-bottom:4px}p.meta{color:#666;font-size:13px;margin-bottom:20px}
      .q{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:14px}
      .q h3{font-size:14px;font-weight:600;margin:0 0 8px}
      .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;margin:6px 0 2px}
      .val{font-size:13px;color:#374151}
      .redflag{color:#dc2626}</style></head>
      <body>
      <h1>${e(input.title)}</h1>
      <p class="meta">${e(input.meta)}</p>
      ${questions}
      </body></html>`;
}
