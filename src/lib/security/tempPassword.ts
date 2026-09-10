import crypto from "crypto";

/**
 * Characters left out on purpose: `I`, `l`, `1`, `O`, `0`.
 *
 * A temporary password created during a lead conversion is read aloud on a
 * call or copied out of a chat message as often as it is pasted, and those five
 * are the ones people mistype.
 */
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Default length. Comfortably over the 12-character policy minimum. */
const DEFAULT_LENGTH = 14;

const pick = (set: string) => set[crypto.randomInt(set.length)];

/**
 * A random password an agent can hand to a new employer.
 *
 * Always satisfies `strongPasswordSchema`: one character from each required
 * class is placed first so the policy cannot fail by chance, then the whole
 * string is shuffled with a CSPRNG so those four do not sit in fixed positions.
 *
 * Callers must treat the return value as write-once — store the bcrypt hash,
 * show or send the plaintext in the same response, and never persist it.
 */
export function generateShareablePassword(length = DEFAULT_LENGTH): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < Math.max(length, chars.length)) chars.push(pick(ALL));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
