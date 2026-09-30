/**
 * Deliberately permissive: the server and the verification email decide.
 * Its own module so a public form can check an email without pulling in
 * account-fields and, through passwordPolicy, zod.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
