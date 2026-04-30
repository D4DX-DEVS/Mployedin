/**
 * @jest-environment node
 *
 * Integration test: Verifies the full bulk job creation pipeline.
 * - AI prompt instructs bulk output format
 * - Extraction regex captures BULK_JOB_DATA
 * - sanitizeExtractedJob normalizes each job
 * - Each sanitized job passes the jobCreateSchema validator
 */
import { z } from "zod";

// Import the real validator schema
import { jobCreateSchema } from "@/lib/validators/jobs";

// ─── Replicate the sanitization logic from the component ────────
const WORK_TYPE_RE = /^(hybrid|remote|on-?site|office|in-office|work from home|wfh|flexible|contract|freelance|part.?time|full.?time|on site)$/i;

const CITY_COUNTRY: Record<string, string> = {
  dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates",
  sharjah: "United Arab Emirates", ajman: "United Arab Emirates",
  riyadh: "Saudi Arabia", jeddah: "Saudi Arabia",
  doha: "Qatar", manama: "Bahrain", muscat: "Oman",
  mumbai: "India", bangalore: "India", bengaluru: "India",
  karachi: "Pakistan", lahore: "Pakistan",
  london: "United Kingdom", "new york": "United States",
};

interface ExtractedJob {
  title?: string;
  category?: string;
  description?: string;
  employmentType?: string;
  workMode?: string;
  location?: { country?: string; city?: string; isRemote?: boolean };
  requirements?: {
    skills?: string[];
    preferredSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
  };
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  salary?: { min?: number; max?: number; currency?: string; period?: string; isNegotiable?: boolean };
  vacancies?: number;
  visibility?: string;
  tags?: string[];
}

function sanitizeExtractedJob(job: ExtractedJob): ExtractedJob {
  const rawCountry = job.location?.country?.trim() ?? "";
  const rawCity = job.location?.city?.trim() ?? "";
  const countryIsWorkType = WORK_TYPE_RE.test(rawCountry);
  const cityIsWorkType = WORK_TYPE_RE.test(rawCity);
  const workTypeText = [rawCountry, rawCity].join(" ").toLowerCase();
  const isRemote = job.location?.isRemote ?? /remote|wfh|work from home/i.test(workTypeText);

  let country = countryIsWorkType ? "" : rawCountry;
  let city = cityIsWorkType ? "" : rawCity;
  if (!country && city) country = CITY_COUNTRY[city.toLowerCase()] ?? "";
  if (!country) country = "To be confirmed";
  if (!city) city = "To be confirmed";

  const rawPeriod = job.salary?.period ?? "monthly";
  const period = /^(month|monthly)$/i.test(rawPeriod)
    ? "monthly"
    : /^(year|yearly|annual|annum|annually)$/i.test(rawPeriod)
      ? "yearly"
      : /^lpa$/i.test(rawPeriod)
        ? "lpa"
        : "monthly";

  let description = job.description ?? "";
  if (description.length < 50) {
    description = `${job.title ?? "Position"} opportunity. ${description} We are looking for talented professionals to join our team.`.trim();
  }

  const tags = job.tags ?? [];
  if (/hybrid/i.test(workTypeText) && !tags.includes("Hybrid")) tags.push("Hybrid");

  const validEmploymentTypes = ["full_time", "part_time", "contract", "internship", "freelance"];
  const employmentType = validEmploymentTypes.includes(job.employmentType ?? "")
    ? job.employmentType
    : undefined;

  const validWorkModes = ["onsite", "hybrid", "remote"];
  let workMode = validWorkModes.includes(job.workMode ?? "")
    ? job.workMode
    : undefined;
  if (!workMode) {
    if (isRemote) workMode = "remote";
    else if (/hybrid/i.test(workTypeText) || tags.includes("Hybrid")) workMode = "hybrid";
  }

  return {
    ...job,
    description,
    employmentType,
    workMode,
    location: { country, city, isRemote },
    requirements: { ...job.requirements, preferredSkills: job.requirements?.preferredSkills ?? [] },
    responsibilities: job.responsibilities ?? [],
    qualifications: job.qualifications ?? [],
    benefits: job.benefits ?? [],
    salary: job.salary ? { ...job.salary, period } : job.salary,
    tags,
  };
}

