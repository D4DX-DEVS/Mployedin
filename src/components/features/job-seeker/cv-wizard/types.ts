/* Shapes of the guided CV builder (onboarding, for seekers with no CV file). */

export type LanguageLevel = "basic" | "conversational" | "professional" | "native";

/** A job, or a project / internship / activity. */
export interface BuiltJob {
  title: string;
  organisation: string;
  start: string; // YYYY-MM
  end: string; // YYYY-MM, "" while current
  current: boolean;
  description: string;
}

export interface BuiltEducation {
  /** A QUALIFICATION_OPTIONS value ("graduation"). */
  level: string;
  course: string;
  field: string;
  institution: string;
  startYear: string;
  endYear: string;
  studying: boolean;
  grade: string;
}

export interface BuiltCertificate {
  name: string;
  issuer: string;
  year: string;
}

export interface BuiltLink {
  label: string;
  url: string;
}

export interface SpokenLanguage {
  language: string;
  proficiency: LanguageLevel;
}

export interface CvBuilderResult {
  targetRole: string;
  fresher: boolean;
  jobs: BuiltJob[];
  projects: BuiltJob[];
  education: BuiltEducation[];
  skills: string[];
  languages: SpokenLanguage[];
  certificates: BuiltCertificate[];
  linkedin: string;
  portfolio: string;
  otherLinks: BuiltLink[];
  summary: string;
  templateId: string;
}

/** Who the CV is for — from the account and onboarding's first step. */
export interface CvIdentity {
  name: string;
  email: string;
  phone: string;
  location: string;
  photo: string;
}

export const emptyJob = (): BuiltJob => ({ title: "", organisation: "", start: "", end: "", current: false, description: "" });
export const emptyEducation = (): BuiltEducation => ({ level: "", course: "", field: "", institution: "", startYear: "", endYear: "", studying: false, grade: "" });
export const emptyCertificate = (): BuiltCertificate => ({ name: "", issuer: "", year: "" });
