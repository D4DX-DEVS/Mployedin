/**
 * Seed one AUDIT pending-approval job under the super agent's team so the
 * Job Approval Gate can be exercised end-to-end.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-audit-pending-job.mjs
 *   node --env-file=.env scripts/seed-audit-pending-job.mjs --delete
 */

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: node --env-file=.env scripts/seed-audit-pending-job.mjs");
  process.exit(1);
}

const SA_EMAIL = "superagent@mployedin.com";
const AUDIT_TITLE = "AUDIT Pending Approval Job";

const loose = { strict: false };
const User = mongoose.model("User", new mongoose.Schema({ email: String }, loose));
const SuperAgent = mongoose.model("SuperAgent", new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, agentIds: [mongoose.Schema.Types.ObjectId] }, loose));
const Agent = mongoose.model("Agent", new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, assignedEmployerIds: [mongoose.Schema.Types.ObjectId] }, loose));
const Employer = mongoose.model("Employer", new mongoose.Schema({}, loose));
const Job = mongoose.model("Job", new mongoose.Schema({}, loose), "jobs");

async function main() {
  await mongoose.connect(MONGODB_URI);
  const del = process.argv.includes("--delete");

  if (del) {
    const r = await Job.deleteMany({ title: AUDIT_TITLE });
    console.log(`Deleted ${r.deletedCount} AUDIT pending job(s).`);
    await mongoose.disconnect();
    return;
  }

  const saUser = await User.findOne({ email: SA_EMAIL }).lean();
  if (!saUser) throw new Error(`Super agent user ${SA_EMAIL} not found`);
  const sa = await SuperAgent.findOne({ userId: saUser._id }).lean();
  if (!sa) throw new Error("SuperAgent profile not found");

  const agentIds = sa.agentIds ?? [];
  if (agentIds.length === 0) throw new Error("Super agent has no agents");

  // Pick an agent that has at least one assigned employer.
  const agents = await Agent.find({ _id: { $in: agentIds } }).lean();
  let chosenAgent = agents.find((a) => (a.assignedEmployerIds ?? []).length > 0);
  let employerId;
  if (chosenAgent) {
    employerId = chosenAgent.assignedEmployerIds[0];
  } else {
    // Fall back to any employer assigned to a team agent via the Employer.agentId field.
    const emp = await Employer.findOne({ agentId: { $in: agentIds } }).lean();
    if (!emp) throw new Error("No employer found under the team to attach the job");
    employerId = emp._id;
    chosenAgent = agents.find((a) => String(a._id) === String(emp.agentId)) ?? agents[0];
  }

  const existing = await Job.findOne({ title: AUDIT_TITLE });
  if (existing) {
    existing.set({
      status: "pending_approval",
      poster: { type: "agent", approvalStatus: "pending" },
      agentId: chosenAgent._id,
      employerId,
    });
    await existing.save();
    console.log(`Updated existing AUDIT pending job ${existing._id}.`);
  } else {
    const job = await Job.create({
      employerId,
      agentId: chosenAgent._id,
      title: AUDIT_TITLE,
      description: "AUDIT seed job submitted by an agent and awaiting super-agent approval.",
      employmentType: "full_time",
      workMode: "onsite",
      salary: { min: 8000, max: 12000, currency: "AED", period: "monthly" },
      location: { country: "United Arab Emirates", city: "Dubai", isRemote: false },
      status: "pending_approval",
      poster: { type: "agent", approvalStatus: "pending" },
    });
    console.log(`Created AUDIT pending job ${job._id} (agent ${chosenAgent._id}, employer ${employerId}).`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
