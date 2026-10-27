/**
 * @jest-environment node
 *
 * The CV builder's chat assistant (client sheet 2026-10-27) replaced the
 * per-field Improve / Suggest / Grammar / Shorten chips. The model proposes,
 * the seeker applies; these pin what it is allowed to propose.
 */
import { buildCvAssistantPrompt, hasCvChanges, sanitizeCvAssistantResult } from "@/lib/ai/cvAssistant";
import { aiCvAssistantSchema } from "@/lib/validators/ai";
import { applyCvChanges, revertCvChanges, toAssistantCv } from "@/app/[locale]/(dashboard)/job-seeker/cv/cv-assistant-apply";
import type { CVForm } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

const form: CVForm = {
  fullName: "Sara Ahmed", email: "sara@example.com", phone: "+971500000000", nationality: "UAE",
  currentLocation: "Dubai", headline: "Developer.", photo: "https://x/p.png", linkedin: "", portfolio: "",
  additionalLinks: [], skills: ["React", "Node.js"],
  experience: [{ jobTitle: "Frontend Dev", company: "Acme", country: "UAE", startDate: "2024-01", endDate: "", isCurrent: true, description: "<ul><li>Built pages</li></ul>" }],
  education: [{ degree: "BSc", institution: "AUS", field: "CS", graduationDate: "2023-06", grade: "" }],
  languages: [], certifications: ["AWS CCP"],
  projects: [{ title: "Shop", description: "<p>An online shop</p>", techStack: ["Next.js"], projectUrl: "", repoUrl: "" }],
};
const cv = aiCvAssistantSchema.parse({ instruction: "x", cv: toAssistantCv(form) }).cv;

describe("toAssistantCv", () => {
  it("sends wording and facts, never contact details or the photo", () => {
    const sent = JSON.stringify(toAssistantCv(form));
    for (const secret of ["sara@example.com", "+971500000000", "Sara Ahmed", "p.png"]) expect(sent).not.toContain(secret);
    expect(toAssistantCv(form).experience[0].description).toBe("• Built pages");
  });
});

describe("buildCvAssistantPrompt", () => {
  it("numbers entries and forbids changing facts", () => {
    const prompt = buildCvAssistantPrompt({ instruction: "Make it punchier", history: [{ role: "user", content: "hi" }], cv });
    expect(prompt).toContain('"index":0');
    expect(prompt).toContain("Make it punchier");
    expect(prompt).toContain("Candidate: hi");
    expect(prompt).toMatch(/Never change or invent job titles, employers, dates/);
  });
});

describe("sanitizeCvAssistantResult", () => {
  it("keeps only allowed fields on entries that exist", () => {
    const result = sanitizeCvAssistantResult({
      reply: "Done.",
      changes: {
        summary: "Frontend developer building fast pages.",
        skills: ["React", "React", "TypeScript"],
        experience: [{ index: 0, description: "- Built 12 pages" }, { index: 5, description: "ghost" }, { index: 0, description: "dupe" }],
        projects: [{ index: 0, description: "An online shop on Next.js" }],
        email: "attacker@evil.test",
        jobTitle: "CEO",
      },
    }, cv);
    expect(result.reply).toBe("Done.");
    expect(result.changes).toEqual({
      summary: "Frontend developer building fast pages.",
      skills: ["React", "TypeScript"],
      experience: [{ index: 0, description: "- Built 12 pages" }],
      projects: [{ index: 0, description: "An online shop on Next.js" }],
    });
  });

  it("drops changes that change nothing and survives junk", () => {
    expect(sanitizeCvAssistantResult({ reply: "Looks good.", changes: { summary: "Developer.", skills: ["React", "Node.js"] } }, cv).changes).toEqual({});
    expect(sanitizeCvAssistantResult("not an object", cv)).toEqual({ reply: "", changes: {} });
    expect(hasCvChanges({})).toBe(false);
  });
});

describe("applyCvChanges / revertCvChanges", () => {
  it("applies descriptions as resume HTML and leaves every other field alone", () => {
    const next = applyCvChanges(form, { summary: "New summary", experience: [{ index: 0, description: "- One\n- Two" }] });
    expect(next.headline).toBe("New summary");
    expect(next.experience[0].description).toBe("<ul><li>One</li><li>Two</li></ul>");
    expect(next.experience[0].jobTitle).toBe("Frontend Dev");
    expect(next.projects).toEqual(form.projects);
    expect(next.email).toBe(form.email);
  });

  it("undo restores only that turn's fields, keeping edits made by hand since", () => {
    const changes = { summary: "AI summary", skills: ["Go"] };
    const applied = applyCvChanges(form, changes);
    const editedAfter = { ...applied, fullName: "Sara A.", projects: [{ ...applied.projects[0], title: "Shop v2" }] };
    const undone = revertCvChanges(editedAfter, form, changes);
    expect(undone.headline).toBe("Developer.");
    expect(undone.skills).toEqual(["React", "Node.js"]);
    expect(undone.fullName).toBe("Sara A.");
    expect(undone.projects[0].title).toBe("Shop v2");
  });
});
