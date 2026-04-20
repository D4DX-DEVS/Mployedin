# Mployedin API Documentation

> **Base URL:** `https://mployedin.com/api`
> **Auth:** All endpoints require `Authorization: Bearer <token>` unless marked 🌐 **Public**.
> **Content-Type:** `application/json` (except file uploads which use `multipart/form-data`).

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Jobs](#2-jobs)
3. [Applications](#3-applications)
4. [Employers](#4-employers)
5. [Job Seekers](#5-job-seekers)
6. [Users](#6-users)
7. [Interviews](#7-interviews)
8. [Offers](#8-offers)
9. [Placements](#9-placements)
10. [Messages & DMs](#10-messages--dms)
11. [Notifications](#11-notifications)
12. [Scorecards](#12-scorecards)
13. [Commissions](#13-commissions)
14. [Saved Jobs](#14-saved-jobs)
15. [Leads](#15-leads)
16. [Activity](#16-activity)
17. [Dashboard](#17-dashboard)
18. [Filters](#18-filters)
19. [AI Services](#19-ai-services)
20. [Admin](#20-admin)
21. [Super Agent](#21-super-agent)
22. [Public / CMS](#22-public--cms)
23. [Integrations](#23-integrations)
24. [GDPR](#24-gdpr)
25. [Cron Jobs](#25-cron-jobs)
26. [Miscellaneous](#26-miscellaneous)

---

## 1. Authentication

### POST `/api/auth/employer-register`

Register a new employer account. Creates User + Employer + CompanyUser records and sends a verification email.

**Request:**
```json
{
  "name": "Ahmed Al-Rashid",
  "email": "ahmed@acmecorp.com",
  "password": "S3cureP@ss!",
  "companyName": "Acme Corp",
  "phone": "+971501234567",
  "country": "AE"
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Employer registered successfully. Please verify your email.",
  "userId": "clx1abc..."
}
```

---

### POST `/api/auth/job-seeker-register`

Register a new job seeker. Creates User + empty JobSeeker profile.

**Request:**
```json
{
  "name": "Sara Ahmed",
  "email": "sara@example.com",
  "password": "MyP@ssw0rd!"
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Account created. Please verify your email.",
  "userId": "clx2def..."
}
```

---

### POST `/api/auth/forgot-password`

Generate a password-reset token and email the reset link.

**Request:**
```json
{
  "email": "ahmed@acmecorp.com"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "If that email exists, a reset link has been sent."
}
```

---

### POST `/api/auth/reset-password`

Validate a reset token and update the user's password.

**Request:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "password": "NewS3cure!Pass"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Password reset successfully."
}
```

---

### POST `/api/auth/verify-email`

Validate an email-verification token and mark the user as verified.

**Request:**
```json
{
  "token": "abc123verifytoken"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Email verified successfully."
}
```

---

## 2. Jobs

### GET `/api/jobs`

Paginated, role-scoped job search. Supports filters for status, location, skills, salary, etc.

**Query Params:**
| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page |
| `search` | string | `"React Developer"` | Full-text search |
| `status` | string | `"active"` | Job status filter |
| `country` | string | `"AE"` | Country code |
| `city` | string | `"Dubai"` | City name |
| `minSalary` | number | `5000` | Minimum salary |
| `maxSalary` | number | `15000` | Maximum salary |
| `skills` | string | `"React,Node.js"` | Comma-separated skills |

**Response `200`:**
```json
{
  "jobs": [
    {
      "id": "clx3ghi...",
      "title": "Senior React Developer",
      "company": "Acme Corp",
      "location": { "country": "AE", "city": "Dubai" },
      "salaryMin": 8000,
      "salaryMax": 15000,
      "currency": "AED",
      "status": "active",
      "skills": ["React", "TypeScript", "Node.js"],
      "createdAt": "2026-04-10T08:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "totalPages": 3
}
```

---

### POST `/api/jobs`

Create a new job posting. Requires employer/agent/admin role.

**Request:**
```json
{
  "title": "Backend Engineer",
  "description": "We are looking for a backend engineer...",
  "requirements": ["Node.js", "MongoDB", "REST APIs"],
  "salaryMin": 10000,
  "salaryMax": 18000,
  "currency": "AED",
  "country": "AE",
  "city": "Abu Dhabi",
  "employmentType": "full-time",
  "experienceLevel": "mid",
  "skills": ["Node.js", "Express", "MongoDB"],
  "tags": ["backend", "api"],
  "expiresAt": "2026-06-01T00:00:00Z"
}
```

**Response `201`:**
```json
{
  "success": true,
  "job": {
    "id": "clx4jkl...",
    "title": "Backend Engineer",
    "status": "draft",
    "createdAt": "2026-04-16T10:00:00Z"
  }
}
```

---

### GET `/api/jobs/[id]`

Fetch a single job by ID.

**Response `200`:**
```json
{
  "job": {
    "id": "clx4jkl...",
    "title": "Backend Engineer",
    "description": "We are looking for...",
    "company": { "id": "clx1abc...", "name": "Acme Corp", "logo": "/uploads/logo.png" },
    "salaryMin": 10000,
    "salaryMax": 18000,
    "currency": "AED",
    "status": "active",
    "viewCount": 128,
    "applicationCount": 14,
    "skills": ["Node.js", "Express", "MongoDB"],
    "createdAt": "2026-04-16T10:00:00Z",
    "expiresAt": "2026-06-01T00:00:00Z"
  }
}
```

---

### PATCH `/api/jobs/[id]`

Update job fields. Requires ownership or admin role.

**Request:**
```json
{
  "title": "Senior Backend Engineer",
  "salaryMax": 20000,
  "status": "active"
}
```

**Response `200`:**
```json
{
  "success": true,
  "job": { "id": "clx4jkl...", "title": "Senior Backend Engineer", "status": "active" }
}
```

---

### POST `/api/jobs/[id]/apply`

Job seeker applies to a job. Fires activity events and email notifications.

**Request:**
```json
{
  "coverLetter": "I am excited to apply for this role because..."
}
```

**Response `201`:**
```json
{
  "success": true,
  "applicationId": "clx5mno..."
}
```

---

### POST `/api/jobs/[id]/clone`

Duplicate a job as a new draft.

**Response `201`:**
```json
{
  "success": true,
  "job": { "id": "clx6pqr...", "title": "Backend Engineer (Copy)", "status": "draft" }
}
```

---

### POST `/api/jobs/[id]/save`

Toggle saved state for a job (save/unsave) for the current job seeker.

**Response `200`:**
```json
{
  "saved": true
}
```

---

### GET `/api/jobs/[id]/similar` 🌐

Returns up to 6 similar active jobs by skills/tags overlap. No auth required.

**Response `200`:**
```json
{
  "jobs": [
    { "id": "clx7stu...", "title": "Full Stack Developer", "company": "Tech Ltd", "matchScore": 85 }
  ]
}
```

---

### POST `/api/jobs/[id]/track-view` 🌐

Increment job view count. Uses cookie fingerprint for unique-view deduplication.

**Response `200`:**
```json
{ "tracked": true }
```

---

### GET `/api/jobs/match-preview`

Returns estimated candidate count and top skills for a job posting preview.

**Query Params:** `?skills=React,Node.js&country=AE&city=Dubai`

**Response `200`:**
```json
{
  "estimatedCandidates": 47,
  "topSkills": ["React", "Node.js", "TypeScript"]
}
```

---

### GET `/api/jobs/recommended`

Match-scored job recommendations for the current job seeker with cursor-based pagination.

**Query Params:** `?cursor=clx3ghi...&limit=10`

**Response `200`:**
```json
{
  "jobs": [
    { "id": "clx3ghi...", "title": "React Developer", "matchScore": 92, "company": "Acme Corp" }
  ],
  "nextCursor": "clx8vwx..."
}
```

---

### GET `/api/jobs/suggestions`

AI-generated job-title variants, skills, salary and experience ranges.

**Query Params:** `?title=Backend Developer`

**Response `200`:**
```json
{
  "variants": ["Backend Engineer", "Server-Side Developer", "API Engineer"],
  "suggestedSkills": ["Node.js", "Python", "PostgreSQL"],
  "salaryRange": { "min": 8000, "max": 20000, "currency": "AED" },
  "experienceRange": { "min": 2, "max": 6 }
}
```

---

## 3. Applications

### GET `/api/applications`

Paginated, role-scoped application list.

**Query Params:**
| Param | Type | Example |
|-------|------|---------|
| `page` | number | `1` |
| `limit` | number | `20` |
| `status` | string | `"screening"` |
| `jobId` | string | `"clx4jkl..."` |

**Response `200`:**
```json
{
  "applications": [
    {
      "id": "clx5mno...",
      "jobTitle": "Backend Engineer",
      "candidateName": "Sara Ahmed",
      "status": "screening",
      "matchScore": 87,
      "appliedAt": "2026-04-12T09:30:00Z"
    }
  ],
  "total": 14,
  "page": 1,
  "totalPages": 1
}
```

---

### POST `/api/applications`

Create an application with AI screening.

**Request:**
```json
{
  "jobId": "clx4jkl...",
  "coverLetter": "I am excited to apply..."
}
```

**Response `201`:**
```json
{
  "success": true,
  "application": {
    "id": "clx5mno...",
    "status": "applied",
    "matchScore": 87
  }
}
```

---

### PATCH `/api/applications/[id]`

Update application status with workflow automation and notifications.

**Request:**
```json
{
  "status": "interview",
  "notes": "Strong profile — moving to interview stage."
}
```

**Response `200`:**
```json
{
  "success": true,
  "application": { "id": "clx5mno...", "status": "interview" }
}
```

---

### POST `/api/applications/bulk`

Bulk-reject or bulk-move candidates through pipeline stages.

**Request:**
```json
{
  "applicationIds": ["clx5mno...", "clx9abc..."],
  "action": "reject",
  "reason": "Position filled"
}
```

**Response `200`:**
```json
{
  "success": true,
  "updated": 2
}
```

---

### GET `/api/applications/compare`

Side-by-side comparison of up to 3 candidates.

**Query Params:** `?ids=clx5mno...,clx9abc...,clx10def...`

**Response `200`:**
```json
{
  "candidates": [
    { "id": "clx5mno...", "name": "Sara Ahmed", "matchScore": 87, "skills": ["React", "Node.js"], "experience": 4 },
    { "id": "clx9abc...", "name": "Omar Hassan", "matchScore": 82, "skills": ["Vue", "Node.js"], "experience": 3 }
  ]
}
```

---

### POST `/api/applications/[id]/feedback`

Job seeker submits NPS rating after a terminal decision.

**Request:**
```json
{
  "rating": 8,
  "comment": "Great interview process, very transparent."
}
```

**Response `200`:**
```json
{ "success": true }
```

---

### POST `/api/applications/[id]/notes`

Add an internal note to an application with @mention notifications.

**Request:**
```json
{
  "content": "Good fit for the role. @john please schedule an interview.",
  "mentions": ["clxUserJohn"]
}
```

**Response `201`:**
```json
{
  "success": true,
  "note": { "id": "clx11ghi...", "content": "Good fit for the role...", "createdAt": "2026-04-16T11:00:00Z" }
}
```

---

### GET `/api/applications/[id]/timeline`

Audit-log entries formatted as a user-friendly timeline.

**Response `200`:**
```json
{
  "timeline": [
    { "event": "applied", "timestamp": "2026-04-12T09:30:00Z", "actor": "Sara Ahmed" },
    { "event": "status_changed", "from": "applied", "to": "screening", "timestamp": "2026-04-13T14:00:00Z", "actor": "HR Team" },
    { "event": "note_added", "timestamp": "2026-04-14T10:00:00Z", "actor": "John Smith" }
  ]
}
```

---

## 4. Employers

### GET `/api/employers`

List employers with verification data. Admin/super-agent role required.

**Query Params:** `?page=1&limit=20&search=Acme&verified=true`

**Response `200`:**
```json
{
  "employers": [
    {
      "id": "clx1abc...",
      "companyName": "Acme Corp",
      "verified": true,
      "activeJobs": 5,
      "totalApplications": 42,
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ],
  "total": 120,
  "page": 1
}
```

---

### POST `/api/employers`

Admin creates an employer account.

**Request:**
```json
{
  "companyName": "New Corp",
  "email": "contact@newcorp.com",
  "phone": "+971509876543",
  "country": "AE"
}
```

**Response `201`:**
```json
{
  "success": true,
  "employer": { "id": "clx12jkl..." }
}
```

---

### GET `/api/employers/[id]`

Get a specific employer profile. IDOR-protected.

**Response `200`:**
```json
{
  "employer": {
    "id": "clx1abc...",
    "companyName": "Acme Corp",
    "logo": "/uploads/acme-logo.png",
    "industry": "Technology",
    "size": "51-200",
    "website": "https://acmecorp.com",
    "verified": true,
    "description": "Leading tech company in the MENA region."
  }
}
```

---

### PATCH `/api/employers/[id]`

Update a specific employer.

**Request:**
```json
{
  "companyName": "Acme Corporation",
  "size": "201-500"
}
```

**Response `200`:**
```json
{ "success": true, "employer": { "id": "clx1abc...", "companyName": "Acme Corporation" } }
```

---

### DELETE `/api/employers/[id]`

Deactivate (soft-delete) an employer. Admin only.

**Response `200`:**
```json
{ "success": true, "message": "Employer deactivated." }
```

---

### GET `/api/employers/me`

Get the current authenticated employer's own profile.

**Response `200`:**
```json
{
  "employer": {
    "id": "clx1abc...",
    "companyName": "Acme Corp",
    "email": "ahmed@acmecorp.com",
    "verified": true,
    "plan": "premium"
  }
}
```

---

### PATCH `/api/employers/me`

Update the current employer's own profile.

**Request:**
```json
{
  "description": "Updated company description",
  "website": "https://acmecorp.io"
}
```

---

### POST `/api/employers/logo`

Upload company logo. `multipart/form-data`.

**Request:** Form data with field `logo` (image file, max 2 MB).

**Response `200`:**
```json
{ "success": true, "url": "/uploads/logos/clx1abc-logo.png" }
```

---

### DELETE `/api/employers/logo`

Remove the company logo.

**Response `200`:**
```json
{ "success": true }
```

---

### POST `/api/employers/documents`

Upload a verification document (PDF/image/DOCX). `multipart/form-data`.

**Request:** Form data with field `document` (max 5 MB).

**Response `201`:**
```json
{ "success": true, "documentId": "clx13mno...", "url": "/uploads/docs/clx13mno.pdf" }
```

---

### GET `/api/employers/analytics`

Employer analytics dashboard: funnel, trend, top jobs and conversion metrics.

**Response `200`:**
```json
{
  "funnel": { "posted": 10, "applied": 85, "screening": 40, "interview": 20, "offered": 8, "hired": 5 },
  "trend": [{ "month": "2026-03", "applications": 30 }, { "month": "2026-04", "applications": 55 }],
  "topJobs": [{ "id": "clx4jkl...", "title": "Backend Engineer", "applications": 14 }],
  "conversionRate": 5.9
}
```

---

### GET `/api/employers/analytics/historical`

Historical analytics: time-to-hire, drop-off rates and source breakdown.

**Query Params:** `?from=2026-01-01&to=2026-04-16`

**Response `200`:**
```json
{
  "avgTimeToHire": 18,
  "dropOffRates": { "screening": 52, "interview": 25, "offer": 10 },
  "sources": { "direct": 45, "referral": 30, "agent": 25 }
}
```

---

### GET `/api/employers/analytics/jobs`

Per-job performance metrics.

**Response `200`:**
```json
{
  "jobs": [
    { "id": "clx4jkl...", "title": "Backend Engineer", "views": 200, "applications": 14, "conversionRate": 7.0, "avgMatchScore": 78 }
  ]
}
```

---

### GET `/api/employers/analytics/pipeline`

Full pipeline breakdown with stage distribution and conversion rates.

**Response `200`:**
```json
{
  "stages": [
    { "name": "applied", "count": 85, "percentage": 100 },
    { "name": "screening", "count": 40, "percentage": 47 },
    { "name": "interview", "count": 20, "percentage": 23.5 },
    { "name": "offered", "count": 8, "percentage": 9.4 },
    { "name": "hired", "count": 5, "percentage": 5.9 }
  ]
}
```

---

### GET `/api/employers/analytics/response-time`

Measures how quickly employers act on new applications.

**Response `200`:**
```json
{
  "avgResponseHours": 18.5,
  "medianResponseHours": 12.0,
  "distribution": { "under24h": 65, "24to48h": 20, "over48h": 15 }
}
```

---

### GET `/api/employers/agents`

Lists agents assigned to the current employer.

**Response `200`:**
```json
{
  "agents": [
    { "id": "clx14pqr...", "name": "Ali Agent", "email": "ali@agency.com", "assignedJobs": 3 }
  ]
}
```

---

### GET `/api/employers/candidates/[id]`

Unified candidate profile: all applications, interviews and notes at this company.

**Response `200`:**
```json
{
  "candidate": {
    "id": "clx2def...",
    "name": "Sara Ahmed",
    "applications": [
      { "id": "clx5mno...", "jobTitle": "Backend Engineer", "status": "interview", "appliedAt": "2026-04-12T09:30:00Z" }
    ],
    "interviews": [
      { "id": "clx15stu...", "scheduledAt": "2026-04-20T14:00:00Z", "type": "video" }
    ],
    "notes": [
      { "content": "Strong backend skills", "createdAt": "2026-04-14T10:00:00Z" }
    ]
  }
}
```

---

### GET `/api/employers/comm-templates`

List employer's communication email templates.

**Response `200`:**
```json
{
  "templates": [
    { "id": "clx16vwx...", "name": "Rejection - Generic", "type": "rejection", "subject": "Application Update", "body": "Thank you for your interest..." }
  ]
}
```

### POST `/api/employers/comm-templates`

Create a communication template.

**Request:**
```json
{
  "name": "Interview Invite",
  "type": "invite",
  "subject": "Interview Invitation - {{jobTitle}}",
  "body": "Dear {{candidateName}}, we'd like to invite you to interview for {{jobTitle}}..."
}
```

**Response `201`:**
```json
{ "success": true, "template": { "id": "clx17yza..." } }
```

---

### GET `/api/employers/comm-templates/[id]`

Get a specific template.

### PATCH `/api/employers/comm-templates/[id]`

Update a template.

### DELETE `/api/employers/comm-templates/[id]`

Delete a template.

---

### GET `/api/employers/job-templates`

List reusable job templates.

### POST `/api/employers/job-templates`

Create a job template.

**Request:**
```json
{
  "name": "Standard Backend Role",
  "title": "Backend Engineer",
  "description": "Standard job description for backend roles...",
  "skills": ["Node.js", "MongoDB"],
  "experienceLevel": "mid"
}
```

### GET `/api/employers/job-templates/[id]`

Get a specific job template.

### DELETE `/api/employers/job-templates/[id]`

Delete a job template.

### POST `/api/employers/job-templates/[id]/use`

Create a draft job pre-filled from a template. Increments template usage count.

**Response `201`:**
```json
{ "success": true, "jobId": "clx18bcd..." }
```

---

### GET `/api/employers/matching-weights`

Get employer's custom candidate-matching weight configuration.

**Response `200`:**
```json
{
  "weights": { "skills": 35, "experience": 25, "education": 15, "location": 15, "salary": 10 }
}
```

### PATCH `/api/employers/matching-weights`

Update matching weights. Must total 100.

**Request:**
```json
{
  "weights": { "skills": 40, "experience": 20, "education": 15, "location": 15, "salary": 10 }
}
```

---

### GET `/api/employers/setup-status`

Onboarding checklist completion steps for new employers.

**Response `200`:**
```json
{
  "steps": [
    { "key": "profile", "label": "Complete company profile", "completed": true },
    { "key": "logo", "label": "Upload company logo", "completed": false },
    { "key": "domain", "label": "Verify domain", "completed": false },
    { "key": "firstJob", "label": "Post first job", "completed": false }
  ],
  "completionPercentage": 25
}
```

---

### GET `/api/employers/stats`

Employer dashboard KPIs.

**Response `200`:**
```json
{
  "activeJobs": 5,
  "totalApplications": 85,
  "scheduledInterviews": 8,
  "placements": 3
}
```

---

### GET `/api/employers/team`

List team members.

### POST `/api/employers/team`

Invite a new team member via email token.

**Request:**
```json
{
  "email": "newmember@acmecorp.com",
  "role": "recruiter"
}
```

**Response `201`:**
```json
{ "success": true, "message": "Invitation sent." }
```

### PATCH `/api/employers/team/[id]`

Update a team member's role/permissions. Cannot modify the owner.

**Request:**
```json
{ "role": "hiring_manager" }
```

### POST `/api/employers/team/accept`

Accept a team invitation using a signed invite token.

**Request:**
```json
{ "token": "invite-token-abc123" }
```

---

### GET `/api/employers/training`

List training/learning items.

### POST `/api/employers/training`

Create a training item.

**Request:**
```json
{ "title": "Inclusive Hiring Workshop", "type": "course", "url": "https://example.com/course" }
```

### PATCH `/api/employers/training/[id]`

Update training item status/notes.

### DELETE `/api/employers/training/[id]`

Delete a training item.

---

### POST `/api/employers/verify-domain`

Send domain-verification email with signed token (rate-limited: 3/day).

**Request:**
```json
{ "email": "verify@acmecorp.com" }
```

### GET `/api/employers/verify-domain/confirm` 🌐

Confirm domain ownership via token click from email.

**Query Params:** `?token=abc123`

---

### GET `/api/employers/workflow`

Get employer's hiring workflow stages and automation settings.

**Response `200`:**
```json
{
  "stages": ["applied", "screening", "interview", "offer", "hired"],
  "automations": {
    "autoRejectAfterDays": 30,
    "autoScreening": true,
    "notifyOnNewApplication": true
  }
}
```

### PATCH `/api/employers/workflow`

Update workflow stages and automation settings.

---

### POST `/api/employers/[id]/profile-view`

Record an employer profile view (deduplicated per 24h).

### POST `/api/employers/[id]/verify`

Admin manually verifies an employer's domain. Admin only.

### DELETE `/api/employers/[id]/verify`

Admin revokes an employer's verification. Admin only.

---

## 5. Job Seekers

### GET `/api/job-seekers`

Paginated searchable list of job seekers. For agents/employers/admins.

**Query Params:** `?page=1&limit=20&search=React&country=AE&skills=React,Node.js`

**Response `200`:**
```json
{
  "jobSeekers": [
    {
      "id": "clx2def...",
      "name": "Sara Ahmed",
      "title": "Frontend Developer",
      "skills": ["React", "TypeScript"],
      "experience": 4,
      "country": "AE",
      "city": "Dubai",
      "matchScore": 87
    }
  ],
  "total": 250,
  "page": 1
}
```

---

### GET `/api/job-seekers/[id]`

Get a specific job seeker. Tracks profile views from employers/agents.

**Response `200`:**
```json
{
  "jobSeeker": {
    "id": "clx2def...",
    "name": "Sara Ahmed",
    "email": "sara@example.com",
    "title": "Frontend Developer",
    "bio": "Passionate frontend developer...",
    "skills": ["React", "TypeScript", "Tailwind CSS"],
    "experience": [
      { "company": "Tech Co", "role": "Frontend Dev", "from": "2022-01", "to": "2026-01" }
    ],
    "education": [
      { "institution": "University of Dubai", "degree": "BSc Computer Science", "year": 2021 }
    ],
    "profileViews": 45
  }
}
```

---

### PATCH `/api/job-seekers/[id]`

Update a job seeker profile. Admin/agent or self.

**Request:**
```json
{
  "title": "Senior Frontend Developer",
  "skills": ["React", "TypeScript", "Next.js", "Tailwind CSS"]
}
```

---

### GET `/api/job-seekers/account`

GDPR data export — returns all user data in JSON.

### DELETE `/api/job-seekers/account`

GDPR right-to-erasure: pseudonymises/erases the account.

---

### POST `/api/job-seekers/avatar`

Upload profile picture. `multipart/form-data` (max 2 MB image).

**Response `200`:**
```json
{ "success": true, "url": "/uploads/avatars/clx2def.jpg" }
```

---

### GET `/api/job-seekers/profile`

Get the current job seeker's own profile.

### PATCH `/api/job-seekers/profile`

Update the current job seeker's profile including onboarding fields.

**Request:**
```json
{
  "bio": "Updated bio text",
  "desiredSalary": 12000,
  "openToRemote": true,
  "onboardingStep": 3
}
```

---

### GET `/api/job-seekers/settings`

Get job seeker automation settings.

**Response `200`:**
```json
{
  "autoApplyEnabled": false,
  "showSalary": true,
  "searchableByEmployers": true,
  "emailNotifications": true
}
```

### PATCH `/api/job-seekers/settings`

Update automation settings.

---

### POST `/api/job-seeker/cv`

Upload CV/resume (PDF/DOC/DOCX). Replaces any existing file. `multipart/form-data`.

**Response `200`:**
```json
{ "success": true, "url": "/uploads/cvs/clx2def-cv.pdf" }
```

---

### GET `/api/job-seeker/dashboard`

Aggregated dashboard data.

**Response `200`:**
```json
{
  "applications": { "total": 12, "pending": 5, "interviews": 3, "offers": 1 },
  "savedJobs": 8,
  "profileViews": 45,
  "recentActivity": [
    { "type": "application_status", "message": "Your application for Backend Engineer moved to Interview", "timestamp": "2026-04-15T09:00:00Z" }
  ]
}
```

---

### GET `/api/job-seeker/documents`

List uploaded documents.

### POST `/api/job-seeker/documents`

Upload a categorized document. `multipart/form-data`.

**Request:** Form field `document` + `category` (one of: `cv`, `certificate`, `portfolio`, `other`).

---

### GET `/api/job-seeker/personal-details-options` 🌐

Reference data for profile form dropdowns.

**Response `200`:**
```json
{
  "genders": ["male", "female", "other", "prefer_not_to_say"],
  "maritalStatuses": ["single", "married", "divorced", "widowed"],
  "countries": [{ "code": "AE", "name": "United Arab Emirates" }]
}
```

---

### GET `/api/job-seeker/profile`

Get current job seeker's full profile data.

### PATCH `/api/job-seeker/profile`

Update current job seeker's full profile data.

---

### GET `/api/job-seeker/recommended-jobs`

Up to 5 scored recommended jobs.

**Response `200`:**
```json
{
  "jobs": [
    { "id": "clx3ghi...", "title": "React Developer", "company": "Acme Corp", "matchScore": 92, "salaryRange": "8000-15000 AED" }
  ]
}
```

---

## 6. Users

### POST `/api/users/change-password`

Change password for the authenticated user.

**Request:**
```json
{
  "currentPassword": "OldP@ss123",
  "newPassword": "NewP@ss456!"
}
```

**Response `200`:**
```json
{ "success": true, "message": "Password changed successfully." }
```

---

### PATCH `/api/users/locale`

Update user's locale/language preference.

**Request:**
```json
{ "locale": "ar" }
```

**Response `200`:**
```json
{ "success": true }
```

---

### GET `/api/users/search`

LinkedIn-style user search with ranked results. Role-scoped.

**Query Params:** `?q=Sara&role=job_seeker&page=1&limit=10`

**Response `200`:**
```json
{
  "users": [
    { "id": "clx2def...", "name": "Sara Ahmed", "role": "job_seeker", "title": "Frontend Developer" }
  ],
  "total": 5
}
```

---

### PATCH `/api/user/autoapply`

Toggle auto-apply mode. **Currently disabled (returns `503`).**

---

### GET `/api/user/profile-completion`

Profile-completion score and missing field categories.

**Response `200`:**
```json
{
  "score": 72,
  "missing": ["education", "portfolio", "avatar"],
  "tips": ["Add your education to improve visibility", "Upload a photo for a 20% profile boost"]
}
```

---

## 7. Interviews

### GET `/api/interviews`

Role-scoped interview list.

**Query Params:** `?page=1&limit=20&status=scheduled&jobId=clx4jkl...`

**Response `200`:**
```json
{
  "interviews": [
    {
      "id": "clx15stu...",
      "jobTitle": "Backend Engineer",
      "candidateName": "Sara Ahmed",
      "scheduledAt": "2026-04-20T14:00:00Z",
      "type": "video",
      "status": "scheduled",
      "meetingLink": "https://meet.google.com/abc-def-ghi"
    }
  ],
  "total": 8
}
```

---

### POST `/api/interviews`

Schedule a new interview with notifications.

**Request:**
```json
{
  "applicationId": "clx5mno...",
  "scheduledAt": "2026-04-20T14:00:00Z",
  "duration": 60,
  "type": "video",
  "meetingLink": "https://meet.google.com/abc-def-ghi",
  "interviewers": ["clxUserJohn"],
  "notes": "Technical interview - focus on system design"
}
```

**Response `201`:**
```json
{ "success": true, "interview": { "id": "clx15stu...", "status": "scheduled" } }
```

---

### GET `/api/interviews/[id]`

Get interview details.

### PATCH `/api/interviews/[id]`

Update interview fields (reschedule, add notes, etc.).

**Request:**
```json
{
  "scheduledAt": "2026-04-22T10:00:00Z",
  "notes": "Rescheduled per candidate request"
}
```

### DELETE `/api/interviews/[id]`

Cancel an interview (soft-delete, sets status to `cancelled`).

---

### POST `/api/interviews/[id]/respond`

Job seeker confirms, declines, or requests reschedule.

**Request:**
```json
{
  "response": "confirmed",
  "message": "Looking forward to it!"
}
```

**Response `200`:**
```json
{ "success": true, "status": "confirmed" }
```

---

### GET `/api/interviews/[id]/scorecard`

Get interview scorecard.

**Response `200`:**
```json
{
  "scorecard": {
    "overallRating": 4,
    "criteria": [
      { "name": "Technical Skills", "rating": 5, "notes": "Excellent system design knowledge" },
      { "name": "Communication", "rating": 4, "notes": "Clear and articulate" },
      { "name": "Culture Fit", "rating": 3, "notes": "Needs some alignment" }
    ],
    "recommendation": "strong_hire",
    "submittedBy": "John Smith",
    "submittedAt": "2026-04-20T16:00:00Z"
  }
}
```

### POST `/api/interviews/[id]/scorecard`

Interviewer submits an evaluation scorecard.

**Request:**
```json
{
  "overallRating": 4,
  "criteria": [
    { "name": "Technical Skills", "rating": 5, "notes": "Excellent" },
    { "name": "Communication", "rating": 4, "notes": "Clear" },
    { "name": "Culture Fit", "rating": 3, "notes": "Needs alignment" }
  ],
  "recommendation": "strong_hire",
  "comments": "Recommend for hire."
}
```

---

### POST `/api/interviews/bulk`

Schedule interviews for multiple candidates simultaneously.

**Request:**
```json
{
  "applicationIds": ["clx5mno...", "clx9abc..."],
  "scheduledAt": "2026-04-20T14:00:00Z",
  "duration": 45,
  "type": "video",
  "intervalMinutes": 60
}
```

**Response `201`:**
```json
{ "success": true, "created": 2, "interviews": ["clx19efg...", "clx20hij..."] }
```

---

## 8. Offers

### GET `/api/offers`

Role-scoped offer list.

**Response `200`:**
```json
{
  "offers": [
    {
      "id": "clx21klm...",
      "jobTitle": "Backend Engineer",
      "candidateName": "Sara Ahmed",
      "salary": 15000,
      "currency": "AED",
      "status": "pending",
      "expiresAt": "2026-04-30T00:00:00Z",
      "createdAt": "2026-04-16T10:00:00Z"
    }
  ],
  "total": 3
}
```

---

### POST `/api/offers`

Employer creates a job offer for a candidate.

**Request:**
```json
{
  "applicationId": "clx5mno...",
  "salary": 15000,
  "currency": "AED",
  "startDate": "2026-05-15",
  "expiresAt": "2026-04-30T00:00:00Z",
  "benefits": ["Health Insurance", "Annual Bonus", "Remote Fridays"],
  "notes": "We are excited to offer you this position."
}
```

**Response `201`:**
```json
{ "success": true, "offer": { "id": "clx21klm...", "status": "pending" } }
```

---

### GET `/api/offers/[id]`

Get a single offer with ownership check.

### PATCH `/api/offers/[id]`

Job seeker accepts or declines the offer.

**Request:**
```json
{
  "action": "accept",
  "message": "I am delighted to accept this offer!"
}
```

**Response `200`:**
```json
{ "success": true, "status": "accepted" }
```

---

## 9. Placements

### GET `/api/placements`

Role-scoped placement list.

**Response `200`:**
```json
{
  "placements": [
    {
      "id": "clx22nop...",
      "jobTitle": "Backend Engineer",
      "candidateName": "Sara Ahmed",
      "employerName": "Acme Corp",
      "salary": 15000,
      "startDate": "2026-05-15",
      "status": "active",
      "placedAt": "2026-04-16T12:00:00Z"
    }
  ],
  "total": 3
}
```

---

### POST `/api/placements`

Record a new successful placement.

**Request:**
```json
{
  "applicationId": "clx5mno...",
  "offerId": "clx21klm...",
  "salary": 15000,
  "startDate": "2026-05-15",
  "notes": "Placement confirmed"
}
```

**Response `201`:**
```json
{ "success": true, "placement": { "id": "clx22nop..." } }
```

---

### GET `/api/placements/[id]`

Get a placement record.

### PATCH `/api/placements/[id]`

Update a placement record (employer/agent/admin).

**Request:**
```json
{ "status": "completed", "endDate": "2027-05-15" }
```

---

## 10. Messages & DMs

### GET `/api/messages`

Get messages for a channel.

**Query Params:** `?channelId=clx23qrs...&page=1&limit=50`

**Response `200`:**
```json
{
  "messages": [
    {
      "id": "clx24tuv...",
      "senderId": "clx2def...",
      "senderName": "Sara Ahmed",
      "content": "Hello, I have a question about the role.",
      "timestamp": "2026-04-16T10:30:00Z",
      "read": false
    }
  ]
}
```

### POST `/api/messages`

Send a new channel message.

**Request:**
```json
{
  "channelId": "clx23qrs...",
  "content": "Thank you for your interest!"
}
```

---

### GET `/api/dm`

List DM conversations for the current user.

**Response `200`:**
```json
{
  "conversations": [
    {
      "id": "clx25wxy...",
      "participant": { "id": "clx2def...", "name": "Sara Ahmed", "avatar": "/uploads/avatars/sara.jpg" },
      "lastMessage": "See you at the interview!",
      "lastMessageAt": "2026-04-16T10:30:00Z",
      "unreadCount": 2
    }
  ]
}
```

### POST `/api/dm`

Initiate a new DM conversation with cross-role permission enforcement.

**Request:**
```json
{
  "recipientId": "clx2def...",
  "message": "Hi Sara, I'd like to discuss the Backend Engineer role."
}
```

**Response `201`:**
```json
{ "success": true, "conversationId": "clx25wxy..." }
```

---

### GET `/api/dm/[conversationId]/messages`

Get paginated message history.

**Query Params:** `?page=1&limit=50`

### POST `/api/dm/[conversationId]/messages`

Send a message with real-time Pusher event.

**Request:**
```json
{ "content": "See you at the interview!" }
```

---

### PATCH `/api/dm/[conversationId]/read`

Mark all messages in a conversation as read.

**Response `200`:**
```json
{ "success": true }
```

---

## 11. Notifications

### GET `/api/notifications`

Paginated notifications with unread count.

**Query Params:** `?page=1&limit=20`

**Response `200`:**
```json
{
  "notifications": [
    {
      "id": "clx26yz...",
      "type": "application_status",
      "title": "Application Update",
      "message": "Your application for Backend Engineer moved to Interview stage.",
      "read": false,
      "link": "/applications/clx5mno...",
      "createdAt": "2026-04-15T09:00:00Z"
    }
  ],
  "unreadCount": 5,
  "total": 42
}
```

### PATCH `/api/notifications`

Mark notifications as read.

**Request:**
```json
{
  "notificationIds": ["clx26yz...", "clx27abc..."]
}
```

**Response `200`:**
```json
{ "success": true, "markedRead": 2 }
```

---

## 12. Scorecards

### GET `/api/scorecards`

List employer's scorecards with application filtering.

**Query Params:** `?applicationId=clx5mno...`

### POST `/api/scorecards`

Create a scorecard.

**Request:**
```json
{
  "applicationId": "clx5mno...",
  "criteria": [
    { "name": "Technical Skills", "rating": 5, "weight": 40 },
    { "name": "Communication", "rating": 4, "weight": 30 },
    { "name": "Culture Fit", "rating": 3, "weight": 30 }
  ],
  "overallRating": 4,
  "recommendation": "hire",
  "comments": "Strong candidate."
}
```

### GET `/api/scorecards/[id]`

Get a specific scorecard.

### PATCH `/api/scorecards/[id]`

Update a specific scorecard. Employer-only ownership enforced.

---

## 13. Commissions

### GET `/api/commissions`

Role-scoped commission list with summary aggregation.

**Response `200`:**
```json
{
  "commissions": [
    {
      "id": "clx28def...",
      "placementId": "clx22nop...",
      "agentName": "Ali Agent",
      "amount": 5000,
      "currency": "AED",
      "status": "pending",
      "createdAt": "2026-04-16T12:00:00Z"
    }
  ],
  "summary": { "total": 15000, "pending": 5000, "approved": 5000, "paid": 5000 },
  "total": 3
}
```

### POST `/api/commissions`

Create a commission record.

**Request:**
```json
{
  "placementId": "clx22nop...",
  "agentId": "clx14pqr...",
  "amount": 5000,
  "currency": "AED",
  "rate": 10
}
```

### GET `/api/commissions/[id]`

Get a commission record.

### PATCH `/api/commissions/[id]`

Update commission status (pending → approved → paid).

**Request:**
```json
{ "status": "approved" }
```

---

## 14. Saved Jobs

### GET `/api/saved-jobs`

List saved jobs for the current job seeker.

**Response `200`:**
```json
{
  "savedJobs": [
    {
      "id": "clx29ghi...",
      "job": { "id": "clx3ghi...", "title": "React Developer", "company": "Acme Corp", "status": "active" },
      "notes": "Looks like a good fit",
      "savedAt": "2026-04-14T08:00:00Z"
    }
  ]
}
```

### POST `/api/saved-jobs`

Save a job with optional notes.

**Request:**
```json
{
  "jobId": "clx3ghi...",
  "notes": "Apply by end of week"
}
```

### DELETE `/api/saved-jobs/[id]`

Remove a saved job entry.

**Response `200`:**
```json
{ "success": true }
```

---

## 15. Leads

### GET `/api/leads`

Role-scoped lead list. Agents see only their own leads.

**Query Params:** `?page=1&limit=20&status=new`

**Response `200`:**
```json
{
  "leads": [
    {
      "id": "clx30jkl...",
      "companyName": "Startup Inc",
      "contactName": "Ali Khalid",
      "email": "ali@startup.com",
      "phone": "+971501111111",
      "status": "new",
      "notes": "Interested in hiring 3 developers",
      "createdAt": "2026-04-10T08:00:00Z"
    }
  ],
  "total": 15
}
```

### POST `/api/leads`

Create a new lead (rate-limited).

**Request:**
```json
{
  "companyName": "Startup Inc",
  "contactName": "Ali Khalid",
  "email": "ali@startup.com",
  "phone": "+971501111111",
  "status": "new",
  "notes": "Needs 3 developers"
}
```

### GET `/api/leads/[id]`

Get a specific lead.

### PATCH `/api/leads/[id]`

Update a lead. Agent ownership enforced.

**Request:**
```json
{ "status": "contacted", "notes": "Spoke on phone, scheduling meeting." }
```

### DELETE `/api/leads/[id]`

Delete a lead. Agent ownership enforced.

---

## 16. Activity

### GET `/api/activity`

Last 10 ActivityEvents for the current job seeker with CTA metadata.

**Response `200`:**
```json
{
  "activities": [
    {
      "id": "clx31mno...",
      "type": "application_status_changed",
      "message": "Your application for Backend Engineer moved to Interview.",
      "timestamp": "2026-04-15T09:00:00Z",
      "cta": { "label": "View Application", "href": "/applications/clx5mno..." }
    },
    {
      "type": "interview_scheduled",
      "message": "Interview scheduled for April 20 at 2:00 PM.",
      "timestamp": "2026-04-14T16:00:00Z",
      "cta": { "label": "View Interview", "href": "/interviews/clx15stu..." }
    }
  ],
  "priorityItem": {
    "type": "interview_scheduled",
    "cta": { "label": "Prepare for Interview", "href": "/interviews/clx15stu..." }
  }
}
```

---

## 17. Dashboard

### GET `/api/dashboard/stats`

Job seeker weekly stats with week-over-week deltas.

**Response `200`:**
```json
{
  "applications": { "current": 12, "previous": 8, "delta": 50 },
  "interviews": { "current": 3, "previous": 1, "delta": 200 },
  "savedJobs": { "current": 8, "previous": 6, "delta": 33 },
  "profileViews": { "current": 45, "previous": 30, "delta": 50 },
  "matchScore": { "current": 87, "previous": 82, "delta": 6 }
}
```

---

## 18. Filters

### GET `/api/filters` 🌐

All active job-attribute values grouped by category. Cached 5 min.

**Response `200`:**
```json
{
  "industries": [
    { "id": "clx32pqr...", "name": "Technology", "slug": "technology" },
    { "id": "clx33stu...", "name": "Healthcare", "slug": "healthcare" }
  ],
  "skills": [
    { "id": "clx34vwx...", "name": "React", "slug": "react" },
    { "id": "clx35yza...", "name": "Node.js", "slug": "nodejs" }
  ],
  "experienceLevels": ["entry", "junior", "mid", "senior", "lead", "executive"],
  "employmentTypes": ["full-time", "part-time", "contract", "internship", "freelance"]
}
```

---

### GET `/api/filters/locations` 🌐

Cascading location dropdown data.

**Query Params:**
| Param | Example | Description |
|-------|---------|-------------|
| `type` | `countries` | `countries` / `states` / `cities` |
| `countryId` | `clxAE...` | Get states by country |
| `stateId` | `clxDubai...` | Get cities by state |
| `search` | `"Dub"` | City name search |

**Response `200`:**
```json
{
  "locations": [
    { "id": "clxAE...", "name": "United Arab Emirates", "code": "AE" }
  ]
}
```

---

## 19. AI Services

### POST `/api/ai/chat`

Streaming AI chat assistant with role-aware system prompts.

**Request:**
```json
{
  "message": "What are the top skills for a backend engineer in Dubai?",
  "threadId": "clx36bcd..."
}
```

**Response:** Server-Sent Events (SSE) stream.

---

### GET `/api/ai/chat-history`

Get recent conversation threads.

### POST `/api/ai/chat-history`

Create or append to a conversation thread.

---

### POST `/api/ai/cv-extract`

Upload a CV and extract structured profile via Gemini multimodal. `multipart/form-data`.

**Request:** Form field `cv` (PDF / DOCX).

**Response `200`:**
```json
{
  "profile": {
    "name": "Sara Ahmed",
    "title": "Frontend Developer",
    "skills": ["React", "TypeScript", "CSS"],
    "experience": [
      { "company": "Tech Co", "role": "Frontend Dev", "duration": "3 years" }
    ],
    "education": [
      { "institution": "University of Dubai", "degree": "BSc Computer Science" }
    ],
    "languages": ["English", "Arabic"]
  }
}
```

---

### POST `/api/ai/job-description`

Generate a structured job description via Gemini.

**Request:**
```json
{
  "title": "Backend Engineer",
  "industry": "Technology",
  "experienceLevel": "mid",
  "skills": ["Node.js", "MongoDB"]
}
```

**Response `200`:**
```json
{
  "description": {
    "summary": "We are seeking a skilled Backend Engineer...",
    "responsibilities": ["Design and build REST APIs...", "Optimize database queries..."],
    "requirements": ["3+ years Node.js experience...", "MongoDB proficiency..."],
    "niceToHave": ["Docker experience", "AWS knowledge"]
  }
}
```

---

### POST `/api/ai/interview-questions`

Generate typed interview questions for a role.

**Request:**
```json
{
  "jobTitle": "Backend Engineer",
  "skills": ["Node.js", "MongoDB"],
  "types": ["technical", "behavioral", "culture_fit"]
}
```

**Response `200`:**
```json
{
  "questions": {
    "technical": [
      "Explain the Node.js event loop and how it handles concurrent requests.",
      "How would you design a MongoDB schema for a multi-tenant SaaS application?"
    ],
    "behavioral": [
      "Tell me about a time you had to debug a complex production issue."
    ],
    "culture_fit": [
      "How do you approach working with a distributed team across time zones?"
    ]
  }
}
```

---

### POST `/api/ai/match`

AI-computed match score (0–100) with reasoning.

**Request:**
```json
{
  "jobSeekerId": "clx2def...",
  "jobId": "clx4jkl..."
}
```

**Response `200`:**
```json
{
  "matchScore": 87,
  "breakdown": {
    "skills": { "score": 90, "matched": ["Node.js", "MongoDB"], "missing": ["Docker"] },
    "experience": { "score": 85, "reason": "4 years vs 3+ required" },
    "location": { "score": 100, "reason": "Same city" },
    "salary": { "score": 75, "reason": "Desired salary slightly above range" }
  },
  "recommendation": "Strong match — excellent skill alignment."
}
```

---

### POST `/api/ai/screen-candidates`

AI screens top candidates for a job using Gemini.

**Request:**
```json
{
  "jobId": "clx4jkl...",
  "limit": 10
}
```

**Response `200`:**
```json
{
  "candidates": [
    { "id": "clx2def...", "name": "Sara Ahmed", "matchScore": 92, "strengths": ["React", "TypeScript"], "concerns": [] },
    { "id": "clx37efg...", "name": "Omar Ali", "matchScore": 85, "strengths": ["Node.js"], "concerns": ["Limited MongoDB experience"] }
  ]
}
```

---

### POST `/api/ai/skills-gap`

Analyze skills gap between a job seeker and a job's requirements.

**Request:**
```json
{
  "jobSeekerId": "clx2def...",
  "jobId": "clx4jkl..."
}
```

**Response `200`:**
```json
{
  "gaps": [
    { "skill": "Docker", "priority": "high", "learningPath": "Docker Fundamentals course — 10 hours" },
    { "skill": "AWS", "priority": "medium", "learningPath": "AWS Cloud Practitioner — 20 hours" }
  ],
  "matchedSkills": ["Node.js", "MongoDB", "Express"],
  "overallReadiness": 78
}
```

---

### GET `/api/ai/skills-suggest`

Suggests 8–12 additional skills based on profile and Gulf market trends.

**Response `200`:**
```json
{
  "suggestions": ["Next.js", "GraphQL", "Docker", "Kubernetes", "Redis", "PostgreSQL", "CI/CD", "Terraform"]
}
```

---

### POST `/api/ai/speech-to-text`

Transcribe audio. `multipart/form-data`.

**Request:** Form field `audio` (WAV/MP3/WebM).

**Response `200`:**
```json
{
  "text": "I am looking for a senior frontend developer role in Dubai.",
  "language": "en",
  "confidence": 0.95
}
```

---

### POST `/api/ai/candidate-search-filters`

Parse natural-language into structured candidate search filters.

**Request:**
```json
{ "query": "React developers in Dubai with 3+ years experience" }
```

**Response `200`:**
```json
{
  "filters": {
    "skills": ["React"],
    "city": "Dubai",
    "minExperience": 3
  }
}
```

---

### POST `/api/ai/job-search-filters`

Parse natural-language into structured job search filters.

**Request:**
```json
{ "query": "remote Node.js jobs paying over 10000 AED" }
```

**Response `200`:**
```json
{
  "filters": {
    "skills": ["Node.js"],
    "remote": true,
    "minSalary": 10000,
    "currency": "AED"
  }
}
```

---

### GET `/api/ai/daily-insights`

Personalized AI-generated daily insights based on role and recent activity.

**Response `200`:**
```json
{
  "insights": [
    { "type": "tip", "message": "Your profile views increased 50% this week. Consider applying to trending roles." },
    { "type": "market", "message": "React developers are in high demand in Dubai this month." }
  ]
}
```

---

### POST `/api/ai/report`

Generate a natural-language analytics report from platform data.

**Request:**
```json
{ "query": "How are our job postings performing this month?" }
```

**Response `200`:**
```json
{
  "report": "Your 5 active job postings received 85 total applications this month, a 40% increase from March. The Backend Engineer role leads with 14 applications and a 7% conversion rate..."
}
```

---

### GET `/api/ai/salary-benchmark`

AI salary benchmark for a role/location/seniority. Cached 24h.

**Query Params:** `?title=Backend Engineer&country=AE&city=Dubai&level=mid`

**Response `200`:**
```json
{
  "benchmark": {
    "title": "Backend Engineer",
    "location": "Dubai, AE",
    "level": "mid",
    "salary": { "min": 8000, "median": 12000, "max": 18000, "currency": "AED" },
    "marketTrend": "rising",
    "lastUpdated": "2026-04-16T00:00:00Z"
  }
}
```

---

## 20. Admin

### GET `/api/admin/stats`

Admin dashboard KPIs.

**Response `200`:**
```json
{
  "users": { "total": 5000, "jobSeekers": 3500, "employers": 800, "agents": 200, "admins": 5 },
  "jobs": { "total": 1200, "active": 450, "draft": 300, "closed": 450 },
  "applications": { "total": 8500, "thisMonth": 1200 }
}
```

---

### GET `/api/admin/analytics`

Platform-wide analytics: jobs by month, application status breakdown and revenue.

**Response `200`:**
```json
{
  "jobsByMonth": [{ "month": "2026-03", "count": 120 }, { "month": "2026-04", "count": 145 }],
  "applicationsByStatus": { "applied": 3000, "screening": 2000, "interview": 1500, "offered": 500, "hired": 300, "rejected": 1200 },
  "revenue": { "thisMonth": 50000, "lastMonth": 42000, "currency": "AED" }
}
```

---

### GET `/api/admin/users`

Admin paginated user list.

**Query Params:** `?page=1&limit=20&role=employer&search=Acme&status=active`

### PATCH `/api/admin/users`

Bulk or single user update (status, role, etc.).

**Request:**
```json
{
  "userId": "clx2def...",
  "status": "suspended",
  "reason": "Terms violation"
}
```

### DELETE `/api/admin/users`

Delete/deactivate a user.

---

### GET `/api/admin/jobs`

Admin/super-agent paginated job list with status and approval filters.

**Query Params:** `?page=1&limit=20&status=pending_approval`

---

### POST `/api/admin/jobs/[id]/approve`

Approve or reject a job posting.

**Request:**
```json
{
  "action": "approve",
  "notes": "Looks good, approved."
}
```

**Response `200`:**
```json
{ "success": true, "status": "active" }
```

---

### GET `/api/admin/agents`

List agent accounts.

### POST `/api/admin/agents`

Create an agent account.

**Request:**
```json
{
  "name": "Ali Agent",
  "email": "ali@agency.com",
  "phone": "+971502222222",
  "region": "Dubai"
}
```

### PATCH `/api/admin/agents`

Update an agent account.

---

### GET `/api/admin/super-agents`

List super-agent accounts.

### POST `/api/admin/super-agents`

Create a super-agent account.

### PATCH `/api/admin/super-agents`

Update a super-agent account.

---

### GET `/api/admin/territories`

List geographic territories.

### POST `/api/admin/territories`

Create a territory with super-agent assignment.

**Request:**
```json
{
  "name": "Dubai Metro",
  "country": "AE",
  "cities": ["Dubai", "Sharjah"],
  "superAgentId": "clx38hij..."
}
```

---

### GET `/api/admin/audit-logs`

Paginated filterable audit-log viewer.

**Query Params:** `?page=1&limit=50&userId=clx2def...&action=login&from=2026-04-01&to=2026-04-16`

**Response `200`:**
```json
{
  "logs": [
    {
      "id": "clx39klm...",
      "userId": "clx2def...",
      "action": "login",
      "ip": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2026-04-16T08:00:00Z"
    }
  ],
  "total": 500
}
```

---

### GET `/api/admin/communications`

View broadcast history.

### POST `/api/admin/communications`

Send bulk system notifications.

**Request:**
```json
{
  "title": "Platform Update",
  "message": "We've launched new AI features! Check them out.",
  "targetRoles": ["job_seeker", "employer"],
  "type": "announcement"
}
```

---

### POST `/api/admin/impersonate`

Start or stop a user impersonation session. Fully audit-logged.

**Request:**
```json
{
  "action": "start",
  "targetUserId": "clx2def...",
  "reason": "Debugging user-reported issue"
}
```

---

### GET `/api/admin/interviews`

Admin paginated interview list.

---

### GET `/api/admin/settings`

Get global platform settings.

**Response `200`:**
```json
{
  "platformName": "Mployedin",
  "supportEmail": "support@mployedin.com",
  "maintenanceMode": false,
  "maxJobsPerEmployer": 50,
  "autoApproveJobs": false
}
```

### POST `/api/admin/settings`

Update global platform settings.

---

### Admin: Job Attributes

#### GET `/api/admin/job-attributes/[category]`
List job attributes by category (e.g., `industries`, `skills`, `job-types`).

#### POST `/api/admin/job-attributes/[category]`
Create a new attribute.

**Request:**
```json
{ "name": "Machine Learning", "slug": "machine-learning" }
```

#### GET `/api/admin/job-attributes/[category]/[id]`
Get a specific attribute.

#### PATCH `/api/admin/job-attributes/[category]/[id]`
Update an attribute.

#### DELETE `/api/admin/job-attributes/[category]/[id]`
Delete an attribute.

---

### Admin: CMS

#### Banners

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/banners` | List banners |
| POST | `/api/admin/cms/banners` | Create banner |
| GET | `/api/admin/cms/banners/[id]` | Get banner |
| PATCH | `/api/admin/cms/banners/[id]` | Update banner |
| DELETE | `/api/admin/cms/banners/[id]` | Delete banner |

**Create Request:**
```json
{
  "title": "Summer Hiring Event",
  "subtitle": "Find your next star employee",
  "imageUrl": "/uploads/banners/summer.jpg",
  "ctaText": "Post a Job",
  "ctaLink": "/employer/jobs/new",
  "active": true,
  "order": 1
}
```

#### Blogs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/blogs` | List blog posts |
| POST | `/api/admin/cms/blogs` | Create blog post (HTML sanitized) |
| GET | `/api/admin/cms/blogs/[id]` | Get blog post |
| PATCH | `/api/admin/cms/blogs/[id]` | Update blog post |
| DELETE | `/api/admin/cms/blogs/[id]` | Delete blog post |

#### FAQs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/faqs` | List FAQs |
| POST | `/api/admin/cms/faqs` | Create FAQ |
| GET | `/api/admin/cms/faqs/[id]` | Get FAQ |
| PATCH | `/api/admin/cms/faqs/[id]` | Update FAQ |
| DELETE | `/api/admin/cms/faqs/[id]` | Delete FAQ |

#### Static Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/static-pages` | List static pages |
| POST | `/api/admin/cms/static-pages` | Create page |
| GET | `/api/admin/cms/static-pages/[id]` | Get page |
| PATCH | `/api/admin/cms/static-pages/[id]` | Update page |
| DELETE | `/api/admin/cms/static-pages/[id]` | Delete page |

#### Testimonials

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/testimonials` | List testimonials |
| POST | `/api/admin/cms/testimonials` | Create testimonial |
| GET | `/api/admin/cms/testimonials/[id]` | Get testimonial |
| PATCH | `/api/admin/cms/testimonials/[id]` | Update testimonial |
| DELETE | `/api/admin/cms/testimonials/[id]` | Delete testimonial |

#### Videos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/videos` | List videos |
| POST | `/api/admin/cms/videos` | Create video |
| GET | `/api/admin/cms/videos/[id]` | Get video |
| PATCH | `/api/admin/cms/videos/[id]` | Update video |
| DELETE | `/api/admin/cms/videos/[id]` | Delete video |

#### Contact Submissions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/cms/contact-submissions` | List submissions |
| GET | `/api/admin/cms/contact-submissions/[id]` | Get submission |
| PATCH | `/api/admin/cms/contact-submissions/[id]` | Mark as read |
| DELETE | `/api/admin/cms/contact-submissions/[id]` | Delete submission |

---

### Admin: Location Data

#### Countries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/location-data/countries` | List countries |
| POST | `/api/admin/location-data/countries` | Create country |
| GET | `/api/admin/location-data/countries/[id]` | Get country |
| PATCH | `/api/admin/location-data/countries/[id]` | Update country |
| DELETE | `/api/admin/location-data/countries/[id]` | Delete country |

#### States

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/location-data/states` | List states |
| POST | `/api/admin/location-data/states` | Create state |
| GET | `/api/admin/location-data/states/[id]` | Get state |
| PATCH | `/api/admin/location-data/states/[id]` | Update state |
| DELETE | `/api/admin/location-data/states/[id]` | Delete state |

#### Cities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/location-data/cities` | List cities |
| POST | `/api/admin/location-data/cities` | Create city |
| GET | `/api/admin/location-data/cities/[id]` | Get city |
| PATCH | `/api/admin/location-data/cities/[id]` | Update city |
| DELETE | `/api/admin/location-data/cities/[id]` | Delete city |

---

## 21. Super Agent

### GET `/api/super-agent/agents`

Lists agents under the current super agent with lead count, conversions and conversion-rate stats.

**Response `200`:**
```json
{
  "agents": [
    {
      "id": "clx14pqr...",
      "name": "Ali Agent",
      "email": "ali@agency.com",
      "leads": 15,
      "conversions": 5,
      "conversionRate": 33.3
    }
  ]
}
```

---

### GET `/api/super-agent/approvals`

Paginated list of jobs pending approval scoped to managed agents.

### PATCH `/api/super-agent/approvals/[id]`

Approve or reject a specific job posting.

**Request:**
```json
{ "action": "approve", "notes": "Good listing." }
```

### GET `/api/super-agent/approvals/count`

Pending approvals count (cached 30s).

**Response `200`:**
```json
{ "count": 7 }
```

---

### GET `/api/super-agent/leads`

Paginated lead list scoped to the super agent.

---

### GET `/api/super-agent/profile`

Get super agent profile.

### PATCH `/api/super-agent/profile`

Update super agent profile.

**Request:**
```json
{ "commissionRate": 12, "bio": "Experienced recruitment leader..." }
```

---

## 22. Public / CMS 🌐

### GET `/api/public/landing`

Aggregated landing page data: FAQs, banners, testimonials, videos and recent blogs in one call.

**Response `200`:**
```json
{
  "banners": [{ "title": "Find Your Dream Job", "imageUrl": "/uploads/banners/hero.jpg", "ctaText": "Browse Jobs" }],
  "testimonials": [{ "name": "Sara", "quote": "Found my dream job in 2 weeks!", "company": "Tech Co" }],
  "faqs": [{ "question": "How does Mployedin work?", "answer": "Mployedin connects..." }],
  "videos": [{ "title": "How It Works", "url": "https://youtube.com/..." }],
  "recentBlogs": [{ "title": "Top Skills in 2026", "slug": "top-skills-2026" }]
}
```

---

### GET `/api/public/blogs`

Paginated blog listing with tag and full-text search.

**Query Params:** `?page=1&limit=10&tag=career-tips&search=interview`

### GET `/api/public/blogs/[slug]`

Blog post detail by slug.

---

### GET `/api/public/pages/[slug]`

Static CMS page by slug (e.g., `privacy-policy`, `terms-of-service`, `about`).

**Response `200`:**
```json
{
  "page": {
    "title": "Privacy Policy",
    "slug": "privacy-policy",
    "content": "<h1>Privacy Policy</h1><p>We respect your privacy...</p>",
    "updatedAt": "2026-04-01T00:00:00Z"
  }
}
```

---

### POST `/api/contact` 🌐

Public contact form submission with optional reCAPTCHA v3 and IP-based rate limiting.

**Request:**
```json
{
  "name": "Visitor",
  "email": "visitor@example.com",
  "subject": "General Inquiry",
  "message": "I have a question about your platform.",
  "recaptchaToken": "03AGdBq24..."
}
```

**Response `200`:**
```json
{ "success": true, "message": "Message sent successfully." }
```

---

### GET `/api/countries` 🌐

Searchable country list with currency and phone-code data. Rate-limited.

**Query Params:** `?search=united`

**Response `200`:**
```json
{
  "countries": [
    { "code": "AE", "name": "United Arab Emirates", "currency": "AED", "phoneCode": "+971" },
    { "code": "US", "name": "United States", "currency": "USD", "phoneCode": "+1" }
  ]
}
```

---

## 23. Integrations

### Built-in Availability Calendar

Availability is managed via the job seeker settings API (`PATCH /api/job-seekers/settings`). No external OAuth is needed.

#### GET `/api/job-seekers/[id]/availability?date=YYYY-MM-DD&range=7`

Returns available 30-minute time slots for a candidate over a date range (1–14 days). Accounts for the candidate's `weeklyAvailability`, `availableHours`, `timeBuffer`, and already-booked interviews.

**Response `200`:**
```json
{
  "seekerId": "ObjectId",
  "timeBuffer": 30,
  "availability": [
    {
      "date": "2026-04-22",
      "dayName": "Wed",
      "slots": [
        { "start": "09:00", "end": "09:30" },
        { "start": "09:30", "end": "10:00" }
      ]
    }
  ]
}
```

---

### POST `/api/pusher/auth`

Authenticate Pusher private channels. Users may only auth their own `private-dm-{userId}` channel.

**Request:**
```json
{
  "socket_id": "12345.67890",
  "channel_name": "private-dm-clx2def..."
}
```

---

## 24. GDPR

### GET `/api/gdpr/export`

Full GDPR data export (max 3 requests/day).

**Response `200`:** JSON containing all user data (profile, applications, messages, etc.).

### DELETE `/api/gdpr/export`

Right-to-erasure: anonymises the user account and associated data.

**Response `200`:**
```json
{ "success": true, "message": "Account data has been anonymised." }
```

---

## 25. Cron Jobs

> Internal endpoints secured by `CRON_SECRET` header.

| Method | Endpoint | Schedule | Description |
|--------|----------|----------|-------------|
| GET | `/api/cron/interview-reminders` | Daily | Sends reminders for interviews within 24h |
| GET | `/api/cron/job-expiry` | Daily | Closes expired jobs or jobs at max applicants |
| GET | `/api/cron/nps-trigger` | Daily | Sends NPS feedback requests for terminal applications |
| GET | `/api/cron/offer-expiry` | Daily | Expires pending offers past their deadline |
| GET | `/api/cron/sla-alerts` | Daily | Alerts employers when candidates stalled > 7 days |
| POST | `/api/cron/autoapply` | — | **Disabled** (returns 503) |

---

## 26. Miscellaneous

### GET `/api/tasks`

Admin reads the project task list from `tasks.json`.

### PATCH `/api/tasks/[id]`

Admin updates a task's completion status.

---

### Inngest

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inngest` | Inngest serve endpoint |
| POST | `/api/inngest` | Inngest event handler |
| PUT | `/api/inngest` | Inngest function registration |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad Request — validation errors |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Not Found |
| `409` | Conflict — resource already exists |
| `429` | Too Many Requests — rate limited |
| `500` | Internal Server Error |
| `503` | Service Unavailable — feature disabled |

---

## Rate Limiting

| Endpoint Group | Limit |
|----------------|-------|
| Auth (register, login, forgot-password) | 5 req/min per IP |
| Contact form | 3 req/min per IP |
| AI endpoints | 20 req/min per user |
| File uploads | 10 req/min per user |
| General API | 100 req/min per user |
| GDPR export | 3 req/day per user |
| Domain verification | 3 req/day per employer |

---

## Authentication Flow

```
1. POST /api/auth/employer-register  OR  /api/auth/job-seeker-register
2. POST /api/auth/verify-email  (click link from email)
3. POST /api/auth/[...nextauth]  (NextAuth.js sign-in → returns JWT)
4. Use JWT as Bearer token for all subsequent requests
```

---

*Generated from 130+ route files across 33 API groups. Last updated: April 2026.*
