import { JobInvite } from "@/models/JobInvite";
import AuditLog from "@/models/AuditLog";

let uniqueIndexReady: Promise<void> | null = null;

/** autoIndex is off; the claim below is only atomic once the unique index exists. */
function ensureUniqueIndex(): Promise<void> {
  uniqueIndexReady ??= JobInvite.collection.createIndex({ jobId: 1, jobSeekerId: 1 }, { unique: true }).then(
    () => undefined,
    (err: unknown) => {
      uniqueIndexReady = null;
      throw err;
    },
  );
  return uniqueIndexReady;
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Claim the right to invite this candidate to this job. Returns the claim id,
 * or null when someone already did — checked by the unique index, so two
 * requests racing each other cannot both send. Call before notifying, and
 * `releaseJobInvite` if the notification then fails.
 */
export async function claimJobInvite(input: {
  jobId: string;
  jobSeekerId: string;
  invitedBy: string;
  invitedByRole: string;
}): Promise<string | null> {
  // Invites sent before this record existed live only in the audit log.
  const legacy = await AuditLog.exists({
    action: "candidate.invite",
    resource: "applications",
    resourceId: input.jobId,
    "meta.jobSeekerId": input.jobSeekerId,
  });
  if (legacy) return null;

  await ensureUniqueIndex();
  try {
    const claim = await JobInvite.create(input);
    return String(claim._id);
  } catch (err) {
    if (isDuplicateKey(err)) return null;
    throw err;
  }
}

/** Undo a claim whose notification could not be sent, so it can be retried. */
export async function releaseJobInvite(claimId: string): Promise<void> {
  await JobInvite.deleteOne({ _id: claimId });
}

/** Everyone already invited to this job, including invites recorded before JobInvite. */
export async function invitedSeekerIds(jobId: string): Promise<Set<string>> {
  const [claims, legacy] = await Promise.all([
    JobInvite.find({ jobId }).select("jobSeekerId").lean(),
    AuditLog.find({ action: "candidate.invite", resource: "applications", resourceId: jobId }).select("meta").lean(),
  ]);
  return new Set([
    ...claims.map((c) => String(c.jobSeekerId)),
    ...(legacy as Array<{ meta?: { jobSeekerId?: unknown } }>).map((l) => String(l.meta?.jobSeekerId ?? "")),
  ]);
}
