# Mployedin — Complete User Roles & Functionalities Documentation

> **Last Updated:** April 29, 2026  
> **Platform:** Mployedin — AI-Powered Recruitment & Staffing Platform  
> **Roles:** `admin` · `super_agent` · `agent` · `employer` · `job_seeker`

---

## Table of Contents

- [Role Hierarchy](#role-hierarchy)
- [1. Admin](#1-admin)
- [2. Super Agent](#2-super-agent)
- [3. Agent](#3-agent)
- [4. Employer](#4-employer)
- [5. Job Seeker](#5-job-seeker)
- [Shared Features (All Roles)](#shared-features-all-roles)
- [Authentication & Onboarding](#authentication--onboarding)
- [Public Pages](#public-pages)
- [API Route Summary](#api-route-summary)

---

## Role Hierarchy

```
Admin (Platform Superuser)
 └── Super Agent (Regional Team Manager)
       └── Agent (Frontline Recruiter)

Employer (Hiring Company)
Job Seeker (Candidate)
```

| Role | Access Scope | Dashboard Path |
|------|-------------|----------------|
| Admin | Full platform — all resources, all dashboards | `/admin` |
| Super Agent | Regional — team agents + territory data | `/super-agent` |
| Agent | Personal — own employers, candidates, pipeline | `/agent` |
| Employer | Company — own jobs, applications, team | `/employer` |
| Job Seeker | Personal — own applications, profile, job search | `/job-seeker` |

---

## 1. Admin

### Overview
Platform superuser with full read/write access to every resource and every dashboard section. Admin can visit ALL role dashboards and has exclusive access to system administration, CMS, audit logs, and GDPR compliance.

### 1.1 Dashboard
**Path:** `/admin`

| KPI | Description |
|-----|-------------|
| Total Users | Platform-wide count with month-over-month trend |
| New Users This Month | Comparison with previous month |
| Active Jobs | Count + jobs created this month vs last |
| Total Applications | Count + this month vs last |
| Total Interviews | All scheduled/completed interviews |
| Total Placements | Confirmed hires |
| Inactive Employers | No login for 7+ days |
| Jobs Without Applications | Zero-application postings |
| Users by Role | Breakdown (admin, super_agent, agent, employer, job_seeker) |
| Monthly Trend | 6-month sparkline for jobs + applications |

**Additional Elements:**
- Recent Users (last 4 registrations)
- Recent Jobs (last 4 posted)
- Recent Applications (last 4)
- Insight Cards (critical/warning/positive with actionable links)
- Quick Actions panel

---

### 1.2 User & Role Management

#### 1.2.1 Users (`/admin/users`)
- List all users with search, role filter, active/inactive filter
- Paginated table with bulk select
- **Create** user (name, email, password, role)
- **Bulk actions** (activate/deactivate selected)
- **Permission Editor** modal — per-user `PermissionMode` (role_default or custom) with granular custom permissions
- Export to CSV, Excel, PDF

#### 1.2.2 Agents (`/admin/agents`)
- List agents with super-agent linkage, commission rate, territory assignments
- **Create** agent (name, email, password, assign super agent, commission rate, territory via `CascadingLocationPicker`)
- **Edit** agent (reassign super agent, commission, territory)
- **Delete/deactivate** agents
- Export to CSV, Excel, PDF

#### 1.2.3 Super Agents (`/admin/super-agents`)
- List super agents with agent count, override commission rate, territory
- **Create** super agent (name, email, password, override commission, territory, assign agents)
- **Edit** super agent (reassign agents, update territory/commission)
- **Delete/deactivate**
- Export to CSV, Excel, PDF

#### 1.2.4 Employers (`/admin/employers`)
- List employers with search, pagination
- **Create** employer (contact name, email, password, company name, industry, location, phone)
- **Edit** employer details
- **Verification management** — verification level (basic/company/premium), domain verification, verification docs
- **Delete/deactivate** employers
- Export to CSV, Excel, PDF

#### 1.2.5 Job Seekers (`/admin/job-seekers`)
- List job seekers with search, pagination
- **Edit** seeker profile (name, email, nationality, location, summary)
- **Deactivate** or **Permanently Delete** seeker
- Export to CSV, Excel, PDF

---

### 1.3 Jobs & Recruitment Pipeline

#### 1.3.1 Jobs (`/admin/jobs`)
- List all jobs with rich filters: status, work mode, employment type, employer, agent, super agent
- Job detail modal with salary, location, requirements, benefits, responsibilities
- Approval status visibility (pending/approved/rejected)
- Source label showing agent/super-agent hierarchy
- Pagination, search, export

#### 1.3.2 Approvals (`/admin/approvals`)
- Dedicated view for **job approval workflow**
- Filter by approval status (pending/approved/rejected)
- Filter by employer, agent, super agent
- View job details, approve/reject jobs
- Paginated, exportable

#### 1.3.3 Applications (`/admin/applications`)
- List all applications across platform
- Filter by status (applied → hired pipeline), source (easy apply, full form, direct), employer
- **AI Match Score** display with breakdown (skills/experience/education/overall)
- **AI Insights Panel** — health score, top jobs, score distribution, avg pipeline days, recommendations
- Status stats summary (by status, by source, average AI score)
- Paginated, exportable

#### 1.3.4 Interviews (`/admin/interviews`)
- List all interviews with type, status, scheduled date, location/meet link
- Filter by status (scheduled/completed/cancelled/no_show)
- **AI Insights** — completion rate, no-show alerts, upcoming count, cancellation trends
- View interview details in modal
- Paginated, exportable

#### 1.3.5 Placements (`/admin/placements`)
- List all placements with salary, currency, visa status, commission status
- Advanced filters: visa status, commission paid, currency, date range, salary range
- Total placement value with **multi-currency breakdown**
- **Edit** placement details
- **AI Insights** generation for placement analytics
- Paginated, exportable

---

### 1.4 Financial Management

#### 1.4.1 Commissions (`/admin/commissions`)
- List commissions with agent, amount, currency, status, type
- **Create** commission (type: placement/override/bonus, amount, currency, rate, notes)
- **Edit** commission
- **Delete** commission
- Filter by status (pending/approved/paid/disputed), type, currency, date range
- Summary KPIs: pending total, approved total, paid total
- Multi-currency support
- Paginated, exportable

#### 1.4.2 Subscription Plans (`/admin/subscription-plans`)
- Full CRUD for subscription plans
- **Employer limits:** max active jobs, max application views, max team members, analytics level, data export, comm templates, scorecard evaluations, matching weight customization, workflow customization, priority support, featured job listings, branded company page
- **Job Seeker limits:** max applications/month, profile visibility boost, salary insights, priority review, resume builder
- **AI feature limits per plan** — 15 configurable AI features with enable/disable + monthly limit
- Tier system with pricing (monthly/quarterly/yearly), active/default flags, sort order

#### 1.4.3 Subscription Management (`/admin/subscriptions`)
- Search users (employer/job_seeker) to manage subscriptions
- **Assign** subscription plan to user
- **Change** plan (upgrade/downgrade)
- **Cancel** subscription
- **Renew** subscription
- **Bulk assign** to multiple users
- View subscription history per user
- Exportable

#### 1.4.4 Subscription Dashboard (`/admin/subscription-dashboard`)
- Overview KPIs: total, active, expired, cancelled, suspended subscriptions
- **By role** breakdown
- **Tier distribution** chart
- **Expiring soon** list with auto-renew status
- **Revenue stats:** total revenue, this month's revenue, paid invoice count
- **Recent activity feed** (assigned, upgraded, downgraded, renewed, cancelled)
- **Monthly trend** chart (new subs per month)

---

### 1.5 CMS / Content Management

#### 1.5.1 CMS Overview (`/admin/cms`)
Dashboard with stat cards for all 7 CMS modules + record counts.

#### 1.5.2 Banners (`/admin/cms/banners`)
CRUD for homepage banner slider — title EN/AR, subtitle EN/AR, image URL, mobile image, link, sort order, active toggle.

#### 1.5.3 Blog Posts (`/admin/cms/blogs`)
CRUD for blog articles — title EN/AR, slug, excerpt EN/AR, body EN/AR, cover image, author, tags, publish status, active toggle.

#### 1.5.4 FAQs (`/admin/cms/faqs`)
CRUD for FAQ entries — question EN/AR, answer EN/AR, category, sort order, active toggle.

#### 1.5.5 Testimonials (`/admin/cms/testimonials`)
CRUD for testimonials — name EN/AR, designation EN/AR, company EN/AR, quote EN/AR, avatar, rating 1-5, sort order, active toggle.

#### 1.5.6 Videos (`/admin/cms/videos`)
CRUD for landing page videos — title EN/AR, description EN/AR, YouTube/Vimeo URL, thumbnail, sort order, active toggle.

#### 1.5.7 Static Pages (`/admin/cms/static-pages`)
Full CRUD with dedicated create/edit pages for static content (privacy policy, terms, cookie policy, GDPR etc.) — slug, title EN/AR, HTML body EN/AR, active toggle.

#### 1.5.8 Contact Submissions (`/admin/cms/contact-submissions`)
Read-only inbox for contact form submissions — view message, mark as read/unread, delete, filter by read status, search.

---

### 1.6 Location & Job Attribute Data

#### 1.6.1 Location Data (`/admin/location-data`)
CRUD for geographic hierarchy:
- **Countries** (`/admin/location-data/countries`)
- **States** (`/admin/location-data/states`)
- **Cities** (`/admin/location-data/cities`)

Cascading parent-child relationships between levels.

#### 1.6.2 Job Attributes (`/admin/job-attributes/<category>`)
CRUD for 16 lookup categories with bilingual EN/AR support:

| Category | Description |
|----------|-------------|
| career-levels | Seniority levels (Junior, Mid, Senior, etc.) |
| degree-levels | Education levels |
| degree-types | Types of degrees |
| functional-areas | Functional areas/departments |
| genders | Gender options |
| industries | Industry categories |
| job-experience | Experience ranges |
| job-shifts | Shift types |
| job-skills | Skill tags |
| job-types | Employment types |
| language-levels | Language proficiency levels |
| major-subjects | Academic major subjects |
| marital-statuses | Marital status options |
| ownership-types | Company ownership types |
| result-types | Academic result types |
| salary-periods | Salary period options |

---

### 1.7 Communications & Notifications

#### 1.7.1 Communications Hub (`/admin/communications`)
- **Broadcast** tab — send messages to targeted roles via channels (in-app, email, WhatsApp)
- **Templates** tab — CRUD for communication templates (onboarding, transactional, marketing, system types)
- **History** tab — view past broadcast records

#### 1.7.2 Messages (`/admin/messages`)
Direct messaging with employers, agents & support tickets. New chat creation. Customer care view.

#### 1.7.3 Notification Settings (`/admin/settings/notifications`)
- **Overview** tab — stats: total users, email enabled, unsubscribed, frequency breakdown, 24h delivery, 7d by source
- **Cron Jobs** tab — toggle/manage 6 automated email jobs (daily recommendations, daily digest, re-engagement, profile completion, weekly digest, job expiry alerts)
- **Email Logs** tab — view sent email history
- **User Overrides** tab — per-user notification overrides
- **Test** tab — send test notification

---

### 1.8 Analytics & Reports

#### 1.8.1 Analytics (`/admin/analytics`)
- **AI-powered analytics** with natural language queries
- Pre-built templates: platform growth, top agents, job category trends, revenue/commission summary, employer activity, geographic distribution
- Results rendered as markdown
- Export to Excel and PDF

#### 1.8.2 Reports (`/admin/reports`)
- KPIs: total jobs, applications, placements, revenue
- Trend data (current vs previous period)
- Activity series charts (jobs + applications over time)
- Applications by status breakdown
- Hiring funnel visualization
- Alert items (critical/warning/positive)
- Top agents leaderboard (by jobs, applications, placements, revenue)
- Recent jobs & applications tables

---

### 1.9 System Administration

#### 1.9.1 Platform Settings (`/admin/settings`)
- Platform name, support email
- **Maintenance mode** toggle
- **Default currency** selector
- **SMTP configuration** (email, app password, host, port, secure flag)
- **Test email** sender

#### 1.9.2 System Health (`/admin/system-health`)
Real-time monitoring with auto-refresh (60s):
- Database — status, latency, connections
- API — status, avg response time, error rate, requests today
- Storage — used/total GB
- Users — online, total active, total registered
- Jobs — active, total, applications today
- Cron — last run, status, failed jobs
- Uptime — percentage, last downtime
- Memory — used/total MB

#### 1.9.3 Audit Logs (`/admin/audit-logs`)
- Searchable, filterable audit trail
- Filter by resource (users, jobs, applications, interviews, settings), action, country, date range
- Columns: timestamp, actor name/email/role, action, resource, IP address, country, user agent
- Change diff viewer (before/after)
- Export to CSV, Excel, PDF

#### 1.9.4 Activity Timeline (`/admin/activity-timeline`)
- Visual timeline of all platform events
- Filter by resource, role, date range
- Action icons for CRUD, login/logout, approve/reject, export/import, send, register, settings changes
- Paginated with export

#### 1.9.5 GDPR Compliance (`/admin/gdpr`)
- **Data subject requests** — export, delete, rectification, restrict processing
- Request status workflow: pending → in_progress → completed/rejected
- **Consent logs** — user, type, granted/revoked, timestamp, IP
- **Retention policies** — data category, period, auto-delete toggle, last review
- Stats: total/pending/completed requests, avg response days, data subjects, active consents

#### 1.9.6 Impersonate (`/admin/impersonate`)
- Search users and start impersonation session
- View-as-user capability for debugging/support
- Session indicator banner when impersonating

---

### 1.10 Data Operations

#### 1.10.1 Bulk Import (`/admin/bulk-import`)
- 3-step wizard: select type → upload/preview → import
- Import types: **Users**, **Jobs**, **Employers**
- CSV parsing with validation and error reporting
- Template download for each import type
- Preview parsed rows with validation status
- Import results summary (success/failed counts)

---

### 1.11 Templates & Configuration

#### 1.11.1 Matching Weight Templates (`/admin/matching-weight-templates`)
- CRUD for AI matching weight configurations
- 8 weight dimensions: skills (27%), experience (23%), education (13%), location (9%), salary (9%), languages (5%), availability (4%), behavior signals (10%)
- Weights must total 100%
- Tags, description, default flag

#### 1.11.2 Workflow Templates (`/admin/workflow-templates`)
- CRUD for hiring workflow configurations
- 8 default stages: New Application → AI Screening → Shortlisted → Interview Scheduled → Interview Completed → Offer Extended → Offer Accepted → Rejected
- Per-stage configuration: enabled, auto-progress, order
- Workflow settings: AI auto-screen, notify on stage change, auto-reject below threshold

#### 1.11.3 Poster Templates (`/admin/poster-templates`)
- Grid-view list of poster background templates
- Create/Edit with dedicated pages
- Active/inactive toggle per template
- Filter by status

---

### 1.12 Territory & Referrals

#### 1.12.1 Territory Management (`/admin/territory`)
- Create territories with name + GCC countries (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Egypt, Jordan, Lebanon)
- Assign to super agents
- Search territories

#### 1.12.2 Referral Links (`/admin/referral-links`)
- List all referral links across platform
- Status: active, expired, maxed, inactive
- Creator info, used count, max uses, expiry date
- Toggle active/inactive
- Copy link, expandable detail view
- Paginated, exportable

---

### 1.13 Development Tools

#### 1.13.1 Design System (`/admin/design-system`)
Internal component showcase — brand colors, typography, buttons, status badges, etc.

#### 1.13.2 Task Board (`/admin/tasks`)
Project task tracker with phases, progress bars, task status (pending/in-progress/completed).

---

### Admin Permission Matrix

| Resource | Actions |
|----------|---------|
| `users` | create, read, update, delete, **impersonate** |
| `jobs` | create, read, update, delete, **approve**, export |
| `applications` | create, read, update, delete, export |
| `interviews` | create, read, update, delete |
| `placements` | create, read, update, delete, export |
| `leads` | create, read, update, delete, export |
| `commissions` | create, read, update, delete, **approve**, export |
| `employers` | create, read, update, delete, **approve** |
| `agents` | create, read, update, delete |
| `super_agents` | create, read, update, delete |
| `job_seekers` | create, read, update, delete |
| `notifications` | create, read, update, delete |
| `reports` | read, export |
| `audit_logs` | read, export *(exclusive)* |
| `cms` | create, read, update, delete *(exclusive)* |
| `job_attributes` | create, read, update, delete *(exclusive)* |
| `location_data` | create, read, update, delete *(exclusive)* |
| `contact_submissions` | read, update, delete *(exclusive)* |
| `offers` | create, read, update, delete |
| `tasks` | read, update |

**Total Admin Pages: ~40+**

---

## 2. Super Agent

### Overview
Regional team manager. Oversees a pool of Agents, approves their job postings, and monitors team-wide performance metrics. All data is scoped to the super agent's managed agents and assigned territory.

### 2.1 Dashboard
**Path:** `/super-agent`

| KPI | Description |
|-----|-------------|
| Active Agents | Live team roster count |
| Total Employers | Under agents' management |
| Total Placements | Confirmed hires across team |
| Commissions Earned | Formatted currency total |
| Jobs Posted | Total + active count |
| CVs Received | Total applications |
| Leads Generated | Across all agents |

**Quick Actions:** Agent Performance, Lead Pipeline, Job Approvals, Commission Report

---

### 2.2 Agent Management (`/super-agent/agents`)
- **List** agents with performance stats (leads, conversions, placements, conversion rate, avg response hours)
- **Create** new agent (name, email, password, commission rate, territory via `CascadingLocationPicker`)
- Search by name/email
- **Advanced filters:** Performance tier (high performer, needs attention, slow response, no activity), leads range, conversion rate range
- Sort by name, leads, conversions, placements, conversion rate, response time
- **AI Explain** button per agent
- Export to CSV/Excel/PDF, pagination

### 2.3 Agent Detail (`/super-agent/agents/[id]`)
- Agent profile: referral code, country, currency, timezone, working hours, commission rate
- Performance metrics: leads generated, employers created, vacancies posted, job seekers submitted, interviews scheduled, placements completed
- Lead list with status breakdown
- Referral links with registration counts
- Recent activity log
- **Edit agent:** commission rate, working hours, working days, active status, territory

---

### 2.4 Applications (`/super-agent/applications`)
- Read-only pipeline view across team
- Metrics: Total Applications, Shortlisted, Hired, Conversion Rate
- Filters: search, status (applied → hired/rejected/withdrawn), agent
- Table: Candidate, Job, Agent, Status, Match Score, Source, Applied Date

### 2.5 Approvals (`/super-agent/approvals`)
- **Job approval gate** — agents cannot self-publish; SA approves/rejects
- KPIs: Total Jobs, Active, Draft, Employers
- Filters: status, search by title, date range
- Job detail dialog with full info
- Approve/reject actions via PATCH

### 2.6 Commissions (`/super-agent/commissions`)
- KPIs: Visible Payouts, Pending count, Approved count, Override Rate %
- **Override rate setting** — inline edit + save
- Update commission status (approve/reject/mark paid)
- Filters: status, search, type, currency, date range
- Export to CSV/Excel/PDF

### 2.7 Employers (`/super-agent/employers`)
- Employer directory with onboarding capability
- Metrics: Total, Active, Assigned to agents, Revenue
- Filters: search, industry, location, status, verified, sort
- **Onboard new employer** — create account with details
- **Generate referral link** for employer self-registration
- Export with column sorting

### 2.8 Insights — AI (`/super-agent/insights`)
- AI-powered alerts, opportunities, and recommendations
- Insight types: alert, metric, tip, opportunity
- Severity levels: critical, warning, info
- Confidence scoring: high, medium, low
- Actionable insights: assign_leads, send_reminder, navigate, generate_report
- Feedback system — thumbs up/down
- 7-day analysis window with 14-day comparison
- Detects: slow response agents, stale leads, inactive agents, conversion opportunities

### 2.9 Interviews (`/super-agent/interviews`)
- Team-wide interview monitoring
- Metrics: Total Interviews, Scheduled, Completed, Cancel Rate %
- Filters: search, status, type (video/in-person/hybrid)
- Table: Candidate, Job, Agent, Type, Status, Scheduled Date, Duration

### 2.10 Job Seekers (`/super-agent/job-seekers`)
- Read-only candidate directory for the region
- Metrics: Total Candidates, Active Profiles, Avg Profile Completion %, Experienced (3+ yrs)
- Filters: search, country, experience level

### 2.11 Jobs (`/super-agent/jobs`)
- Comprehensive job management with **AI-powered natural language search**
- KPIs: Total, Active, Draft, Closed, Expired, Pending, Paused, Employers, Agents
- Standard filters: status, employment type, work mode, country, city, skills, salary range, experience range, date range
- **AI Search:** Natural language queries (e.g. "Show me all remote jobs", "Jobs in UAE paying above 10000 AED")
- **AI Quick Chips** — 8 preset AI search suggestions
- Job detail dialog, export, pagination

### 2.12 Leads (`/super-agent/leads`)
- Full lead pipeline across all agents
- Stages: new → contacted → interested → negotiating → converted → lost
- Filters: status, search, country, industry, source, agent, date range, follow-up date range, has notes, has follow-up, overdue follow-ups
- **AI search** with summary generation
- Facets: countries, industries, sources
- Export to CSV/Excel/PDF

### 2.13 Market Intelligence — AI (`/super-agent/market`)
- AI-powered global recruitment market research
- Free-text query about any recruitment market worldwide
- **12 quick query presets** (e.g. "Top 5 most in-demand job categories in UAE")
- Report output: Summary, Insight cards (salary, demand, job categories), Strategic recommendations

### 2.14 Messages (`/super-agent/messages`)
Direct messaging with agents, employers, and team. New chat creation.

### 2.15 Placements (`/super-agent/placements`)
- Placement tracking with visa status and commission tracking
- Visa statuses: not_required, pending, approved, rejected, stamped
- Filters: visa status, search, commission paid, currency (12 currencies), salary range, date range, agent, employer
- Salary by currency aggregation
- Export to CSV/Excel/PDF

### 2.16 Referral Links (`/super-agent/referral-links`)
- Metrics: Total Links, Active Links, Total Registrations, My Links, Agent Links
- **Create** referral link (label, max uses, expiry)
- Toggle active/inactive, copy URL, delete
- **AI search** for filtering links
- Expandable rows showing registration details
- Export to CSV/Excel/PDF

### 2.17 Reports (`/super-agent/reports`)
- KPIs: Agents Managed, Total Leads, Placements, Commissions
- Agent Performance Breakdown (per-agent comparison)
- Monthly Trends (6-month view)
- **AI Report Generation** with 4 templates:
  1. Team performance summary
  2. Agent comparison analysis
  3. Lead pipeline health
  4. Commission forecast
- Download report as `.txt` file

### 2.18 Settings (`/super-agent/settings`)
6 tabs:
| Tab | Features |
|-----|----------|
| Profile & Avatar | Photo upload, name, phone, email |
| Region & Currency | Country, currency code, display preferences |
| Commission Rate | Override rate for placements (%) |
| Notifications | Per-category prefs (placements, commissions, team, jobs, system) with channel toggles (in-app, email), email frequency, daily digest time |
| Availability | Timezone, working hours, working days |
| Account & Security | Password changes, account actions |

### 2.19 Territory Map (`/super-agent/territory`)
- Metrics: Regions count, Agents across regions, Employers in territory, Active Jobs
- Coverage legend: High (5+ agents), Good (3-4), Low (1-2), No Coverage (0)
- Territory grid cards with heat coloring based on agent density

### 2.20 Action APIs
| Action | Description |
|--------|-------------|
| Assign Leads | Reassign unworked leads between agents |
| Send Reminder | Send performance reminder notifications to agents (up to 10) |

---

### Super Agent Permission Matrix

| Resource | Actions |
|----------|---------|
| `jobs` | read, export |
| `applications` | read, export |
| `interviews` | read |
| `placements` | read, export |
| `leads` | create, read, update, delete, export |
| `commissions` | read, **approve**, export |
| `employers` | read |
| `agents` | create, read, update *(no delete)* |
| `job_seekers` | read |
| `notifications` | read |
| `reports` | read, export |
| `ai_assistant` | read |

**Cannot access:** users, audit_logs, cms, job_attributes, location_data, contact_submissions, impersonate.

**Total Super Agent Pages: 19**

---

## 3. Agent

### Overview
Frontline recruiter and individual contributor. Manages own book of business — employers, candidates, jobs, leads, and the full hiring pipeline. Reports optionally to a Super Agent.

### 3.1 Dashboard
**Path:** `/agent`

| KPI | Description |
|-----|-------------|
| Active Employers | Assigned employer count |
| Active Jobs | Job postings managed |
| Total Applications | Applications received |
| Placements | Confirmed hires |

**Recruitment Funnel Metrics:** Leads Generated, Employers Created, Vacancies Posted, Interview Rate %, Offer Rate %, Placements

**Per-Job Metrics Table:** Top 10 jobs ranked by application count (title, status, applications, interviews, offers, interview rate %, offer rate %)

**Quick Actions:** Add Lead, Post Job, My Jobs, Candidates, View Job Seekers, Performance Report

---

### 3.2 Jobs (`/agent/jobs`)
- Paginated listing with search, status tabs (All/Draft/Active/Closed), employer filter
- **AI-powered search** with natural language queries
- Export to CSV/Excel/PDF
- Links to job detail and "View Candidates" per job

### 3.3 Job Detail (`/agent/jobs/[id]`)
Read-only job view: title, location, category, employment type, salary, description, requirements, skills, vacancies, status, dates.

### 3.4 Post New Job (`/agent/jobs/new`)
- Post job **on behalf of an employer** (employer selector dropdown)
- Form: title, category, location, employment type, salary min/max/currency, description, requirements
- Job goes to approval queue (Super Agent/Admin must approve)

### 3.5 Candidates Pipeline (`/agent/candidates`)
- View all applications across agent's managed jobs
- Filter by status (applied → hired/rejected) and jobId
- **Status update** — push candidates through pipeline stages
- **AI Match Score** display with color coding (80%+ green, 60%+ yellow, below red)
- Pipeline summary cards: total, shortlisted, interview, high-match
- Export to CSV/Excel/PDF

### 3.6 Employers (`/agent/employers`)
- List assigned employers with search and pagination
- **CRUD:** Create, Edit, Delete employer accounts
- **Onboard new employer** — create account with name, email, temp password, company details
- **Referral link system** — generate/view referral links for employer self-registration with stats
- Permission-gated actions

### 3.7 Leads Pipeline (`/agent/leads`)
- Full CRM-style lead management
- Stages: New → Contacted → Interested → Negotiating → Converted → Lost
- **CRUD:** Create, edit, delete leads
- **AI Lead Scoring** — score (0-100), temperature (hot/warm/cold), reasoning, next action, risk factors, draft follow-up message
- **Lead → Employer Conversion** — convert qualified lead into employer account
- Search + status filter + pagination
- Export to CSV/Excel/PDF

### 3.8 New Lead Form (`/agent/leads/new`)
Dedicated form: company name, contact person, email, phone, country, industry, source (Referral/Cold Call/LinkedIn/Website/Event/Other), follow-up date, notes.

### 3.9 Interviews (`/agent/interviews`)
- List with rich filtering: status, employer, job, type, outcome, date range
- **CRUD:** Create/edit interviews (scheduled date, type, notes)
- Status counts summary
- Export to CSV/Excel/PDF

### 3.10 Placements (`/agent/placements`)
- Track successful hires: candidate, job, employer, salary, status, start date
- Summary: completed, offer stage, start dates confirmed, total salary value
- Export to CSV/Excel/PDF

### 3.11 Commissions (`/agent/commissions`)
- **Read-only** commission tracking
- Summary: pending, approved, paid, disputed totals
- Filters: status, type (Placement/Override/Bonus), currency (10 currencies), date range
- Table: job title, candidate, type, amount, currency, status, date
- Export to CSV/Excel/PDF

### 3.12 Offers (`/agent/offers`)
- Track all offers: Total, Pending, Accepted, Declined
- Filter by search and status
- Table: candidate, job, company, salary, status, start date, expiry date

### 3.13 Referral Links (`/agent/referral-links`)
- **Create** referral links (label, max uses, expiration date)
- View stats: referral code, used count, registrations, status
- Toggle active/inactive, delete, copy URL
- Expandable rows showing registration details
- Export to CSV/Excel/PDF

### 3.14 Reports & Analytics (`/agent/reports`)
- **KPI Cards with 30-day Trends:** leads, placements, applications, active jobs, offers, interviews, employers, overdue follow-ups
- **Lead Funnel Visualization**
- **Application Status Breakdown**
- **Commission Summary** by status
- **Monthly Trends** (6-month MoM)
- **AI Report Generation** with 4 templates:
  1. This week's activity summary
  2. Top conversion opportunities
  3. Follow-up priority list
  4. Monthly performance overview

### 3.15 Calendar (`/agent/calendar`)
Google Calendar-style monthly view of all interviews with type, status, duration, meet link.

### 3.16 Chat (`/agent/chat`)
- Slack-style channel-based messaging: #general, #employers, #leads, #agents
- Real-time messages with 30-second polling
- Role-colored names, channel sidebar

### 3.17 Direct Messages (`/agent/messages`)
1-to-1 messaging with employers & super agents.

### 3.18 Job Seekers Browser (`/agent/job-seekers`)
- Browse/search all job seeker profiles
- Filters: availability, profile completeness %, location, skills, has CV, preferred job type
- Edit seeker (job title, location)
- Export to CSV/Excel/PDF

### 3.19 Tasks (`/agent/tasks`)
- Personal task manager
- **CRUD:** Create, update status, delete
- Fields: title, description, priority (high/medium/low), category (follow_up/call/meeting/document/other), due date
- Status: pending → in_progress → completed
- Filter and search

### 3.20 Settings (`/agent/settings`)
6 tabs (identical structure to Super Agent):
| Tab | Features |
|-----|----------|
| Profile & Avatar | Photo upload/delete, name, phone |
| Region & Currency | Country, currency code |
| Commission Rate | Placement commission rate |
| Notifications | Per-category toggles with in-app/email channels, frequency |
| Availability | Timezone, working hours, working days |
| Account & Security | Password change, account actions |

---

### Agent Permission Matrix

| Resource | Actions |
|----------|---------|
| `jobs` | create, read, update, export *(no delete, no approve)* |
| `applications` | read, update, export |
| `interviews` | create, read, update |
| `placements` | read |
| `leads` | create, read, update *(no delete)* |
| `employers` | create, read, update *(no delete)* |
| `job_seekers` | read, update |
| `notifications` | read |
| `ai_cv` | read |
| `ai_match` | read |
| `ai_assistant` | read |

**Cannot access:** commissions (approve/delete), users, audit_logs, cms, reports (platform level), super_agents.

### Agent Messaging Rules
| From | To | Allowed |
|------|----|---------|
| agent | employer | ✅ always |
| agent | job_seeker | ⚠️ conditional (shared application required) |
| agent | agent | ✅ via general chat channel |

**Total Agent Pages: 20**

---

## 4. Employer

### Overview
Hiring company role. Manages job postings, candidate pipeline, interviews, offers, and team collaboration. Full AI-assisted hiring tools including AI job creation, candidate matching, interview prep, and analytics.

### 4.1 Dashboard
**Path:** `/employer`

| Feature | Description |
|---------|-------------|
| Smart Welcome Header | Personalized greeting with contextual stats |
| Priority Actions | Action cards for items needing attention |
| Candidate Quality Chart | Doughnut/bar chart of AI match score distribution |
| Interactive Hiring Pipeline | 4-stage funnel (Applied → Screening → Interviews → Offers) |
| Current Openings | Active job listings at a glance |
| Openings Stats | Active jobs, total applications, offers |
| Time to Hire | Average days from application to placement |
| Setup Guide | Onboarding checklist for new employers |

---

### 4.2 Jobs Management (`/employer/jobs`)
- List all jobs with pagination
- Filters: status, work mode, salary visibility, location, skills
- **AI-powered natural language job search**
- **CRUD:** Create, clone, delete jobs
- Status management: activate, deactivate, pause
- Save job as template
- **Generate job poster image** (visual poster for social media)
- Export to CSV/Excel/PDF

**Sub-Pages:**
| Page | Path | Description |
|------|------|-------------|
| New Job Hub | `/employer/jobs/new` | Choose AI-assisted or manual mode |
| AI Job Creator | `/employer/jobs/ai-create` | Conversational AI with voice input (EN, AR, Malayalam, Hindi, Tamil, Telugu, Urdu). Extracts job details from natural language |
| Job Detail | `/employer/jobs/[id]` | Tabs: Overview, Workflow, Matching Weights. Actions: edit, clone, delete, change status, generate poster |
| Job Edit | `/employer/jobs/[id]/edit` | Full form: title, description, category, country search, skills, experience, salary (multi-currency), employment type, work mode, vacancies, tags, responsibilities, qualifications, benefits, learning outcomes, application mode, expiry date |

### 4.3 Applications (`/employer/applications`)
- Full pipeline management (applied → hired/rejected)
- **AI Match Scoring** with breakdown (skills, experience, overall), strengths & gaps
- **Bulk Actions** — bulk AI matching, bulk status updates
- Resume viewer modal
- Application timeline/history
- Create interview directly from application
- Create offer directly from application
- Scorecard creation per application
- Screening answers display
- Export to CSV/Excel/PDF

### 4.4 Candidates (`/employer/candidates`)
- Browse all candidates who applied to employer's jobs
- **AI-powered candidate search** with natural language suggestions
- Filters: job, availability, score band (high/good/low/unscored)
- **AI batch matching** (up to 20 candidates)
- **AI candidate screening**
- Start direct conversation with candidate
- Resume viewer
- Session-persistent match review list
- Export to CSV/Excel/PDF

**Candidate Detail (`/employer/candidates/[id]`):**
5 tabs: Profile (skills, experience, education, languages, certifications, availability, badges, CV, preferences), Applications (per-job status, match scores), Interviews (type, schedule, status, outcome), Timeline (status change history), Notes (per-job notes from team members).

### 4.5 Interviews (`/employer/interviews`)
- List with filter by status
- **AI Interview Questions Panel** — AI-generated questions based on job, candidate skills
- **AI Prep Brief** — candidate summary, strengths, areas to probe, suggested questions with follow-ups, red flags, interview strategy, time allocation
- Complete interview (outcome: strong_hire, hire, no_hire, strong_no_hire)
- Reschedule, schedule next round, create offer, forward, cancel
- Export to CSV/Excel/PDF

**Bulk Interviews (`/employer/interviews/bulk`):**
Select multiple shortlisted candidates, pick date/time/duration/type, schedule all at once.

### 4.6 Calendar (`/employer/calendar`)
- Monthly calendar view of scheduled interviews
- Events color-coded by status
- Book interviews directly from calendar
- Today's count and upcoming count stats

### 4.7 Offers (`/employer/offers`)
- List with status filter (pending/accepted/declined/expired/withdrawn)
- Summary KPIs: pending, accepted, expiring soon, responded
- Offer detail modal
- Withdraw offers
- Expiry warnings
- Export to CSV/Excel/PDF

### 4.8 Placements (`/employer/placements`)
- Track successful hires
- Stats: total, active, completed, this month
- Candidate, position, type, salary (multi-currency), start date
- Export to CSV/Excel/PDF

### 4.9 Scorecards (`/employer/scorecards`)
- Interview scorecards with 1-5 scale
- Recommendation labels: Strong Yes, Yes, Neutral, No, Strong No
- **Feedback Trends Panel** — aggregate trends from scorecards
- Export to CSV/Excel/PDF

### 4.10 Analytics (`/employer/analytics`)
4 rich tabs:
| Tab | Features |
|-----|----------|
| **Pipeline** | Live funnel health, stage distribution, conversion rates, per-job breakdown, source analysis, rejection reasons |
| **Historical** | Trends over time (7d/30d/90d/180d/custom), drop-off analysis, time-to-hire benchmarks |
| **Performance** | Job-level visibility and application lift metrics |
| **Response Time** | SLA tracking, response time commitments |

Auto-refresh every 30 seconds, date range selector with custom support, export capability.

### 4.11 Messages (`/employer/messages`)
Direct messaging with agents & super agents. New chat initiation.

### 4.12 Communication Templates (`/employer/comm-templates`)
- Pre-written email templates: Rejection, Interview Invite, Follow-up, Offer
- Create new templates (name, type, subject, body)
- Delete, filter by type
- Feature-gated

### 4.13 Job Templates (`/employer/job-templates`)
- Reusable job posting templates
- Create, search, delete, copy/duplicate
- Tracks usage count

### 4.14 Workflow Configuration (`/employer/workflow`)
- Customize hiring pipeline stages (up to 20)
- Default 8 stages: New Application → AI Screening → Shortlisted → Interview Scheduled → Interview Completed → Offer Extended → Offer Accepted → Rejected
- Enable/disable stages, toggle auto-progression
- Reorder stages, add custom stages
- Settings: AI auto-screen, notify on stage change, auto-reject threshold
- Save/load workflow templates
- Feature-gated

### 4.15 Matching Weights (`/employer/matching-weights`)
- Configure AI matching weight distribution (must sum to 100):
  - Skills Match (27%), Experience (23%), Education (13%), Location (9%), Salary (9%), Languages (5%), Availability (4%), Behavior Signals (10%)
- Slider/input per dimension
- Reset to defaults, save/load templates
- Feature-gated

### 4.16 Team Management (`/employer/team`)
- Invite team members by email
- Roles: Owner, Admin, Hiring Manager, Viewer
- Job-level access control for Hiring Manager & Viewer
- Update roles, edit job access, deactivate members
- Stats: active, pending, total

**Activity Logs (`/employer/team/activity-logs`):**
Full audit log — all team actions (logins, job changes, interview actions, application updates, offers, scorecards, messages, settings, placements). Filter by member, action type, date. Displays IP address, country, user agent.

### 4.17 Settings (`/employer/settings`)
5 tabs:
| Tab | Features |
|-----|----------|
| Company Profile | Logo upload, company name, description, industry, size, founded year, designation, address |
| Contact & Social | Email, phone, website, LinkedIn, Twitter, Facebook, Instagram |
| Hiring Preferences | Default job visibility, work type preference, preferred locations |
| Notifications | Email toggles (new applicant, interview scheduled, offer response, weekly digest) + in-app toggle |
| Account & Security | Verification status, plan info, danger zone |

**Additional Settings:**
- SMTP override configuration (custom email sending)
- Domain verification (email + confirmation)
- Verification document upload (PDF, JPEG, PNG, WEBP, DOCX; max 10MB, max 10 docs)

### 4.18 Subscription (`/employer/subscription`)
- Current plan details and renewal date
- Usage meters per feature
- AI usage tracking (AI Chat, Daily Insights, Job Matching, CV Extraction, Interview Questions, Skills Gap, Candidate Screening, Salary Benchmark, Job Description Gen, Hiring Reports, Voice Input)
- Invoice history
- Currency display selector with live exchange rates
- Feature gate map visualization

### 4.19 Payment Setup (`/employer/payment-setup`)
- Choose payment gateway: Stripe (Global) or Tap Payments (GCC/MENA)
- Enter public/publishable key and secret key
- Connection status indicator

### 4.20 Training Tracker (`/employer/training`)
- Track team upskilling/training items
- Create entries: title, provider, URL, target role, due date, notes
- Status: Not Started → In Progress → Completed
- Suggested trainings: Gulf Labour Law, CIPD HR Certificate, Excel for HR, Interviewing Skills, Arabic Communication

---

**Total Employer Pages: 27**

---

## 5. Job Seeker

### Overview
Candidate role. Full job discovery, application lifecycle, profile/CV management with AI assistance, skills coaching, messaging, referral programs, and granular automation settings.

### 5.1 Dashboard
**Path:** `/job-seeker`

| KPI | Description |
|-----|-------------|
| Applications Sent | Total applications count |
| Upcoming Interviews | Future, non-cancelled |
| Saved Jobs | Bookmarked job count |
| Recruiter Views | Profile views in last 30 days |

**Features:**
- AI match-scoring of recent active jobs against profile
- Excludes already-applied jobs from recommendations
- Top 6 recommended jobs (≥30% match score, sorted descending)
- 5 most recent applied jobs with status

---

### 5.2 Applications (`/job-seeker/applications`)
- Status filter tabs: All, Applied, Shortlisted, Interview, Selected, Offer, Hired, Rejected
- Search by job title, date range filtering
- Expandable cards: job details, salary, location, cover letter, status history timeline
- Latest interview details (type, time, meet link)
- Latest offer details (salary, start date, benefits)
- Placement info when hired
- **Withdraw** application action
- Export to CSV/Excel/PDF

### 5.3 Application Feedback (`/job-seeker/applications/[id]/feedback`)
- Post-decision feedback on hiring experience
- Star rating (1-5) with labels
- Text comment
- Only available after terminal statuses (hired, rejected, withdrawn)

### 5.4 Calendar (`/job-seeker/calendar`)
Google Calendar-style monthly view of upcoming interviews with type, status, meet link, company name.

### 5.5 Companies (`/job-seeker/companies`)
- Browse all employers on the platform
- Search by company name, industry, location
- Company cards: logo, name, industry, location, size, active job count, verified badge
- Links to company profiles

### 5.6 Company Detail (`/job-seeker/companies/[id]`)
- Company info: name, logo, industry, size, founded year, location, website, social links
- Verification badges (domain, agent verified)
- Active job listings by this employer
- Profile view tracking

### 5.7 Courses & Training (`/job-seeker/courses`)
- 6 curated external courses: Business English, Project Management, Data Analysis, Customer Service, Digital Marketing, Construction Safety
- Category color-coding, free/paid badges
- External links to providers (Coursera, Alison, Microsoft Learn, Google, OSHA)

### 5.8 CV Builder (`/job-seeker/cv`)
- Full CV/resume builder
- Sections: Skills, Work Experience, Education, Languages, Certifications, Projects
- **Multiple PDF templates** with template picker
- Formatting options (colors, fonts)
- **AI-powered text writing**
- CV upload & import from existing resume
- Pro template access (subscription-gated)
- PDF download & preview (full-screen toggle)
- Auto-fills from profile data

### 5.9 Documents (`/job-seeker/documents`)
- Document categories: Resume/CV, College Certificate, Course Certificate, Professional Certificate, Other
- Drag-and-drop upload (PDF, DOCX, JPG, PNG, WEBP)
- **AI-powered data extraction** from uploaded resumes (name, skills, experience, education, languages, certifications)
- View/delete documents

### 5.10 Experience (`/job-seeker/experience`)
- Add/edit/delete work experience entries
- Fields: job title, company, country, start/end dates, current job toggle, description
- Debounced auto-save (800ms)
- **AI-enhanced descriptions**
- Drag-to-reorder

### 5.11 Interviews (`/job-seeker/interviews`)
- Split view: Upcoming vs Past
- Interview card: job title, company, type (video/offline/hybrid), time, duration, meet link, location
- **Candidate response actions:** Confirm, Decline, Request Reschedule
- Search, pagination, export

### 5.12 Jobs Feed (`/job-seeker/jobs`)
Main job browsing feed with:
- Job search and listing
- AI-recommended jobs
- Job title suggestions
- Apply to jobs
- Save/unsave jobs
- Job view tracking

### 5.13 Job Detail (`/job-seeker/jobs/[id]`)
- Full job description with markdown sections
- Employer info with verification badges
- Salary, closing date, location
- **Easy Apply** modal with screening questions
- **Similar Jobs** section
- **Skill Insights** (gap analysis vs. job requirements)
- **Share Job** functionality
- SEO metadata (Open Graph)

### 5.14 Messages (`/job-seeker/messages`)
Real-time messaging with employers and customer support.

### 5.15 Offers (`/job-seeker/offers`)
- View all offers: job title, salary (amount, currency, period), start date, benefits, notes
- Status: Pending, Accepted, Declined, Expired, Withdrawn
- **Accept/Decline** actions (decline reason required)
- Expiry detection
- Search, pagination, export

### 5.16 Portfolio & Projects (`/job-seeker/portfolio`)
- Create projects: title, description, URL, image URL, technologies, date range
- Project grid display
- Delete projects
- External link and GitHub integration

### 5.17 Preferences (`/job-seeker/preferences`)
- Preferred roles (with popular role suggestions)
- Preferred countries/locations (MENA region + Remote)
- Salary expectations with currency-specific presets (USD, INR, AED, SAR, EGP, KWD, QAR, BHD, OMR)
- Job type: Remote, Hybrid, Onsite, Any
- Availability: Immediately, Within 1 Month, Within 3 Months, Not Available
- Notice period
- Match score computation with improvement tips

### 5.18 Profile (`/job-seeker/profile`)
- Profile completeness progress bar with checklist:
  - CV +30%, Skills +20%, Experience +15%, Education +10%, Personal Details +10%, Job Preferences +15%
- Avatar upload/change
- Inline edit modals: Name, Headline, Summary
- **AI-generated summary**
- Profile visibility toggle (visible/hidden)
- Sections: Skills, Experience, Education, Languages, Certifications, Projects, Accomplishments, Career Profile, Social Links, Badges

### 5.19 Personal Details (`/job-seeker/profile/personal-details`)
- Gender selection, marital status
- Date of birth (min age: 16)
- Work permit countries (multi-select)
- Address: permanent address, hometown, pincode
- Languages with proficiency levels (Basic, Conversational, Professional, Native)

### 5.20 Referral Program (`/job-seeker/referral`)
- Unique referral code & shareable link
- Social media sharing
- KPI cards: Total Referrals, Successful, Pending, Rewards Earned
- Referral history table (name, email, status, date)

### 5.21 Saved Searches (`/job-seeker/saved-searches`)
- Create saved searches: name, query, location filter, job type filter
- Email alert frequency: Daily, Weekly, Never
- Toggle alerts on/off per search
- Delete saved searches

### 5.22 AI Job Search (`/job-seeker/search`)
- Natural language AI-powered job search
- Free-text: "Senior React developer Dubai salary AED 15k minimum"
- Pre-built prompt suggestions
- Match score display per result with color coding
- Fallback to basic search if NL fails

### 5.23 Settings (`/job-seeker/settings`)
- **Auto-Apply:** Toggle with min match score (50-95%), verified employers only
- **Apply Speed:** Safe (≥85%), Balanced (≥70%), Aggressive (≥55%)
- **Interview Booking:** Instant booking toggle, timezone, time buffer, weekly availability schedule with per-day hours
- **Availability Calendar** for granular scheduling
- **Resume Management:** Default resume, auto-generate cover letter toggle, cover letter tone (Professional/Friendly/Bold)
- **Auto-answer screening questions**
- **Profile Visibility:** Show salary toggle, open to relocation toggle
- **Notifications:** Job match alerts, application submitted, interview notifications

### 5.24 Notification Preferences (`/job-seeker/settings/notifications`)
- Email frequency: Instant, Daily Digest, Weekly Summary, Off
- Per-category toggles with channel selection (In-App, Email, WhatsApp):
  - Job Recommendations, Application Updates, Interview Alerts, Offer Notifications, Profile Views, Tips & Updates, Security & System
- Unsubscribe all toggle
- Daily digest time setting

### 5.25 Skills Coach — AI (`/job-seeker/skills`)
- AI-powered skills gap analysis with radial progress
- Target role selection (popular roles quick-pick)
- Critical gaps with priority (high/medium/low), learning paths, demand percentages
- Existing strengths display
- Platform demand data (matching jobs, demanded skills, missing skills)
- Skills coach progress tracking (previous vs current score)
- Skill suggestions (technical/soft/language/certification)
- Recommended jobs based on skills
- Projected score after filling gaps

### 5.26 Subscription (`/job-seeker/subscription`)
- Current plan with expiry countdown
- Usage meters per feature
- AI usage tracking (AI Chat, Daily Insights, CV Extraction, Skills Suggest, Skills Gap, Interview Questions, Profile Fill, Enhance Text, Generate Summary, Voice Input)
- Invoice history
- Currency preference selector with live exchange rates

---

**Total Job Seeker Pages: 26**

---

## Shared Features (All Roles)

### Notifications (`/notifications`)
All logged-in users have access to a shared notifications page with real-time notification feed.

### Internationalization (i18n)
- Full bilingual support: **English** and **Arabic**
- All pages, labels, and CMS content support EN/AR
- RTL layout for Arabic
- Locale-based routing (`/en/...`, `/ar/...`)

### Messaging System
- Unified `UnifiedMessagesPage` component shared across roles
- Real-time polling (30-second intervals)
- Direct messages (DM) and channel-based chat
- Customer care/support channel (job seeker, employer)

### CSRF Protection
All mutating API endpoints are CSRF-protected via `csrfFetch`.

### Data Export
Most list pages support export to:
- CSV (comma-separated values)
- Excel (.xlsx)
- PDF (formatted report)

### Subscription & Feature Gating
- Features gated by subscription tier
- AI usage limits per feature per plan
- Feature gate visualization on subscription pages

---

## Authentication & Onboarding

### Authentication Pages
| Page | Path | Description |
|------|------|-------------|
| Login | `/login` | Email/password login |
| Register (Job Seeker) | `/register` | Job seeker self-registration |
| Employer Register | `/employer-register` | Employer self-registration (supports referral codes) |
| Agent Register | `/agent-register` | Agent registration |
| Forgot Password | `/forgot-password` | Password reset request |
| Reset Password | `/reset-password` | New password entry |
| Verify Email | `/verify-email` | Email verification |

### Onboarding
| Path | Description |
|------|-------------|
| `/onboarding` | Multi-step onboarding wizard for new users |

---

## Public Pages

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with banners, testimonials, videos |
| Jobs | `/jobs` | Public job board |
| Blog | `/blog` | Blog articles |
| FAQ | `/faq` | Frequently asked questions |
| Contact | `/contact` | Contact form |
| Privacy Policy | `/privacy` | Privacy policy |
| Terms of Service | `/terms` | Terms and conditions |
| Cookie Policy | `/cookies` | Cookie policy |
| GDPR | `/gdpr` | GDPR information |

---

## API Route Summary

### Admin API Routes (~50+)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/admin/activity-timeline` | GET | Platform activity timeline |
| `/api/admin/agents` | GET, POST | Agent CRUD |
| `/api/admin/analytics` | GET | AI-powered analytics |
| `/api/admin/audit-logs` | GET | Audit log entries |
| `/api/admin/bulk-import` | POST | CSV bulk import |
| `/api/admin/cms/banners` | GET, POST, PATCH, DELETE | Banner CRUD |
| `/api/admin/cms/blogs` | GET, POST, PATCH, DELETE | Blog CRUD |
| `/api/admin/cms/contact-submissions` | GET, PATCH, DELETE | Contact inbox |
| `/api/admin/cms/faqs` | GET, POST, PATCH, DELETE | FAQ CRUD |
| `/api/admin/cms/static-pages` | GET, POST, PATCH, DELETE | Static page CRUD |
| `/api/admin/cms/testimonials` | GET, POST, PATCH, DELETE | Testimonial CRUD |
| `/api/admin/cms/videos` | GET, POST, PATCH, DELETE | Video CRUD |
| `/api/admin/comm-templates` | GET, POST, PATCH, DELETE | Communication templates |
| `/api/admin/communications` | GET, POST | Broadcast messaging |
| `/api/admin/email-logs` | GET | Email delivery logs |
| `/api/admin/gdpr` | GET, POST | GDPR compliance |
| `/api/admin/impersonate` | POST | User impersonation |
| `/api/admin/interviews` | GET | Interview listing |
| `/api/admin/jobs` | GET | Job listing + approval |
| `/api/admin/jobs/[id]/approve` | POST | Approve/reject job |
| `/api/admin/location-data/*` | GET, POST, PATCH, DELETE | Countries/States/Cities |
| `/api/admin/job-attributes/[cat]` | GET, POST, PATCH, DELETE | Job attribute CRUD |
| `/api/admin/matching-weight-templates` | GET, POST, PATCH, DELETE | Weight templates |
| `/api/admin/notification-config` | GET, POST | Notification settings |
| `/api/admin/notification-stats` | GET | Notification statistics |
| `/api/admin/poster-templates` | GET, POST, PATCH, DELETE | Poster templates |
| `/api/admin/settings` | GET, POST | Platform settings |
| `/api/admin/settings/test-email` | POST | Test email sending |
| `/api/admin/stats` | GET | Report statistics |
| `/api/admin/subscription-plans` | GET, POST, PATCH, DELETE | Subscription plans |
| `/api/admin/subscription-stats` | GET | Subscription dashboard |
| `/api/admin/super-agents` | GET, POST | Super agent CRUD |
| `/api/admin/system-health` | GET | System health monitoring |
| `/api/admin/territories` | GET, POST | Territory management |
| `/api/admin/users` | GET, POST | User management |
| `/api/admin/workflow-templates` | GET, POST, PATCH, DELETE | Workflow templates |

### Super Agent API Routes (~20)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/super-agent/dashboard` | GET | Dashboard KPIs |
| `/api/super-agent/agents` | GET, POST | List/create agents |
| `/api/super-agent/agents/[id]` | GET, PATCH | Agent detail/edit |
| `/api/super-agent/applications` | GET | Application pipeline |
| `/api/super-agent/approvals` | GET | Job listing for approvals |
| `/api/super-agent/approvals/[id]` | PATCH | Approve/reject job |
| `/api/super-agent/approvals/count` | GET | Pending approval count |
| `/api/super-agent/avatar` | POST, DELETE | Avatar upload/removal |
| `/api/super-agent/insights` | GET | AI-generated insights |
| `/api/super-agent/insights/feedback` | POST | Insight feedback |
| `/api/super-agent/interviews` | GET | Interview monitoring |
| `/api/super-agent/job-seekers` | GET | Candidate directory |
| `/api/super-agent/jobs` | GET | Jobs with AI NL search |
| `/api/super-agent/leads` | GET | Lead pipeline |
| `/api/super-agent/profile` | GET, PATCH | Profile & override rate |
| `/api/super-agent/reports` | GET | Team reports |
| `/api/super-agent/settings` | GET, PATCH | Settings |
| `/api/super-agent/territory` | GET | Territory map data |
| `/api/super-agent/actions/assign-leads` | POST | Reassign leads |
| `/api/super-agent/actions/send-reminder` | POST | Send agent reminders |

### Agent API Routes (~7 dedicated + shared)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/agent/dashboard` | GET | Dashboard metrics |
| `/api/agent/analytics` | GET | Full analytics |
| `/api/agent/profile` | GET, PATCH | Agent profile |
| `/api/agent/settings` | GET, PATCH | Agent settings |
| `/api/agent/avatar` | POST, DELETE | Avatar upload/removal |
| `/api/agent/tasks` | GET, POST | List/create tasks |
| `/api/agent/tasks/[id]` | PATCH, DELETE | Update/delete tasks |

### Employer API Routes (~56)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/employers/stats` | GET | Dashboard KPIs |
| `/api/employers/setup-status` | GET | Onboarding checklist |
| `/api/employers/me` | GET, PATCH | Employer profile |
| `/api/employers/logo` | POST | Company logo upload |
| `/api/employers/documents` | POST | Verification docs |
| `/api/employers/me/smtp` | GET, PUT | SMTP configuration |
| `/api/employers/me/smtp/test` | POST | Test SMTP |
| `/api/employers/verify-domain` | POST | Domain verification |
| `/api/employers/verify-domain/confirm` | POST | Confirm domain |
| `/api/employers/candidates/[id]` | GET | Candidate detail |
| `/api/employers/analytics` | GET | Analytics overview |
| `/api/employers/analytics/pipeline` | GET | Pipeline breakdown |
| `/api/employers/analytics/historical` | GET | Historical trends |
| `/api/employers/analytics/jobs` | GET | Per-job performance |
| `/api/employers/analytics/response-time` | GET | Response time SLA |
| `/api/employers/analytics/feedback-trends` | GET | Scorecard trends |
| `/api/employers/comm-templates` | GET, POST, DELETE | Communication templates |
| `/api/employers/job-templates` | GET, POST, PUT, DELETE | Job templates |
| `/api/employers/workflow` | GET, PATCH | Workflow config |
| `/api/employers/workflow-templates` | GET, POST, PUT, DELETE | Workflow templates |
| `/api/employers/matching-weights` | GET, PUT | Matching weights |
| `/api/employers/matching-weight-templates` | GET, POST, PUT, DELETE | Weight templates |
| `/api/employers/team` | GET, POST, PUT, DELETE | Team management |
| `/api/employers/team/accept` | POST | Accept invitation |
| `/api/employers/team/activity-logs` | GET | Team audit logs |
| `/api/employers/training` | GET, POST, PATCH | Training tracker |
| `/api/employers/posters` | POST | Job poster generation |
| `/api/employer/payment-config` | POST | Payment setup |
| `/api/employer/job-templates` | GET, POST, DELETE | Job templates |

### Job Seeker API Routes (~20+)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/job-seeker/dashboard` | GET | Dashboard data |
| `/api/job-seeker/recommended-jobs` | GET | AI-recommended jobs |
| `/api/job-seeker/profile` | GET, PATCH | Profile CRUD |
| `/api/job-seeker/cv` | POST | CV file upload |
| `/api/job-seeker/documents` | GET, POST | Document management |
| `/api/job-seeker/personal-details-options` | GET | Lookup data |
| `/api/job-seeker/skill-gaps` | GET | Skill gap analysis |
| `/api/job-seeker/skill-confirmations` | POST | Confirm/deny skills |
| `/api/job-seekers/settings` | GET, PATCH | Settings |
| `/api/job-seekers/avatar` | POST | Avatar upload |
| `/api/job-seekers/account` | GET, DELETE | GDPR data export/erasure |
| `/api/job-seekers/[id]/availability` | GET | Availability slots |
| `/api/user/portfolio` | GET, POST, DELETE | Portfolio projects |
| `/api/user/referral` | GET | Referral program |
| `/api/user/saved-searches` | GET, POST, PATCH, DELETE | Saved searches |
| `/api/user/notification-preferences` | GET, PATCH | Notification prefs |
| `/api/user/autoapply` | GET, PATCH | Auto-apply config |
| `/api/user/profile-completion` | GET | Completeness calc |

### Shared API Routes (Cross-Role)

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/jobs` | GET, POST, PATCH, DELETE | Job CRUD |
| `/api/jobs/[id]` | GET | Job detail |
| `/api/jobs/[id]/similar` | GET | Similar jobs |
| `/api/jobs/search` | GET | AI natural language search |
| `/api/jobs/recommended` | GET | AI recommendations |
| `/api/applications` | GET, POST | Application CRUD |
| `/api/applications/[id]` | GET, PATCH | Application detail/update |
| `/api/applications/[id]/ai-match` | POST | AI match scoring |
| `/api/applications/[id]/timeline` | GET | Status history |
| `/api/applications/bulk-action` | POST | Bulk operations |
| `/api/interviews` | GET, POST, PATCH | Interview CRUD |
| `/api/interviews/[id]/respond` | PATCH | Candidate response |
| `/api/placements` | GET | Placement listing |
| `/api/commissions` | GET, POST, PATCH, DELETE | Commission CRUD |
| `/api/offers` | GET, POST, PATCH | Offer CRUD |
| `/api/leads` | GET, POST, PATCH, DELETE | Lead CRUD |
| `/api/leads/[id]/convert` | POST | Lead → Employer |
| `/api/messages` | GET, POST | Channel messaging |
| `/api/dm` | GET, POST | Direct messages |
| `/api/notifications` | GET, PATCH | Notifications |
| `/api/referral-links` | GET, POST, PATCH, DELETE | Referral links |
| `/api/companies` | GET | Company directory |
| `/api/scorecards` | GET, POST | Interview scorecards |
| `/api/subscriptions/my` | GET | Current subscription |
| `/api/subscriptions/features` | GET | Feature gate map |
| `/api/invoices` | GET | Invoice history |
| `/api/ai/report` | POST | AI report generation |
| `/api/ai/lead-score` | POST | AI lead scoring |
| `/api/ai/generate-summary` | POST | AI summary |
| `/api/saved-jobs` | GET, POST, DELETE | Saved/bookmarked jobs |

---

## Platform Summary

| Role | Dashboard Pages | Key Capabilities |
|------|----------------|------------------|
| **Admin** | ~40+ | Full platform management, CMS, GDPR, audit logs, impersonation, system health, bulk import, subscription management |
| **Super Agent** | 19 | Regional team management, job approvals, AI market intelligence, territory mapping, commission oversight |
| **Agent** | 20 | Hiring pipeline, lead management, employer onboarding, AI lead scoring, task management, channel chat |
| **Employer** | 27 | AI job creation (voice), candidate matching, interview scheduling, scorecards, analytics, team management, workflow customization |
| **Job Seeker** | 26 | AI job search, CV builder, skills coaching, auto-apply, portfolio, referral program, interview management |
| **Total** | **130+** | — |

### AI Features Summary

| Feature | Used By |
|---------|---------|
| AI Match Scoring | Employer, Agent, Admin |
| AI Lead Scoring | Agent |
| AI Job Search (NL) | Employer, Super Agent, Agent, Job Seeker |
| AI Job Creation (Voice) | Employer |
| AI Interview Questions | Employer |
| AI Interview Prep Brief | Employer |
| AI CV Builder Writing | Job Seeker |
| AI Document Extraction | Job Seeker |
| AI Summary Generation | Job Seeker |
| AI Skills Coach | Job Seeker |
| AI Report Generation | Admin, Super Agent, Agent |
| AI Market Intelligence | Super Agent |
| AI Insights (Team) | Super Agent |
| AI Analytics (NL Query) | Admin |
| AI Candidate Screening | Employer |
