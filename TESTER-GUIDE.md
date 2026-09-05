# Mployedin — Tester Guide (Intern Edition)

This document explains **what this project is, how it works, and what to test for every user role**. Read section 3 (Core Flow) first and test it before anything else. When something behaves differently than described here, that is a bug — report it using the format in the last section.

---

## 1. What is this project?

Mployedin is a **job recruitment platform** (think LinkedIn Jobs combined with a recruitment agency system). Every feature is connected — a bug in one role can break another role's screen — so always think about "who else is affected" when you find an issue.

| Role | What they do |
|------|--------------|
| **Job Seeker** | Builds a profile/CV, searches jobs, applies, attends interviews, accepts/rejects offers |
| **Employer** | Posts jobs, reviews applicants, schedules interviews, sends offers, hires |
| **Agent** | A recruiter: manages candidates and leads, refers candidates to jobs, raises invoices, earns commissions |
| **Super Agent** | Manages a team of agents, approves agent work (jobs, invoices), sees team reports, targets and territories |
| **Admin** | Runs the platform: verifies employers, approves jobs, manages users, CMS, subscriptions, targets, reports |

The site also has **public pages** (no login needed): home page, job listings, company pages, blog, FAQ, salary explorer, contact.

---

## 2. Test accounts

| Role | Email | Password | Dashboard URL |
|------|-------|----------|---------------|
| Admin | admin@mployedin.com | Admin@1234 | /en/admin |
| Job Seeker | jobseeker@mployedin.com | JobSeeker@1234 | /en/job-seeker |
| Employer | employer@test.mployedin.com | TestPass123! | /en/employer |
| Agent | agent@mployedin.com | Agent@1234 | /en/agent |
| Super Agent | superagent@mployedin.com | SuperAgent@1234 | /en/super-agent |

Login page: `/en/login`. Separate signup pages: job seeker `/en/register`, employer `/en/employer-register`, agent `/en/agent-register`.

---

## 3. Core Flow (highest priority — test this end-to-end first)

1. **Employer** logs in → *Jobs → Post a Job* (choose **Manual** mode) → fills the wizard → publishes.
2. The job is **Active immediately** — there is no admin approval queue for any role. Saving as **Draft** keeps it private until the employer publishes it. Employer verification (section 4) controls the verified badge, not whether a job goes live.
3. **Job Seeker** logs in → searches jobs → opens the job → **applies** (with CV).
4. **Employer** sees the application → moves it through pipeline stages (shortlist → interview) → **schedules an interview**.
5. **Job Seeker** sees the interview invitation on their Interviews/Calendar page.
6. **Employer** sends an **offer** → Job Seeker accepts or rejects it.
7. On hire, a **placement** is created. If an agent referred the candidate, the money flow starts (invoice → payment → commission — see section 11).

**If any step in this chain fails, stop and report immediately as Critical.**

---

## 4. Employer verification & job publishing rules (read carefully)

**No job needs approval.** Whoever publishes a job — employer, agent, or admin — the job is live to job seekers immediately. A **Draft** stays private until its poster publishes it. Admins and super-agents oversee postings from their *Jobs* pages (edit, close, delete) but never gate publication.

Employer **verification** is separate: it controls the verified badge and trust signals on the employer's profile and job cards.

**How an employer gets verified (test this flow):**

1. Log in as **Admin** → *Employers* → open an employer.
2. Use the **Verify** action. Rules to check:
   - If the employer has **no verification documents uploaded**, verification must be **refused** with a message asking for documents — unless the admin explicitly chooses **override with a reason**. Test both paths.
   - After verification, the employer's profile and job cards show the **verified** badge.
3. Everything the admin does here should appear in **Audit Logs**.

**What to verify as tester:**

- Publish a job as an unverified employer → it is visible to job seekers immediately; save another as Draft → it is NOT visible.
- Verify the employer as admin → the badge appears; job publishing behaviour is unchanged.
- Post a job as an agent → it is live immediately and appears under the employer's jobs (no approval queue anywhere).

---

## 5. Public website (no login)

- Home page loads; job search and filters work; job detail page opens.
- Company pages, blog, FAQ, salary explorer, contact form.
- **Only Active jobs appear publicly** — a pending/draft/closed job must never show.
- Language switching works (URLs start with `/en/`; check the other language too).

## 6. Authentication (all roles)

- Register through all 3 signup forms; login; logout.
- Forgot password → reset email → set new password → login with it.
- Email verification for new accounts.
- Wrong password shows a clear error (not a crash).
- Logged-out user opening a dashboard URL is redirected to login.
- **Role separation:** log in as a job seeker and type `/en/admin` in the URL bar — must be blocked/redirected. Try every role against every other role's URL.

## 7. Job Seeker

- Complete profile: personal info, experience, skills, portfolio, documents/CV upload.
- Search jobs, filter, save searches, save/bookmark jobs.
- Apply to a job; the application appears under *Applications* with correct status; status updates when employer moves it.
- Interviews and offers appear when the employer sends them; accept and decline an offer (try both).
- Messages: chat with the employer — both sides must see the conversation.
- Settings: change password, notification preferences, subscription page.

## 8. Employer

- Post a job in **both** AI mode and Manual mode (*Jobs → Post a Job*).
- Edit / close / repost jobs; job templates.
- View applicants, move them through pipeline stages, reject with feedback.
- Schedule interviews (check they appear on the calendar), fill scorecards, send offers.
- Team: invite a team member; check what the team member can and cannot see.
- Company settings, subscription and payment setup, invoices (see section 11 for the invoice flow).
- Talent pools and candidate search.

