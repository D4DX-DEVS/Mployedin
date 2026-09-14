/**
 * `Application.isAgentReferred` is a snapshot of the seeker at apply time.
 * `find().sort()` cannot order by a populated field, and "was referred when
 * they applied" is the historically honest value. This decides what a NEW
 * application should carry; the Mongoose hook supplies the lookup.
 */
export interface ReferralSnapshotDoc {
  isNew: boolean;
  jobSeekerId: unknown;
  isModified(path: string): boolean;
}

export type SeekerReferralLookup = (jobSeekerId: unknown) => Promise<boolean>;

/** `undefined` means "change nothing": not a new document, or the caller set the flag explicitly. */
export async function resolveApplicationReferralFlag(
  doc: ReferralSnapshotDoc,
  lookup: SeekerReferralLookup,
): Promise<boolean | undefined> {
  if (!doc.isNew) return undefined;
  if (doc.isModified("isAgentReferred")) return undefined;
  return (await lookup(doc.jobSeekerId)) === true;
}