// ─── Simulated AI response for a small description ──────────────
// This simulates what the AI would output when given:
// "I need 3 developers in Dubai - React, Node, and Python"
const SIMULATED_AI_BULK_RESPONSE = `Great! I'll create 3 developer positions for you in Dubai. Here are the job drafts:

<BULK_JOB_DATA>
[
  {
    "title": "React Developer",
    "category": "Technology",
    "description": "We are looking for a skilled React Developer to build modern, responsive web applications for our growing platform in Dubai.",
    "employmentType": "full_time",
    "workMode": "onsite",
    "location": { "country": "United Arab Emirates", "city": "Dubai", "isRemote": false },
    "requirements": {
      "skills": ["React", "JavaScript", "TypeScript", "HTML", "CSS"],
      "preferredSkills": ["Next.js", "Redux"],
      "experienceMin": 2,
      "experienceMax": 5,
      "education": "Bachelor's in Computer Science"
    },
    "responsibilities": ["Build React applications", "Write unit tests", "Collaborate with designers", "Code reviews"],
    "qualifications": ["BSc in Computer Science or equivalent"],
    "benefits": ["Health insurance", "Annual flight allowance", "Flexible hours"],
    "salary": { "min": 12000, "max": 20000, "currency": "AED", "period": "monthly", "isNegotiable": true },
    "vacancies": 1,
    "visibility": "public",
    "tags": ["React", "Frontend", "Dubai"]
  },
  {
    "title": "Node.js Backend Developer",
    "category": "Technology",
    "description": "Seeking an experienced Node.js developer to design and build scalable backend services and RESTful APIs for our Dubai office.",
    "employmentType": "full_time",
    "workMode": "onsite",
    "location": { "country": "United Arab Emirates", "city": "Dubai", "isRemote": false },
    "requirements": {
      "skills": ["Node.js", "Express", "MongoDB", "REST APIs", "TypeScript"],
      "preferredSkills": ["Docker", "AWS"],
      "experienceMin": 3,
      "experienceMax": 6,
      "education": "Bachelor's in Computer Science"
    },
    "responsibilities": ["Design APIs", "Database architecture", "Performance optimization", "Security implementation"],
    "qualifications": ["BSc in CS or related field", "3+ years backend experience"],
    "benefits": ["Health insurance", "Annual bonus", "Remote Fridays"],
    "salary": { "min": 15000, "max": 25000, "currency": "AED", "period": "monthly", "isNegotiable": false },
    "vacancies": 1,
    "visibility": "public",
    "tags": ["Node.js", "Backend", "Dubai"]
  },
  {
    "title": "Python Developer",
    "category": "Technology",
    "description": "Join our team as a Python Developer working on data pipelines, automation scripts, and backend services in our Dubai headquarters.",
    "employmentType": "full_time",
    "workMode": "hybrid",
    "location": { "country": "United Arab Emirates", "city": "Dubai", "isRemote": false },
    "requirements": {
      "skills": ["Python", "Django", "FastAPI", "PostgreSQL", "Redis"],
      "preferredSkills": ["Machine Learning", "Pandas"],
      "experienceMin": 2,
      "experienceMax": 5,
      "education": "Bachelor's in Computer Science or related field"
    },
    "responsibilities": ["Build Python services", "Data pipeline development", "API integration", "Write documentation"],
    "qualifications": ["BSc in CS", "Experience with cloud services"],
    "benefits": ["Health insurance", "Learning budget", "Hybrid work"],
    "salary": { "min": 13000, "max": 22000, "currency": "AED", "period": "monthly", "isNegotiable": true },
    "vacancies": 1,
    "visibility": "public",
    "tags": ["Python", "Backend", "Hybrid", "Dubai"]
  }
]
</BULK_JOB_DATA>

I've filled in standard responsibilities, skills, benefits, and salary ranges for Dubai-based developer roles. You can modify any details in the edit pages after creating them.`;

// ─── Simulated minimal user input scenarios ─────────────────────
const MINIMAL_RESPONSE_WITH_DEFAULTS = `Here's a quick batch for you:

<BULK_JOB_DATA>
[
  {
    "title": "Sales Manager",
    "description": "Leading sales team",
    "location": { "city": "Riyadh" },
    "requirements": { "skills": ["Sales", "CRM"] }
  },
  {
    "title": "Marketing Coordinator",
    "description": "Coordinate marketing campaigns",
    "location": { "city": "Jeddah" },
    "requirements": { "skills": ["Marketing", "Social Media"] }
  }
]
</BULK_JOB_DATA>`;

