import type { CvAssistantChanges } from "@/lib/ai/cvAssistant";
import type { AiCvAssistantInput } from "@/lib/validators/ai";
import { htmlToPlainText, plainTextToHtml } from "./rich-text";
import type { CVForm } from "./types";

/** What the assistant sees: wording and facts, never contact details or the photo. */
export function toAssistantCv(form: CVForm): AiCvAssistantInput["cv"] {
  return {
    summary: form.headline.slice(0, 1000),
    skills: form.skills.slice(0, 50),
    experience: form.experience.slice(0, 20).map((e) => ({
      jobTitle: e.jobTitle,
      company: e.company,
      startDate: e.startDate,
      endDate: e.endDate,
      isCurrent: e.isCurrent,
      description: htmlToPlainText(e.description).slice(0, 4000),
    })),
    projects: form.projects.slice(0, 15).map((p) => ({
      title: p.title,
      description: htmlToPlainText(p.description).slice(0, 4000),
      techStack: p.techStack.slice(0, 20),
    })),
    education: form.education.slice(0, 10).map((e) => ({ degree: e.degree, institution: e.institution, field: e.field })),
    certifications: form.certifications.slice(0, 30),
  };
}

/**
 * Undo one applied turn: only the fields that turn changed go back to their
 * earlier values, so edits made by hand since then survive.
 */
export function revertCvChanges(current: CVForm, before: CVForm, changes: CvAssistantChanges): CVForm {
  const revertAt = <T,>(list: T[], prior: T[], indices: number[] | undefined): T[] =>
    list.map((item, i) => (indices?.includes(i) && prior[i] ? prior[i] : item));
  return {
    ...current,
    headline: changes.summary !== undefined ? before.headline : current.headline,
    skills: changes.skills ? before.skills : current.skills,
    experience: revertAt(current.experience, before.experience, changes.experience?.map((c) => c.index)),
    projects: revertAt(current.projects, before.projects, changes.projects?.map((c) => c.index)),
  };
}

/** The form with the assistant's proposal applied; descriptions go back as resume HTML. */
export function applyCvChanges(form: CVForm, changes: CvAssistantChanges): CVForm {
  const experience = form.experience.map((e, i) => {
    const change = changes.experience?.find((c) => c.index === i);
    return change ? { ...e, description: plainTextToHtml(change.description) } : e;
  });
  const projects = form.projects.map((p, i) => {
    const change = changes.projects?.find((c) => c.index === i);
    return change ? { ...p, description: plainTextToHtml(change.description) } : p;
  });
  return {
    ...form,
    headline: changes.summary ?? form.headline,
    skills: changes.skills ?? form.skills,
    experience,
    projects,
  };
}
