/**
 * @jest-environment node
 *
 * EMP-13: one definition per pipeline metric, shared by the dashboard,
 * analytics and applications workspace.
 */
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));

const jobCount = jest.fn();
const interviewCount = jest.fn();
const aggregate = jest.fn();
jest.mock("@/models/Job", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => jobCount(...a) } }));
jest.mock("@/models/Interview", () => ({ Interview: { countDocuments: (...a: unknown[]) => interviewCount(...a) } }));
jest.mock("@/models/Application", () => ({ Application: { aggregate: (...a: unknown[]) => aggregate(...a) } }));

import { getEmployerPipelineCounts, conversionRate } from "@/lib/employers/pipelineCounts";

const EMP = "aaaaaaaaaaaaaaaaaaaaaaaa";

it("counts current statuses, open pipeline, current hires and upcoming interviews", async () => {
  jobCount.mockResolvedValue(20);
  interviewCount.mockResolvedValue(2);
  aggregate.mockResolvedValue([
    { _id: "applied", count: 18 },
    { _id: "shortlisted", count: 6 },
    { _id: "interview_scheduled", count: 1 },
    { _id: "selected", count: 9 },
    { _id: "hired", count: 3 },
    { _id: "rejected", count: 10 },
    { _id: "withdrawn", count: 2 },
  ]);

  const c = await getEmployerPipelineCounts(EMP);

  expect(jobCount).toHaveBeenCalledWith({ employerId: EMP, status: "active", deletedAt: null });
  const interviewFilter = interviewCount.mock.calls[0][0];
  expect(interviewFilter.status).toEqual({ $in: ["scheduled", "confirmed"] });
  expect(interviewFilter.scheduledAt.$gte).toBeInstanceOf(Date);
  expect(c).toMatchObject({
    activeJobs: 20,
    applications: 49,
    inPipeline: 34,
    upcomingInterviews: 2,
    hired: 3,
    conversionRate: 6,
  });
  expect(c.byStatus.shortlisted).toBe(6);
});

it("reports 0% conversion with no applications", () => {
  expect(conversionRate(0, 0)).toBe(0);
});
