/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import JobSeekerProfilePage from "@/app/[locale]/(dashboard)/job-seeker/profile/page";

const fetchMock = jest.fn();
const pushMock = jest.fn();
const replaceMock = jest.fn();
const updateSessionMock = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Jahfar Sadik",
        email: "jobseeker@mployedin.com",
        image: null,
      },
    },
    status: "authenticated",
    update: updateSessionMock,
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useParams: () => ({ locale: "en" }),
}));

jest.mock("@/components/shared/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actions}
    </div>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}));

jest.mock("@/components/ui/progress", () => ({
  Progress: ({ value }: { value?: number }) => <div aria-label="progress">{value ?? 0}</div>,
}));

jest.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  AvatarImage: ({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (src ? <img alt="" src={src} {...props} /> : null),
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}>{children}</label>,
}));

describe("JobSeekerProfilePage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    updateSessionMock.mockReset();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        userId: "user-1",
        nationality: "",
        dateOfBirth: "",
        currentLocation: "Malappuram Kerala",
        summary: "",
        headline: "Web developer",
        skills: [],
        experience: [],
        education: [],
        languages: [],
        certifications: [],
        linkedin: "",
        portfolio: "",
        socialLinks: [],
        profileCompleteness: 45,
        cvFileUrl: "",
        cv: {},
        cvExtractedByAI: false,
        badges: [],
        projects: [],
        accomplishments: [],
        careerProfile: {},
        profileVisibility: "visible",
        availabilityStatus: "immediately",
        totalExperienceYears: 0,
        totalExperienceMonths: 0,
        noticePeriod: 0,
        updatedAt: "2026-04-18T00:00:00.000Z",
        fullName: "Jahfar Sadik",
      }),
    });

    global.fetch = fetchMock as typeof fetch;
  });

  it("surfaces AI CV extraction and AI profile help near the top of the profile page", async () => {
    render(<JobSeekerProfilePage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/job-seeker/profile");
    });

    await screen.findByText("AI CV extractor");

    expect(screen.getAllByRole("button", { name: /upload cv with ai/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /resume & ai/i }).length).toBeGreaterThan(0);
    expect(screen.getByText("AI CV extractor")).toBeInTheDocument();
    expect(screen.getByText("AI profile help")).toBeInTheDocument();
    expect(screen.getByText(/ai can generate one from your uploaded cv/i)).toBeInTheDocument();
  });
});