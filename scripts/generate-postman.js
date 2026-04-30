const fs = require('fs');

const collection = {
  info: {
    name: 'Mployedin API',
    description: 'Full API documentation for Mployedin platform - All endpoints with request models',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'jobId', value: '', type: 'string' },
    { key: 'applicationId', value: '', type: 'string' },
    { key: 'employerId', value: '', type: 'string' },
    { key: 'interviewId', value: '', type: 'string' },
    { key: 'conversationId', value: '', type: 'string' },
    { key: 'cronSecret', value: '', type: 'string' },
    { key: 'leadId', value: '', type: 'string' },
    { key: 'offerId', value: '', type: 'string' },
    { key: 'planId', value: '', type: 'string' },
    { key: 'subscriptionId', value: '', type: 'string' },
    { key: 'agentId', value: '', type: 'string' },
    { key: 'jobSeekerId', value: '', type: 'string' },
    { key: 'placementId', value: '', type: 'string' },
    { key: 'commissionId', value: '', type: 'string' },
    { key: 'invoiceId', value: '', type: 'string' },
    { key: 'taskId', value: '', type: 'string' },
    { key: 'scorecardId', value: '', type: 'string' },
    { key: 'templateId', value: '', type: 'string' },
    { key: 'approvalId', value: '', type: 'string' }
  ],
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  item: []
};

function req(name, method, url, body, desc) {
  const r = {
    name,
    request: {
      method,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      url: { raw: '{{baseUrl}}' + url, host: ['{{baseUrl}}'], path: url.split('?')[0].split('/').filter(Boolean) },
      description: desc || ''
    }
  };
  if (url.includes('?')) {
    const params = new URLSearchParams(url.split('?')[1]);
    r.request.url.query = Array.from(params.entries()).map(([key, value]) => ({ key, value }));
  }
  if (body) r.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2) };
  return r;
}

function formReq(name, method, url, fields, desc) {
  return {
    name,
    request: {
      method,
      header: [],
      url: { raw: '{{baseUrl}}' + url, host: ['{{baseUrl}}'], path: url.split('/').filter(Boolean) },
      body: { mode: 'formdata', formdata: fields },
      description: desc || ''
    }
  };
}

// ============ AUTH ============
const auth = {
  name: 'Auth',
  description: 'Authentication & Registration endpoints',
  item: [
    req('Job Seeker Register', 'POST', '/api/auth/job-seeker-register', { name: 'John Doe', email: 'john@example.com', password: 'Password123!' }, 'Register a new job seeker account. Rate limited.'),
    req('Employer Register', 'POST', '/api/auth/employer-register', { companyName: 'Acme Corp', industry: 'Technology', size: '50-200', website: 'https://acme.com', country: 'AE', city: 'Dubai', contactName: 'Jane', contactEmail: 'jane@acme.com', contactTitle: 'HR Manager', contactPhone: '+971501234567', password: 'Password123!' }, 'Register a new employer account. Rate limited.'),
    req('Agent Register', 'POST', '/api/auth/agent-register', { fullName: 'Agent Smith', email: 'agent@example.com', phone: '+971501234567', password: 'Password123!', country: 'AE', city: 'Dubai', experience: '5', specialization: 'IT', languages: ['en', 'ar'] }, 'Register a new recruitment agent account'),
    req('Forgot Password', 'POST', '/api/auth/forgot-password', { email: 'user@example.com' }, 'Request password reset email. Rate limited: 5 per 5 min'),
    req('Reset Password', 'POST', '/api/auth/reset-password', { token: 'reset-token-here', password: 'NewPassword123!' }, 'Reset password using token from email. Rate limited: 5 per 5 min'),
    req('Verify Email', 'POST', '/api/auth/verify-email', { token: 'verification-token' }, 'Verify email address. Rate limited: 10 per 5 min'),
    req('Resend Verification', 'POST', '/api/auth/resend-verification', { email: 'user@example.com' }, 'Resend email verification. Rate limited: 3 per 5 min'),
    req('Post Login Redirect', 'GET', '/api/auth/post-login-redirect', null, 'Get redirect URL after login based on user role. Requires session.'),
  ]
};

