/**
 * Team membership (invite a colleague into the employer workspace).
 *
 * Un-parked 2026-09-09. Previously `POST /api/employers/team` answered 501
 * because an accepted invite never reached the invitee's session, so the ACLs
 * behind it were dead code (EMPLOYER-FIX-PLAN E6, Option A).
 *
 * That gap is now closed: a colleague holds no Employer document of their own,
 * the session resolves their active CompanyUser membership plus the owning
 * employer's user id, and `withAuth` swaps that id in so every employer lookup
 * resolves the company. See
 * docs/superpowers/specs/2026-09-09-employer-team-members-design.md.
 */
export const TEAM_INVITE_ENABLED = true;
