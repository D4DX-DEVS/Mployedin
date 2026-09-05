import type { UserRole, Resource, Action } from "@/types/user";
import type { IconName } from "./iconRegistry";

/**
 * A verb, not a destination.
 *
 * The sidebar and the ⌘K palette both answer "where is X?". This registry
 * answers "do X" — the same list feeds the palette's Actions group and the
 * topbar Create menu, so an action is reachable from every page without
 * navigating home to find the button that starts it.
 */
export interface QuickAction {
  key: string;
  /** Path without the locale prefix, e.g. "/employer/jobs/ai-create". */
  href: string;
  icon: IconName;
  /** Key into the "quickActions" translation namespace. */
  labelKey: string;
  /** Optional second line in the palette; same namespace. */
  descriptionKey?: string;
  /**
   * Shown in the topbar "Create" menu. Actions without it stay palette-only —
   * the Create menu is for making new things, not for opening filtered lists.
   */
  create?: boolean;
  /** Resource + action checked against the caller's permissions, when set. */
  permission?: { resource: Resource; action: Action };
}

export const WORKSPACE_QUICK_ACTIONS: Partial<Record<UserRole, QuickAction[]>> = {
  employer: [
    {
      key: "postJobAi",
      href: "/employer/jobs/ai-create",
      icon: "Sparkles",
      labelKey: "postJobAi",
      descriptionKey: "postJobAiDesc",
      create: true,
      permission: { resource: "jobs", action: "create" },
    },
    {
      // The manual wizard is otherwise reachable only by knowing the query
      // string; without this entry a repeat poster must sit through the chat.
      key: "postJobManual",
      href: "/employer/jobs/new?mode=manual",
      icon: "Plus",
      labelKey: "postJobManual",
      descriptionKey: "postJobManualDesc",
      create: true,
      permission: { resource: "jobs", action: "create" },
    },
    {
      key: "scheduleInterviews",
      href: "/employer/interviews/bulk",
      icon: "Calendar",
      labelKey: "scheduleInterviews",
      descriptionKey: "scheduleInterviewsDesc",
      create: true,
      permission: { resource: "interviews", action: "create" },
    },
    {
      key: "newMessage",
      href: "/employer/messages",
      icon: "MessageSquare",
      labelKey: "newMessage",
      descriptionKey: "newMessageDesc",
      create: true,
    },
    {
      key: "reviewNewApplications",
      href: "/employer/applications?status=applied",
      icon: "FileText",
      labelKey: "reviewNewApplications",
      descriptionKey: "reviewNewApplicationsDesc",
    },
    {
      key: "reviewTopMatches",
      href: "/employer/applications?scoreMin=80",
      icon: "Star",
      labelKey: "reviewTopMatches",
      descriptionKey: "reviewTopMatchesDesc",
    },
  ],
  // Admin had two entries — one of them a destination, not a verb — so the
  // Create menu offered a single item to the role with the most creatable
  // objects, and ⌘K's Actions group was effectively empty. The verbs below all
  // point at routes that already exist; `createInvoice` in particular was
  // reachable only by typing the URL.
  admin: [
    {
      key: "postJobAdmin",
      href: "/admin/jobs/new",
      icon: "Plus",
      labelKey: "postJobAdmin",
      descriptionKey: "postJobAdminDesc",
      create: true,
      permission: { resource: "jobs", action: "create" },
    },
    {
      key: "createInvoice",
      href: "/admin/invoices/new",
      icon: "ReceiptText",
      labelKey: "createInvoice",
      descriptionKey: "createInvoiceDesc",
      create: true,
      permission: { resource: "invoices", action: "create" },
    },
    {
      key: "createTarget",
      href: "/admin/target-management/create",
      icon: "Crosshair",
      labelKey: "createTarget",
      descriptionKey: "createTargetDesc",
      create: true,
      permission: { resource: "targets", action: "create" },
    },
    {
      key: "createStaticPage",
      href: "/admin/cms/static-pages/new",
      icon: "ScrollText",
      labelKey: "createStaticPage",
      descriptionKey: "createStaticPageDesc",
      create: true,
      permission: { resource: "cms", action: "create" },
    },
    {
      key: "bulkImport",
      href: "/admin/bulk-import",
      icon: "Upload",
      labelKey: "bulkImport",
      descriptionKey: "bulkImportDesc",
      create: true,
      permission: { resource: "users", action: "create" },
    },
    {
      key: "newMessage",
      href: "/admin/messages",
      icon: "MessageSquare",
      labelKey: "newMessage",
      descriptionKey: "newMessageDesc",
      create: true,
    },
    {
      key: "reviewSupportTickets",
      href: "/admin/messages?tab=support",
      icon: "Headset",
      labelKey: "reviewSupportTickets",
      descriptionKey: "reviewSupportTicketsDesc",
    },
    {
      key: "reviewNewApplications",
      href: "/admin/applications?status=applied",
      icon: "FileText",
      labelKey: "reviewNewApplications",
      descriptionKey: "reviewNewApplicationsDesc",
    },
    {
      key: "reviewFailingWebhooks",
      href: "/admin/webhooks?status=failed",
      icon: "Activity",
      labelKey: "reviewFailingWebhooks",
      descriptionKey: "reviewFailingWebhooksDesc",
    },
    {
      key: "manageUsers",
      href: "/admin/users",
      icon: "Users",
      labelKey: "manageUsers",
      descriptionKey: "manageUsersDesc",
    },
  ],
  // An agent had two entries — one of them a destination rather than a verb —
  // so the Create menu offered a single item to the role that creates the most
  // records, and ⌘K's Actions group was effectively empty. Every href below
  // resolves to a page that already exists; the three review entries are the
  // filtered views the dashboard queue links, reachable here from any page.
  agent: [
    {
      key: "postJobAgent",
      href: "/agent/jobs/new",
      icon: "Plus",
      labelKey: "postJobAgent",
      descriptionKey: "postJobAgentDesc",
      create: true,
      permission: { resource: "jobs", action: "create" },
    },
    {
      key: "newLead",
      href: "/agent/leads/new",
      icon: "Target",
      labelKey: "newLead",
      descriptionKey: "newLeadDesc",
      create: true,
      permission: { resource: "leads", action: "create" },
    },
    {
      // `?new=1` opens the inline create form on arrival — the form is on the
      // list page, so without it this action lands the agent next to the button
      // instead of on it.
      key: "newTask",
      href: "/agent/tasks?new=1",
      icon: "CheckSquare",
      labelKey: "newTask",
      descriptionKey: "newTaskDesc",
      create: true,
      permission: { resource: "tasks", action: "create" },
    },
    {
      key: "scheduleInterviewAgent",
      href: "/agent/interviews?new=1",
      icon: "Calendar",
      labelKey: "scheduleInterviewAgent",
      descriptionKey: "scheduleInterviewAgentDesc",
      create: true,
      permission: { resource: "interviews", action: "create" },
    },
    {
      key: "dueFollowUps",
      href: "/agent/leads?followUp=due",
      icon: "Clock",
      labelKey: "dueFollowUps",
      descriptionKey: "dueFollowUpsDesc",
    },
    {
      key: "overdueTasks",
      href: "/agent/tasks?due=overdue",
      icon: "ClipboardList",
      labelKey: "overdueTasks",
      descriptionKey: "overdueTasksDesc",
    },
    {
      key: "reviewNewCandidates",
      href: "/agent/candidates?status=applied",
      icon: "Users",
      labelKey: "reviewNewCandidates",
      descriptionKey: "reviewNewCandidatesDesc",
    },
    {
      key: "recordInterviewOutcomes",
      href: "/agent/interviews?outcome=pending",
      icon: "ClipboardCheck",
      labelKey: "recordInterviewOutcomes",
      descriptionKey: "recordInterviewOutcomesDesc",
    },
    {
      key: "openLeads",
      href: "/agent/leads",
      icon: "Target",
      labelKey: "openLeads",
      descriptionKey: "openLeadsDesc",
    },
  ],
  job_seeker: [
    {
      // The CV is the one artefact every application reuses, and it was
      // previously only reachable by walking into the profile section.
      key: "updateResume",
      href: "/job-seeker/cv",
      icon: "FileText",
      labelKey: "updateResume",
      descriptionKey: "updateResumeDesc",
      create: true,
    },
    {
      key: "uploadDocument",
      href: "/job-seeker/documents",
      icon: "FolderOpen",
      labelKey: "uploadDocument",
      descriptionKey: "uploadDocumentDesc",
      create: true,
    },
    {
      key: "addPortfolioItem",
      href: "/job-seeker/portfolio",
      icon: "FolderOpen",
      labelKey: "addPortfolioItem",
      descriptionKey: "addPortfolioItemDesc",
      create: true,
    },
    {
      key: "findJobs",
      href: "/job-seeker/jobs",
      icon: "Briefcase",
      labelKey: "findJobs",
      descriptionKey: "findJobsDesc",
    },
    {
      key: "reviewOffers",
      href: "/job-seeker/offers",
      icon: "DollarSign",
      labelKey: "reviewOffers",
      descriptionKey: "reviewOffersDesc",
    },
    {
      key: "setPreferences",
      href: "/job-seeker/preferences",
      icon: "Target",
      labelKey: "setPreferences",
      descriptionKey: "setPreferencesDesc",
    },
  ],
  // This role had two entries, both of them destinations, and neither marked
  // `create` — so CreateMenu returned null and the super-agent was the one
  // workspace role with no way to start anything from outside the page that
  // happens to host the button. Five things a super-agent creates already
  // existed, each reachable only by first navigating to its own page: an agent,
  // an employer, an invoice, a referral link and a year's target distribution.
  super_agent: [
    {
      key: "saAddAgent",
      href: "/super-agent/agents?new=1",
      icon: "Users",
      labelKey: "saAddAgent",
      descriptionKey: "saAddAgentDesc",
      create: true,
      permission: { resource: "agents", action: "create" },
    },
    {
      key: "saOnboardEmployer",
      href: "/super-agent/employers?new=1",
      icon: "Building2",
      labelKey: "saOnboardEmployer",
      descriptionKey: "saOnboardEmployerDesc",
      create: true,
      permission: { resource: "employers", action: "create" },
    },
    {
      key: "saNewInvoice",
      href: "/super-agent/invoices/new",
      icon: "ReceiptText",
      labelKey: "saNewInvoice",
      descriptionKey: "saNewInvoiceDesc",
      create: true,
      permission: { resource: "invoices", action: "create" },
    },
    {
      key: "saNewReferralLink",
      href: "/super-agent/referral-links?new=1",
      icon: "Link2",
      labelKey: "saNewReferralLink",
      descriptionKey: "saNewReferralLinkDesc",
      create: true,
    },
    {
      key: "saDistributeTargets",
      href: "/super-agent/target-management/create",
      icon: "Target",
      labelKey: "saDistributeTargets",
      descriptionKey: "saDistributeTargetsDesc",
      create: true,
      permission: { resource: "targets", action: "create" },
    },
    // Palette-only: these open a filtered queue rather than making something new.
    {
      key: "saReviewExhibitions",
      href: "/super-agent/exhibitions?status=submitted",
      icon: "CalendarDays",
      labelKey: "saReviewExhibitions",
      descriptionKey: "saReviewExhibitionsDesc",
      permission: { resource: "exhibitions", action: "approve" },
    },
    {
      key: "saApproveCommissions",
      href: "/super-agent/commissions?status=pending",
      icon: "DollarSign",
      labelKey: "saApproveCommissions",
      descriptionKey: "saApproveCommissionsDesc",
      permission: { resource: "commissions", action: "approve" },
    },
    {
      key: "openTeam",
      href: "/super-agent/agents",
      icon: "Users",
      labelKey: "openTeam",
      descriptionKey: "openTeamDesc",
    },
    {
      key: "openLeads",
      href: "/super-agent/leads",
      icon: "Target",
      labelKey: "openLeads",
      descriptionKey: "openLeadsDesc",
    },
  ],
};

/** Actions for a role, locale-prefixed. Unknown roles get an empty list. */
export function getQuickActions(role: string | undefined, locale: string): QuickAction[] {
  const actions = WORKSPACE_QUICK_ACTIONS[role as UserRole] ?? [];
  return actions.map((action) => ({ ...action, href: `/${locale}${action.href}` }));
}
