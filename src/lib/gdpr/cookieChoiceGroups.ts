import type { PipelineStage } from "mongoose";
import User from "@/models/User";
import { COOKIE_CONSENT_TYPES } from "./consent";
import { cookieChoiceOutcome, type CookieChoiceOutcome } from "./cookieChoiceOutcome";

/**
 * A signed-in user's cookie choice is two ConsentLog rows, one per optional
 * category (cookies.preferences, cookies.media), written together by
 * recordCookieConsent with the same choice reference. The admin pages show one
 * row per choice, so these stages fold the rows back into choices in the
 * database: a page and its total then count choices, not rows.
 *
 * The key is the choice reference (with the account, so a reference can never
 * merge two people). Rows written before references existed have none; they
 * fall back to the account plus the second the row was written. insertMany is
 * not transactional, so a choice can have one row only: the missing category
 * comes back as null, never guessed. So does a category whose rows disagree.
 */

export const COOKIE_CHOICE_TYPES: string[] = [COOKIE_CONSENT_TYPES.preferences, COOKIE_CONSENT_TYPES.media];

/** 1 when any row of the choice records this category as `granted`, else 0. */
const anyRow = (type: string, granted: boolean) => ({
  $max: { $cond: [{ $and: [{ $eq: ["$consentType", type] }, { $eq: ["$granted", granted] }] }, 1, 0] },
});

/**
 * On only when the choice's rows for the category all say on, Off only when
 * they all say off. No row, or rows that disagree (a stray duplicate), is null:
 * "Not recorded", never overstated as On.
 */
const fromFlags = (on: string, off: string) => ({
  $switch: {
    branches: [
      { case: { $and: [{ $eq: [on, 1] }, { $eq: [off, 0] }] }, then: true },
      { case: { $and: [{ $eq: [on, 0] }, { $eq: [off, 1] }] }, then: false },
    ],
    default: null,
  },
});

const hasReference = { $gt: [{ $strLenCP: { $ifNull: ["$receiptId", ""] } }, 0] };

/** $group + $project: ConsentLog cookie rows in, one document per choice out. */
export function groupCookieChoiceStages(): PipelineStage[] {
  return [
    {
      $group: {
        _id: {
          $cond: [
            hasReference,
            { receiptId: "$receiptId", userId: "$userId" },
            { userId: "$userId", second: { $dateToString: { format: "%Y-%m-%dT%H:%M:%S", date: "$createdAt" } } },
          ],
        },
        // Every row of one choice carries the same account, name, reference, source and version.
        userId: { $first: "$userId" },
        userName: { $first: "$userName" },
        receiptId: { $max: "$receiptId" },
        recordedAt: { $min: "$createdAt" },
        source: { $first: "$source" },
        policyVersion: { $first: "$policyVersion" },
        preferencesOn: anyRow(COOKIE_CONSENT_TYPES.preferences, true),
        preferencesOff: anyRow(COOKIE_CONSENT_TYPES.preferences, false),
        mediaOn: anyRow(COOKIE_CONSENT_TYPES.media, true),
        mediaOff: anyRow(COOKIE_CONSENT_TYPES.media, false),
      },
    },
    {
      $project: {
        userId: 1,
        userName: 1,
        receiptId: 1,
        recordedAt: 1,
        source: 1,
        policyVersion: 1,
        preferences: fromFlags("$preferencesOn", "$preferencesOff"),
        media: fromFlags("$mediaOn", "$mediaOff"),
      },
    },
  ];
}

/** One choice as the stages above return it. Only these fields are read: nothing else reaches a response. */
export interface GroupedCookieChoice {
  userId?: unknown;
  userName?: string | null;
  receiptId?: string | null;
  recordedAt: Date | string;
  source?: string | null;
  policyVersion?: string | null;
  preferences: boolean | null;
  media: boolean | null;
}

/** One choice as the admin API sends it. No IP address, user agent or banner-text hash, ever. */
export interface CookieChoiceRecord {
  userId: string;
  userName: string;
  /** Null once the account is erased (the name is then "Deleted User") or no longer exists. */
  userEmail: string | null;
  /** Null for a choice written before choice references existed. */
  receiptId: string | null;
  recordedAt: Date | string;
  source: string | null;
  policyVersion: string | null;
  preferences: boolean | null;
  media: boolean | null;
  outcome: CookieChoiceOutcome;
}

const asBoolOrNull = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

export function toCookieChoiceRecord(choice: GroupedCookieChoice, accounts: Map<string, ConsentAccount>): CookieChoiceRecord {
  const userId = String(choice.userId ?? "");
  const preferences = asBoolOrNull(choice.preferences);
  const media = asBoolOrNull(choice.media);
  return {
    userId,
    ...consentRowIdentity(userId, choice.userName, accounts),
    receiptId: choice.receiptId || null,
    recordedAt: choice.recordedAt,
    source: choice.source ?? null,
    policyVersion: choice.policyVersion ?? null,
    preferences,
    media,
    outcome: cookieChoiceOutcome({ preferences, media }),
  };
}

/** What a consent view needs to know about the account behind a row. */
export interface ConsentAccount {
  email: string | null;
  /** The account was erased (UK GDPR Art 17): its rows show as "Deleted User", with no e-mail. */
  erased: boolean;
}

/** The name an erased account shows under on every consent view (the erasure writes the same into the rows). */
export const ERASED_USER_NAME = "Deleted User";

/**
 * One batched lookup for the accounts on a page (the log rows store the name, the account holds the e-mail and
 * whether it was erased). An account that no longer exists is simply absent.
 */
export async function consentAccountsById(userIds: string[]): Promise<Map<string, ConsentAccount>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids } })
    .select("email deletedAt")
    .lean<Array<{ _id: unknown; email?: string; deletedAt?: Date | null }>>();
  return new Map(users.map((u) => [String(u._id), { email: u.email || null, erased: Boolean(u.deletedAt) }]));
}

/**
 * The name and e-mail a consent row shows. An erased account is "Deleted User" with no e-mail, even when the row
 * still holds the old name (written before the erasure anonymised consent rows, lib/gdpr/erasure.ts). Otherwise
 * the name the row was written with, and the account's e-mail (null once the account no longer exists).
 */
export function consentRowIdentity(
  userId: string,
  storedName: string | null | undefined,
  accounts: Map<string, ConsentAccount>,
): { userName: string; userEmail: string | null } {
  const account = accounts.get(userId);
  if (account?.erased) return { userName: ERASED_USER_NAME, userEmail: null };
  return { userName: storedName || "Unknown", userEmail: account?.email ?? null };
}
