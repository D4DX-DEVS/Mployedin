/**
 * @jest-environment node
 *
 * The text a seeker or a job is embedded from. Both use the same labels
 * ("Skills:", "Years of experience:") so the two vectors line up, and the hash
 * changes whenever the text or the embedding model does, which is how the
 * refresher knows what to re-embed.
 */
// jobSkillExtraction pulls in the AI client; none of it runs here.
jest.mock("@/lib/ai/gemini", () => ({ generateText: jest.fn(), GEMINI_MODELS: {} }));

import { jobMatchText, seekerMatchText, MATCH_TEXT_MAX } from "@/lib/matching/matchText";

beforeEach(() => {
  delete process.env.OPENROUTER_EMBEDDING_MODEL;
});

describe("seekerMatchText", () => {
  it("leads with the target role, then skills, experience and summary", () => {
    const { text } = seekerMatchText({
      preferredRoles: ["Frontend Developer"],
      headline: "React engineer",
      skills: ["React", "TypeScript"],
      experience: [{ jobTitle: "Developer", company: "Acme" }],
      totalExperienceYears: 5,
      industry: "Software",
      certifications: ["AWS CCP"],
      summary: "<p>Builds <b>dashboards</b>.</p>",
    });
    expect(text).toBe(
      [
        "Target role: Frontend Developer",
        "Headline: React engineer",
        "Skills: React, TypeScript",
        "Experience: Developer at Acme",
        "Years of experience: 5",
        "Industry: Software",
        "Certifications: AWS CCP",
        "Summary: Builds dashboards .",
      ].join("\n"),
    );
  });

  it("falls back to the onboarding job role when no preferred roles are set", () => {
    expect(seekerMatchText({ careerProfile: { jobRole: "Accountant" } }).text).toBe("Target role: Accountant");
  });

  it("gives an empty text for an empty profile", () => {
    expect(seekerMatchText({ totalExperienceYears: 0 }).text).toBe("");
  });
});

describe("jobMatchText", () => {
  it("uses the stated skills, the experience range and the plain description", () => {
    const { text } = jobMatchText({
      title: "Frontend Developer",
      category: "IT",
      description: "<p>Build our UI.</p>",
      requirements: { skills: ["React"], preferredSkills: ["GraphQL"], experienceMin: 3, experienceMax: 6 },
    });
    expect(text).toBe(
      [
        "Role: Frontend Developer",
        "Category: IT",
        "Skills: React",
        "Preferred skills: GraphQL",
        "Years of experience: 3-6",
        "Description: Build our UI.",
      ].join("\n"),
    );
  });

  it("falls back to AI-extracted skills when the employer typed none", () => {
    const { text } = jobMatchText({ title: "Clerk", requirements: { skills: [], aiSkills: ["Excel"], experienceMin: 0, experienceMax: 30 } });
    expect(text).toBe("Role: Clerk\nSkills: Excel");
  });

  it("caps the text so a long description can't crowd out the rest", () => {
    const { text } = jobMatchText({ title: "T", description: "x ".repeat(5000) });
    expect(text.length).toBe(MATCH_TEXT_MAX);
    expect(text.startsWith("Role: T\nDescription: x x")).toBe(true);
  });
});

describe("match text hash", () => {
  it("is stable for the same text and changes with the text or the model", () => {
    const a = seekerMatchText({ skills: ["React"] }).hash;
    expect(seekerMatchText({ skills: ["React"] }).hash).toBe(a);
    expect(seekerMatchText({ skills: ["Vue"] }).hash).not.toBe(a);
    process.env.OPENROUTER_EMBEDDING_MODEL = "other/embedder";
    expect(seekerMatchText({ skills: ["React"] }).hash).not.toBe(a);
  });
});