// ============ ADMIN ============
const admin = {
  name: 'Admin',
  description: 'Admin-only endpoints. Requires role: admin',
  item: [
    { name: 'Users', item: [
      req('List Users', 'GET', '/api/admin/users?page=1&limit=20&role=job_seeker&search=&isActive=true', null, 'List all users with pagination and filters'),
      req('Create User', 'POST', '/api/admin/users', { name: 'New User', email: 'new@example.com', role: 'job_seeker', password: 'Pass123!' }, 'Admin create user'),
      req('Update User', 'PATCH', '/api/admin/users', { userId: '{{userId}}', isActive: false }, 'Admin update user'),
      req('Delete User', 'DELETE', '/api/admin/users', { userId: '{{userId}}' }, 'Admin delete user'),
    ]},
    { name: 'Stats & Analytics', item: [
      req('Dashboard Stats', 'GET', '/api/admin/stats', null, 'Platform-wide statistics'),
      req('Analytics', 'GET', '/api/admin/analytics', null, 'Detailed platform analytics'),
      req('System Health', 'GET', '/api/admin/system-health', null, 'System health check (DB, queues, etc.)'),
      req('Subscription Stats', 'GET', '/api/admin/subscription-stats', null, 'Subscription revenue and usage stats'),
      req('Notification Stats', 'GET', '/api/admin/notification-stats', null, 'Email/push delivery statistics'),
    ]},
    { name: 'Settings', item: [
      req('Get Settings', 'GET', '/api/admin/settings', null, 'Get platform settings'),
      req('Update Settings', 'POST', '/api/admin/settings', { platformName: 'Mployedin', supportEmail: 'support@mployedin.com', maintenanceMode: false, defaultCurrency: 'AED' }, 'Update platform settings'),
      req('Test Email', 'POST', '/api/admin/settings/test-email', { to: 'test@example.com' }, 'Send test email to verify configuration'),
    ]},
    { name: 'Jobs Management', item: [
      req('List Jobs', 'GET', '/api/admin/jobs?page=1&limit=20&status=active&approvalStatus=pending&search=&employerId=&agentId=', null, 'List all jobs with admin filters'),
      req('Approve/Reject Job', 'PATCH', '/api/admin/jobs/{{jobId}}/approve', { action: 'approve', notes: 'Approved' }, 'Approve or reject a job posting'),
    ]},
    { name: 'Subscription Plans', item: [
      req('List Plans', 'GET', '/api/admin/subscription-plans', null, 'List all subscription plans'),
      req('Create Plan', 'POST', '/api/admin/subscription-plans', { name: 'Pro Plan', price: 99, currency: 'AED', interval: 'monthly', features: ['unlimited_jobs', 'ai_matching', 'analytics'], role: 'employer', isActive: true }, 'Create a new subscription plan'),
      req('Get Plan', 'GET', '/api/admin/subscription-plans/{{planId}}', null, 'Get plan details'),
      req('Update Plan', 'PATCH', '/api/admin/subscription-plans/{{planId}}', { price: 149, isActive: true }, 'Update plan'),
      req('Delete Plan', 'DELETE', '/api/admin/subscription-plans/{{planId}}', null, 'Delete plan'),
    ]},
    { name: 'Impersonate', item: [
      req('Start Impersonation', 'POST', '/api/admin/impersonate', { userId: '{{userId}}' }, 'Login as another user for debugging'),
      req('Exit Impersonation', 'POST', '/api/admin/impersonate', { exit: true }, 'Return to admin account'),
    ]},
    { name: 'Audit & Logs', item: [
      req('Audit Logs', 'GET', '/api/admin/audit-logs?page=1&limit=50&resource=job&action=create&from=2026-01-01&to=2026-12-31', null, 'View system audit logs'),
      req('Email Logs', 'GET', '/api/admin/email-logs', null, 'View email delivery logs'),
      req('Activity Timeline', 'GET', '/api/admin/activity-timeline', null, 'Platform activity timeline'),
    ]},
    { name: 'Bulk Import', item: [
      req('Bulk Import', 'POST', '/api/admin/bulk-import', { type: 'job_seekers', rows: [{ name: 'User 1', email: 'u1@test.com' }, { name: 'User 2', email: 'u2@test.com' }] }, 'Bulk import data (max 500 rows). Types: job_seekers, employers, jobs'),
    ]},
    { name: 'Agents & Territories', item: [
      req('List Agents', 'GET', '/api/admin/agents', null, 'List all agents'),
      req('List Super Agents', 'GET', '/api/admin/super-agents', null, 'List all super agents'),
      req('List Territories', 'GET', '/api/admin/territories', null, 'List all territories'),
    ]},
    { name: 'Notification Config', item: [
      req('Get Config', 'GET', '/api/admin/notification-config', null, 'Get notification templates and settings'),
      req('Update Config', 'PATCH', '/api/admin/notification-config', { templateId: 'welcome_email', enabled: true, channels: ['email', 'push'] }, 'Update notification template config'),
      req('Get User Override', 'GET', '/api/admin/notification-config/user-override?userId={{userId}}', null, 'Get per-user notification overrides'),
      req('Set User Override', 'PATCH', '/api/admin/notification-config/user-override', { userId: '{{userId}}', overrides: { marketing_emails: false } }, 'Set per-user notification override'),
    ]},
    { name: 'CMS - Blogs', item: [
      req('List Blogs', 'GET', '/api/admin/cms/blogs?page=1&limit=10', null, 'List blog posts'),
      req('Create Blog', 'POST', '/api/admin/cms/blogs', { title: 'Career Tips 2026', slug: 'career-tips-2026', content: '<p>Here are the top career tips...</p>', excerpt: 'Top career tips for professionals', tags: ['career', 'tips'], status: 'published', author: 'Admin' }, 'Create blog post'),
      req('Get Blog', 'GET', '/api/admin/cms/blogs/{{blogId}}', null, 'Get blog by ID'),
      req('Update Blog', 'PATCH', '/api/admin/cms/blogs/{{blogId}}', { title: 'Updated Title', status: 'draft' }, 'Update blog'),
      req('Delete Blog', 'DELETE', '/api/admin/cms/blogs/{{blogId}}', null, 'Delete blog'),
    ]},
    { name: 'CMS - Static Pages', item: [
      req('List Pages', 'GET', '/api/admin/cms/static-pages', null, 'List static pages (about, terms, privacy, etc.)'),
      req('Create Page', 'POST', '/api/admin/cms/static-pages', { title: 'About Us', slug: 'about', content: '<h1>About Mployedin</h1><p>We connect talent...</p>', metaTitle: 'About Us | Mployedin', metaDescription: 'Learn about Mployedin' }, 'Create static page'),
      req('Get Page', 'GET', '/api/admin/cms/static-pages/{{pageId}}', null, 'Get page by ID'),
      req('Update Page', 'PATCH', '/api/admin/cms/static-pages/{{pageId}}', { content: '<p>Updated content</p>' }, 'Update page'),
      req('Delete Page', 'DELETE', '/api/admin/cms/static-pages/{{pageId}}', null, 'Delete page'),
    ]},
    { name: 'CMS - FAQs', item: [
      req('List FAQs', 'GET', '/api/admin/cms/faqs', null, 'List all FAQs'),
      req('Create FAQ', 'POST', '/api/admin/cms/faqs', { question: 'How do I apply for a job?', answer: 'Click the Apply button on any job listing and follow the steps.', category: 'general', order: 1 }, 'Create FAQ entry'),
      req('Get FAQ', 'GET', '/api/admin/cms/faqs/{{faqId}}', null, 'Get FAQ'),
      req('Update FAQ', 'PATCH', '/api/admin/cms/faqs/{{faqId}}', { answer: 'Updated answer text' }, 'Update FAQ'),
      req('Delete FAQ', 'DELETE', '/api/admin/cms/faqs/{{faqId}}', null, 'Delete FAQ'),
    ]},
    { name: 'CMS - Testimonials', item: [
      req('List Testimonials', 'GET', '/api/admin/cms/testimonials', null, 'List testimonials'),
      req('Create Testimonial', 'POST', '/api/admin/cms/testimonials', { name: 'Ahmed Ali', role: 'Senior Developer', company: 'Tech Corp', content: 'Mployedin helped me find my dream job!', rating: 5, imageUrl: '/testimonials/ahmed.jpg' }, 'Create testimonial'),
      req('Update Testimonial', 'PATCH', '/api/admin/cms/testimonials/{{testimonialId}}', { rating: 4 }, 'Update testimonial'),
      req('Delete Testimonial', 'DELETE', '/api/admin/cms/testimonials/{{testimonialId}}', null, 'Delete testimonial'),
    ]},
    { name: 'CMS - Banners', item: [
      req('List Banners', 'GET', '/api/admin/cms/banners', null, 'List banners'),
      req('Create Banner', 'POST', '/api/admin/cms/banners', { title: 'Hiring Event 2026', imageUrl: '/banners/event.jpg', link: '/events/hiring-2026', isActive: true, order: 1 }, 'Create banner'),
      req('Update Banner', 'PATCH', '/api/admin/cms/banners/{{bannerId}}', { isActive: false }, 'Update banner'),
      req('Delete Banner', 'DELETE', '/api/admin/cms/banners/{{bannerId}}', null, 'Delete banner'),
    ]},
    { name: 'CMS - Videos', item: [
      req('List Videos', 'GET', '/api/admin/cms/videos', null, 'List tutorial/promo videos'),
      req('Create Video', 'POST', '/api/admin/cms/videos', { title: 'How to Create Your Profile', url: 'https://youtube.com/watch?v=xxx', thumbnail: '/thumbs/profile.jpg', category: 'tutorial', duration: 300 }, 'Add video'),
      req('Update Video', 'PATCH', '/api/admin/cms/videos/{{videoId}}', { title: 'Updated Title' }, 'Update video'),
      req('Delete Video', 'DELETE', '/api/admin/cms/videos/{{videoId}}', null, 'Delete video'),
    ]},
    { name: 'CMS - Contact Submissions', item: [
      req('List Submissions', 'GET', '/api/admin/cms/contact-submissions?page=1&limit=20', null, 'List contact form submissions'),
      req('Get Submission', 'GET', '/api/admin/cms/contact-submissions/{{submissionId}}', null, 'Get submission details'),
      req('Update Submission', 'PATCH', '/api/admin/cms/contact-submissions/{{submissionId}}', { status: 'resolved', notes: 'Responded via email' }, 'Update submission status'),
      req('Delete Submission', 'DELETE', '/api/admin/cms/contact-submissions/{{submissionId}}', null, 'Delete submission'),
    ]},
    { name: 'Location Data', item: [
      req('List Countries', 'GET', '/api/admin/location-data/countries', null, 'List all countries'),
      req('Create Country', 'POST', '/api/admin/location-data/countries', { name: 'United Arab Emirates', code: 'AE', phoneCode: '+971', isActive: true }, 'Add country'),
      req('Update Country', 'PATCH', '/api/admin/location-data/countries/{{countryId}}', { name: 'UAE', isActive: true }, 'Update country'),
      req('Delete Country', 'DELETE', '/api/admin/location-data/countries/{{countryId}}', null, 'Delete country'),
      req('List States', 'GET', '/api/admin/location-data/states', null, 'List states/provinces'),
      req('Create State', 'POST', '/api/admin/location-data/states', { name: 'Dubai', countryId: '{{countryId}}', isActive: true }, 'Add state'),
      req('Update State', 'PATCH', '/api/admin/location-data/states/{{stateId}}', { name: 'Dubai Emirate' }, 'Update state'),
      req('Delete State', 'DELETE', '/api/admin/location-data/states/{{stateId}}', null, 'Delete state'),
      req('List Cities', 'GET', '/api/admin/location-data/cities', null, 'List cities'),
      req('Create City', 'POST', '/api/admin/location-data/cities', { name: 'Downtown Dubai', stateId: '{{stateId}}', isActive: true }, 'Add city'),
      req('Update City', 'PATCH', '/api/admin/location-data/cities/{{cityId}}', { name: 'Dubai Downtown' }, 'Update city'),
      req('Delete City', 'DELETE', '/api/admin/location-data/cities/{{cityId}}', null, 'Delete city'),
    ]},
    { name: 'Job Attributes', item: [
      req('List Skills', 'GET', '/api/admin/job-attributes/skills', null, 'List job attributes by category. Categories: skills, industries, job_types, experience_levels, education_levels'),
      req('Create Skill', 'POST', '/api/admin/job-attributes/skills', { name: 'React.js', slug: 'react-js', isActive: true }, 'Create job attribute'),
      req('Update Skill', 'PATCH', '/api/admin/job-attributes/skills/{{attributeId}}', { name: 'React.js (Updated)', isActive: true }, 'Update job attribute'),
      req('Delete Skill', 'DELETE', '/api/admin/job-attributes/skills/{{attributeId}}', null, 'Delete job attribute'),
      req('List Industries', 'GET', '/api/admin/job-attributes/industries', null, 'List industry attributes'),
      req('List Job Types', 'GET', '/api/admin/job-attributes/job_types', null, 'List job type attributes'),
    ]},
    { name: 'Templates', item: [
      req('List Matching Weight Templates', 'GET', '/api/admin/matching-weight-templates', null, 'List system matching weight templates'),
      req('Create Matching Weight Template', 'POST', '/api/admin/matching-weight-templates', { name: 'Default Tech', weights: { skills: 40, experience: 30, education: 15, location: 15 }, isDefault: false }, 'Create matching weight template'),
      req('Get Matching Weight Template', 'GET', '/api/admin/matching-weight-templates/{{templateId}}', null, 'Get template'),
      req('Update Matching Weight Template', 'PATCH', '/api/admin/matching-weight-templates/{{templateId}}', { name: 'Updated Template' }, 'Update template'),
      req('Delete Matching Weight Template', 'DELETE', '/api/admin/matching-weight-templates/{{templateId}}', null, 'Delete template'),
      req('List Workflow Templates', 'GET', '/api/admin/workflow-templates', null, 'List system workflow templates'),
      req('Create Workflow Template', 'POST', '/api/admin/workflow-templates', { name: 'Standard Hiring', stages: ['applied', 'screening', 'interview', 'assessment', 'offer', 'hired'], isDefault: false }, 'Create workflow template'),
      req('Get Workflow Template', 'GET', '/api/admin/workflow-templates/{{templateId}}', null, 'Get workflow template'),
      req('Update Workflow Template', 'PATCH', '/api/admin/workflow-templates/{{templateId}}', { name: 'Updated Workflow' }, 'Update workflow template'),
      req('Delete Workflow Template', 'DELETE', '/api/admin/workflow-templates/{{templateId}}', null, 'Delete workflow template'),
      req('List Poster Templates', 'GET', '/api/admin/poster-templates', null, 'List poster design templates'),
      req('Create Poster Template', 'POST', '/api/admin/poster-templates', { name: 'Modern Blue', layout: { background: '#1e3a5f', textColor: '#ffffff' }, isActive: true }, 'Create poster template'),
      req('List Comm Templates', 'GET', '/api/admin/comm-templates', null, 'List system communication templates'),
      req('Create Comm Template', 'POST', '/api/admin/comm-templates', { name: 'Welcome Email', subject: 'Welcome to Mployedin!', body: '<h1>Welcome {{name}}</h1><p>Your account is ready.</p>', type: 'email', trigger: 'user_registered' }, 'Create communication template'),
    ]},
    { name: 'Other', item: [
      req('GDPR Admin', 'GET', '/api/admin/gdpr', null, 'GDPR compliance admin panel'),
      req('All Interviews', 'GET', '/api/admin/interviews', null, 'List all interviews platform-wide'),
      req('Communications Overview', 'GET', '/api/admin/communications', null, 'Communications overview and stats'),
      req('Test Email (Alt)', 'POST', '/api/admin/test-email', { to: 'test@example.com', template: 'welcome' }, 'Send test email with specific template'),
    ]},
  ]
};

