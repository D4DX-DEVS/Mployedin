/* ── The CV built on Mployedin, as a file an application can carry ──
   The builder keeps no file: a built CV is the profile plus the saved design
   (`cvDesign`). To send one with an application it is rendered to PDF and
   stored once as a resume document marked with `builtHash`; the same file is
   reused until the CV changes, so applying twice neither fills the documents
   list nor pays for a second AI reading of the same CV.

   Nothing here loads react-pdf until a PDF is actually made. */

import { createElement } from "react";
import type { CVForm, FormattingOptions, LanguageSkill } from "./types";
import { getVisibleForm, restoreCvDesign } from "./types";
import type { CVPDFLabels } from "./pdf/shared";
import { plainTextToHtml } from "./rich-text";
import { cleanSocialLinks, type ProfileLink } from "@/lib/jobSeeker/socialLinks";
import { cleanSkills } from "@/lib/jobSeeker/tagList";
import { csrfFetch } from "@/lib/security/csrf-client";

// The apply dialogs' key for "send the CV I built here" lives with the other
// CV choices; re-exported for the callers that already import it from here.
export { BUILT_CV_KEY } from "@/lib/applications/cvChoice";

export const EMPTY_CV_FORM: CVForm = {
  fullName: "", email: "", phone: "", nationality: "", currentLocation: "",
  headline: "", photo: "", linkedin: "", portfolio: "", additionalLinks: [],
  skills: [], experience: [], education: [], languages: [], certifications: [], projects: [],
};

/** The parts of GET /api/job-seeker/profile the CV is made from. */
export interface SeekerProfileData {
  phone?: string | null;
  nationality?: string | null;
  currentLocation?: string | null;
  summary?: string | null;
  avatar?: string | null;
  socialLinks?: unknown;
  skills?: unknown[];
  experience?: Record<string, unknown>[];
  education?: Record<string, unknown>[];
  languages?: Record<string, unknown>[];
  certifications?: string[];
  projects?: Record<string, unknown>[];
  cvDesign?: unknown;
}

/** Sort profile links into the builder's LinkedIn / Portfolio / other fields. */
export function splitProfileLinks(links: ProfileLink[]) {
  const labelled = (l: ProfileLink, names: string[]) => names.includes(l.label.toLowerCase());
  return {
    linkedin: links.find((l) => labelled(l, ["linkedin"]))?.url,
    portfolio: links.find((l) => labelled(l, ["portfolio", "website"]))?.url,
    additional: links.filter((l) => !labelled(l, ["linkedin", "portfolio", "website"])),
  };
}

const monthOf = (value: unknown): string => (value ? new Date(value as string).toISOString().slice(0, 7) : "");
const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The builder's form filled from the profile. Whatever the profile has no
 * value for keeps what `prev` held (the name and email come from the session).
 */
export function cvFormFromProfile(profile: SeekerProfileData, prev: CVForm): CVForm {
  // Older CV imports stored a link's text as its address ("LinkedIn");
  // sent back on save, one of those failed the whole save.
  const links = splitProfileLinks(cleanSocialLinks(profile.socialLinks));
  return {
    ...prev,
    phone: profile.phone ?? prev.phone,
    nationality: profile.nationality ?? prev.nationality,
    currentLocation: profile.currentLocation ?? prev.currentLocation,
    headline: profile.summary ?? prev.headline,
    photo: profile.avatar ?? prev.photo,
    linkedin: links.linkedin ?? prev.linkedin,
    portfolio: links.portfolio ?? prev.portfolio,
    additionalLinks: links.additional.length ? links.additional : prev.additionalLinks,
    // Imported profiles joined whole skill lists into one over-long entry.
    skills: profile.skills?.length ? cleanSkills(profile.skills) : prev.skills,
    experience: profile.experience?.length
      ? profile.experience.map((e) => ({
          jobTitle: text(e.jobTitle),
          company: text(e.company),
          country: text(e.country),
          startDate: monthOf(e.startDate),
          endDate: monthOf(e.endDate),
          isCurrent: e.isCurrent === true,
          description: plainTextToHtml(text(e.description)),
        }))
      : prev.experience,
    education: profile.education?.length
      ? profile.education.map((e) => ({
          degree: text(e.degree),
          institution: text(e.institution),
          field: text(e.field),
          graduationDate: monthOf(e.graduationDate),
          grade: text(e.grade),
        }))
      : prev.education,
    languages: profile.languages?.length
      ? profile.languages.map((l) => ({
          language: text(l.language),
          proficiency: (l.proficiency as LanguageSkill["proficiency"]) ?? "conversational",
        }))
      : prev.languages,
    certifications: profile.certifications?.length ? profile.certifications : prev.certifications,
    projects: profile.projects?.length
      ? profile.projects.map((p) => ({
          title: text(p.title),
          description: plainTextToHtml(text(p.description)),
          techStack: Array.isArray(p.techStack) ? (p.techStack as string[]) : [],
          projectUrl: text(p.projectUrl),
          repoUrl: text(p.repoUrl),
        }))
      : prev.projects,
  };
}

