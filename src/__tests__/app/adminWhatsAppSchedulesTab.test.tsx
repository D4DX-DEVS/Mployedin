/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { formatDateTime } from "@/lib/ui/intlFormat";
import { resolveViewerTimeZone, timeZoneLabel } from "@/lib/datetime/zone";

jest.mock("@/hooks/useUrlFilter", () => ({ useUrlFilter: (_key: string, def: string) => React.useState(def) }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ locale: "en" }),
  usePathname: () => "/en/admin/settings/whatsapp",
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const mockConfirm = jest.fn();
jest.mock("@/hooks/useConfirm", () => ({ useConfirm: () => ({ confirm: mockConfirm, ConfirmDialogNode: null }) }));

import AdminWhatsAppPage from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/page";
import { toForm, toPatchBody } from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/scheduleForm";
import type { WaSchedule } from "@/app/[locale]/(dashboard)/admin/settings/whatsapp/_components/shared";

// Heavy user-event flows (typing, Radix selects): a single test can pass 5 s when the whole suite runs in parallel.
jest.setTimeout(20_000);

// jsdom lacks the pointer-capture and scrollIntoView calls Radix Select makes when it opens.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

const SCHEDULES = "/api/admin/whatsapp/schedules";
const toastError = jest.requireMock("sonner").toast.error as jest.Mock;
const toastSuccess = jest.requireMock("sonner").toast.success as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const PAST = new Date(Date.now() - 30 * DAY).toISOString();
const FUTURE = new Date(Date.now() + 30 * DAY).toISOString();
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// True for a one-off that never ran too (its time passed while it was switched off).
const SPENT_NOTE = "This one-time message is no longer waiting to be sent. Pick a new date and time in the future, and saving will turn it on again.";

// Zone names the way useTimezoneOptions labels them: city, then today's offset in a left-to-right isolate (Dubai has no summer time).
const DUBAI = "Dubai (\u2066GMT+4\u2069)";
const KARACHI = "Karachi (\u2066GMT+5\u2069)";

/** A times cell as the list prints it: the viewer's zone is named, since a bare clock time is ambiguous. */
const stamp = (iso: string) => formatDateTime(iso, { timeZoneName: "short" }, "en");

const schedule = {
  _id: "s1", name: "Monday digest", enabled: true, kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Dubai",
  template: { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "New jobs this week"] },
  audience: { targetAll: false, targetRoles: ["job_seeker"] },
  nextRunAt: "2026-10-05T05:00:00.000Z", lastRunAt: "2026-09-28T05:00:00.000Z", lastRunStatus: "partial", lastRunSummary: { sent: 10, failed: 1, skipped: 2 },
};
const announcement = { _id: "t1", name: "mployedin_admin_announcement", language: "en", category: "MARKETING", status: "APPROVED", bodyText: "Hi {{1}}, {{2}}", bodyParamCount: 2, lastSyncedAt: "2026-10-01T00:00:00Z" };
const hello = { _id: "t2", name: "hello_world", language: "en_US", category: "UTILITY", status: "APPROVED", bodyText: "Hello World", bodyParamCount: 0, lastSyncedAt: "2026-10-01T00:00:00Z" };
const status = { configured: false, mode: "mock", enabled: true, phone: null, phoneError: null, last24h: { sent: 0, delivered: 0, read: 0, failed: 0, skipped: 1, mock: 0 }, skipReasons: [] };

const log = { _id: "l1", to: "+971501234567", kind: "template", templateName: "mployedin_interview_reminder", source: "orchestrator", status: "skipped", skipReason: "daily_cap", sentAt: "2026-09-29T09:00:00.000Z" };
const logsPage = (logs: unknown[], totalPages: number, page = 1, total = logs.length) => ({ success: true, logs, pagination: { page, limit: 25, total, totalPages } });

const reply = (httpStatus: number, body: unknown) => Promise.resolve({ ok: httpStatus >= 200 && httpStatus < 300, status: httpStatus, json: async () => body });

type Handler = (init?: RequestInit, url?: string) => Promise<unknown>;
/** Overrides keyed by "METHOD /path" (query string dropped). */
let handlers: Record<string, Handler>;
let schedules: unknown[];
const fetchMock = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue(true);
  handlers = {};
  schedules = [schedule];
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    const key = `${init?.method ?? "GET"} ${u.split("?")[0]}`;
    if (handlers[key]) return handlers[key](init, u);
    if (key === `GET ${SCHEDULES}`) return reply(200, { schedules });
    if (key === "GET /api/admin/whatsapp/templates") return reply(200, { templates: [announcement, hello] });
    if (key === "GET /api/admin/whatsapp/status") return reply(200, status);
    if (key === "GET /api/admin/whatsapp/logs") return reply(200, logsPage([log], 1));
    if (key === `POST ${SCHEDULES}/s1/run`) return reply(200, { queued: true });
    if (key === `PATCH ${SCHEDULES}/s1`) return reply(200, { schedule });
    if (key === `DELETE ${SCHEDULES}/s1`) return reply(200, { success: true });
    if (key === `POST ${SCHEDULES}`) return reply(201, { schedule });
    return reply(200, {});
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(([u, init]) => String(u).split("?")[0] === url && ((init as RequestInit | undefined)?.method ?? "GET") === method) as Array<[string, RequestInit | undefined]>;
const bodyOf = (call: [string, RequestInit | undefined]) => JSON.parse(String(call[1]?.body));

async function openSchedules() {
  render(<AdminWhatsAppPage />);
  await screen.findAllByText("Not connected");
  await userEvent.click(screen.getByRole("button", { name: "Scheduled messages" }));
}

async function openList() {
  await openSchedules();
  await screen.findByText("Monday digest");
}

const rowOf = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

async function openMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `More actions for ${name}` }));
}