// ============ AI ============
const ai = {
  name: 'AI',
  description: 'AI-powered features. Most require authentication + feature gate (subscription tier).',
  item: [
    req('Chat', 'POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'Find me React developer jobs in Dubai with salary above 15000 AED' }], context: 'job_search' }, 'AI chat assistant. Supports job search, career advice, profile optimization.'),
    req('Chat History', 'GET', '/api/ai/chat-history', null, 'Get previous AI chat sessions'),
    req('CV Extract', 'POST', '/api/ai/cv-extract', null, 'Extract profile data from uploaded CV. Use FormData with file field (PDF/DOCX, max 10MB). Role: job_seeker'),
    req('Match Score', 'POST', '/api/ai/match', { jobId: '{{jobId}}', jobSeekerId: '{{jobSeekerId}}' }, 'Calculate AI matching score between candidate and job'),
    req('Enhance Text', 'POST', '/api/ai/enhance-text', { text: 'I am good at programming and worked on many projects', context: 'profile_summary' }, 'AI text enhancement for profiles/descriptions'),
    req('Generate Summary', 'POST', '/api/ai/generate-summary', {}, 'Auto-generate profile summary from experience data'),
    req('Job Description', 'POST', '/api/ai/job-description', { title: 'Senior React Developer', category: 'Engineering', location: 'Dubai, UAE', skills: ['React', 'TypeScript', 'Node.js', 'AWS'] }, 'Generate complete job description with AI'),
    req('Screen Candidates', 'POST', '/api/ai/screen-candidates', { jobId: '{{jobId}}', candidateIds: ['id1', 'id2', 'id3'] }, 'AI screen and rank multiple candidates for a job'),
    req('Interview Questions', 'POST', '/api/ai/interview-questions', { jobTitle: 'React Developer', skills: ['React', 'TypeScript', 'System Design'], level: 'senior', count: 10 }, 'Generate interview questions based on role'),
    req('Interview Prep Brief', 'POST', '/api/ai/interview-prep-brief', { interviewId: '{{interviewId}}' }, 'Generate interview preparation brief for candidate'),
    req('Salary Benchmark', 'POST', '/api/ai/salary-benchmark', { jobTitle: 'Senior React Developer', location: 'Dubai', experience: 5, skills: ['React', 'TypeScript'] }, 'AI salary benchmarking based on market data'),
    req('Skills Suggest', 'POST', '/api/ai/skills-suggest', { jobTitle: 'Full Stack Developer', currentSkills: ['JavaScript', 'React'], targetRole: 'Tech Lead' }, 'Suggest skills to learn for career growth'),
    req('Skills Gap', 'POST', '/api/ai/skills-gap', { jobId: '{{jobId}}' }, 'Analyze skill gaps between candidate profile and job requirements'),
    req('Email Draft', 'POST', '/api/ai/email-draft', { context: 'offer_letter', candidateName: 'John Doe', jobTitle: 'Senior Developer', salary: '20000 AED', startDate: '2026-06-01' }, 'Generate professional email draft'),
    req('Profile Fill', 'POST', '/api/ai/profile-fill', { partialProfile: { name: 'John', currentTitle: 'Developer' } }, 'AI suggestions to complete profile fields'),
    req('Daily Insights', 'GET', '/api/ai/daily-insights', null, 'Get AI-generated daily insights for dashboard'),
    req('Generate Report', 'POST', '/api/ai/report', { type: 'hiring_funnel', dateRange: 'last_30_days', filters: {} }, 'Generate AI analytical report'),
    req('Lead Score', 'POST', '/api/ai/lead-score', { leadId: '{{leadId}}' }, 'AI-powered lead scoring'),
    req('Poster Content', 'POST', '/api/ai/poster-content', { jobTitle: 'React Developer', company: 'Acme Corp', highlights: ['Remote', 'Competitive Salary'] }, 'Generate job poster marketing copy'),
    req('Poster Layout', 'POST', '/api/ai/poster-layout', { content: 'We are hiring! Senior React Developer...', style: 'modern', colors: ['#1e3a5f', '#ffffff'] }, 'Generate poster layout design'),
    req('Speech to Text', 'POST', '/api/ai/speech-to-text', null, 'Convert audio to text. Use FormData with audio file.'),
    req('Job Search Filters (NL)', 'POST', '/api/ai/job-search-filters', { query: 'remote react jobs in UAE paying more than 15k' }, 'Parse natural language query into structured job search filters'),
    req('Candidate Search Filters (NL)', 'POST', '/api/ai/candidate-search-filters', { query: 'senior developers with 5+ years in React who are available immediately' }, 'Parse natural language to candidate search filters'),
    req('Lead Search Filters (NL)', 'POST', '/api/ai/lead-search-filters', { query: 'technology companies in Dubai with 100+ employees' }, 'Parse natural language to lead search filters'),
    req('Application Search Filters (NL)', 'POST', '/api/ai/application-search-filters', { query: 'applications rejected last week for engineering roles' }, 'Parse natural language to application filters'),
    req('Referral Search Filters (NL)', 'POST', '/api/ai/referral-search-filters', { query: 'active referral links created this month' }, 'Parse natural language to referral filters'),
  ]
};

// ============ AGENT ============
const agent = {
  name: 'Agent',
  description: 'Recruitment agent endpoints. Requires role: agent',
  item: [
    req('Dashboard', 'GET', '/api/agent/dashboard', null, 'Agent dashboard with KPIs, tasks, and pipeline summary'),
    req('Get Profile', 'GET', '/api/agent/profile', null, 'Get agent profile details'),
    req('Update Profile', 'PATCH', '/api/agent/profile', { name: 'Agent Smith', phone: '+971501234567', bio: 'Experienced IT recruiter' }, 'Update agent profile'),
    req('Get Settings', 'GET', '/api/agent/settings', null, 'Get agent settings'),
    req('Update Settings', 'PATCH', '/api/agent/settings', { country: 'AE', currency: 'AED', timezone: 'Asia/Dubai', workingHours: { start: '09:00', end: '18:00' } }, 'Update agent settings'),
    req('Analytics', 'GET', '/api/agent/analytics', null, 'Agent performance analytics'),
    formReq('Upload Avatar', 'POST', '/api/agent/avatar', [{ key: 'avatar', type: 'file', src: '', description: 'Image file (JPG/PNG, max 5MB)' }], 'Upload agent profile picture'),
    req('List Tasks', 'GET', '/api/agent/tasks?status=pending&search=follow', null, 'List agent tasks with filters'),
    req('Create Task', 'POST', '/api/agent/tasks', { title: 'Follow up with lead - Acme Corp', description: 'Call back on Monday to discuss requirements', priority: 'high', dueDate: '2026-05-15T09:00:00Z', category: 'follow_up' }, 'Create a new task'),
    req('Update Task', 'PATCH', '/api/agent/tasks/{{taskId}}', { status: 'completed', notes: 'Called and scheduled meeting' }, 'Update task status/details'),
    req('Delete Task', 'DELETE', '/api/agent/tasks/{{taskId}}', null, 'Delete a task'),
  ]
};

// ============ SUPER AGENT ============
const superAgent = {
  name: 'Super Agent',
  description: 'Super agent (team lead) endpoints. Requires role: super_agent. Territory-scoped.',
  item: [
    req('Dashboard', 'GET', '/api/super-agent/dashboard', null, 'Super agent dashboard with team performance'),
    req('List Agents', 'GET', '/api/super-agent/agents?search=&performance=high&sortBy=placements', null, 'List agents under this super agent'),
    req('Create Agent', 'POST', '/api/super-agent/agents', { fullName: 'New Agent', email: 'newagent@mployedin.com', phone: '+971509876543', country: 'AE', city: 'Abu Dhabi' }, 'Create/invite agent under this super agent'),
    req('Get Agent', 'GET', '/api/super-agent/agents/{{agentId}}', null, 'Get agent details and performance'),
    req('Update Agent', 'PATCH', '/api/super-agent/agents/{{agentId}}', { isActive: true, territory: 'Dubai' }, 'Update agent under management'),
    req('Delete Agent', 'DELETE', '/api/super-agent/agents/{{agentId}}', null, 'Remove agent from team'),
    req('List Leads', 'GET', '/api/super-agent/leads?page=1&limit=20&status=new&agentId=&search=&country=AE&industry=tech&source=referral', null, 'List all leads across managed agents'),
    req('List Jobs', 'GET', '/api/super-agent/jobs?status=active&page=1&limit=20&search=react&dateFrom=2026-01-01', null, 'List jobs in territory'),
    req('List Job Seekers', 'GET', '/api/super-agent/job-seekers', null, 'List job seekers in territory'),
    req('List Applications', 'GET', '/api/super-agent/applications', null, 'List all applications in territory'),
    req('List Interviews', 'GET', '/api/super-agent/interviews', null, 'List all scheduled interviews'),
    req('List Approvals', 'GET', '/api/super-agent/approvals', null, 'Pending items requiring approval'),
    req('Approval Count', 'GET', '/api/super-agent/approvals/count', null, 'Quick count of pending approvals'),
    req('Process Approval', 'PATCH', '/api/super-agent/approvals/{{approvalId}}', { action: 'approve', notes: 'Verified and approved' }, 'Approve or reject a pending item'),
    req('Get Profile', 'GET', '/api/super-agent/profile', null, 'Get super agent profile'),
    req('Update Profile', 'PATCH', '/api/super-agent/profile', { name: 'Super Agent', phone: '+971501234567', bio: 'Team lead for Dubai region' }, 'Update super agent profile'),
    req('Get Settings', 'GET', '/api/super-agent/settings', null, 'Get settings'),
    req('Update Settings', 'PATCH', '/api/super-agent/settings', { timezone: 'Asia/Dubai', currency: 'AED', language: 'en' }, 'Update settings'),
    req('Reports', 'GET', '/api/super-agent/reports', null, 'Performance and revenue reports'),
    req('Territory Info', 'GET', '/api/super-agent/territory', null, 'Get assigned territory details'),
    req('AI Insights', 'GET', '/api/super-agent/insights', null, 'AI-powered team performance insights'),
    req('Insights Feedback', 'GET', '/api/super-agent/insights/feedback', null, 'Feedback on AI insights accuracy'),
    formReq('Upload Avatar', 'POST', '/api/super-agent/avatar', [{ key: 'avatar', type: 'file', src: '' }], 'Upload profile picture'),
    req('Assign Leads', 'POST', '/api/super-agent/actions/assign-leads', { fromAgentUserId: '{{agentId}}', toAgentUserId: '{{agentId}}', maxLeads: 10 }, 'Reassign leads from one agent to another'),
    req('Send Reminder', 'POST', '/api/super-agent/actions/send-reminder', { agentUserIds: ['{{agentId}}'], message: 'Please update your pipeline status by EOD' }, 'Send reminder notification to agents'),
  ]
};

// ============ APPLICATIONS ============
const applications = {
  name: 'Applications',
  description: 'Job application management. Role-scoped access.',
  item: [
    req('List Applications', 'GET', '/api/applications?page=1&limit=20&status=pending&jobId=&search=&dateFrom=&dateTo=&skills=React&scoreMin=70&sortBy=createdAt&sortOrder=desc', null, 'List applications with comprehensive filters'),
    req('Create Application', 'POST', '/api/applications', { jobId: '{{jobId}}', coverLetter: 'I am excited to apply for this position. My 5 years of experience in React development...' }, 'Submit a job application'),
    req('Get Application', 'GET', '/api/applications/{{applicationId}}', null, 'Get full application details'),
    req('Update Status', 'PATCH', '/api/applications/{{applicationId}}', { status: 'shortlisted', note: 'Strong technical background', employerNotes: 'Schedule for interview next week' }, 'Update application status. Statuses: pending, reviewing, shortlisted, interview, offered, hired, rejected, withdrawn'),
    req('Get Timeline', 'GET', '/api/applications/{{applicationId}}/timeline', null, 'Get complete application status change timeline'),
    req('Add Note', 'POST', '/api/applications/{{applicationId}}/notes', { content: 'Had a great initial phone screening. Very articulate and enthusiastic.', mentions: [] }, 'Add internal note to application (visible to employer/agent)'),
    req('Submit Feedback', 'POST', '/api/applications/{{applicationId}}/feedback', { rating: 4, comment: 'The process was smooth and professional. Would recommend.' }, 'Job seeker NPS feedback on application process'),
    req('Compare Applications', 'GET', '/api/applications/compare?ids=id1,id2,id3', null, 'Side-by-side comparison of up to 3 applications'),
    req('Bulk Action', 'POST', '/api/applications/bulk', { applicationIds: ['id1', 'id2', 'id3'], action: 'reject', params: { rejectionReason: 'Position has been filled. Thank you for your interest.' } }, 'Bulk action on applications. Actions: reject, move_stage, send_message'),
    req('AI Insights', 'GET', '/api/applications/ai-insights', null, 'AI-powered application pipeline insights'),
  ]
};

// ============ EMPLOYERS ============
const employers = {
  name: 'Employers',
  description: 'Employer management endpoints',
  item: [
    { name: 'Profile & Setup', item: [
      req('List Employers', 'GET', '/api/employers?search=tech&page=1&limit=20', null, 'List employers (agent/admin view)'),
      req('Create Employer', 'POST', '/api/employers', { companyName: 'New Tech Corp', industry: 'Technology', country: 'AE', city: 'Dubai', size: '50-200', contactEmail: 'hr@newtech.com' }, 'Admin/agent create employer account'),
      req('Get Employer', 'GET', '/api/employers/{{employerId}}', null, 'Get employer details'),
      req('Update Employer', 'PATCH', '/api/employers/{{employerId}}', { description: 'Leading technology solutions provider', website: 'https://newtech.com' }, 'Update employer'),
      req('Delete Employer', 'DELETE', '/api/employers/{{employerId}}', null, 'Delete employer (admin)'),
      req('Verify Employer', 'PATCH', '/api/employers/{{employerId}}/verify', { verified: true, notes: 'Documents verified' }, 'Verify employer identity (admin)'),
      req('Track Profile View', 'POST', '/api/employers/{{employerId}}/profile-view', {}, 'Track when someone views employer profile'),
      req('Get My Company', 'GET', '/api/employers/me', null, 'Get own employer profile (logged-in employer)'),
      req('Update My Company', 'PATCH', '/api/employers/me', { companyName: 'Acme Corp', description: 'Leading technology company in the MENA region', industry: 'Technology', size: '200-500', website: 'https://acmecorp.com', socialLinks: { linkedin: 'https://linkedin.com/company/acme' } }, 'Update own company profile'),
      req('Setup Status', 'GET', '/api/employers/setup-status', null, 'Get onboarding completion status'),
      formReq('Upload Logo', 'POST', '/api/employers/logo', [{ key: 'logo', type: 'file', src: '', description: 'Company logo (JPG/PNG, max 5MB)' }], 'Upload company logo'),
    ]},
    { name: 'SMTP Configuration', item: [
      req('Get SMTP Config', 'GET', '/api/employers/me/smtp', null, 'Get custom SMTP settings for branded emails'),
      req('Update SMTP', 'PATCH', '/api/employers/me/smtp', { host: 'smtp.company.com', port: 587, username: 'notifications@company.com', password: 'smtp-password', fromEmail: 'hr@company.com', fromName: 'Company HR' }, 'Configure custom SMTP for branded email delivery'),
      req('Test SMTP', 'POST', '/api/employers/me/smtp/test', { to: 'test@company.com' }, 'Send test email via configured SMTP'),
    ]},
    { name: 'Team Management', item: [
      req('List Team', 'GET', '/api/employers/team', null, 'List team members and pending invites'),
      req('Invite Member', 'POST', '/api/employers/team', { email: 'recruiter@company.com', role: 'recruiter', permissions: ['view_applications', 'schedule_interviews', 'manage_jobs'] }, 'Invite team member (requires subscription)'),
      req('Update Member', 'PATCH', '/api/employers/team/{{memberId}}', { role: 'admin', permissions: ['all'] }, 'Update team member role/permissions'),
      req('Remove Member', 'DELETE', '/api/employers/team/{{memberId}}', null, 'Remove team member'),
      req('Accept Invite', 'POST', '/api/employers/team/accept', { token: 'invitation-token-from-email' }, 'Accept team invitation'),
      req('Activity Logs', 'GET', '/api/employers/team/activity-logs', null, 'View team member activity logs'),
    ]},
    { name: 'Analytics', item: [
      req('Quick Stats', 'GET', '/api/employers/stats', null, 'Quick stats (active jobs, applications, interviews)'),
      req('Full Analytics', 'GET', '/api/employers/analytics', null, 'Full analytics dashboard (requires feature gate)'),
      req('Historical Data', 'GET', '/api/employers/analytics/historical', null, 'Historical hiring data and trends'),
      req('Feedback Trends', 'GET', '/api/employers/analytics/feedback-trends', null, 'Candidate feedback trends over time'),
      req('Response Time', 'GET', '/api/employers/analytics/response-time', null, 'Average response time metrics'),
      req('Pipeline Analytics', 'GET', '/api/employers/analytics/pipeline', null, 'Hiring pipeline conversion rates'),
      req('Jobs Analytics', 'GET', '/api/employers/analytics/jobs', null, 'Per-job performance analytics'),
    ]},
    { name: 'Matching & Workflow', item: [
      req('Get Matching Weights', 'GET', '/api/employers/matching-weights', null, 'Get current AI matching weights configuration'),
      req('Update Matching Weights', 'PATCH', '/api/employers/matching-weights', { skills: 40, experience: 30, education: 15, location: 15 }, 'Update matching weights (must total 100)'),
      req('List Weight Templates', 'GET', '/api/employers/matching-weight-templates', null, 'List saved matching weight templates'),
      req('Create Weight Template', 'POST', '/api/employers/matching-weight-templates', { name: 'Tech Focused', weights: { skills: 50, experience: 25, education: 15, location: 10 } }, 'Save matching weight configuration as template'),
      req('Get Workflow', 'GET', '/api/employers/workflow', null, 'Get current hiring workflow stages'),
      req('Update Workflow', 'PATCH', '/api/employers/workflow', { stages: ['screening', 'phone_interview', 'technical_test', 'final_interview', 'offer'], settings: { autoReject: false } }, 'Update hiring workflow'),
      req('List Workflow Templates', 'GET', '/api/employers/workflow-templates', null, 'List saved workflow templates'),
      req('Create Workflow Template', 'POST', '/api/employers/workflow-templates', { name: 'Engineering Hiring', stages: ['screening', 'coding_challenge', 'system_design', 'culture_fit', 'offer'] }, 'Save workflow as template'),
    ]},
    { name: 'Job Templates', item: [
      req('List Templates', 'GET', '/api/employers/job-templates', null, 'List saved job posting templates'),
      req('Create Template', 'POST', '/api/employers/job-templates', { title: 'Senior React Developer', description: 'We are looking for an experienced React developer...', requirements: ['5+ years React', 'TypeScript expertise', 'Next.js experience'], salary: { min: 15000, max: 25000, currency: 'AED' }, skills: ['React', 'TypeScript', 'Next.js'] }, 'Save job posting as template'),
      req('Get Template', 'GET', '/api/employers/job-templates/{{templateId}}', null, 'Get template details'),
      req('Update Template', 'PATCH', '/api/employers/job-templates/{{templateId}}', { title: 'Lead React Developer', salary: { min: 20000, max: 35000, currency: 'AED' } }, 'Update template'),
      req('Delete Template', 'DELETE', '/api/employers/job-templates/{{templateId}}', null, 'Delete template'),
      req('Use Template', 'POST', '/api/employers/job-templates/{{templateId}}/use', {}, 'Create a new job posting from this template'),
    ]},
    { name: 'Candidates', item: [
      req('Get Candidate Profile', 'GET', '/api/employers/candidates/{{jobSeekerId}}', null, 'View unified candidate profile (skills, experience, match score)'),
      req('List Assigned Agents', 'GET', '/api/employers/agents', null, 'List recruitment agents assigned to this employer'),
    ]},
    { name: 'Documents & Posters', item: [
      req('List Documents', 'GET', '/api/employers/documents', null, 'List uploaded company documents'),
      req('Upload Document', 'POST', '/api/employers/documents', { name: 'Employment Contract Template', type: 'contract', description: 'Standard employment contract' }, 'Upload company document'),
      req('List Posters', 'GET', '/api/employers/posters', null, 'List generated job posters'),
      req('Create Poster', 'POST', '/api/employers/posters', { jobId: '{{jobId}}', templateId: '{{templateId}}', customizations: {} }, 'Generate a job poster from template'),
    ]},
    { name: 'Training', item: [
      req('List Training', 'GET', '/api/employers/training', null, 'List training modules for team'),
      req('Create Training', 'POST', '/api/employers/training', { title: 'Effective Interviewing', content: 'Best practices for conducting interviews...', type: 'guide', isRequired: true }, 'Create training module'),
      req('Get Training', 'GET', '/api/employers/training/{{trainingId}}', null, 'Get training details'),
      req('Update Training', 'PATCH', '/api/employers/training/{{trainingId}}', { title: 'Updated Training', isRequired: false }, 'Update training'),
      req('Delete Training', 'DELETE', '/api/employers/training/{{trainingId}}', null, 'Delete training'),
    ]},
    { name: 'Communication Templates', item: [
      req('List Templates', 'GET', '/api/employers/comm-templates', null, 'List employer communication templates'),
      req('Create Template', 'POST', '/api/employers/comm-templates', { name: 'Interview Invitation', subject: 'Interview Invitation - {{jobTitle}}', body: '<p>Dear {{candidateName}},</p><p>We would like to invite you for an interview...</p>', type: 'email' }, 'Create communication template'),
      req('Get Template', 'GET', '/api/employers/comm-templates/{{templateId}}', null, 'Get template'),
      req('Update Template', 'PATCH', '/api/employers/comm-templates/{{templateId}}', { subject: 'Updated Subject' }, 'Update template'),
      req('Delete Template', 'DELETE', '/api/employers/comm-templates/{{templateId}}', null, 'Delete template'),
    ]},
    { name: 'Domain Verification', item: [
      req('Request Verification', 'POST', '/api/employers/verify-domain', { domain: 'company.com' }, 'Request domain verification (adds DNS TXT record requirement)'),
      req('Confirm Verification', 'POST', '/api/employers/verify-domain/confirm', { token: 'dns-verification-token' }, 'Confirm domain verification after DNS setup'),
    ]},
    { name: 'Payment Config', item: [
      req('Get Payment Config', 'GET', '/api/employer/payment-config', null, 'Get payment/billing configuration'),
      req('Update Payment Config', 'PATCH', '/api/employer/payment-config', { billingEmail: 'billing@company.com', vatNumber: 'AE123456789' }, 'Update payment configuration'),
    ]},
  ]
};

// ============ JOBS ============
const jobs = {
  name: 'Jobs',
  description: 'Job posting and management endpoints',
  item: [
    req('List/Search Jobs', 'GET', '/api/jobs?page=1&limit=20&search=react developer&status=active&category=engineering&location=dubai&workMode=remote&skills=React,TypeScript&myJobs=false', null, 'Search and list jobs with filters. Role-scoped visibility.'),
    req('Create Job', 'POST', '/api/jobs', { title: 'Senior React Developer', description: 'We are seeking an experienced React developer to join our growing team...', requirements: ['5+ years professional React experience', 'Strong TypeScript skills', 'Experience with Next.js', 'REST API and GraphQL knowledge'], responsibilities: ['Lead frontend development', 'Mentor junior developers', 'Code review'], salary: { min: 15000, max: 25000, currency: 'AED' }, location: { country: 'AE', city: 'Dubai' }, workMode: 'hybrid', category: 'engineering', skills: ['React', 'TypeScript', 'Next.js', 'Node.js'], experienceMin: 5, experienceMax: 10, educationLevel: 'bachelors', jobType: 'full_time', benefits: ['health_insurance', 'annual_leave', 'training_budget'], applicationDeadline: '2026-06-30' }, 'Create new job posting. Requires: employer/agent/admin + subscription.'),
    req('Get Job', 'GET', '/api/jobs/{{jobId}}', null, 'Get complete job details. Job seekers only see active jobs.'),
    req('Update Job', 'PATCH', '/api/jobs/{{jobId}}', { title: 'Lead React Developer', salary: { min: 20000, max: 30000, currency: 'AED' }, status: 'active' }, 'Update job posting. Owner/agent/admin only.'),
    req('Apply to Job', 'POST', '/api/jobs/{{jobId}}/apply', { coverLetter: 'I am excited to apply for this role. With 7 years of React experience...' }, 'Submit job application (job_seeker only)'),
    req('Toggle Save Job', 'POST', '/api/jobs/{{jobId}}/save', {}, 'Save or unsave job (job_seeker only)'),
    req('Similar Jobs', 'GET', '/api/jobs/{{jobId}}/similar', null, 'Get similar job listings (public, rate-limited)'),
    req('Clone Job', 'POST', '/api/jobs/{{jobId}}/clone', {}, 'Clone/duplicate a job posting'),
    req('Job Analytics', 'GET', '/api/jobs/{{jobId}}/analytics', null, 'Job performance analytics (views, applications, conversion)'),
    req('Get Job Workflow', 'GET', '/api/jobs/{{jobId}}/workflow', null, 'Get job-specific hiring workflow stages'),
    req('Update Job Workflow', 'PATCH', '/api/jobs/{{jobId}}/workflow', { stages: ['screening', 'technical_test', 'interview', 'offer'] }, 'Set custom workflow for this job'),
    req('Get Matching Weights', 'GET', '/api/jobs/{{jobId}}/matching-weights', null, 'Get job-specific matching weight configuration'),
    req('Update Matching Weights', 'PATCH', '/api/jobs/{{jobId}}/matching-weights', { skills: 50, experience: 25, education: 15, location: 10 }, 'Set custom matching weights for this job'),
    req('Track View', 'POST', '/api/jobs/{{jobId}}/track-view', {}, 'Track job page view (public, cookie-deduplicated)'),
    req('Suggestions', 'GET', '/api/jobs/suggestions?q=react&category=engineering', null, 'Autocomplete job title suggestions'),
    req('Recommended Jobs', 'GET', '/api/jobs/recommended?limit=10&sort=score&min_score=60', null, 'AI-recommended jobs for current job seeker'),
    req('Match Preview', 'GET', '/api/jobs/match-preview?skills=React,TypeScript&country=AE&experienceMin=3&experienceMax=8', null, 'Preview how many candidates match given criteria'),
  ]
};

// ============ JOB SEEKERS ============
const jobSeekers = {
  name: 'Job Seekers',
  description: 'Job seeker profile and management',
  item: [
    { name: 'Admin/Agent View', item: [
      req('List Job Seekers', 'GET', '/api/job-seekers?page=1&limit=20&search=react&availability=available&skills=React,TypeScript&location=Dubai&hasCV=true&sort=profileCompletion', null, 'List/search job seekers (agent/admin scope)'),
      req('Get Job Seeker', 'GET', '/api/job-seekers/{{jobSeekerId}}', null, 'Get job seeker full profile'),
      req('Update Job Seeker', 'PATCH', '/api/job-seekers/{{jobSeekerId}}', { agentNotes: 'Strong candidate for tech roles' }, 'Update job seeker (admin/agent)'),
      req('Update Availability', 'PATCH', '/api/job-seekers/{{jobSeekerId}}/availability', { availability: 'available', availableFrom: '2026-06-01', preferredWorkMode: 'remote' }, 'Update job seeker availability'),
    ]},
    { name: 'Self-Service Profile', item: [
      req('Get Profile', 'GET', '/api/job-seeker/profile', null, 'Get own profile'),
      req('Update Profile', 'PATCH', '/api/job-seeker/profile', { headline: 'Senior Full Stack Developer | React & Node.js', summary: 'Passionate developer with 7 years of experience building scalable web applications...', skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS'], experience: [{ title: 'Senior Developer', company: 'Tech Corp', from: '2022-01', to: null, current: true, description: 'Leading frontend development team' }], education: [{ degree: 'BSc Computer Science', institution: 'University of Technology', year: 2018, grade: '3.8 GPA' }], languages: [{ language: 'English', level: 'fluent' }, { language: 'Arabic', level: 'native' }], preferredJobTypes: ['full_time', 'contract'], preferredLocations: ['Dubai', 'Abu Dhabi'], expectedSalary: { min: 18000, max: 25000, currency: 'AED' } }, 'Update full profile with all sections'),
      formReq('Upload CV', 'POST', '/api/job-seeker/cv', [{ key: 'cv', type: 'file', src: '', description: 'CV file (PDF/DOCX, max 10MB)' }], 'Upload CV document'),
      req('Dashboard', 'GET', '/api/job-seeker/dashboard', null, 'Job seeker dashboard (applications, saved jobs, recommendations)'),
      req('List Documents', 'GET', '/api/job-seeker/documents', null, 'List uploaded documents (certificates, portfolios)'),
      req('Upload Document', 'POST', '/api/job-seeker/documents', { name: 'AWS Certification', type: 'certificate', description: 'AWS Solutions Architect Professional' }, 'Upload supporting document'),
      req('Recommended Jobs', 'GET', '/api/job-seeker/recommended-jobs', null, 'Get AI-recommended jobs based on profile'),
      req('Skill Gaps', 'GET', '/api/job-seeker/skill-gaps', null, 'AI analysis of skill gaps vs desired roles'),
      req('Skill Confirmations', 'GET', '/api/job-seeker/skill-confirmations', null, 'Get skill endorsements/confirmations'),
      req('Add Skill Confirmation', 'POST', '/api/job-seeker/skill-confirmations', { skill: 'React', level: 'expert', yearsOfExperience: 5 }, 'Self-declare skill proficiency'),
      req('Personal Details Options', 'GET', '/api/job-seeker/personal-details-options', null, 'Get dropdown options for personal details form (nationalities, visa types, etc.)'),
    ]},
    { name: 'Settings & Account', item: [
      req('Get Settings', 'GET', '/api/job-seekers/settings', null, 'Get job seeker settings'),
      req('Update Settings', 'PATCH', '/api/job-seekers/settings', { emailNotifications: true, jobAlerts: true, profileVisibility: 'public' }, 'Update notification and privacy settings'),
      req('Get Account', 'GET', '/api/job-seekers/account', null, 'Get account details'),
      req('Update Account', 'PATCH', '/api/job-seekers/account', { name: 'John Doe Updated', phone: '+971501234567' }, 'Update account info'),
      req('Delete Account', 'DELETE', '/api/job-seekers/account', {}, 'Delete account permanently (GDPR right to erasure)'),
      formReq('Upload Avatar', 'POST', '/api/job-seekers/avatar', [{ key: 'avatar', type: 'file', src: '' }], 'Upload profile picture'),
    ]},
  ]
};

// ============ INTERVIEWS ============
const interviews = {
  name: 'Interviews',
  description: 'Interview scheduling and management',
  item: [
    req('List Interviews', 'GET', '/api/interviews?page=1&limit=20&status=scheduled&type=video&outcome=&search=&dateFrom=2026-05-01&dateTo=2026-05-31&sortBy=scheduledAt&sortOrder=asc', null, 'List interviews with comprehensive filters. Role-scoped.'),
    req('Schedule Interview', 'POST', '/api/interviews', { applicationId: '{{applicationId}}', scheduledAt: '2026-05-15T10:00:00Z', duration: 60, type: 'video', meetLink: 'https://meet.google.com/abc-defg-hij', instructions: 'Please join 5 minutes early. Have your portfolio ready.' }, 'Schedule a new interview. Types: phone, video, in_person'),
    req('Get Interview', 'GET', '/api/interviews/{{interviewId}}', null, 'Get interview details including participants and status'),
    req('Update Interview', 'PATCH', '/api/interviews/{{interviewId}}', { status: 'completed', outcome: 'passed', notes: 'Excellent technical skills. Strong communication. Recommended for offer.', feedback: 'Very impressive candidate' }, 'Update interview status/outcome. Outcomes: passed, failed, pending_decision'),
    req('Respond to Interview', 'POST', '/api/interviews/{{interviewId}}/respond', { response: 'confirmed', rescheduleNote: null }, 'Job seeker respond to interview invite. Responses: confirmed, declined, reschedule_requested'),
    req('Submit Scorecard', 'POST', '/api/interviews/{{interviewId}}/scorecard', { scores: { technicalSkills: 8, communication: 9, cultureFit: 7, problemSolving: 8, motivation: 9 }, overallRating: 8, notes: 'Strong technical foundation. Excellent communicator. Would be a great culture fit.', recommendation: 'strong_hire' }, 'Submit structured interview scorecard (1-10 scale)'),
    req('Get Scorecard', 'GET', '/api/interviews/{{interviewId}}/scorecard', null, 'Get submitted scorecard for an interview'),
    req('Schedule Next Round', 'POST', '/api/interviews/{{interviewId}}/next-round', { scheduledAt: '2026-05-20T14:00:00Z', duration: 45, type: 'in_person', location: 'Acme Corp HQ, Floor 12, Dubai', instructions: 'Ask for John at reception', interviewers: ['CTO', 'VP Engineering'] }, 'Schedule next interview round (only after passed previous round)'),
    req('Bulk Schedule', 'POST', '/api/interviews/bulk', { candidates: ['{{applicationId}}'], scheduledAt: '2026-05-15T09:00:00Z', duration: 30, type: 'video', meetLink: 'https://meet.google.com/xxx', durationPerCandidate: 30, gapMinutes: 15, workingHours: { start: '09:00', end: '17:00' }, breaks: [{ start: '12:00', end: '13:00' }] }, 'Bulk schedule interviews with auto time-slot allocation'),
  ]
};

// ============ SUBSCRIPTIONS ============
const subscriptions = {
  name: 'Subscriptions',
  description: 'Subscription and billing management',
  item: [
    req('My Subscription', 'GET', '/api/subscriptions/my', null, 'Get current active subscription details'),
    req('Feature Gate Check', 'GET', '/api/subscriptions/feature-gate', null, 'Check which features are available on current plan'),
    req('Subscription History', 'GET', '/api/subscriptions/history?userId={{userId}}', null, 'View subscription history (admin can query any user)'),
    req('Get Subscription', 'GET', '/api/subscriptions/{{subscriptionId}}', null, 'Get subscription details by ID'),
    req('Cancel Subscription', 'PATCH', '/api/subscriptions/{{subscriptionId}}', { action: 'cancel', reason: 'No longer needed', feedback: 'Great service but downsizing team' }, 'Cancel a subscription (admin/super_agent)'),
    req('Assign Plan', 'POST', '/api/subscriptions/assign', { planId: '{{planId}}', userId: '{{userId}}', autoRenew: true, notes: 'Premium plan assigned for enterprise client' }, 'Assign subscription plan to a user'),
    req('Bulk Assign', 'POST', '/api/subscriptions/bulk-assign', { userIds: ['user1', 'user2', 'user3'], planId: '{{planId}}', autoRenew: true, notes: 'Batch assignment for onboarding' }, 'Bulk assign plans to multiple users (max 100)'),
    req('Change Plan', 'POST', '/api/subscriptions/change', { userId: '{{userId}}', newPlanId: '{{planId}}' }, 'Change/upgrade user subscription plan'),
    req('Renew Subscription', 'POST', '/api/subscriptions/renew', { subscriptionId: '{{subscriptionId}}' }, 'Manually renew a subscription'),
  ]
};

// ============ MESSAGES & DM ============
const messages = {
  name: 'Messages & DM',
  description: 'Direct messaging and customer care tickets',
  item: [
    { name: 'Direct Messages', item: [
      req('List Conversations', 'GET', '/api/dm', null, 'List all DM conversations (excludes customer care)'),
      req('Start Conversation', 'POST', '/api/dm', { recipientId: '{{userId}}', initialMessage: 'Hello! I saw your profile and would like to discuss a potential opportunity.' }, 'Start new conversation. Permission matrix enforced (e.g., employer→job_seeker allowed).'),
      req('Get Conversation', 'GET', '/api/dm/conversation?id={{conversationId}}', null, 'Get conversation metadata and participants'),
      req('List Messages', 'GET', '/api/dm/{{conversationId}}/messages?limit=50&before=cursor-id', null, 'Get messages with cursor-based pagination'),
      req('Send Message', 'POST', '/api/dm/{{conversationId}}/messages', { content: 'Thank you for your interest! When would be a good time to discuss this further?' }, 'Send message in conversation. Rate limited: 60/min'),
      req('Mark as Read', 'PATCH', '/api/dm/{{conversationId}}/read', {}, 'Mark all messages in conversation as read'),
      req('Clear History', 'PATCH', '/api/dm/{{conversationId}}/manage', { action: 'clear' }, 'Clear conversation history (for current user only)'),
      req('Delete Conversation', 'DELETE', '/api/dm/{{conversationId}}/manage', null, 'Delete conversation (for current user only)'),
    ]},
    { name: 'Customer Care', item: [
      req('List Tickets', 'GET', '/api/dm/customer-care?status=open&category=technical&page=1&limit=20', null, 'List support tickets. Job seekers see own, admin sees all.'),
      req('Create Ticket', 'POST', '/api/dm/customer-care', { subject: 'Cannot upload CV', category: 'technical', message: 'I keep getting an error when trying to upload my CV. The file is a PDF under 5MB.', priority: 'medium' }, 'Create customer care support ticket'),
      req('Manage Ticket', 'PATCH', '/api/dm/customer-care/{{conversationId}}/manage', { status: 'in_progress', assignedTo: '{{userId}}', priority: 'high', notes: 'Investigating file upload issue' }, 'Update ticket status/assignment (admin only)'),
    ]},
    { name: 'Channel Messages', item: [
      req('List Channel Messages', 'GET', '/api/messages?channel=general&limit=50', null, 'List messages from a channel'),
      req('Send Channel Message', 'POST', '/api/messages', { channel: 'announcements', content: 'New feature released: AI-powered candidate matching!', senderName: 'System' }, 'Post message to a channel'),
    ]},
  ]
};

// ============ LEADS ============
const leads = {
  name: 'Leads',
  description: 'Lead management for agents. Role: agent, admin, super_agent',
  item: [
    req('List Leads', 'GET', '/api/leads?page=1&limit=20&status=new&search=tech', null, 'List leads (agents see own, super_agent/admin see all)'),
    req('Create Lead', 'POST', '/api/leads', { companyName: 'Potential Tech Corp', contactName: 'Jane Smith', contactEmail: 'jane@potentialtech.com', phone: '+971501234567', industry: 'Technology', size: '50-200', source: 'referral', country: 'AE', city: 'Dubai', notes: 'Met at tech conference. Interested in hiring 5 developers.', priority: 'high' }, 'Create new sales lead'),
    req('Get Lead', 'GET', '/api/leads/{{leadId}}', null, 'Get lead details with activity history'),
    req('Update Lead', 'PATCH', '/api/leads/{{leadId}}', { status: 'qualified', notes: 'Had discovery call. Budget confirmed. Ready to proceed.', nextFollowUp: '2026-05-10' }, 'Update lead status/details. Statuses: new, contacted, qualified, proposal, negotiation, won, lost'),
    req('Delete Lead', 'DELETE', '/api/leads/{{leadId}}', null, 'Delete a lead'),
    req('Convert to Employer', 'POST', '/api/leads/{{leadId}}/convert', {}, 'Convert qualified lead into employer account. Creates employer + user records.'),
  ]
};

// ============ OFFERS ============
const offers = {
  name: 'Offers',
  description: 'Job offer management',
  item: [
    req('List Offers', 'GET', '/api/offers?page=1&limit=20&status=pending&jobId={{jobId}}', null, 'List offers with filters. Role-scoped.'),
    req('Create Offer', 'POST', '/api/offers', { applicationId: '{{applicationId}}', salary: 22000, currency: 'AED', startDate: '2026-07-01', expiresAt: '2026-05-20T23:59:59Z', benefits: ['health_insurance', 'annual_leave_30_days', 'training_budget', 'relocation_allowance'], probationPeriod: '3 months', notes: 'Congratulations! We are excited to have you join our team.' }, 'Extend a job offer to a candidate'),
    req('Get Offer', 'GET', '/api/offers/{{offerId}}', null, 'Get offer details'),
    req('Respond to Offer', 'PATCH', '/api/offers/{{offerId}}', { action: 'accept', notes: 'Happy to accept! Looking forward to starting.' }, 'Accept or reject offer (job_seeker only). Actions: accept, reject'),
  ]
};

// ============ PLACEMENTS ============
const placements = {
  name: 'Placements',
  description: 'Placement records (successful hires). Role: agent, admin',
  item: [
    req('List Placements', 'GET', '/api/placements?page=1&limit=20&commissionPaid=false&search=&agentId=&employerId=&currency=AED&dateFrom=2026-01-01', null, 'List placements with filters'),
    req('Create Placement', 'POST', '/api/placements', { jobSeekerId: '{{jobSeekerId}}', employerId: '{{employerId}}', jobId: '{{jobId}}', salary: 22000, currency: 'AED', startDate: '2026-07-01', visaStatus: 'valid', probationEndDate: '2026-10-01', notes: 'Placed as Senior React Developer' }, 'Record a successful placement'),
    req('Get Placement', 'GET', '/api/placements/{{placementId}}', null, 'Get placement details'),
    req('Update Placement', 'PATCH', '/api/placements/{{placementId}}', { commissionPaid: true, commissionAmount: 5000, commissionCurrency: 'AED' }, 'Update placement details'),
    req('Delete Placement', 'DELETE', '/api/placements/{{placementId}}', null, 'Delete placement record'),
  ]
};

// ============ COMMISSIONS ============
const commissions = {
  name: 'Commissions',
  description: 'Commission tracking for agents',
  item: [
    req('List Commissions', 'GET', '/api/commissions?status=pending&type=placement&page=1&limit=20&currency=AED', null, 'List commissions with filters'),
    req('Create Commission', 'POST', '/api/commissions', { placementId: '{{placementId}}', agentId: '{{agentId}}', amount: 5000, currency: 'AED', type: 'placement', notes: 'Commission for senior developer placement' }, 'Create commission record (admin only)'),
    req('Get Commission', 'GET', '/api/commissions/{{commissionId}}', null, 'Get commission details'),
    req('Update Commission', 'PATCH', '/api/commissions/{{commissionId}}', { status: 'paid', paidAt: '2026-05-01T00:00:00Z', paymentMethod: 'bank_transfer', transactionRef: 'TXN-12345' }, 'Update commission status (mark as paid)'),
  ]
};

// ============ INVOICES ============
const invoices = {
  name: 'Invoices',
  description: 'Invoice management',
  item: [
    req('List Invoices', 'GET', '/api/invoices?page=1&limit=20&status=pending&type=subscription&userId={{userId}}', null, 'List invoices. Staff can filter by userId.'),
    req('Get Invoice', 'GET', '/api/invoices/{{invoiceId}}', null, 'Get invoice details'),
    req('Update Invoice', 'PATCH', '/api/invoices/{{invoiceId}}', { status: 'paid', paidAt: '2026-05-01', paymentMethod: 'credit_card' }, 'Update invoice status'),
  ]
};

// ============ SCORECARDS ============
const scorecards = {
  name: 'Scorecards',
  description: 'Candidate evaluation scorecards',
  item: [
    req('List Scorecards', 'GET', '/api/scorecards?applicationId={{applicationId}}&page=1&limit=10', null, 'List scorecards for an application'),
    req('Create Scorecard', 'POST', '/api/scorecards', { applicationId: '{{applicationId}}', scores: { technical_skills: 8, communication: 9, problem_solving: 7, cultural_fit: 8, leadership: 6 }, overallRating: 8, notes: 'Very strong technical skills. Good communicator.', recommendation: 'hire', interviewRound: 'technical' }, 'Create evaluation scorecard'),
    req('Get Scorecard', 'GET', '/api/scorecards/{{scorecardId}}', null, 'Get scorecard details'),
    req('Update Scorecard', 'PATCH', '/api/scorecards/{{scorecardId}}', { scores: { technical_skills: 9 }, notes: 'Updated after reviewing coding challenge results' }, 'Update scorecard'),
    req('Delete Scorecard', 'DELETE', '/api/scorecards/{{scorecardId}}', null, 'Delete scorecard'),
  ]
};

// ============ TASKS ============
const tasks = {
  name: 'Tasks (Admin)',
  description: 'Platform task management (admin)',
  item: [
    req('List Tasks', 'GET', '/api/tasks', null, 'List all platform tasks'),
    req('Get Task', 'GET', '/api/tasks/{{taskId}}', null, 'Get task details'),
    req('Update Task', 'PATCH', '/api/tasks/{{taskId}}', { status: 'completed', completedAt: '2026-05-01' }, 'Update task'),
    req('Delete Task', 'DELETE', '/api/tasks/{{taskId}}', null, 'Delete task'),
  ]
};

// ============ NOTIFICATIONS ============
const notifications = {
  name: 'Notifications',
  description: 'User notification management',
  item: [
    req('List Notifications', 'GET', '/api/notifications?page=1&limit=20&unread=true', null, 'List user notifications'),
    req('Mark as Read', 'PATCH', '/api/notifications', { ids: ['notif-1', 'notif-2', 'notif-3'] }, 'Mark specific notifications as read'),
    req('Mark All Read', 'PATCH', '/api/notifications', { markAllRead: true }, 'Mark all notifications as read'),
  ]
};

// ============ SAVED JOBS ============
const savedJobs = {
  name: 'Saved Jobs',
  description: 'Job seeker saved/bookmarked jobs',
  item: [
    req('List Saved Jobs', 'GET', '/api/saved-jobs?page=1&limit=20', null, 'List saved/bookmarked jobs'),
    req('Save Job', 'POST', '/api/saved-jobs', { jobId: '{{jobId}}', notes: 'Great opportunity - apply next week' }, 'Bookmark a job'),
    req('Remove Saved Job', 'DELETE', '/api/saved-jobs/{{savedJobId}}', null, 'Remove job from bookmarks'),
  ]
};

// ============ USERS ============
const users = {
  name: 'Users',
  description: 'User account management',
  item: [
    req('Change Password', 'POST', '/api/users/change-password', { currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' }, 'Change account password (requires current password)'),
    req('Update Locale', 'PATCH', '/api/users/locale', { locale: 'ar' }, 'Switch UI language. Supported: en, ar'),
    req('Search Users', 'GET', '/api/users/search?q=john', null, 'Search users by name or email'),
    req('Get User (Admin)', 'GET', '/api/users/{{userId}}', null, 'Get user by ID (admin only)'),
    req('Update User (Admin)', 'PATCH', '/api/users/{{userId}}', { isActive: false, role: 'job_seeker' }, 'Update user (admin only)'),
    req('Delete User (Admin)', 'DELETE', '/api/users/{{userId}}', null, 'Delete user account (admin only)'),
  ]
};

// ============ USER SELF-SERVICE ============
const userSelf = {
  name: 'User (Self-Service)',
  description: 'Current user settings and preferences',
  item: [
    req('List Saved Searches', 'GET', '/api/user/saved-searches', null, 'List saved search queries'),
    req('Create Saved Search', 'POST', '/api/user/saved-searches', { name: 'React Jobs Dubai', filters: { skills: ['React', 'TypeScript'], location: 'Dubai', workMode: 'remote', salaryMin: 15000 }, alertFrequency: 'daily' }, 'Save a search with optional email alerts'),
    req('Delete Saved Search', 'DELETE', '/api/user/saved-searches/{{searchId}}', null, 'Delete a saved search'),
    req('Referral Info', 'GET', '/api/user/referral', null, 'Get referral code, stats, and earnings'),
    req('Profile Completion', 'GET', '/api/user/profile-completion', null, 'Get profile completion percentage and missing fields'),
    req('Get Notification Preferences', 'GET', '/api/user/notification-preferences', null, 'Get notification channel preferences'),
    req('Update Notification Preferences', 'PATCH', '/api/user/notification-preferences', { email: { jobAlerts: true, applicationUpdates: true, marketing: false }, push: { messages: true, interviews: true }, sms: { interviews: true } }, 'Update notification preferences per channel'),
    req('Get Auto-Apply Settings', 'GET', '/api/user/autoapply', null, 'Get auto-apply configuration'),
    req('Update Auto-Apply', 'PATCH', '/api/user/autoapply', { enabled: true, filters: { skills: ['React', 'TypeScript'], location: 'Dubai', workMode: 'remote', salaryMin: 15000 }, maxApplicationsPerDay: 5, coverLetterTemplate: 'I am interested in this position...' }, 'Configure auto-apply preferences'),
    req('List Portfolio', 'GET', '/api/user/portfolio', null, 'List portfolio items/projects'),
    req('Add Portfolio Item', 'POST', '/api/user/portfolio', { title: 'E-commerce Platform', description: 'Built a full-stack e-commerce platform using React and Node.js', url: 'https://github.com/user/ecommerce', imageUrl: '/portfolio/ecommerce.png', technologies: ['React', 'Node.js', 'PostgreSQL'], year: 2025 }, 'Add portfolio item'),
    req('Get Portfolio Item', 'GET', '/api/user/portfolio/{{portfolioId}}', null, 'Get portfolio item details'),
    req('Update Portfolio Item', 'PATCH', '/api/user/portfolio/{{portfolioId}}', { title: 'Updated Project Name', description: 'Updated description' }, 'Update portfolio item'),
    req('Delete Portfolio Item', 'DELETE', '/api/user/portfolio/{{portfolioId}}', null, 'Delete portfolio item'),
  ]
};

// ============ REFERRALS ============
const referrals = {
  name: 'Referrals',
  description: 'Referral system for agents/super agents',
  item: [
    req('Get My Referral Code', 'GET', '/api/referral', null, 'Get agent/super_agent referral code and stats'),
    req('Validate Code', 'POST', '/api/referral/validate', { code: 'REF-ABC123' }, 'Validate a referral code (public endpoint)'),
    req('List Referral Links', 'GET', '/api/referral-links', null, 'List custom referral tracking links'),
    req('Create Referral Link', 'POST', '/api/referral-links', { name: 'LinkedIn Q2 Campaign', targetRole: 'job_seeker', utmSource: 'linkedin', utmCampaign: 'q2_hiring' }, 'Create trackable referral link'),
    req('Get Referral Link', 'GET', '/api/referral-links/{{linkId}}', null, 'Get referral link details and analytics'),
    req('Update Referral Link', 'PATCH', '/api/referral-links/{{linkId}}', { isActive: false, name: 'LinkedIn Q2 (Paused)' }, 'Update referral link'),
    req('Delete Referral Link', 'DELETE', '/api/referral-links/{{linkId}}', null, 'Delete referral link'),
  ]
};

// ============ PUBLIC ============
const publicRoutes = {
  name: 'Public',
  description: 'Public endpoints - no authentication required',
  item: [
    req('Landing Page', 'GET', '/api/public/landing', null, 'Get landing page content (stats, testimonials, featured jobs)'),
    req('List Blogs', 'GET', '/api/public/blogs?page=1&limit=10&tag=career&search=tips', null, 'Public blog listing with search'),
    req('Get Blog Post', 'GET', '/api/public/blogs/career-tips-2026', null, 'Get blog post by slug'),
    req('Get Static Page', 'GET', '/api/public/pages/about', null, 'Get static page by slug (about, terms, privacy, etc.)'),
    req('Search Countries', 'GET', '/api/countries?q=united&limit=10', null, 'Search countries (rate-limited)'),
    req('Job Filters', 'GET', '/api/filters', null, 'Get all job filter options (skills, categories, job types, experience levels)'),
    req('Location Filters', 'GET', '/api/filters/locations', null, 'Get location data for filters (countries, states, cities)'),
    req('Contact Form', 'POST', '/api/contact', { name: 'John Doe', email: 'john@example.com', phone: '+971501234567', subject: 'Partnership Inquiry', message: 'I would like to discuss a potential partnership...', captchaToken: 'recaptcha-token' }, 'Submit contact form. Rate limited: 5 per 10 min'),
    req('Exchange Rates', 'GET', '/api/exchange-rates', null, 'Get current currency exchange rates'),
    req('GDPR Information', 'GET', '/api/gdpr', null, 'GDPR and data privacy information'),
    req('Request Data Export', 'POST', '/api/gdpr/export', {}, 'Request personal data export (authenticated)'),
    req('Unsubscribe', 'GET', '/api/unsubscribe?token=unsubscribe-token&email=user@example.com', null, 'Email unsubscribe (token-based)'),
    req('Proxy Image', 'GET', '/api/proxy-image?url=https://example.com/photo.jpg', null, 'Proxy external images through platform CDN'),
  ]
};

// ============ MISCELLANEOUS ============
const misc = {
  name: 'Miscellaneous',
  description: 'Other utility endpoints',
  item: [
    req('Activity Feed', 'GET', '/api/activity', null, 'Job seeker activity feed (applications, views, saves)'),
    req('Dashboard Stats', 'GET', '/api/dashboard/stats', null, 'General dashboard statistics based on role'),
    req('Poster Templates', 'GET', '/api/poster-templates', null, 'List available poster design templates'),
    req('Courses', 'GET', '/api/courses', null, 'List available learning courses'),
    req('Companies', 'GET', '/api/companies', null, 'List companies for search/autocomplete'),
    req('LinkedIn Import', 'POST', '/api/linkedin/import-profile', {}, 'Import profile data from LinkedIn (requires OAuth token)'),
    req('LinkedIn Share', 'POST', '/api/social/linkedin/share', { jobUrl: 'https://mployedin.com/jobs/senior-react-developer', caption: 'We are hiring a Senior React Developer! Join our amazing team.', visibility: 'public' }, 'Share job posting on LinkedIn'),
  ]
};

// ============ CRON JOBS ============
const cron = {
  name: 'Cron Jobs (Internal)',
  description: 'Internal scheduled job endpoints. Require x-cron-secret header.',
  item: [
    { name: 'Subscription Expiry Check', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/subscription-expiry', host: ['{{baseUrl}}'], path: ['api', 'cron', 'subscription-expiry'] }, description: 'Check and process expired subscriptions' } },
    { name: 'Subscription Reminder', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/subscription-reminder', host: ['{{baseUrl}}'], path: ['api', 'cron', 'subscription-reminder'] }, description: 'Send subscription renewal reminders (7 days before expiry)' } },
    { name: 'Usage Counter Reset', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/subscription-usage-reset', host: ['{{baseUrl}}'], path: ['api', 'cron', 'subscription-usage-reset'] }, description: 'Reset monthly subscription usage counters' } },
    { name: 'Job Expiry', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/job-expiry', host: ['{{baseUrl}}'], path: ['api', 'cron', 'job-expiry'] }, description: 'Expire jobs past their deadline' } },
    { name: 'Offer Expiry', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/offer-expiry', host: ['{{baseUrl}}'], path: ['api', 'cron', 'offer-expiry'] }, description: 'Expire pending job offers past deadline' } },
    { name: 'Interview Reminders', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/interview-reminders', host: ['{{baseUrl}}'], path: ['api', 'cron', 'interview-reminders'] }, description: 'Send interview reminders (24h and 1h before)' } },
    { name: 'SLA Alerts', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/sla-alerts', host: ['{{baseUrl}}'], path: ['api', 'cron', 'sla-alerts'] }, description: 'Check and alert on SLA violations' } },
    { name: 'NPS Trigger', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/nps-trigger', host: ['{{baseUrl}}'], path: ['api', 'cron', 'nps-trigger'] }, description: 'Trigger NPS surveys for eligible users' } },
    { name: 'Auto Apply Processing', request: { method: 'GET', header: [{ key: 'x-cron-secret', value: '{{cronSecret}}', type: 'text' }], url: { raw: '{{baseUrl}}/api/cron/autoapply', host: ['{{baseUrl}}'], path: ['api', 'cron', 'autoapply'] }, description: 'Process auto-apply queue for eligible job seekers' } },
  ]
};

// Assemble collection
collection.item = [
  auth, admin, ai, agent, superAgent, applications, employers, jobs,
  jobSeekers, interviews, subscriptions, messages, leads, offers,
  placements, commissions, invoices, scorecards, tasks, notifications,
  savedJobs, users, userSelf, referrals, publicRoutes, misc, cron
];

// Write file
const output = JSON.stringify(collection, null, 2);
fs.writeFileSync('docs/Mployedin-API.postman_collection.json', output);
console.log(`✓ Postman collection generated: docs/Mployedin-API.postman_collection.json`);
console.log(`  Size: ${(output.length / 1024).toFixed(1)} KB`);
console.log(`  Folders: ${collection.item.length}`);
console.log(`  Total requests: ${countRequests(collection.item)}`);

function countRequests(items) {
  let count = 0;
  for (const item of items) {
    if (item.request) count++;
    if (item.item) count += countRequests(item.item);
  }
  return count;
}
