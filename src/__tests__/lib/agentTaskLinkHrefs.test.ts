import { taskLinkHrefs } from "@/lib/agentTasks/linkHrefs";

describe("taskLinkHrefs", () => {
  it("opens the candidate's application to the linked job, where the status actions are", () => {
    expect(taskLinkHrefs("en", { candidate: { id: "c1", name: "Sara", applicationId: "a1", hasApplications: true } }).candidate)
      .toBe("/en/agent/candidates?applicationId=a1");
  });

  it("opens all their applications when no linked job has one", () => {
    expect(taskLinkHrefs("ar", { candidate: { id: "c1", name: "Sara", hasApplications: true } }).candidate)
      .toBe("/ar/agent/candidates?jobSeekerId=c1");
  });

  it("falls back to their row in Job Seekers when they never applied", () => {
    expect(taskLinkHrefs("en", { candidate: { id: "c1", name: "Sara Ali", hasApplications: false } }).candidate)
      .toBe("/en/agent/job-seekers?search=Sara+Ali");
  });

  it("links a job to its page and an employer to their jobs", () => {
    const hrefs = taskLinkHrefs("en", { job: { id: "j1", title: "Driver", deleted: false }, employer: { id: "e1", name: "Acme" } });
    expect(hrefs.job).toBe("/en/agent/jobs/j1");
    expect(hrefs.employer).toBe("/en/agent/jobs?employerId=e1");
  });

  it("gives a deleted job no link", () => {
    expect(taskLinkHrefs("en", { job: { id: "j1", title: "Driver", deleted: true } }).job).toBeUndefined();
  });

  it("returns nothing for an unlinked task", () => {
    expect(taskLinkHrefs("en", undefined)).toEqual({});
  });
});
