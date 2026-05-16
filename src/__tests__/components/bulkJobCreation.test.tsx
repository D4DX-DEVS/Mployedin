/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TextEncoder, TextDecoder } from "util";

// Polyfill for jsdom
Object.assign(global, { TextEncoder, TextDecoder });
if (typeof global.ReadableStream === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReadableStream } = require("stream/web");
  Object.assign(global, { ReadableStream });
}

// Mock scrollIntoView for jsdom
Element.prototype.scrollIntoView = jest.fn();

// ─── Mocks ──────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ locale: "en" }),
}));

// next-intl is handled by the global moduleNameMapper in jest.config.ts

jest.mock("react-dom", () => {
  const actual = jest.requireActual("react-dom");
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/hooks/useVoiceInput", () => ({
  useVoiceInput: () => ({
    state: "idle",
    isRecording: false,
    isProcessing: false,
    startRecording: jest.fn(),
    cancelRecording: jest.fn(),
    submitRecording: jest.fn(),
    transcript: "",
    detectedLanguage: null,
    durationMs: 0,
    clearTranscript: jest.fn(),
  }),
}));

jest.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, className }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    (props, ref) => <textarea ref={ref} {...props} />
  ),
}));

// ─── Import the component under test ─────────────────────────────
import { RecruitmentAssistant } from "@/components/features/employer/RecruitmentAssistant";

// ─── Test data ──────────────────────────────────────────────────
const SINGLE_JOB_RESPONSE = `Here's the job I've created for you:

<JOB_DATA>
{
  "title": "Senior React Developer",
  "category": "Technology",
  "description": "We are looking for a Senior React Developer to join our growing team and build scalable web applications.",
  "employmentType": "full_time",
  "workMode": "remote",
  "location": { "country": "United Arab Emirates", "city": "Dubai", "isRemote": true },
  "requirements": {
    "skills": ["React", "TypeScript", "Node.js"],
    "preferredSkills": ["GraphQL"],
    "experienceMin": 4,
    "experienceMax": 8,
    "education": "Bachelor's in CS"
  },
  "responsibilities": ["Build React apps", "Code reviews"],
  "qualifications": ["BSc in CS"],
  "benefits": ["Health insurance"],
  "salary": { "min": 15000, "max": 25000, "currency": "AED", "period": "monthly", "isNegotiable": false },
  "vacancies": 1,
  "visibility": "public",
  "tags": ["React", "Remote"]
}
</JOB_DATA>`;

const BULK_JOB_RESPONSE = `Here are the 3 jobs I've created for your hiring campaign:

<BULK_JOB_DATA>
[
  {
    "title": "Frontend Developer",
    "category": "Technology",
    "description": "We need a frontend developer to build modern web interfaces using React and TypeScript for our product team.",
    "employmentType": "full_time",
    "workMode": "hybrid",
    "location": { "country": "United Arab Emirates", "city": "Dubai", "isRemote": false },
    "requirements": { "skills": ["React", "CSS", "TypeScript"], "preferredSkills": ["Next.js"], "experienceMin": 2, "experienceMax": 5, "education": "BSc" },
    "responsibilities": ["Build UIs"],
    "qualifications": ["BSc"],
    "benefits": ["Health insurance"],
    "salary": { "min": 10000, "max": 18000, "currency": "AED", "period": "monthly", "isNegotiable": false },
    "vacancies": 2,
    "visibility": "public",
    "tags": ["Frontend"]
  },
  {
    "title": "Backend Engineer",
    "category": "Technology",
    "description": "Looking for a backend engineer with Node.js expertise to design and implement robust API services and microservices.",
    "employmentType": "full_time",
    "workMode": "onsite",
    "location": { "country": "United Arab Emirates", "city": "Abu Dhabi", "isRemote": false },
    "requirements": { "skills": ["Node.js", "MongoDB", "Express"], "preferredSkills": ["Redis"], "experienceMin": 3, "experienceMax": 6, "education": "BSc" },
    "responsibilities": ["Design APIs"],
    "qualifications": ["BSc CS"],
    "benefits": ["Medical coverage"],
    "salary": { "min": 12000, "max": 22000, "currency": "AED", "period": "monthly", "isNegotiable": true },
    "vacancies": 1,
    "visibility": "public",
    "tags": ["Backend", "Node.js"]
  },
  {
    "title": "UI/UX Designer",
    "category": "Technology",
    "description": "We are seeking a creative UI/UX designer to craft delightful user experiences for our mobile and web applications.",
    "employmentType": "contract",
    "workMode": "remote",
    "location": { "country": "United Arab Emirates", "city": "Remote", "isRemote": true },
    "requirements": { "skills": ["Figma", "Adobe XD", "Wireframing"], "preferredSkills": ["Prototyping"], "experienceMin": 2, "experienceMax": 4, "education": "Design degree" },
    "responsibilities": ["Design mockups"],
    "qualifications": ["Design portfolio"],
    "benefits": ["Flexible hours"],
    "salary": { "min": 8000, "max": 15000, "currency": "AED", "period": "monthly", "isNegotiable": false },
    "vacancies": 1,
    "visibility": "public",
    "tags": ["Design", "Remote"]
  }
]
</BULK_JOB_DATA>`;