async function pick(combobox: string, option: string | RegExp) {
  await userEvent.click(screen.getByRole("combobox", { name: combobox }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

async function openEdit(name = "Monday digest") {
  await openList();
  await userEvent.click(within(rowOf(name)).getByRole("button", { name: "Edit scheduled message" }));
  return screen.findByRole("dialog");
}

describe("admin WhatsApp Schedules tab: list", () => {
  it("lists schedules and queues a run after confirmation", async () => {
    await openList();
    expect(screen.getByText("Job seekers")).toBeInTheDocument();
    // The Latin name is its own left-to-right element beside the language name.
    expect(screen.getByText("mployedin_admin_announcement").parentElement).toHaveTextContent("mployedin_admin_announcement · English");
    expect(screen.getByText("10 sent · 1 failed · 2 not sent")).toBeInTheDocument();
    expect(screen.getByText("Partly sent")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    // A run is not destructive: the confirm button must not be the red one.
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "default" }));
    await waitFor(() => expect(calls("POST", `${SCHEDULES}/s1/run`)).toHaveLength(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Sending has started. You can follow it in Message history."));
  });

  it("does not send the run when the confirmation is declined", async () => {
    mockConfirm.mockResolvedValue(false);
    await openList();
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(calls("POST", `${SCHEDULES}/s1/run`)).toHaveLength(0);
  });

  it("shows the next run for an enabled schedule and never for a paused one", async () => {
    schedules = [schedule, { ...schedule, _id: "s2", name: "Paused digest", enabled: false, nextRunAt: "2026-10-06T05:00:00.000Z" }];
    await openList();
    await screen.findByText("Paused digest");
    expect(within(rowOf("Monday digest")).getByText(stamp("2026-10-05T05:00:00.000Z"))).toBeInTheDocument();
    expect(within(rowOf("Paused digest")).getByText("Paused")).toBeInTheDocument();
    expect(within(rowOf("Monday digest")).getByText("On")).toBeInTheDocument();
    expect(screen.queryByText(stamp("2026-10-06T05:00:00.000Z"))).not.toBeInTheDocument();
  });

  it("names the viewer's zone beside the next run, the last run and a one-time run time", async () => {
    const zone = timeZoneLabel(schedule.nextRunAt, resolveViewerTimeZone(), "en");
    // Guard against a vacuous pass: the stamp must really end with a zone label, and differ from the bare one.
    expect(zone).not.toBe("");
    expect(stamp(schedule.nextRunAt).endsWith(zone)).toBe(true);
    expect(stamp(schedule.nextRunAt)).not.toBe(formatDateTime(schedule.nextRunAt, undefined, "en"));

    schedules = [schedule, { ...schedule, _id: "s2", name: "Launch blast", kind: "once", runAt: FUTURE, cron: undefined, enabled: false, nextRunAt: undefined }];
    await openList();
    await screen.findByText("Launch blast");
    const recurring = rowOf("Monday digest");
    expect(within(recurring).getByText(stamp(schedule.nextRunAt))).toBeInTheDocument();
    expect(within(recurring).getByText(stamp(schedule.lastRunAt))).toBeInTheDocument();
    expect(within(rowOf("Launch blast")).getByText(stamp(FUTURE))).toBeInTheDocument();
  });

  it("calls a one-time schedule that has fired Done, never Paused, and offers no Resume", async () => {
    // The tick switches a one-off off when it claims the run, so enabled=false with a past runAt means "done".
    schedules = [{ ...schedule, enabled: false, kind: "once", runAt: PAST, cron: undefined, lastRunAt: PAST, lastRunStatus: "success", lastRunSummary: { sent: 4, failed: 0, skipped: 0 } }];
    await openList();
    const row = rowOf("Monday digest");
    expect(within(row).getByText("Done")).toBeInTheDocument();
    expect(within(row).queryByText("Paused")).not.toBeInTheDocument();
    expect(within(row).queryByText("On")).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Edit scheduled message" })).toBeInTheDocument();

    // Nothing is left to resume or pause. With Delete the only menu item, RowActions shows it as a button
    // of its own (a "…" that opens onto one item only hides it), still behind the destructive confirm.
    for (const name of ["Resume", "Pause"]) {
      expect(within(row).queryByRole("button", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "More actions for Monday digest" })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    await waitFor(() => expect(calls("DELETE", `${SCHEDULES}/s1`)).toHaveLength(1));
  });

  it("treats a switched-off one-time schedule with no run time as completed too", async () => {
    schedules = [{ ...schedule, enabled: false, kind: "once", runAt: undefined, cron: undefined }];
    await openList();
    expect(within(rowOf("Monday digest")).getByText("Done")).toBeInTheDocument();
  });

  it("keeps Paused and Resume for a one-time schedule paused before its time, and for a paused recurring one", async () => {
    schedules = [
      { ...schedule, _id: "s2", name: "Early pause", enabled: false, kind: "once", runAt: FUTURE, cron: undefined },
      { ...schedule, _id: "s3", name: "Recurring pause", enabled: false },
      { ...schedule, _id: "s4", name: "Live one-off", enabled: true, kind: "once", runAt: FUTURE, cron: undefined },
    ];
    await openSchedules();
    await screen.findByText("Early pause");
    expect(within(rowOf("Early pause")).getByText("Paused")).toBeInTheDocument();
    expect(within(rowOf("Recurring pause")).getByText("Paused")).toBeInTheDocument();
    expect(within(rowOf("Live one-off")).getByText("On")).toBeInTheDocument();
    expect(screen.queryByText("Done")).not.toBeInTheDocument();

    await openMenu("Early pause");
    expect(await screen.findByRole("menuitem", { name: "Resume" })).toBeInTheDocument();
  });

  it("calls a schedule that has no lastRunAt 'never run' even though the stored summary defaults to zeros", async () => {
    schedules = [{ ...schedule, lastRunAt: undefined, lastRunStatus: undefined, lastRunSummary: { sent: 0, failed: 0, skipped: 0 } }];
    await openList();
    expect(within(rowOf("Monday digest")).getByText("Not sent yet")).toBeInTheDocument();
    expect(screen.queryByText("0 sent · 0 failed · 0 not sent")).not.toBeInTheDocument();
  });

  it("says nothing was sent for an attempt the runner recorded as an error without counting it as a run", async () => {
    schedules = [{ ...schedule, lastRunAt: undefined, lastRunStatus: "error", lastRunSummary: { sent: 0, failed: 0, skipped: 0 } }];
    await openList();
    const row = rowOf("Monday digest");
    expect(within(row).getByText("Not sent")).toBeInTheDocument();
    expect(within(row).getByText("Nothing was sent.")).toBeInTheDocument();
    expect(within(row).queryByText("Not sent yet")).not.toBeInTheDocument();
    expect(screen.queryByText("0 sent · 0 failed · 0 not sent")).not.toBeInTheDocument();
  });

  it.each([
    ["success", "Sent"],
    ["partial", "Partly sent"],
    ["error", "Not sent"],
  ])("labels a last run that ended as %s", async (lastRunStatus, label) => {
    schedules = [{ ...schedule, lastRunStatus }];
    await openList();
    expect(within(rowOf("Monday digest")).getByText(label)).toBeInTheDocument();
  });

  it("says when a repeating schedule sends in plain words, never as a cron", async () => {
    schedules = [
      schedule,
      { ...schedule, _id: "s2", name: "Daily digest", cron: "30 14 * * *" },
      { ...schedule, _id: "s3", name: "Month start", cron: "0 8 1 * *" },
      { ...schedule, _id: "s4", name: "Weekdays", cron: "0 9 * * 1-5" },
    ];
    await openList();
    await screen.findByText("Weekdays");
    expect(within(rowOf("Monday digest")).getByText("Every Monday at 09:00")).toBeInTheDocument();
    expect(within(rowOf("Daily digest")).getByText("Every day at 14:30")).toBeInTheDocument();
    expect(within(rowOf("Month start")).getByText("Every month on day 1 at 08:00")).toBeInTheDocument();
    // A timing only the API can set has no picker shape: it is named, not printed.
    expect(within(rowOf("Weekdays")).getByText("Custom timing set by your technical team")).toBeInTheDocument();
    expect(within(rowOf("Monday digest")).getByText(DUBAI)).toBeInTheDocument();
    expect(screen.queryByText(/\* \*/)).not.toBeInTheDocument();
  });

  it("names the time zone as a city and offset in the list, never as the raw zone id", async () => {
    schedules = [
      schedule,
      { ...schedule, _id: "s2", name: "Karachi digest", timezone: "Asia/Karachi" },
      { ...schedule, _id: "s3", name: "Odd zone digest", timezone: "Mars/Olympus" },
    ];
    await openList();
    await screen.findByText("Odd zone digest");
    expect(within(rowOf("Monday digest")).getByText(DUBAI)).toBeInTheDocument();
    // A zone outside the dialog's list is named too.
    expect(within(rowOf("Karachi digest")).getByText(KARACHI)).toBeInTheDocument();
    // One the hook has no name for falls back to its last word rather than the full id.
    expect(within(rowOf("Odd zone digest")).getByText("Olympus")).toBeInTheDocument();
    expect(screen.queryByText(/Asia\/Dubai|Asia\/Karachi|Mars\/Olympus/)).not.toBeInTheDocument();
  });

  it("keeps the template name left to right beside the language name, which follows the page direction", async () => {
    await openList();
    const name = within(rowOf("Monday digest")).getByText("mployedin_admin_announcement");
    expect(name.tagName).toBe("BDI");
    expect(name).toHaveAttribute("dir", "ltr");
    const label = name.parentElement as HTMLElement;
    expect(label).toHaveTextContent("mployedin_admin_announcement · English");
    // The language name is not forced left to right or set in the code font.
    expect(label).not.toHaveAttribute("dir");
    expect(label).not.toHaveClass("font-mono");
  });

  it("shows an empty state only when the list really is empty", async () => {
    schedules = [];
    await openSchedules();
    expect(await screen.findByText("No scheduled messages yet.")).toBeInTheDocument();
  });

  it("shows an error state with Try again when the list cannot be loaded, never the empty claim", async () => {
    handlers[`GET ${SCHEDULES}`] = () => reply(500, { error: "boom: connect ECONNREFUSED" });
    await openSchedules();
    expect(await screen.findByText("We couldn't load the scheduled messages. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("No scheduled messages yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();

    delete handlers[`GET ${SCHEDULES}`];
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Monday digest")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load the scheduled messages. Please try again.")).not.toBeInTheDocument();
  });

  it("shows the error state when the request itself fails", async () => {
    handlers[`GET ${SCHEDULES}`] = () => Promise.reject(new TypeError("Failed to fetch"));
    await openSchedules();
    expect(await screen.findByText("We couldn't load the scheduled messages. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("No scheduled messages yet.")).not.toBeInTheDocument();
  });
});

describe("admin WhatsApp Schedules tab: Run now outcomes", () => {
  const RUN = `POST ${SCHEDULES}/s1/run`;

  async function runNow() {
    await openList();
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
  }

  it("explains that WhatsApp sending is switched off", async () => {
    handlers[RUN] = () => reply(409, { error: "whatsapp_disabled" });
    await runNow();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("We couldn't start sending because WhatsApp messages are switched off. Turn on \"Send WhatsApp messages\" in the Automatic messages tab, then try again."),
    );
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("whatsapp_disabled"));
  });

  it("explains a run in progress without promising a short wait", async () => {
    handlers[RUN] = () => reply(409, { error: "run_in_progress" });
    await runNow();
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const copy = toastError.mock.calls[0][0] as string;
    expect(copy).toMatch(/already being sent/);
    expect(copy).toMatch(/up to an hour/);
    expect(copy).not.toMatch(/run_in_progress|moment|shortly|few minutes|seconds/i);
  });

  it("explains that a schedule never messages its audience more than about once an hour", async () => {
    handlers[RUN] = () => reply(409, { error: "too_soon" });
    await runNow();
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This message was sent less than an hour ago. A scheduled message goes out at most about once an hour, so try again later.",
      ),
    );
  });

  it("says the schedule is gone on a 404 and refreshes the list", async () => {
    handlers[RUN] = () => reply(404, { error: "Schedule not found" });
    await runNow();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This scheduled message no longer exists. We've refreshed the list."));
    expect(calls("GET", SCHEDULES).length).toBeGreaterThanOrEqual(2);
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("Schedule not found"));
  });

  it.each([
    ["a 500", () => reply(500, { error: "Internal: mongo exploded" })],
    ["an unknown 409 code", () => reply(409, { error: "something_new" })],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("uses the generic copy for %s and never renders the server text", async (_label, handler) => {
    handlers[RUN] = handler;
    await runNow();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't start sending. Please try again."));
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("disables Run now while its request is pending, so a second click sends nothing", async () => {
    let finish: () => void = () => {};
    handlers[RUN] = () => new Promise((resolve) => { finish = () => resolve({ ok: true, status: 200, json: async () => ({ queued: true }) }); });
    await runNow();
    await waitFor(() => expect(calls("POST", `${SCHEDULES}/s1/run`)).toHaveLength(1));
    const button = screen.getByRole("button", { name: "Send now" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(calls("POST", `${SCHEDULES}/s1/run`)).toHaveLength(1);

    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send now" })).toBeEnabled());
  });
});

describe("admin WhatsApp Schedules tab: pause, resume and delete", () => {
  it("pauses a schedule", async () => {
    await openList();
    await openMenu("Monday digest");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Pause" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0])).toEqual({ enabled: false });
  });

  it("explains a refused resume in the page's own words", async () => {
    // A paused recurring schedule whose cron can no longer fire is the case Resume still refuses (a fired one-off has no Resume).
    schedules = [{ ...schedule, enabled: false }];
    handlers[`PATCH ${SCHEDULES}/s1`] = () => reply(400, { error: "We couldn't work out the next run time for this cron expression" });
    await openList();
    await openMenu("Monday digest");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Resume" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("We couldn't resume this scheduled message. Edit it to check the timing, then try again."),
    );
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining("next run time"));
  });

  it("deletes through the confirm dialog, marked destructive, and keeps Delete in the menu", async () => {
    await openList();
    // Delete is never a button of its own in the row.
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    await openMenu("Monday digest");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    await waitFor(() => expect(calls("DELETE", `${SCHEDULES}/s1`)).toHaveLength(1));
  });

  it("does not delete when the confirmation is declined", async () => {
    mockConfirm.mockResolvedValue(false);
    await openList();
    await openMenu("Monday digest");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(calls("DELETE", `${SCHEDULES}/s1`)).toHaveLength(0);
  });

  it("reports a failed delete without the server text", async () => {
    handlers[`DELETE ${SCHEDULES}/s1`] = () => reply(500, { error: "Internal: mongo exploded" });
    await openList();
    await openMenu("Monday digest");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("We couldn't delete the scheduled message. Please try again."));
  });
});

describe("toPatchBody", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const recurring = schedule as unknown as WaSchedule;
  const once: WaSchedule = { ...recurring, kind: "once", cron: undefined, runAt: "2026-11-15T05:00:00.000Z", enabled: true };

  it("sends no runAt when the run time is the same instant in another spelling", () => {
    for (const spelling of ["2026-11-15T05:00:00Z", "2026-11-15T09:00:00+04:00", "2026-11-15T05:00:00.000Z"]) {
      const body = toPatchBody({ ...toForm(once), runAt: spelling }, once, now);
      expect(body).not.toHaveProperty("runAt");
      expect(body).not.toHaveProperty("kind");
      expect(body).not.toHaveProperty("enabled");
    }
  });

  it("turning a one-time schedule into a recurring one sends the kind with the cron and the timezone, and no runAt", () => {
    const repeat = { frequency: "weekly" as const, hour: 9, minute: 0, weekdays: [1], dayOfMonth: 1 };
    const body = toPatchBody({ ...toForm(once), kind: "recurring", repeat, timezone: "Asia/Riyadh" }, once, now);
    expect(body).toEqual(expect.objectContaining({ kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Riyadh" }));
    expect(body).not.toHaveProperty("runAt");
    expect(body).not.toHaveProperty("enabled");
  });

  it("sends the cron for a once → recurring change even when the form kept the stored default", () => {
    const body = toPatchBody({ ...toForm(once), kind: "recurring" }, once, now);
    expect(body).toEqual(expect.objectContaining({ kind: "recurring", cron: "0 9 * * 1" }));
  });
});

describe("admin WhatsApp Schedules tab: create and edit", () => {
  async function openCreate() {
    await openList();
    await userEvent.click(screen.getByRole("button", { name: "New scheduled message" }));
    return screen.findByRole("dialog");
  }

  /**
   * Picks the 15th of next month through the real DateTimePicker (month chevrons, day cell, Done) and
   * returns that day. A fresh picker starts at 09:00; one opened on a value keeps that value's time of day.
   */
  async function pickRunAt(): Promise<Date> {
    const target = new Date();
    target.setMonth(target.getMonth() + 1, 15);
    target.setHours(9, 0, 0, 0);
    const heading = () => screen.getByText(/^[A-Za-z]+ \d{4}$/);
    const title = target.toLocaleDateString("en", { month: "long", year: "numeric" });
    await userEvent.click(screen.getByRole("button", { name: "Date and time" }));
    await screen.findByText(/^[A-Za-z]+ \d{4}$/);
    for (let i = 0; i < 6 && heading().textContent !== title; i++) {
      await userEvent.click(heading().nextElementSibling as HTMLElement);
    }
    expect(heading()).toHaveTextContent(title);
    await userEvent.click(screen.getByRole("gridcell", { name: target.toLocaleDateString("en", { month: "long", day: "numeric" }) }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    return target;
  }

  it("shows localized inline errors instead of posting an empty one-time schedule", async () => {
    await openCreate();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a template.")).toBeInTheDocument();
    expect(screen.getByText("Pick a date and time.")).toBeInTheDocument();
    expect(calls("POST", SCHEDULES)).toHaveLength(0);
  });

  it("offers a repeat picker, not a cron field, for a repeating schedule", async () => {
    const dialog = await openCreate();
    await pick("When to send", "Repeating");
    expect(within(dialog).queryByText(/cron/i)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "Repeats" })).toHaveTextContent("Every week");
    expect(within(dialog).getByRole("combobox", { name: "Hour" })).toHaveTextContent("09");
    expect(within(dialog).getByRole("combobox", { name: "Minute" })).toHaveTextContent("00");
    // Weekday toggles are tap-target sized and say whether they are on.
    const monday = within(dialog).getByRole("button", { name: "Monday" });
    expect(monday).toHaveAttribute("aria-pressed", "true");
    expect(monday.className).toMatch(/\bmin-h-11\b/);
    expect(within(dialog).getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps each template name left to right in the template list, beside a language name that follows the page direction", async () => {
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole("combobox", { name: "Message template" }));
    const option = await screen.findByRole("option", { name: "hello_world · English (United States)" });
    const name = within(option).getByText("hello_world");
    expect(name.tagName).toBe("BDI");
    expect(name).toHaveAttribute("dir", "ltr");
    // The language name sits in the item's own text, which has no forced direction.
    expect(option).not.toHaveAttribute("dir");
    expect(name.parentElement).not.toHaveAttribute("dir");
  });

  it("asks for at least one day on a weekly repeat", async () => {
    const dialog = await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "Digest");
    await pick("When to send", "Repeating");
    await pick("Message template", "hello_world · English (United States)");
    await userEvent.click(within(dialog).getByRole("button", { name: "Monday" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose at least one day.")).toBeInTheDocument();
    expect(calls("POST", SCHEDULES)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Friday" }));
    await waitFor(() => expect(within(dialog).queryByText("Choose at least one day.")).not.toBeInTheDocument());
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("POST", SCHEDULES)).toHaveLength(1));
    expect(bodyOf(calls("POST", SCHEDULES)[0]).cron).toBe("0 9 * * 5");
  });

  it.each([
    ["Every day", [], "15 7 * * *"],
    ["Every month", ["Day of the month", "12"], "15 7 12 * *"],
  ])("builds the cron for %s from the picker", async (repeatLabel, extra, cron) => {
    const dialog = await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "Digest");
    await pick("When to send", "Repeating");
    await pick("Message template", "hello_world · English (United States)");
    await pick("Repeats", repeatLabel);
    await pick("Hour", "07");
    await pick("Minute", "15");
    if (extra.length) {
      expect(within(dialog).getByText("Days 1 to 28 only, so the message goes out every month, February included.")).toBeInTheDocument();
      await pick(extra[0], extra[1]);
    }
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("POST", SCHEDULES)).toHaveLength(1));
    expect(bodyOf(calls("POST", SCHEDULES)[0]).cron).toBe(cron);
  });

  it("offers days 1 to 28 only for a monthly repeat", async () => {
    await openCreate();
    await pick("When to send", "Repeating");
    await pick("Repeats", "Every month");
    await userEvent.click(screen.getByRole("combobox", { name: "Day of the month" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(Array.from({ length: 28 }, (_, i) => String(i + 1)));
  });

  it("names a custom timing it cannot show, keeps it on a rename, and replaces it once a repeat is chosen", async () => {
    schedules = [{ ...schedule, cron: "0 9 * * 1-5" }];
    const dialog = await openEdit();
    expect(within(dialog).getByText("Custom timing set by your technical team")).toBeInTheDocument();
    expect(within(dialog).queryByText(/1-5/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: "Hour" })).not.toBeInTheDocument();

    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Weekdays v2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0])).not.toHaveProperty("cron");
  });

  it("replaces a custom timing with the repeat the admin picks", async () => {
    schedules = [{ ...schedule, cron: "0 9 * * 1-5" }];
    const dialog = await openEdit();
    await pick("Repeats", "Every day");
    expect(within(dialog).queryByText("Custom timing set by your technical team")).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]).cron).toBe("0 9 * * *");
  });

  it("offers the time zone as a dropdown of cities with their offset, never as a raw zone id", async () => {
    const dialog = await openCreate();
    await pick("When to send", "Repeating");
    const zone = within(dialog).getByRole("combobox", { name: "Time zone" });
    expect(zone).toHaveTextContent(DUBAI);
    expect(within(dialog).queryByRole("textbox", { name: "Time zone" })).not.toBeInTheDocument();
    await userEvent.click(zone);
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent ?? "");
    // The same nine zones as before, each named as a person would say it.
    expect(options).toHaveLength(9);
    expect(options[0]).toBe(DUBAI);
    expect(options.slice(1, 7).map((o) => o.replace(/ \(.*$/, ""))).toEqual(["Riyadh", "Qatar", "Kuwait", "Bahrain", "Muscat", "India"]);
    expect(options[7]).toMatch(/^London \(\u2066GMT(\+1)?\u2069\)$/);
    expect(options.every((o) => !o.includes("/"))).toBe(true);
    expect(screen.queryByText(/Asia\/|Europe\//)).not.toBeInTheDocument();
  });

  it("saves the zone id behind the friendly name", async () => {
    const dialog = await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "Digest");
    await pick("When to send", "Repeating");
    await pick("Message template", "hello_world · English (United States)");
    await pick("Time zone", /^Riyadh \(/);
    expect(within(dialog).getByRole("combobox", { name: "Time zone" })).toHaveTextContent(/^Riyadh \(/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("POST", SCHEDULES)).toHaveLength(1));
    expect(bodyOf(calls("POST", SCHEDULES)[0]).timezone).toBe("Asia/Riyadh");
  });

  it("keeps a stored zone that is not in the list, shown by name at the top, and does not resend it on a rename", async () => {
    schedules = [{ ...schedule, timezone: "Asia/Karachi" }];
    const dialog = await openEdit();
    const zone = within(dialog).getByRole("combobox", { name: "Time zone" });
    expect(zone).toHaveTextContent(KARACHI);
    await userEvent.click(zone);
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(10);
    expect(options[0]).toHaveTextContent(KARACHI);
    await userEvent.keyboard("{Escape}");
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Karachi digest v2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0])).not.toHaveProperty("timezone");
  });

  // A stored zone the system cannot read (only the API could have set it) is still judged on save.
  it("refuses to save a recurring schedule whose stored zone is not a real one, until another zone is picked", async () => {
    schedules = [{ ...schedule, timezone: "Mars/Olympus" }];
    const dialog = await openEdit();
    expect(within(dialog).getByRole("combobox", { name: "Time zone" })).toHaveTextContent("Olympus");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose a time zone from the list.")).toBeInTheDocument();
    expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(0);

    await pick("Time zone", DUBAI);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]).timezone).toBe("Asia/Dubai");
  });

  it("requires an audience: everyone, or at least one role", async () => {
    await openCreate();
    await userEvent.click(screen.getByRole("switch", { name: "Everyone" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose everyone, or at least one group.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Job seekers" }));
    await waitFor(() => expect(screen.queryByText("Choose everyone, or at least one group.")).not.toBeInTheDocument());
  });

  it("posts a recurring schedule for a zero-variable template with empty params and no run time", async () => {
    await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "  Hello digest ");
    await pick("When to send", "Repeating");
    await pick("Message template", "hello_world · English (United States)");
    // A template with no variables takes no parameter fields at all.
    expect(screen.queryByRole("textbox", { name: "Blank 1" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("POST", SCHEDULES)).toHaveLength(1));
    expect(bodyOf(calls("POST", SCHEDULES)[0])).toEqual({
      name: "Hello digest",
      kind: "recurring",
      cron: "0 9 * * 1",
      timezone: "Asia/Dubai",
      template: { templateName: "hello_world", language: "en_US", params: [] },
      audience: { targetAll: true, targetRoles: [] },
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("fills the first parameter with the first-name token and leaves the rest for the admin", async () => {
    await openCreate();
    await pick("Message template", "mployedin_admin_announcement · English");
    expect(screen.getByRole("textbox", { name: "Blank 1" })).toHaveValue("{{firstName}}");
    expect(screen.getByRole("textbox", { name: "Blank 2" })).toHaveValue("");
  });

  it("blocks a blank template parameter with its own message", async () => {
    await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "Digest");
    await pick("When to send", "Repeating");
    await pick("Message template", "mployedin_admin_announcement · English");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fill in every blank. WhatsApp won't send a message with an empty blank.")).toBeInTheDocument();
    expect(calls("POST", SCHEDULES)).toHaveLength(0);

    await userEvent.type(screen.getByRole("textbox", { name: "Blank 2" }), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Fill in every blank. WhatsApp won't send a message with an empty blank.")).toBeInTheDocument();
    expect(calls("POST", SCHEDULES)).toHaveLength(0);
  });

  it("flags a token a schedule run does not fill in (it would go out empty), and saves once only known tokens are left", async () => {
    const dialog = await openEdit();
    const field = within(dialog).getByRole("textbox", { name: "Blank 2" });
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste("Update: {{ message }}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("{{message}} isn't a placeholder that scheduled messages fill in, so it would go out empty. Use {{firstName}}, {{fullName}}, {{role}} or {{title}}."),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(0);

    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste("{{fullName}}, {{role}}: {{title}}");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]).template.params).toEqual(["{{firstName}}", "{{fullName}}, {{role}}: {{title}}"]);
  });

  it("checks the parameter count against the chosen template and offers to match it", async () => {
    schedules = [{ ...schedule, template: { ...schedule.template, params: ["{{firstName}}"] } }];
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("This template has 2 blanks, but this scheduled message fills in 1.")).toBeInTheDocument();
    expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Use the template's number of blanks" }));
    expect(within(dialog).getByRole("textbox", { name: "Blank 2" })).toHaveValue("");
    expect(within(dialog).queryByText(/but this scheduled message fills in/)).not.toBeInTheDocument();
  });

  it("warns when the schedule's template is not approved in its language, and does not block the save for it", async () => {
    schedules = [{ ...schedule, template: { templateName: "mployedin_admin_announcement", language: "ar", params: ["{{firstName}}", "x"] } }];
    const dialog = await openEdit();
    expect(await within(dialog).findByText("WhatsApp hasn't approved this template in this language yet.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
  });

  it("sends a name-only edit of a recurring schedule without any timing key", async () => {
    const dialog = await openEdit();
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Monday digest v2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    // Any of kind/cron/runAt/timezone makes the route recompute nextRunAt, which would skip a deferred occurrence.
    expect(bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0])).toEqual({
      name: "Monday digest v2",
      template: { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "New jobs this week"] },
      audience: { targetAll: false, targetRoles: ["job_seeker"] },
    });
  });

  it("sends a name-only edit of a one-time schedule without any timing key", async () => {
    schedules = [{ ...schedule, kind: "once", runAt: FUTURE, cron: undefined, nextRunAt: FUTURE }];
    const dialog = await openEdit();
    const name = within(dialog).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Launch v2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.name).toBe("Launch v2");
    for (const key of ["kind", "cron", "runAt", "timezone", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("sends only the timing key that changed", async () => {
    const dialog = await openEdit();
    await pick("Hour", "08");
    await pick("Minute", "30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tuesday" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Monday" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.cron).toBe("30 8 * * 2");
    for (const key of ["kind", "runAt", "timezone", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("sends the timezone alone when only the timezone of a recurring schedule changed", async () => {
    const dialog = await openEdit();
    // London's offset follows summer time, so the option is matched by its city.
    await pick("Time zone", /^London \(/);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.timezone).toBe("Europe/London");
    for (const key of ["kind", "cron", "runAt", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("sends the kind with the half of the timing it needs when a recurring schedule becomes one-time", async () => {
    const dialog = await openEdit();
    await pick("When to send", "Once");
    const day = await pickRunAt();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.kind).toBe("once");
    expect(body.runAt).toBe(day.toISOString());
    // The zone is ignored for a one-off, so none is sent for it; the route keeps the stored one.
    for (const key of ["cron", "timezone", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("sends a new run time for a one-time schedule that is still waiting, without touching enabled", async () => {
    schedules = [{ ...schedule, kind: "once", runAt: FUTURE, cron: undefined, nextRunAt: FUTURE }];
    const dialog = await openEdit();
    const day = await pickRunAt();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.runAt).toMatch(ISO_INSTANT);
    expect(new Date(body.runAt).getDate()).toBe(day.getDate());
    for (const key of ["kind", "cron", "timezone", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("creates a one-time schedule through the picker and posts the run time as an ISO instant", async () => {
    const dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Launch blast");
    await pick("Message template", "hello_world · English (United States)");
    const day = await pickRunAt();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("POST", SCHEDULES)).toHaveLength(1));
    const body = bodyOf(calls("POST", SCHEDULES)[0]);
    expect(body.runAt).toMatch(ISO_INSTANT);
    // No zone and no cron: the zone is ignored for a one-off, and the schema defaults it.
    expect(body).toEqual({
      name: "Launch blast",
      kind: "once",
      runAt: day.toISOString(),
      template: { templateName: "hello_world", language: "en_US", params: [] },
      audience: { targetAll: true, targetRoles: [] },
    });
  });

  it("hides the Timezone field for a one-time schedule and shows it for a recurring one", async () => {
    const dialog = await openCreate();
    expect(within(dialog).queryByLabelText("Time zone")).not.toBeInTheDocument();
    await pick("When to send", "Repeating");
    expect(within(dialog).getByLabelText("Time zone")).toBeInTheDocument();
    await pick("When to send", "Once");
    expect(within(dialog).queryByLabelText("Time zone")).not.toBeInTheDocument();
  });

  it("does not let a stored zone that is not real block saving the schedule as a one-time one", async () => {
    schedules = [{ ...schedule, timezone: "Mars/Olympus" }];
    const dialog = await openEdit();
    await pick("When to send", "Once");
    expect(within(dialog).queryByLabelText("Time zone")).not.toBeInTheDocument();
    await pickRunAt();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    expect(body.kind).toBe("once");
    expect(body).not.toHaveProperty("timezone");
  });

  it("needs a future run time to save an enabled one-time schedule", async () => {
    schedules = [{ ...schedule, kind: "once", runAt: PAST, cron: undefined }];
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Pick a date and time in the future.")).toBeInTheDocument();
    expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(0);
  });

  it("lets a fired one-time schedule be renamed without a new run time, and leaves it switched off", async () => {
    schedules = [{ ...schedule, enabled: false, kind: "once", runAt: PAST, cron: undefined }];
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    for (const key of ["kind", "runAt", "cron", "timezone", "enabled"]) expect(body).not.toHaveProperty(key);
  });

  it("says, only for a fired one-time schedule, that saving a future time switches it on again", async () => {
    schedules = [
      { ...schedule, enabled: false, kind: "once", runAt: PAST, cron: undefined },
      { ...schedule, _id: "s2", name: "Waiting one-off", enabled: true, kind: "once", runAt: FUTURE, cron: undefined },
      { ...schedule, _id: "s3", name: "Paused digest", enabled: false },
    ];
    await openSchedules();
    await screen.findByText("Waiting one-off");
    const editFrom = async (name: string) => {
      await userEvent.click(within(rowOf(name)).getByRole("button", { name: "Edit scheduled message" }));
      return screen.findByRole("dialog");
    };
    const close = async () => {
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    };

    expect(await within(await editFrom("Monday digest")).findByText(SPENT_NOTE)).toBeInTheDocument();
    await close();
    await editFrom("Waiting one-off");
    expect(screen.queryByText(SPENT_NOTE)).not.toBeInTheDocument();
    await close();
    await editFrom("Paused digest");
    expect(screen.queryByText(SPENT_NOTE)).not.toBeInTheDocument();
  });

  it("does not show that note on a new schedule", async () => {
    await openCreate();
    expect(screen.queryByText(SPENT_NOTE)).not.toBeInTheDocument();
  });

  it("switches a fired one-time schedule back on when it is edited to a future time", async () => {
    schedules = [{ ...schedule, enabled: false, kind: "once", runAt: PAST, cron: undefined, nextRunAt: undefined }];
    const dialog = await openEdit();
    const day = await pickRunAt();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    const body = bodyOf(calls("PATCH", `${SCHEDULES}/s1`)[0]);
    // Without enabled:true the route would store the new time on a switched-off row and it would never run.
    expect(body.enabled).toBe(true);
    expect(body.runAt).toMatch(ISO_INSTANT);
    expect(new Date(body.runAt).getDate()).toBe(day.getDate());
    expect(new Date(body.runAt).getTime()).toBeGreaterThan(Date.now());
    for (const key of ["kind", "cron", "timezone"]) expect(body).not.toHaveProperty(key);
  });

  it("accepts a one-time schedule with a future run time", async () => {
    schedules = [{ ...schedule, kind: "once", runAt: FUTURE, cron: undefined }];
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls("PATCH", `${SCHEDULES}/s1`)).toHaveLength(1));
    expect(within(dialog).queryByText("Pick a date and time in the future.")).not.toBeInTheDocument();
  });

  it("maps a server 400 to one localized message and never renders the server sentence", async () => {
    handlers[`PATCH ${SCHEDULES}/s1`] = () => reply(400, { error: "Minute must be a single number (0–59) so a schedule runs at most once per hour" });
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("We couldn't save the scheduled message. Check the timing, the time zone, who gets it and the blanks, then try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Minute must be/)).not.toBeInTheDocument();
    // The dialog stays open with what was typed.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("maps a server 400 on create the same way", async () => {
    handlers[`POST ${SCHEDULES}`] = () => reply(400, { error: "Validation failed" });
    await openCreate();
    await userEvent.type(screen.getByLabelText("Name"), "Digest");
    await pick("When to send", "Repeating");
    await pick("Message template", "hello_world · English (United States)");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Check the timing, the time zone/)).toBeInTheDocument();
    expect(screen.queryByText("Validation failed")).not.toBeInTheDocument();
  });

  it.each([
    ["a 500", () => reply(500, { error: "Internal: mongo exploded" })],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("uses the generic save error for %s", async (_label, handler) => {
    handlers[`PATCH ${SCHEDULES}/s1`] = handler;
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("We couldn't save the scheduled message. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/mongo exploded/)).not.toBeInTheDocument();
  });

  it("closes the dialog and refreshes the list when the schedule was deleted meanwhile", async () => {
    handlers[`PATCH ${SCHEDULES}/s1`] = () => reply(404, { error: "Schedule not found" });
    const dialog = await openEdit();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("This scheduled message no longer exists. We've refreshed the list."));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers to retry when the approved templates could not be loaded", async () => {
    handlers["GET /api/admin/whatsapp/templates"] = () => reply(500, { error: "boom" });
    await openCreate();
    expect(await screen.findByText("We couldn't load the templates. Please try again.")).toBeInTheDocument();

    delete handlers["GET /api/admin/whatsapp/templates"];
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("We couldn't load the templates. Please try again.")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("combobox", { name: "Message template" }));
    expect(await screen.findByRole("option", { name: "hello_world · English (United States)" })).toBeInTheDocument();
  });

  it("says when there is no approved template to pick", async () => {
    handlers["GET /api/admin/whatsapp/templates"] = () => reply(200, { templates: [] });
    await openCreate();
    expect(await screen.findByText("No approved templates yet. Sync them in the Message templates tab.")).toBeInTheDocument();
  });
});

describe("admin WhatsApp Logs tab", () => {
  const LOGS = "/api/admin/whatsapp/logs";
  const logUrls = () => calls("GET", LOGS).map(([u]) => String(u));

  async function openLogs() {
    render(<AdminWhatsAppPage />);
    await screen.findAllByText("Not connected");
    await userEvent.click(screen.getByRole("button", { name: "Message history" }));
  }

  describe("the 'Not sent (not connected)' status filter", () => {
    const NOT_CONNECTED = "Not sent (not connected)";
    const live = (mock: number) => ({ ...status, configured: true, mode: "live", last24h: { ...status.last24h, mock } });

    /** Opens the Logs tab once the page has settled on `badge` ("Connected" or "Not connected"), then lists the Status filter's options. */
    async function statusOptions(badge: string): Promise<string[]> {
      render(<AdminWhatsAppPage />);
      await screen.findAllByText(badge);
      await userEvent.click(screen.getByRole("button", { name: "Message history" }));
      await screen.findByText("+971501234567");
      await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
      return (await screen.findAllByRole("option")).map((o) => o.textContent ?? "");
    }

    it("is offered while WhatsApp is not connected", async () => {
      expect(await statusOptions("Not connected")).toEqual(["All statuses", "Sent", "Delivered", "Read", "Failed", "Not sent", NOT_CONNECTED]);
    });

    it("is not offered once WhatsApp is connected and no message was held for that reason in the last 24 hours", async () => {
      handlers["GET /api/admin/whatsapp/status"] = () => reply(200, live(0));
      const options = await statusOptions("Connected");
      expect(options).toEqual(["All statuses", "Sent", "Delivered", "Read", "Failed", "Not sent"]);
      expect(options).not.toContain(NOT_CONNECTED);
    });

    it("is still offered while connected if such messages are in the last 24 hours", async () => {
      handlers["GET /api/admin/whatsapp/status"] = () => reply(200, live(2));
      expect(await statusOptions("Connected")).toContain(NOT_CONNECTED);
    });
  });

  it("lists delivery logs with translated status and skip reason", async () => {
    await openLogs();
    expect(await screen.findByText("+971501234567")).toBeInTheDocument();
    const row = rowOf("+971501234567");
    expect(within(row).getByText("Not sent")).toBeInTheDocument();
    expect(within(row).getByText("This person already got today's maximum number of messages")).toBeInTheDocument();
    expect(within(row).getByText("Automatic messages")).toBeInTheDocument();
    expect(within(row).getByText("mployedin_interview_reminder")).toBeInTheDocument();
    // 30 is not one of the page-size options, so the size select would have shown nothing.
    expect(logUrls()).toContain(`${LOGS}?page=1&limit=25`);
  });

  it("labels a failed row by its classified kind and never renders Meta's own wording", async () => {
    handlers[`GET ${LOGS}`] = () =>
      reply(200, logsPage([{ ...log, _id: "l2", status: "failed", skipReason: undefined, errorKind: "template_error", errorCode: 132001, errorMessage: "(#132001) Template name does not exist in en_US" }], 1));
    await openLogs();
    const row = (await screen.findByText("+971501234567")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText(/WhatsApp didn't accept the template or what was filled into its blanks/)).toBeInTheDocument();
    expect(within(row).getByText(/Error code 132001/)).toBeInTheDocument();
    expect(screen.queryByText(/does not exist in en_US/)).not.toBeInTheDocument();
  });

  it("falls back to generic copy for an error kind this page does not know", async () => {
    handlers[`GET ${LOGS}`] = () =>
      reply(200, logsPage([{ ...log, status: "failed", skipReason: undefined, errorKind: "brand_new_kind", errorMessage: "weird raw text" }], 1));
    await openLogs();
    expect(await screen.findByText(/WhatsApp reported a problem we don't recognise/)).toBeInTheDocument();
    expect(screen.queryByText(/brand_new_kind/)).not.toBeInTheDocument();
    expect(screen.queryByText(/weird raw text/)).not.toBeInTheDocument();
  });

  it("says no reason was recorded for a failed send that has no kind, without the raw message", async () => {
    handlers[`GET ${LOGS}`] = () =>
      reply(200, logsPage([{ ...log, status: "failed", skipReason: undefined, errorMessage: "getaddrinfo ENOTFOUND graph.facebook.com" }], 1));
    await openLogs();
    expect(await screen.findByText("The message didn't go out, and no reason was recorded.")).toBeInTheDocument();
    expect(screen.queryByText(/ENOTFOUND/)).not.toBeInTheDocument();
  });

  it("labels an unrecognised skip reason as another reason", async () => {
    handlers[`GET ${LOGS}`] = () => reply(200, logsPage([{ ...log, skipReason: "a_reason_added_later" }], 1));
    await openLogs();
    expect(await screen.findByText("Another reason")).toBeInTheDocument();
    expect(screen.queryByText(/a_reason_added_later/)).not.toBeInTheDocument();
  });

  it("shows an error state with Try again when the log cannot be loaded, never the empty claim", async () => {
    handlers[`GET ${LOGS}`] = () => reply(500, { error: "boom: connect ECONNREFUSED" });
    await openLogs();
    expect(await screen.findByText("We couldn't load the message history. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();

    delete handlers[`GET ${LOGS}`];
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("+971501234567")).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load the message history. Please try again.")).not.toBeInTheDocument();
  });

  it("shows the error state when the request itself fails", async () => {
    handlers[`GET ${LOGS}`] = () => Promise.reject(new TypeError("Failed to fetch"));
    await openLogs();
    expect(await screen.findByText("We couldn't load the message history. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();
  });

  it("says nothing has been logged only when the list really is empty", async () => {
    handlers[`GET ${LOGS}`] = () => reply(200, logsPage([], 1));
    await openLogs();
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
  });

  it("filters by status and source, goes back to page 1, and says so when nothing matches", async () => {
    handlers[`GET ${LOGS}`] = (_init, url) => {
      const params = new URL(String(url), "http://localhost").searchParams;
      if (params.get("status") === "failed") return reply(200, logsPage([], 1, 1, 0));
      return reply(200, logsPage([log], 3, Number(params.get("page") ?? 1), 60));
    };
    await openLogs();
    await screen.findByText("+971501234567");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(logUrls()).toContain(`${LOGS}?page=2&limit=25`));

    await pick("Status", "Failed");
    await waitFor(() => expect(logUrls()).toContain(`${LOGS}?page=1&limit=25&status=failed`));
    expect(await screen.findByText("No messages match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();

    await pick("Sent from", "Broadcast");
    await waitFor(() => expect(logUrls()).toContain(`${LOGS}?page=1&limit=25&status=failed&source=broadcast`));

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(logUrls().at(-1)).toBe(`${LOGS}?page=1&limit=25`));
    expect(await screen.findByText("+971501234567")).toBeInTheDocument();
  });

  it("steps back to the last real page when the current one no longer exists", async () => {
    handlers[`GET ${LOGS}`] = (_init, url) => {
      const params = new URL(String(url), "http://localhost").searchParams;
      return Number(params.get("page")) > 1 ? reply(200, logsPage([], 1, 1, 0)) : reply(200, logsPage([log], 2, 1, 40));
    };
    await openLogs();
    await screen.findByText("+971501234567");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    // Page 2 answers "only 1 page exists": the tab asks for page 1 again and shows its row, not an empty list.
    await waitFor(() => expect(logUrls()).toEqual([`${LOGS}?page=1&limit=25`, `${LOGS}?page=2&limit=25`, `${LOGS}?page=1&limit=25`]));
    expect(await screen.findByText("+971501234567")).toBeInTheDocument();
    expect(screen.queryByText("No messages yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("No messages match these filters.")).not.toBeInTheDocument();
  });
});
