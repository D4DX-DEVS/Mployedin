/**
 * @jest-environment node
 */
import mongoose from "mongoose";
import { attributeStaffAiToEmployer } from "@/lib/ai/usageAttribution";
import { getAiCaller, runWithAiCaller } from "@/lib/ai/usageContext";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => ({ employerId: "bbbbbbbbbbbbbbbbbbbbbbbb" }) }) })) },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));

const mine = "aaaaaaaaaaaaaaaaaaaaaaaa";
const theirs = "bbbbbbbbbbbbbbbbbbbbbbbb";
const scoped = getScopedEmployerIds as jest.Mock;

function run<T>(role: string, fn: () => Promise<T>) {
  return runWithAiCaller({ userId: "u1", role }, async () => {
    const out = await fn();
    return { out, caller: getAiCaller() };
  });
}

describe("attributeStaffAiToEmployer", () => {
  beforeEach(() => scoped.mockReset());

  test("an agent's own employer is tagged on behalf", async () => {
    scoped.mockResolvedValue([new mongoose.Types.ObjectId(mine)]);
    const { out, caller } = await run("agent", () => attributeStaffAiToEmployer({ userId: "u1", role: "agent" }, { employerId: mine }));
    expect(out).toBe(mine);
    expect(caller).toMatchObject({ employerId: mine, onBehalf: true });
  });

  test("an employer outside the agent's book is ignored, never trusted", async () => {
    scoped.mockResolvedValue([new mongoose.Types.ObjectId(mine)]);
    const { out, caller } = await run("agent", () => attributeStaffAiToEmployer({ userId: "u1", role: "agent" }, { employerId: theirs }));
    expect(out).toBeNull();
    expect(caller?.employerId).toBeUndefined();
  });

  test("an admin (no scope limit) may name any employer", async () => {
    scoped.mockResolvedValue(null);
    const { out } = await run("admin", () => attributeStaffAiToEmployer({ userId: "u1", role: "admin" }, { employerId: theirs }));
    expect(out).toBe(theirs);
  });

  test("a saved job resolves to its employer, then is scope-checked", async () => {
    scoped.mockResolvedValue([new mongoose.Types.ObjectId(mine)]);
    const { out } = await run("agent", () => attributeStaffAiToEmployer({ userId: "u1", role: "agent" }, { jobId: "cccccccccccccccccccccccc" }));
    expect(out).toBeNull(); // the job belongs to `theirs`
  });

  test("employers and seekers are never tagged this way", async () => {
    const { out } = await run("employer", () => attributeStaffAiToEmployer({ userId: "u1", role: "employer" }, { employerId: mine }));
    expect(out).toBeNull();
    expect(scoped).not.toHaveBeenCalled();
  });
});