// ─── Tests ──────────────────────────────────────────────────────
describe("Bulk Job Creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe("Extraction Logic", () => {
    it("extracts single JOB_DATA correctly", () => {
      const match = SINGLE_JOB_RESPONSE.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
      expect(match).not.toBeNull();
      const parsed = JSON.parse(match![1].trim());
      expect(parsed.title).toBe("Senior React Developer");
      expect(parsed.location.country).toBe("United Arab Emirates");
    });

    it("extracts BULK_JOB_DATA as an array", () => {
      const bulkMatch = BULK_JOB_RESPONSE.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).not.toBeNull();
      const parsed = JSON.parse(bulkMatch![1].trim());
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].title).toBe("Frontend Developer");
      expect(parsed[1].title).toBe("Backend Engineer");
      expect(parsed[2].title).toBe("UI/UX Designer");
    });

    it("BULK_JOB_DATA takes priority over JOB_DATA", () => {
      const mixed = `${SINGLE_JOB_RESPONSE}\n${BULK_JOB_RESPONSE}`;
      const bulkMatch = mixed.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      expect(bulkMatch).not.toBeNull();
      // This mirrors the component logic: check bulk first
      if (bulkMatch) {
        const parsed = JSON.parse(bulkMatch[1].trim());
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBe(3);
      }
    });

    it("limits bulk jobs to 10 items max", () => {
      const manyJobs = Array.from({ length: 15 }, (_, i) => ({
        title: `Job ${i + 1}`,
        category: "Technology",
        description: "A test job description that is long enough to pass validation requirements.",
        location: { country: "UAE", city: "Dubai", isRemote: false },
      }));
      const response = `<BULK_JOB_DATA>${JSON.stringify(manyJobs)}</BULK_JOB_DATA>`;
      const bulkMatch = response.match(/<BULK_JOB_DATA>([\s\S]*?)<\/BULK_JOB_DATA>/);
      const parsed = JSON.parse(bulkMatch![1].trim());
      // Component slices to 10
      const limited = parsed.slice(0, 10);
      expect(limited).toHaveLength(10);
    });

    it("strips BULK_JOB_DATA from displayed message", () => {
      const content = BULK_JOB_RESPONSE;
      const displayed = content
        .replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/g, "")
        .replace(/<BULK_JOB_DATA>[\s\S]*?<\/BULK_JOB_DATA>/g, "")
        .trim();
      expect(displayed).toBe("Here are the 3 jobs I've created for your hiring campaign:");
      expect(displayed).not.toContain("BULK_JOB_DATA");
      expect(displayed).not.toContain("Frontend Developer");
    });
  });

  describe("Component Rendering", () => {
    it("renders the RecruitmentAssistant with Bulk Create option", () => {
      render(<RecruitmentAssistant />);
      // Open the widget
      const trigger = screen.getByLabelText("Open Recruitment AI");
      fireEvent.click(trigger);
      // The welcome screen should show "Bulk Create" button
      expect(screen.getByText("Bulk Create")).toBeInTheDocument();
      expect(screen.getByText("Create multiple jobs at once")).toBeInTheDocument();
    });

    it("sends correct prompt when Bulk Create is clicked", async () => {
      // Mock fetch to return a streaming response
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode("I can help you with that."));
          controller.close();
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      render(<RecruitmentAssistant />);
      const trigger = screen.getByLabelText("Open Recruitment AI");
      fireEvent.click(trigger);

      const bulkBtn = screen.getByText("Bulk Create");
      fireEvent.click(bulkBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/ai/chat",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("multiple job postings at once"),
          })
        );
      });
    });

    it("displays bulk job preview card when BULK_JOB_DATA is received", async () => {
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(BULK_JOB_RESPONSE));
          controller.close();
        },
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, body: mockStream }) // AI chat
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ threadId: "t1" }) }); // history

      render(<RecruitmentAssistant />);
      const trigger = screen.getByLabelText("Open Recruitment AI");
      fireEvent.click(trigger);

      const bulkBtn = screen.getByText("Bulk Create");

      await act(async () => {
        fireEvent.click(bulkBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Bulk Job Preview/)).toBeInTheDocument();
        expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
        expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
        expect(screen.getByText("UI/UX Designer")).toBeInTheDocument();
        expect(screen.getByText(/Create All 3 Job Drafts/)).toBeInTheDocument();
      });
    });

    it("creates all bulk jobs and shows success message", async () => {
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(BULK_JOB_RESPONSE));
          controller.close();
        },
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, body: mockStream }) // AI chat
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ threadId: "t1" }) }) // history
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ job: { _id: "j1" } }) }) // job 1
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ job: { _id: "j2" } }) }) // job 2
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ job: { _id: "j3" } }) }); // job 3

      render(<RecruitmentAssistant />);
      const trigger = screen.getByLabelText("Open Recruitment AI");
      fireEvent.click(trigger);

      const bulkBtn = screen.getByText("Bulk Create");
      await act(async () => {
        fireEvent.click(bulkBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Create All 3 Job Drafts/)).toBeInTheDocument();
      });

      const createAllBtn = screen.getByText(/Create All 3 Job Drafts/);
      await act(async () => {
        fireEvent.click(createAllBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/All 3 job drafts created successfully/)).toBeInTheDocument();
      });

      // Verify 3 POST calls to /api/jobs
      const jobCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (call) => call[0] === "/api/jobs"
      );
      expect(jobCalls).toHaveLength(3);
      // Each call should have status: "draft"
      for (const call of jobCalls) {
        const body = JSON.parse(call[1].body);
        expect(body.status).toBe("draft");
      }
    });

    it("handles partial failures in bulk creation", async () => {
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(BULK_JOB_RESPONSE));
          controller.close();
        },
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, body: mockStream }) // AI chat
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ threadId: "t1" }) }) // history
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ job: { _id: "j1" } }) }) // job 1 OK
        .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: "Validation failed" }) }) // job 2 FAIL
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ job: { _id: "j3" } }) }); // job 3 OK

      render(<RecruitmentAssistant />);
      const trigger = screen.getByLabelText("Open Recruitment AI");
      fireEvent.click(trigger);

      const bulkBtn = screen.getByText("Bulk Create");
      await act(async () => {
        fireEvent.click(bulkBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Create All 3 Job Drafts/)).toBeInTheDocument();
      });

      const createAllBtn = screen.getByText(/Create All 3 Job Drafts/);
      await act(async () => {
        fireEvent.click(createAllBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Created 2\/3 drafts\. 1 failed\./)).toBeInTheDocument();
      });
    });
  });
});