export interface BuiltCvRenderInput {
  data: CVForm;
  templateId: string;
  formatting: FormattingOptions;
  labels: CVPDFLabels;
}

/* cyrb53: a change detector, not a security hash — it only answers "is this
   the CV the stored file was made from?". */
function hashText(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Identifies one rendering of the CV: its content, template, formatting and labels. */
export function builtCvHash(input: {
  data: CVForm;
  templateId: string;
  formatting: unknown;
  labels: unknown;
}): string {
  // A signed photo link gets a new signature on every read; the photo is the same.
  const data = { ...input.data, photo: input.data.photo.split("?")[0] };
  return hashText(JSON.stringify({ data, templateId: input.templateId, formatting: input.formatting, labels: input.labels }));
}

export interface BuiltCvDocument {
  id: string;
  name: string;
  category: string;
  url: string;
  /** Set on the stored copy of the built CV; absent on the seeker's own uploads. */
  builtHash?: string;
}

export interface BuiltCvIdentity {
  fullName: string;
  email: string;
  photo: string;
}

/** `message` is the server's own reason (an upload limit, say) when it gave one. */
export class BuiltCvError extends Error {
  constructor(message = "") {
    super(message);
    this.name = "BuiltCvError";
  }
}

export interface BuiltCvDeps {
  loadProfile: () => Promise<SeekerProfileData | null>;
  /** The seeker's documents as they are now; null when they cannot be read. */
  loadDocuments: () => Promise<BuiltCvDocument[] | null>;
  renderPdf: (input: BuiltCvRenderInput) => Promise<Blob>;
  upload: (file: File, builtHash: string) => Promise<BuiltCvDocument>;
}

async function loadProfile(): Promise<SeekerProfileData | null> {
  const res = await fetch("/api/job-seeker/profile", { cache: "no-store" });
  if (!res.ok) throw new BuiltCvError();
  if (res.status === 204) return null;
  return (await res.json()) as SeekerProfileData;
}

async function loadDocuments(): Promise<BuiltCvDocument[] | null> {
  try {
    const res = await fetch("/api/job-seeker/me", { cache: "no-store" });
    if (!res.ok) return null;
    const documents = (await res.json())?.jobSeeker?.documents;
    return Array.isArray(documents) ? (documents as BuiltCvDocument[]) : null;
  } catch {
    return null;
  }
}

async function renderPdf(input: BuiltCvRenderInput): Promise<Blob> {
  const [{ pdf }, { CVPDFDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./cv-pdf-document"),
  ]);
  // CVPDFDocument returns react-pdf's <Document>; `pdf` is typed for that
  // element itself, not for a component wrapping it (JSX hid this in the builder).
  const document = createElement(CVPDFDocument, input) as unknown as Parameters<typeof pdf>[0];
  return pdf(document).toBlob();
}

async function upload(file: File, builtHash: string): Promise<BuiltCvDocument> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", "resume");
  fd.append("builtHash", builtHash);
  const res = await csrfFetch("/api/job-seeker/documents", { method: "POST", body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.document) throw new BuiltCvError(typeof data?.error === "string" ? data.error : "");
  const { id, name, category, url } = data.document as BuiltCvDocument;
  return { id, name, category, url, builtHash };
}

const DEFAULT_DEPS: BuiltCvDeps = { loadProfile, loadDocuments, renderPdf, upload };

/**
 * The resume document holding the seeker's built CV as it is now: the stored
 * one when the CV has not changed since, otherwise a fresh PDF stored in its
 * place. Rejects with BuiltCvError when it cannot be made or stored.
 */
export async function ensureBuiltCvDocument(
  options: { identity: BuiltCvIdentity; labels: CVPDFLabels; documents: BuiltCvDocument[] },
  deps: Partial<BuiltCvDeps> = {},
): Promise<BuiltCvDocument> {
  const { loadProfile: load, loadDocuments: list, renderPdf: render, upload: store } = { ...DEFAULT_DEPS, ...deps };

  // The documents are read again rather than taken from the dialog: its list
  // dates from when it opened, and a copy deleted or replaced since (another
  // tab) must not be reused — the application would go out without it.
  const [profile, current] = await Promise.all([load(), list()]);
  if (!profile) throw new BuiltCvError();
  const documents = current ?? options.documents;

  const design = restoreCvDesign(profile.cvDesign);
  const form = cvFormFromProfile(profile, { ...EMPTY_CV_FORM, ...options.identity });
  const input: BuiltCvRenderInput = {
    data: getVisibleForm(form, design.hiddenSections),
    templateId: design.templateId,
    formatting: design.formatting,
    labels: options.labels,
  };

  const hash = builtCvHash(input);
  const stored = documents.find((d) => d.builtHash === hash);
  if (stored) return stored;

  let blob: Blob;
  try {
    blob = await render(input);
  } catch {
    throw new BuiltCvError();
  }
  const owner = options.identity.fullName.replace(/[\\/:*?"<>|]/g, " ").trim();
  const file = new File([blob], `${owner || "CV"} - Mployedin CV.pdf`, { type: "application/pdf" });
  return store(file, hash);
}
