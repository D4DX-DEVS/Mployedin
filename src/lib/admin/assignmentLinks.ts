/**
 * Where an admin assigns each kind of account (client report 2026-09-30, #13).
 *
 * The assignments already live on their own pages — an agent's super agent and
 * area on Agents, a super agent's team and territory on Super Agents, an
 * employer's agent on Employers — and each keeps both ends of the link in step.
 * User Management links there instead of growing a second way to do the same.
 */

const ASSIGNMENT_PAGE: Partial<Record<string, string>> = {
  agent: "agents",
  super_agent: "super-agents",
  employer: "employers",
};

export interface AssignableUser {
  _id: string;
  email: string;
  role: string;
}

/** The page that assigns this account, opened on its row; null when the role has nothing to assign. */
export function assignmentHref(user: AssignableUser, locale: string): string | null {
  const page = ASSIGNMENT_PAGE[user.role];
  if (!page) return null;
  const params = new URLSearchParams({ search: user.email, open: user._id });
  return `/${locale}/admin/${page}?${params.toString()}`;
}
