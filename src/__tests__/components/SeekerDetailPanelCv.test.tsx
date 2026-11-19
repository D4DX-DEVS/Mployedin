/**
 * @jest-environment jsdom
 *
 * The profile panel agents and super agents open from a job seeker row. Its
 * primary button is "View CV" and opens the Standardised CV (the viewer's
 * default for staff); "Original CV (Uploaded)" is the secondary item, in a
 * menu beside it, and asks the viewer for the uploaded file.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SeekerDetailPanel } from "@/components/features/super-agent/SeekerDetailPanel";

const SEEKER_ID = "a".repeat(24);

function profile(extra: Record<string, unknown>) {
  return {
    _id: SEEKER_ID,
    userId: { name: "Sara Ahmed", email: "sara@example.com" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function serve(jobSeeker: Record<string, unknown>) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jobSeeker, applications: [] }),
  })) as unknown as typeof fetch;
}

async function renderPanel(onViewCv = jest.fn()) {
  render(<SeekerDetailPanel seekerId={SEEKER_ID} onViewCv={onViewCv} />);
  await screen.findByRole("heading", { name: /Sara Ahmed/ });
  return onViewCv;
}

describe("SeekerDetailPanel CV entry", () => {
  it("opens the standardised CV from the primary View CV button", async () => {
    serve(profile({ cv: { originalUrl: "/files/sara.pdf" }, skills: ["ETAP"] }));
    const onViewCv = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "View CV" }));

    // No source: the viewer opens staff on Standardised.
    expect(onViewCv).toHaveBeenCalledWith({ id: SEEKER_ID, name: "Sara Ahmed" });
  });

  it("offers the uploaded file as a secondary item that asks for the original", async () => {
    serve(profile({ cv: { originalUrl: "/files/sara.pdf" } }));
    const onViewCv = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "More ways to open the CV" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" }));

    expect(onViewCv).toHaveBeenCalledWith({ id: SEEKER_ID, name: "Sara Ahmed", source: "file" });
  });

  it("counts an uploaded resume document as an original file too", async () => {
    serve(profile({ documents: [{ category: "resume", url: "/files/sara.docx" }] }));
    await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "More ways to open the CV" }));
    expect(await screen.findByRole("menuitem", { name: "Original CV (Uploaded)" })).toBeInTheDocument();
  });

  it("still opens the standardised CV for a profile with no uploaded file, and offers no original", async () => {
    serve(profile({ skills: ["ETAP"], summary: "Electrical engineer" }));
    const onViewCv = await renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "View CV" }));
    expect(onViewCv).toHaveBeenCalledWith({ id: SEEKER_ID, name: "Sara Ahmed" });
    expect(screen.queryByRole("button", { name: "More ways to open the CV" })).toBeNull();
  });

  it("shows no CV button when there is neither a file nor anything to build one from", async () => {
    serve(profile({}));
    await renderPanel();

    await waitFor(() => expect(screen.queryByRole("button", { name: "View CV" })).toBeNull());
    expect(screen.queryByRole("button", { name: "More ways to open the CV" })).toBeNull();
  });
});