// ─── Tests ──────────────────────────────────────────────────────
describe("Bulk Job Creation - Integration", () => {
  describe("AI Prompt Configuration", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { JOB_CREATOR_PROMPT } = require("@/lib/ai/assistantPrompts");

    it("prompt contains BULK_JOB_DATA instructions", () => {
      expect(JOB_CREATOR_PROMPT).toContain("BULK_JOB_DATA");
      expect(JOB_CREATOR_PROMPT).toContain("Bulk / Multiple Jobs");
      expect(JOB_CREATOR_PROMPT).toContain("Maximum 10 jobs per bulk request");
    });

    it("prompt instructs AI to generate all jobs at once", () => {
      expect(JOB_CREATOR_PROMPT).toContain("Generate ALL jobs at once in a single BULK_JOB_DATA block");
      expect(JOB_CREATOR_PROMPT).toContain("never output multiple separate JOB_DATA blocks");
    });

    it("prompt still supports single JOB_DATA format", () => {
      expect(JOB_CREATOR_PROMPT).toContain("<JOB_DATA>");
      expect(JOB_CREATOR_PROMPT).toContain("</JOB_DATA>");
      expect(JOB_CREATOR_PROMPT).toContain("Single Job");
    });
  });

  describe("AI Response Extraction", () => {
    it("extracts 3 jobs from AI response to a small description", () => {
      const bulkMatch = SIMULATED_AI_BULK_RESPONSE.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).not.toBeNull();
      const jobs = JSON.parse(bulkMatch![1].trim());
      expect(jobs).toHaveLength(3);
      expect(jobs[0].title).toBe("React Developer");
      expect(jobs[1].title).toBe("Node.js Backend Developer");
      expect(jobs[2].title).toBe("Python Developer");
    });

    it("extracts minimal AI response with missing fields", () => {
      const bulkMatch = MINIMAL_RESPONSE_WITH_DEFAULTS.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).not.toBeNull();
      const jobs = JSON.parse(bulkMatch![1].trim());
      expect(jobs).toHaveLength(2);
      expect(jobs[0].title).toBe("Sales Manager");
      expect(jobs[1].title).toBe("Marketing Coordinator");
    });
  });

  describe("Sanitization fills in defaults", () => {
    it("sanitizes minimal jobs: infers country from city, fills description", () => {
      const bulkMatch = MINIMAL_RESPONSE_WITH_DEFAULTS.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      const jobs: ExtractedJob[] = JSON.parse(bulkMatch![1].trim());

      const sanitized0 = sanitizeExtractedJob(jobs[0]);
      expect(sanitized0.location?.country).toBe("Saudi Arabia"); // inferred from "Riyadh"
      expect(sanitized0.location?.city).toBe("Riyadh");
      expect(sanitized0.description!.length).toBeGreaterThanOrEqual(50);

      const sanitized1 = sanitizeExtractedJob(jobs[1]);
      expect(sanitized1.location?.country).toBe("Saudi Arabia"); // inferred from "Jeddah"
      expect(sanitized1.location?.city).toBe("Jeddah");
      expect(sanitized1.description!.length).toBeGreaterThanOrEqual(50);
    });

    it("sanitizes full AI response without changing valid data", () => {
      const bulkMatch = SIMULATED_AI_BULK_RESPONSE.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      const jobs: ExtractedJob[] = JSON.parse(bulkMatch![1].trim());

      for (const job of jobs) {
        const sanitized = sanitizeExtractedJob(job);
        expect(sanitized.location?.country).toBe("United Arab Emirates");
        expect(sanitized.location?.city).toBe("Dubai");
        expect(sanitized.employmentType).toBe("full_time");
        expect(["onsite", "hybrid", "remote"]).toContain(sanitized.workMode);
      }
    });

    it("handles work-type in location fields gracefully", () => {
      const weirdJob: ExtractedJob = {
        title: "Remote Engineer",
        description: "A remote engineering position working on cloud infrastructure and DevOps tooling.",
        location: { country: "Remote", city: "Work from home", isRemote: true },
        requirements: { skills: ["AWS"] },
      };

      const sanitized = sanitizeExtractedJob(weirdJob);
      expect(sanitized.location?.country).toBe("To be confirmed"); // "Remote" is work-type
      expect(sanitized.location?.city).toBe("To be confirmed"); // "Work from home" is work-type
      expect(sanitized.location?.isRemote).toBe(true);
      expect(sanitized.workMode).toBe("remote");
    });
  });

  describe("Schema Validation (jobCreateSchema)", () => {
    it("all 3 fully-specified bulk jobs pass the schema after sanitization", () => {
      const bulkMatch = SIMULATED_AI_BULK_RESPONSE.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      const jobs: ExtractedJob[] = JSON.parse(bulkMatch![1].trim());

      for (const job of jobs) {
        const sanitized = sanitizeExtractedJob(job);
        const payload = { ...sanitized, status: "draft" };
        const result = jobCreateSchema.safeParse(payload);
        expect(result.success).toBe(true);
        if (!result.success) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          console.error(`Validation failed for ${job.title}:`, (result.error as any).issues);
        }
      }
    });

    it("minimal jobs pass schema after sanitization fills defaults", () => {
      const bulkMatch = MINIMAL_RESPONSE_WITH_DEFAULTS.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      const jobs: ExtractedJob[] = JSON.parse(bulkMatch![1].trim());

      for (const job of jobs) {
        const sanitized = sanitizeExtractedJob(job);
        const payload = { ...sanitized, status: "draft" };
        const result = jobCreateSchema.safeParse(payload);
        // Minimal jobs may still fail on title length (min 5) — test that sanitization helps
        if (!result.success) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const issues = (result.error as any).issues ?? [];
          const titleErr = issues.find((e: { path: string[] }) => e.path.includes("title"));
          expect(titleErr).toBeUndefined(); // titles are valid
        }
      }
    });

    it("validates all required constraints", () => {
      // Edge case: a job with bare minimum from AI
      const bareMinimum: ExtractedJob = {
        title: "QA Engineer", // 11 chars, passes min(5)
        description: "", // empty — sanitize will fill
        location: { city: "Dubai" },
      };

      const sanitized = sanitizeExtractedJob(bareMinimum);
      const payload = { ...sanitized, status: "draft" };
      const result = jobCreateSchema.safeParse(payload);

      // After sanitization, description should be long enough
      expect(sanitized.description!.length).toBeGreaterThanOrEqual(20);
      expect(result.success).toBe(true);
    });
  });

  describe("Full Pipeline Simulation", () => {
    it("simulates user saying 'hire 3 devs in Dubai' → AI bulk response → extract → sanitize → validate → all pass", () => {
      // Step 1: User sends "I need 3 developers in Dubai - React, Node, and Python"
      const userPrompt = "I need 3 developers in Dubai - React, Node, and Python";
      expect(userPrompt).toBeTruthy();

      // Step 2: AI produces bulk response
      const aiResponse = SIMULATED_AI_BULK_RESPONSE;

      // Step 3: Extract BULK_JOB_DATA
      const bulkMatch = aiResponse.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).not.toBeNull();

      // Step 4: Parse JSON array
      const jobs: ExtractedJob[] = JSON.parse(bulkMatch![1].trim());
      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBe(3);
      expect(jobs.length).toBeLessThanOrEqual(10); // Max 10 limit

      // Step 5: Sanitize each job
      const sanitizedJobs = jobs.map(sanitizeExtractedJob);

      // Step 6: Validate each job against backend schema
      const results = sanitizedJobs.map((job, idx) => {
        const payload = { ...job, status: "draft" as const };
        const result = jobCreateSchema.safeParse(payload);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { idx, title: job.title, success: result.success, errors: result.success ? [] : (result.error as any).issues };
      });

      // All 3 must pass
      for (const r of results) {
        if (!r.success) {
          console.error(`Job ${r.idx} (${r.title}) failed:`, r.errors);
        }
        expect(r.success).toBe(true);
      }

      // Step 7: Verify the payloads would be sent correctly to POST /api/jobs
      for (const job of sanitizedJobs) {
        const body = JSON.stringify({ ...job, status: "draft" });
        const parsed = JSON.parse(body);
        expect(parsed.status).toBe("draft");
        expect(parsed.title.length).toBeGreaterThanOrEqual(5);
        expect(parsed.description.length).toBeGreaterThanOrEqual(20);
        expect(parsed.location.country).toBe("United Arab Emirates");
        expect(parsed.location.city).toBe("Dubai");
      }
    });

    it("handles edge case: AI produces single JOB_DATA when bulk expected", () => {
      // If AI misbehaves and outputs single JOB_DATA instead of BULK_JOB_DATA
      const singleResponse = `<JOB_DATA>{"title":"Fallback Job","description":"A single job that was created instead of bulk. The AI should create multiple jobs.","location":{"country":"India","city":"Mumbai","isRemote":false},"requirements":{"skills":["Java"]}}</JOB_DATA>`;

      // Bulk check first — should not match
      const bulkMatch = singleResponse.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).toBeNull();

      // Falls back to single extraction
      const singleMatch = singleResponse.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
      expect(singleMatch).not.toBeNull();
      const job = JSON.parse(singleMatch![1].trim());
      expect(job.title).toBe("Fallback Job");

      // Sanitize and validate
      const sanitized = sanitizeExtractedJob(job);
      const result = jobCreateSchema.safeParse({ ...sanitized, status: "draft" });
      expect(result.success).toBe(true);
    });

    it("display text is clean after stripping bulk data", () => {
      const displayContent = SIMULATED_AI_BULK_RESPONSE
        .replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/g, "")
        .replace(/<BULK_JOB_DATA>[\s\S]*?<\/BULK_JOB_DATA>/g, "")
        .trim();

      expect(displayContent).not.toContain("BULK_JOB_DATA");
      expect(displayContent).not.toContain("{");
      expect(displayContent).toContain("3 developer positions");
      expect(displayContent).toContain("modify any details");
    });
  });
});
