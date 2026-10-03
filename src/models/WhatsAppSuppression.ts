import mongoose, { Document, Schema } from "mongoose";

/**
 * WhatsAppSuppression — numbers that replied STOP. The opt-out on the User
 * belongs to an account, and anyone can type any number on their profile and
 * tick the channel again; this list belongs to the number, so a STOP holds
 * whichever account the number is typed on. Only a START from the number (or
 * an admin) lifts it. Every send checks it (whatsapp/send.ts). Index in
 * indexes.ts.
 *
 * A START does not delete the entry: it records its own time as `liftedAt`.
 * Meta redelivers a STOP whose first delivery failed, possibly after a newer
 * START; with the entry gone that STOP would list the number again and block a
 * user who had just been told their updates are on. Kept, the older STOP stays
 * older than `liftedAt` and changes nothing (isSuppressionInForce).
 */
export const WHATSAPP_SUPPRESSION_SOURCES = ["stop_keyword", "admin"] as const;
export type WhatsAppSuppressionSource = (typeof WHATSAPP_SUPPRESSION_SOURCES)[number];

export interface IWhatsAppSuppression extends Document {
  _id: mongoose.Types.ObjectId;
  /** E.164 with "+", the form send.ts logs and sends to. */
  number: string;
  /** The latest STOP from the number. */
  optedOutAt: Date;
  /** The latest START from the number; absent until one arrives. */
  liftedAt?: Date;
  source: WhatsAppSuppressionSource;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppSuppressionSchema = new Schema<IWhatsAppSuppression>(
  {
    number: { type: String, required: true, unique: true },
    optedOutAt: { type: Date, required: true },
    liftedAt: { type: Date },
    source: { type: String, enum: WHATSAPP_SUPPRESSION_SOURCES, required: true },
  },
  { timestamps: true },
);

export const WhatsAppSuppression =
  mongoose.models.WhatsAppSuppression ||
  mongoose.model<IWhatsAppSuppression>("WhatsAppSuppression", WhatsAppSuppressionSchema);

/**
 * The one "is suppressed" rule, read by every send (send.ts), the admin test
 * send and the settings pages' WhatsApp status (through isNumberSuppressed). A
 * number is suppressed while its latest STOP is not older than its latest START:
 * a STOP and a START in the same second go to the STOP, the order guard the
 * account-level opt-out applies (optOut.ts). A date that cannot be read counts
 * as suppressed: a withdrawn consent must fail as "do not send".
 */
export function isSuppressionInForce(entry: { optedOutAt?: Date | null; liftedAt?: Date | null } | null | undefined): boolean {
  if (!entry?.optedOutAt) return false;
  if (!entry.liftedAt) return true;
  const out = new Date(entry.optedOutAt).getTime();
  const lifted = new Date(entry.liftedAt).getTime();
  if (Number.isNaN(out) || Number.isNaN(lifted)) return true;
  return out >= lifted;
}

/**
 * isSuppressionInForce as a query: the entries it says are not in force. That
 * is no STOP time at all, or a START newer than the latest STOP (a tie stays in
 * force, as in the rule). Only real dates are compared: an entry with a time
 * that is not a date stays, as the rule counts it as in force.
 */
export const liftedSuppressionFilter = {
  $or: [{ optedOutAt: null }, { optedOutAt: { $type: "date" }, liftedAt: { $type: "date" }, $expr: { $lt: ["$optedOutAt", "$liftedAt"] } }],
};

/**
 * Deletes the entries of these numbers that no longer suppress anything
 * (liftedSuppressionFilter), keeping a STOP still in force. For the GDPR
 * erasure: a lifted entry only guards against a stale STOP redelivered after
 * its START, so once its account is erased it would keep a phone number for no
 * purpose. The condition sits in the delete itself, so a STOP landing at the
 * same moment is never deleted.
 */
export async function deleteLiftedSuppressions(numbers: string[]): Promise<void> {
  if (numbers.length === 0) return;
  await WhatsAppSuppression.deleteMany({ number: { $in: numbers }, ...liftedSuppressionFilter });
}

/** True when the number (E.164 with "+") replied STOP and has not sent a newer START. */
export async function isNumberSuppressed(number: string): Promise<boolean> {
  const entry = (await WhatsAppSuppression.findOne({ number }).select("optedOutAt liftedAt").lean()) as
    | { optedOutAt?: Date | null; liftedAt?: Date | null }
    | null;
  return isSuppressionInForce(entry);
}

/**
 * Records a STOP from the number. `$max` keeps the latest STOP when Meta
 * redelivers an older one; the source of an existing entry is kept, and so is
 * `liftedAt`, so a STOP older than the START on record stays lifted.
 */
export async function suppressNumber(number: string, at: Date, source: WhatsAppSuppressionSource): Promise<void> {
  await WhatsAppSuppression.updateOne({ number }, { $max: { optedOutAt: at }, $setOnInsert: { source } }, { upsert: true });
}

/**
 * A START from the number lifts its STOP by recording the START's time on the
 * entry (`$max`, so a redelivered older START cannot move it back). Whether the
 * STOP still holds is decided by isSuppressionInForce: a stale START, older
 * than the STOP on record, lifts nothing. A number with no entry gets none.
 */
export async function liftSuppression(number: string, at: Date): Promise<void> {
  await WhatsAppSuppression.updateOne({ number }, { $max: { liftedAt: at } });
}

export default WhatsAppSuppression;
