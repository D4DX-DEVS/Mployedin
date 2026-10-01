/**
 * Leaving employer view. An agent opens an assigned employer's job in employer
 * view from the agent job page ("Open employer's job page"); leaving should land
 * back on that job, not on the agent's home page. Everything else goes home.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TenantViewBanner } from "@/components/features/tenant/TenantViewBanner";

const push = jest.fn();
let pathname = "/en/employer";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => pathname,
}));
const csrfFetch = jest.fn().mockResolvedValue({ ok: true });
jest.mock("@/lib/security/csrf-client", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));

const JOB = "6abe375503c08e35fc9e58ce";

async function leave(actorRole: "agent" | "admin", at: string) {
  pathname = at;
  push.mockClear();
  const { unmount } = render(<TenantViewBanner companyName="QA Audit Company" actorRole={actorRole} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: /Back to/ }));
  await waitFor(() => expect(push).toHaveBeenCalled());
  unmount();
  return push.mock.calls[0][0];
}

it("ends employer view before navigating", async () => {
  await leave("agent", "/en/employer");
  expect(csrfFetch).toHaveBeenCalledWith("/api/tenant/switch", expect.objectContaining({ method: "POST", body: JSON.stringify({ exit: true }) }));
});

it("returns an agent to the job they opened, from any tab of it", async () => {
  expect(await leave("agent", `/en/employer/jobs/${JOB}`)).toBe(`/en/agent/jobs/${JOB}`);
  expect(await leave("agent", `/ar/employer/jobs/${JOB}/applications`)).toBe(`/en/agent/jobs/${JOB}`);
});

it("sends everyone else home", async () => {
  expect(await leave("agent", "/en/employer/candidates")).toBe("/en/agent");
  expect(await leave("admin", `/en/employer/jobs/${JOB}`)).toBe("/en/admin");
});