## 9. Agent

- Dashboard shows their own candidates, leads, and tasks — never another agent's.
- Add/manage candidates and leads; refer candidates to jobs.
- Referral links: generate one, open it in a private/incognito window, register a new user through it — the new user must be linked to that agent.
- Post a job on behalf of an employer → confirm it is live immediately and appears under that employer's jobs (no approval queue — section 4).
- Raise a recruitment invoice (section 11) → confirm it needs approval before it is issued.
- Targets: see assigned targets and live progress (section 10).
- Commissions: appear after invoice is paid (section 11); commission report numbers must match.
- Messages/chat, calendar, interviews.

## 10. Targets — how to test them (step by step)

Targets are yearly goals the admin sets for agents and super agents, split into monthly numbers. There are three kinds of targets in one profile:

- **Employer target** — how many employers the agent should bring in
- **Employee target** — how many candidates/placements
- **Finance target** — how much revenue

**Test flow:**

1. **Admin** → *Targets / Target Management* → create a **Target Profile** for the test agent:
   - Set the three annual numbers.
   - Choose a distribution: **equal** (same every month), **seasonal**, or **custom** (type each month yourself).
   - With **custom**, try entering months that do NOT add up to the annual total — the form must reject it with a clear error.
2. Save/assign → the **agent should receive a notification** that a target was assigned.
3. Log in as the **Agent** → *Targets* → confirm the assigned numbers and monthly breakdown match exactly what admin entered.
4. Do some real activity (e.g. a placement or a paid invoice) → open *Target Report* → progress/achievement % should move accordingly.
5. **Super Agent** → *Target Management / Target Report* → sees their team's targets and progress; **Admin** → *Target Report* → sees everyone.
6. Check an agent can only see their **own** targets, never another agent's.

## 11. Money flow: Invoices → Payment → Commissions (step by step)

This is how the platform earns and how agents get paid. Test it in this exact order:

1. **Create an invoice.** As **Agent** (or Super Agent/Admin) → *Invoices* → create a **recruitment invoice** against an employer + job. It supports line items, discount %, tax, service charge and payment terms — try a few combinations and check the totals are calculated correctly.
2. **Approval rule:** an invoice created by an **Agent** starts as **Pending Approval** — a Super Agent or Admin must approve it before it counts. Invoices created by Admin/Super Agent can be issued directly. Verify both.
3. **Payment.** The employer pays and a payment notification is recorded. Now log in as **Admin or Super Agent** → open the invoice → **Verify Payment**.
   - An **agent must NOT be able to verify payments** (they could approve their own commission) — try it as agent and confirm it is refused.
   - Partial payment: if the paid amount is less than the total, the invoice stays partially paid; only full payment makes it **Paid**.
4. **Commissions appear.** The moment the invoice becomes **Paid**, commission records are created and approved automatically for the agent (and a share for the super agent). Check:
   - **Agent** → *Commissions*: the commission from this invoice is there, with the right amount (based on the commission rate).
   - The agent received a **notification**.
   - **Commissions Report** (agent, super agent, admin views): totals match the individual records.
   - An agent sees only their own commissions; a super agent sees their team's; admin sees all.
5. **Payouts.** Admin → *Commissions / Payouts*: mark commissions as paid out and confirm status changes on the agent side.

**What counts as Critical here:** wrong commission amounts, commissions appearing before the invoice is paid, an agent verifying their own payment, or one agent seeing another agent's commissions/invoices.

## 12. Super Agent

- Everything an agent can do (sections 9–11), **plus**:
- See and manage their team of agents.
- **Invoices** page: approve/reject invoices submitted by agents (status *Pending approval*).
- Team-level reports, targets, territory management, market insights.
- Data isolation: an agent must not see other agents' data; a super agent sees only their own team, not other teams.

## 13. Admin

- **Verify employers** (section 4) — the only gate on the platform; job posts go live without admin approval.
- Manage users: job seekers, employers, agents, super agents — activate/deactivate accounts; a deactivated user must not be able to log in.
- Impersonate a user (log in as them), do something, and return to admin safely.
- CMS: edit banners/content and confirm the public site actually changes.
- Subscriptions and plans, invoices, commissions, placements, payouts.
- Targets (section 10), reports, analytics, **audit logs** (admin actions like verify/approve must be recorded here), system health.

## 14. Cross-cutting checks (apply everywhere)

- **Notifications**: every key event (application, interview, offer, job approved, target assigned, commission created) notifies the right user — bell icon and/or email.
- **Messaging**: both sides of a conversation see all messages.
- **Mobile**: main flows work on a phone-sized screen. Test desktop first, then mobile.
- **Validation**: forms reject empty/invalid input with clear messages; never a raw error screen.
- **Data isolation** (most important bug class): no user ever sees another company's/agent's/seeker's private data. Try changing IDs in URLs (e.g. open another employer's job edit page, another agent's commission) — must be denied.

## 15. Bug reporting

For every bug record: **Role + account used, URL, steps to reproduce, expected result, actual result, screenshot/recording, browser, severity.**

Severity guide:

- **Critical** — anything in the Core Flow (section 3), the money flow (section 11), a data-isolation leak, or login broken.
- **High** — a feature doesn't work but there is a workaround.
- **Medium/Low** — visual issues, typos, minor UX.

### Tips for interns

- Don't rush. Click every button, submit every form, follow every link on a page.
- Always compare **expected vs actual** — this guide is the "expected".
- Reproduce a bug **twice** before reporting it.
- Never skip the Core Flow — run it at the start of every test session.
