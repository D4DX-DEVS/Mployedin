import type { UserRole } from "@/models/User";
import type { IconName } from "./iconRegistry";

/** Resources in the system */
export type Resource = string;

/** Counters a nav entry can carry. See `NavItem.badgeKey`. */
export type NavBadgeKey =
  | "unreadMessages"
  | "pendingOffers"
  | "interviewsAwaitingResponse"
  | "openSupportTickets"
  | "unreadContactSubmissions"
  | "pendingExhibitionReviews"
  | "pendingCommissionApprovals"
  | "overdueTasks"
  | "dueFollowUps";

export interface NavItem {
  title: string;
  titleAr: string;
  href: string;
  /** Plain icon name — resolved to a Lucide component inside Client Components via getIcon() */
  icon: IconName;
  badge?: string;
  /**
   * Which live count badges this entry, if any. The Sidebar used to match on
   * `item.title === "Messages"`, so a renamed or translated entry silently lost
   * its badge and no second counter could ever be added.
   */
  badgeKey?: NavBadgeKey;
  /** Short description shown in command menu */
  description?: string;
  descriptionAr?: string;
  /** Optional group label for grouping children in the submenu panel */
  group?: string;
  groupAr?: string;
  children?: NavItem[];
}

export interface NavGroup {
  label?: string;
  labelAr?: string;
  items: NavItem[];
}

function buildNav(locale: string): Record<UserRole, NavGroup[]> {
  const p = (path: string) => `/${locale}${path}`;

  return {
    admin: [
      {
        items: [
          {
            title: "Dashboard",
            titleAr: "لوحة التحكم",
            href: p("/admin"),
            icon: "LayoutDashboard",
            description: "Overview & key metrics",
            descriptionAr: "نظرة عامة والمقاييس الرئيسية",
          },
          {
            title: "Recruitment",
            titleAr: "التوظيف",
            href: p("/admin/jobs"),
            icon: "Briefcase",
            description: "Manage the hiring pipeline",
            descriptionAr: "إدارة عملية التوظيف",
            children: [
              {
                title: "Jobs",
                titleAr: "الوظائف",
                href: p("/admin/jobs"),
                icon: "Briefcase",
                description: "Manage job listings",
                descriptionAr: "إدارة الوظائف المنشورة",
              },
              {
                title: "Applications",
                titleAr: "الطلبات",
                href: p("/admin/applications"),
                icon: "FileText",
                description: "Review candidate applications",
                descriptionAr: "مراجعة طلبات المرشحين",
              },
              {
                title: "Interviews",
                titleAr: "المقابلات",
                href: p("/admin/interviews"),
                icon: "Calendar",
                description: "Schedule & track interviews",
                descriptionAr: "جدولة وتتبع المقابلات",
              },
              {
                title: "Placements",
                titleAr: "التوظيفات",
                href: p("/admin/placements"),
                icon: "UserCheck",
                description: "Confirmed hires & placements",
                descriptionAr: "التعيينات المؤكدة",
              },
            ],
          },
          {
            title: "People",
            titleAr: "الأشخاص",
            href: p("/admin/employers"),
            icon: "Users",
            description: "Manage all users & accounts",
            descriptionAr: "إدارة جميع المستخدمين والحسابات",
            children: [
              {
                title: "Employers",
                titleAr: "أصحاب العمل",
                href: p("/admin/employers"),
                icon: "Building2",
                description: "Company accounts & profiles",
                descriptionAr: "حسابات وملفات الشركات",
                group: "Accounts",
                groupAr: "الحسابات",
              },
              {
                title: "Job Seekers",
                titleAr: "الباحثون عن عمل",
                href: p("/admin/job-seekers"),
                icon: "UserSearch",
                description: "Candidate profiles & CVs",
                descriptionAr: "ملفات المرشحين والسير الذاتية",
                group: "Accounts",
                groupAr: "الحسابات",
              },
              {
                title: "Agents",
                titleAr: "الوكلاء",
                href: p("/admin/agents"),
                icon: "Star",
                description: "Recruitment agents & regions",
                descriptionAr: "وكلاء التوظيف والمناطق",
                group: "Workforce",
                groupAr: "القوى العاملة",
              },
              {
                title: "Super Agents",
                titleAr: "الوكلاء الكبار",
                href: p("/admin/super-agents"),
                icon: "Shield",
                description: "Agent managers & team leads",
                descriptionAr: "مديرو الوكلاء وقادة الفرق",
                group: "Workforce",
                groupAr: "القوى العاملة",
              },
              {
                title: "Users",
                titleAr: "المستخدمون",
                href: p("/admin/users"),
                icon: "UserCog",
                description: "System users & permissions",
                descriptionAr: "مستخدمو النظام والأذونات",
                group: "Workforce",
                groupAr: "القوى العاملة",
              },
              {
                title: "Territory",
                titleAr: "المناطق",
                href: p("/admin/territory"),
                icon: "MapPin",
                description: "Geographic territories & lead routing",
                descriptionAr: "المناطق الجغرافية وتوجيه العملاء المحتملين",
                group: "Workforce",
                groupAr: "القوى العاملة",
              },
              {
                title: "Referral Links",
                titleAr: "روابط الإحالة",
                href: p("/admin/referral-links"),
                icon: "Link2",
                description: "All referral links & analytics",
                descriptionAr: "جميع روابط الإحالة والتحليلات",
                group: "Marketing",
                groupAr: "التسويق",
              },
            ],
          },
          {
            title: "Finance",
            titleAr: "المالية",
            href: p("/admin/commissions"),
            icon: "DollarSign",
            description: "Commissions, subscriptions & payments",
            descriptionAr: "العمولات والاشتراكات والمدفوعات",
            children: [
              {
                title: "Commissions",
                titleAr: "العمولات",
                href: p("/admin/commissions"),
                icon: "DollarSign",
                description: "Track & manage commissions",
                descriptionAr: "تتبع وإدارة العمولات",
              },
              {
                title: "Invoices",
                titleAr: "الفواتير",
                href: p("/admin/invoices"),
                icon: "ReceiptText",
                description: "Recruitment & subscription invoices",
                descriptionAr: "فواتير التوظيف والاشتراكات",
              },
              {
                title: "Subscription Plans",
                titleAr: "خطط الاشتراك",
                href: p("/admin/subscription-plans"),
                icon: "Crown",
                description: "Manage subscription tiers & features",
                descriptionAr: "إدارة مستويات الاشتراك والميزات",
              },
              {
                title: "Subscriptions",
                titleAr: "الاشتراكات",
                href: p("/admin/subscriptions"),
                icon: "CreditCard",
                description: "Assign & manage user subscriptions",
                descriptionAr: "تعيين وإدارة اشتراكات المستخدمين",
              },
              {
                title: "Subscription Dashboard",
                titleAr: "لوحة الاشتراكات",
                href: p("/admin/subscription-dashboard"),
                icon: "BarChart2",
                description: "Overview, revenue & activity stats",
                descriptionAr: "نظرة عامة والإيرادات وإحصائيات النشاط",
              },
              {
                title: "Targets",
                titleAr: "الأهداف",
                href: p("/admin/target-management"),
                icon: "Target",
                description: "Enterprise target profiles & analytics",
                descriptionAr: "ملفات الأهداف المتقدمة والتحليلات",
              },
              {
                title: "Target Report",
                titleAr: "تقرير الأهداف",
                href: p("/admin/target-report"),
                icon: "FileText",
                description: "Consolidated target performance report",
                descriptionAr: "تقرير أداء الأهداف الموحد",
              },
              {
                title: "Commission Report",
                titleAr: "تقرير العمولات",
                href: p("/admin/commissions-report"),
                icon: "BarChart2",
                description: "Aggregated commission analytics across all agents",
                descriptionAr: "تحليلات العمولات الموحدة لجميع الوكلاء",
              },
            ],
          },
          {
            title: "CMS / Content",
            titleAr: "إدارة المحتوى",
            href: p("/admin/cms"),
            icon: "PanelsTopLeft",
            description: "Manage website content",
            descriptionAr: "إدارة محتوى الموقع",
            children: [
              {
                title: "CMS Overview",
                titleAr: "نظرة عامة",
                href: p("/admin/cms"),
                icon: "PanelsTopLeft",
                description: "Content management dashboard",
                descriptionAr: "لوحة إدارة المحتوى",
                group: "Overview",
                groupAr: "نظرة عامة",
              },
              {
                title: "FAQs",
                titleAr: "الأسئلة الشائعة",
                href: p("/admin/cms/faqs"),
                icon: "HelpCircle",
                description: "Frequently asked questions",
                descriptionAr: "الأسئلة المتداولة",
                group: "Content",
                groupAr: "المحتوى",
              },
              {
                title: "Blog Posts",
                titleAr: "المقالات",
                href: p("/admin/cms/blogs"),
                icon: "Newspaper",
                description: "Articles & news posts",
                descriptionAr: "المقالات والأخبار",
                group: "Content",
                groupAr: "المحتوى",
              },
              {
                title: "Testimonials",
                titleAr: "شهادات العملاء",
                href: p("/admin/cms/testimonials"),
                icon: "Quote",
                description: "Client success stories",
                descriptionAr: "قصص نجاح العملاء",
                group: "Content",
                groupAr: "المحتوى",
              },
              {
                title: "Banners",
                titleAr: "البانرات",
                href: p("/admin/cms/banners"),
                icon: "Image",
                description: "Homepage & promo banners",
                descriptionAr: "بانرات الصفحة الرئيسية",
                group: "Media",
                groupAr: "الوسائط",
              },
              {
                title: "Videos",
                titleAr: "الفيديوهات",
                href: p("/admin/cms/videos"),
                icon: "Video",
                description: "Video content library",
                descriptionAr: "مكتبة محتوى الفيديو",
                group: "Media",
                groupAr: "الوسائط",
              },
              {
                title: "Static Pages",
                titleAr: "الصفحات الثابتة",
                href: p("/admin/cms/static-pages"),
                icon: "FileText",
                description: "Privacy, terms & custom pages",
                descriptionAr: "الخصوصية والشروط والصفحات المخصصة",
                group: "Pages",
                groupAr: "الصفحات",
              },
              {
                title: "Contact Inbox",
                titleAr: "صندوق الرسائل",
                href: p("/admin/cms/contact-submissions"),
                badgeKey: "unreadContactSubmissions",
                icon: "Mail",
                description: "Contact form submissions",
                descriptionAr: "رسائل نموذج الاتصال",
                group: "Pages",
                groupAr: "الصفحات",
              },

            ],
          },
          {
            // Eight lookup tables — five job attributes and three location
            // levels — used to occupy eight of this workspace's fifty-two
            // leaves, at the same depth as Applications and Placements, for
            // data edited a few times a year. They are one entry now; the
            // destination renders a tab bar across all eight, and every
            // original route still resolves.
            title: "Platform Data",
            titleAr: "بيانات المنصة",
            href: p("/admin/job-attributes/industries"),
            icon: "SlidersHorizontal",
            description: "Industries, skills, subjects and locations",
            descriptionAr: "القطاعات والمهارات والتخصصات والمواقع",
          },
          {
            title: "Insight",
            titleAr: "التحليلات",
            href: p("/admin/reports"),
            icon: "BarChart2",
            description: "Platform report, AI insights and the audit trail",
            descriptionAr: "تقرير المنصة ورؤى الذكاء الاصطناعي وسجل التدقيق",
            children: [
              {
                // Platform performance: funnel, trends and the alert engine.
                title: "Platform Report",
                titleAr: "تقرير المنصة",
                href: p("/admin/reports"),
                icon: "BarChart2",
                description: "Funnel, trends and alerts that need action",
                descriptionAr: "المسار والاتجاهات والتنبيهات التي تحتاج إجراءً",
              },
              {
                // An AI-written narrative over the same numbers — a different
                // thing from the report above, and previously named as if it
                // were the report itself.
                title: "AI Insights",
                titleAr: "رؤى الذكاء الاصطناعي",
                href: p("/admin/analytics"),
                icon: "Sparkles",
                description: "AI-written summary of platform performance",
                descriptionAr: "ملخص من الذكاء الاصطناعي لأداء المنصة",
              },
              {
                // One page now: Activity Timeline read the same AuditLog
                // collection with a filter set that neither contained nor was
                // contained by this one.
                title: "Audit Trail",
                titleAr: "سجل التدقيق",
                href: p("/admin/audit-logs"),
                icon: "ClipboardList",
                description: "Who did what, filtered by user, role, resource or date",
                descriptionAr: "من فعل ماذا، مع التصفية حسب المستخدم أو الدور أو المورد أو التاريخ",
              },
            ],
          },
          {
            title: "System",
            titleAr: "النظام",
            href: p("/admin/settings"),
            icon: "Settings",
            description: "Settings & configuration",
            descriptionAr: "الإعدادات والتكوين",
            children: [
              {
                title: "Settings",
                titleAr: "الإعدادات",
                href: p("/admin/settings"),
                icon: "Settings",
                description: "Platform configuration",
                descriptionAr: "إعدادات المنصة",
                group: "Configuration",
                groupAr: "التكوين",
              },
              {
                title: "Communications",
                titleAr: "الاتصالات",
                href: p("/admin/communications"),
                icon: "MessageSquare",
                description: "Email & notification logs",
                descriptionAr: "سجلات البريد والإشعارات",
                group: "Configuration",
                groupAr: "التكوين",
              },
              {
                title: "Notification System",
                titleAr: "نظام الإشعارات",
                href: p("/admin/settings/notifications"),
                icon: "Bell",
                description: "Email automation & monitoring",
                descriptionAr: "أتمتة البريد الإلكتروني والمراقبة",
                group: "Configuration",
                groupAr: "التكوين",
              },
              {
                title: "Webhooks",
                titleAr: "الويب هوك",
                href: p("/admin/webhooks"),
                icon: "Link2",
                description: "Outbound webhook integrations",
                descriptionAr: "تكاملات الويب هوك الصادرة",
                group: "Configuration",
                groupAr: "التكوين",
              },

              {
                title: "Workflow Templates",
                titleAr: "قوالب سير العمل",
                href: p("/admin/workflow-templates"),
                icon: "GitBranch",
                description: "Manage hiring workflow presets",
                descriptionAr: "إدارة قوالب سير عمل التوظيف",
                group: "Automation",
                groupAr: "الأتمتة",
              },
              {
                title: "Matching Weight Templates",
                titleAr: "قوالب أوزان المطابقة",
                href: p("/admin/matching-weight-templates"),
                icon: "Scale",
                description: "Manage matching weight presets",
                descriptionAr: "إدارة قوالب أوزان المطابقة",
                group: "Automation",
                groupAr: "الأتمتة",
              },
              {
                title: "GDPR / Data Privacy",
                titleAr: "حماية البيانات",
                href: p("/admin/gdpr"),
                icon: "ShieldCheck",
                description: "Data requests, consent & retention",
                descriptionAr: "طلبات البيانات والموافقة والاحتفاظ",
                group: "Compliance",
                groupAr: "الامتثال",
              },
              {
                title: "Bulk Import",
                titleAr: "استيراد جماعي",
                href: p("/admin/bulk-import"),
                icon: "Upload",
                description: "CSV import for users & jobs",
                descriptionAr: "استيراد CSV للمستخدمين والوظائف",
                group: "Data",
                groupAr: "البيانات",
              },
              {
                title: "System Health",
                titleAr: "صحة النظام",
                href: p("/admin/system-health"),
                icon: "Activity",
                description: "Platform monitoring & diagnostics",
                descriptionAr: "مراقبة المنصة والتشخيص",
                group: "Operations",
                groupAr: "العمليات",
              },
              {
                title: "Impersonate User",
                titleAr: "انتحال هوية مستخدم",
                href: p("/admin/impersonate"),
                icon: "UserCheck",
                description: "Sign in as another user for support",
                descriptionAr: "تسجيل الدخول كمستخدم آخر للدعم",
                group: "Operations",
                groupAr: "العمليات",
              },
            ],
          },
          {
            title: "Exhibitions",
            titleAr: "المعارض",
            href: p("/admin/exhibitions"),
            icon: "CalendarDays",
            description: "Requests, performance & resources",
            descriptionAr: "الطلبات والأداء والموارد",
            children: [
              {
                title: "Review Requests",
                titleAr: "مراجعة الطلبات",
                href: p("/admin/exhibitions"),
                icon: "CalendarDays",
                description: "Manage exhibition requests",
                descriptionAr: "إدارة طلبات المعارض",
              },
              {
                title: "Check Performance",
                titleAr: "مراجعة الأداء",
                href: p("/admin/exhibitions/analytics"),
                icon: "BarChart2",
                description: "Exhibition performance reports",
                descriptionAr: "تقارير أداء المعارض",
              },
              {
                title: "Manage Resources",
                titleAr: "إدارة الموارد",
                href: p("/admin/resources"),
                icon: "FolderOpen",
                description: "Upload and manage exhibition resources",
                descriptionAr: "رفع وإدارة موارد المعارض",
              },
            ],
          },
          {
            title: "Communication",
            titleAr: "التواصل",
            href: p("/admin/messages"),
            icon: "MessageSquare",
            description: "Messages, support & notifications",
            descriptionAr: "الرسائل والدعم والإشعارات",
            // No badgeKey here: the Sidebar sums a group's children into the
            // parent, so declaring the same counter on both would show it
            // twice. The count lives on "Open Messages" below, which is where
            // the tickets actually are.
            children: [
              {
                title: "Open Messages",
                titleAr: "فتح الرسائل",
                href: p("/admin/messages"),
                icon: "MessageSquare",
                description: "Messages and support tickets",
                descriptionAr: "الرسائل وتذاكر الدعم",
                badgeKey: "openSupportTickets",
              },
            ],
          },
        ],
      },
    ],

    super_agent: [
      {
        items: [
          {
            title: "Dashboard",
            titleAr: "لوحة التحكم",
            href: p("/super-agent"),
            icon: "LayoutDashboard",
            description: "Overview & key metrics",
            descriptionAr: "نظرة عامة والمقاييس الرئيسية",
          },
          {
            title: "Team",
            titleAr: "الفريق",
            href: p("/super-agent/agents"),
            icon: "Users",
            description: "Manage your agent team",
            descriptionAr: "إدارة فريق الوكلاء",
            children: [
              {
                title: "Agents",
                titleAr: "الوكلاء",
                href: p("/super-agent/agents"),
                icon: "Star",
                description: "Your assigned agents",
                descriptionAr: "الوكلاء المعينون لك",
              },
              {
                title: "Leads",
                titleAr: "العملاء المحتملون",
                href: p("/super-agent/leads"),
                icon: "Target",
                description: "Lead pipeline & follow-ups",
                descriptionAr: "مسار العملاء والمتابعات",
              },
              {
                title: "Employers",
                titleAr: "أصحاب العمل",
                href: p("/super-agent/employers"),
                icon: "Building2",
                description: "Employers in your region",
                descriptionAr: "أصحاب العمل في منطقتك",
              },
              {
                title: "Referral Links",
                titleAr: "روابط الإحالة",
                href: p("/super-agent/referral-links"),
                icon: "Link2",
                description: "Manage all referral links",
                descriptionAr: "إدارة جميع روابط الإحالة",
              },
              {
                title: "Job Seekers",
                titleAr: "الباحثون عن عمل",
                href: p("/super-agent/job-seekers"),
                icon: "UserSearch",
                description: "Regional candidate directory",
                descriptionAr: "دليل المرشحين الإقليمي",
              },
            ],
          },
          {
            title: "Overview",
            titleAr: "نظرة عامة",
            href: p("/super-agent/placements"),
            icon: "BarChart2",
            description: "Performance & finance",
            descriptionAr: "الأداء والمالية",
            children: [
              {
                title: "Jobs",
                titleAr: "الوظائف",
                href: p("/super-agent/jobs"),
                icon: "Briefcase",
                description: "Regional job listings",
                descriptionAr: "قوائم الوظائف الإقليمية",
              },
              {
                title: "Applications",
                titleAr: "الطلبات",
                href: p("/super-agent/applications"),
                icon: "FileText",
                description: "Team application pipeline",
                descriptionAr: "مسار طلبات الفريق",
              },
              {
                title: "Interviews",
                titleAr: "المقابلات",
                href: p("/super-agent/interviews"),
                icon: "Video",
                description: "Team-wide interview tracking",
                descriptionAr: "تتبع مقابلات الفريق",
              },
              {
                title: "Placements",
                titleAr: "التوظيفات",
                href: p("/super-agent/placements"),
                icon: "UserCheck",
                description: "Confirmed hires & placements",
                descriptionAr: "التعيينات المؤكدة",
              },
              {
                title: "Commissions",
                titleAr: "العمولات",
                href: p("/super-agent/commissions"),
                icon: "DollarSign",
                badgeKey: "pendingCommissionApprovals",
                description: "Team commission tracking",
                descriptionAr: "تتبع عمولات الفريق",
              },
              {
                title: "Invoices",
                titleAr: "الفواتير",
                href: p("/super-agent/invoices"),
                icon: "ReceiptText",
                description: "Team invoice tracking",
                descriptionAr: "تتبع فواتير الفريق",
              },
              {
                title: "Market",
                titleAr: "السوق",
                href: p("/super-agent/market"),
                icon: "TrendingUp",
                description: "Market insights & trends",
                descriptionAr: "رؤى واتجاهات السوق",
              },
              {
                title: "Insights",
                titleAr: "الرؤى",
                href: p("/super-agent/insights"),
                icon: "Lightbulb",
                description: "AI alerts & opportunities",
                descriptionAr: "تنبيهات وفرص مدعومة بالذكاء الاصطناعي",
              },
              {
                title: "Reports",
                titleAr: "التقارير",
                href: p("/super-agent/reports"),
                icon: "BarChart2",
                description: "Performance reports",
                descriptionAr: "تقارير الأداء",
              },
              {
                title: "Targets",
                titleAr: "الأهداف",
                href: p("/super-agent/target-management"),
                icon: "Target",
                description: "Unified target profiles & team tracking",
                descriptionAr: "ملفات الأهداف الموحدة وتتبع الفريق",
              },
              {
                title: "Target Report",
                titleAr: "تقرير الأهداف",
                href: p("/super-agent/target-report"),
                icon: "FileText",
                description: "Team target performance report",
                descriptionAr: "تقرير أداء أهداف الفريق",
              },
              {
                title: "Commission Report",
                titleAr: "تقرير العمولات",
                href: p("/super-agent/commissions-report"),
                icon: "BarChart2",
                description: "Override commissions & team earnings report",
                descriptionAr: "تقرير عمولات التجاوز وأرباح الفريق",
              },
              {
                title: "Territory",
                titleAr: "المنطقة",
                href: p("/super-agent/territory"),
                icon: "MapPin",
                description: "Territory visualization",
                descriptionAr: "عرض المنطقة",
              },
            ],
          },
          {
            title: "Exhibition Requests",
            titleAr: "طلبات المعارض",
            href: p("/super-agent/exhibitions"),
            icon: "CalendarDays",
            // The only approval this role performs alone. Without a count it was
            // a menu entry you had to remember to open.
            badgeKey: "pendingExhibitionReviews",
            description: "Review & approve exhibition requests",
            descriptionAr: "مراجعة واعتماد طلبات المعارض",
          },
          {
            title: "Exhibition Analytics",
            titleAr: "تحليلات المعارض",
            href: p("/super-agent/exhibitions/analytics"),
            icon: "BarChart2",
            description: "Team exhibition performance",
            descriptionAr: "أداء معارض الفريق",
          },
          {
            title: "Resource Downloads",
            titleAr: "تحميل الموارد",
            href: p("/super-agent/resources"),
            icon: "FolderOpen",
            description: "Download exhibition resources",
            descriptionAr: "تحميل موارد المعارض",
          },
          {
            title: "Messages",
            titleAr: "الرسائل",
            href: p("/super-agent/messages"),
            icon: "MessageSquare",
            description: "Messages with agents & employers",
            descriptionAr: "الرسائل مع الوكلاء وأصحاب العمل",
          },
        ],
      },
    ],

    // Ten rows, not two parents and a junk drawer. "Tools" held twelve
    // unrelated leaves — CRM, money, performance and daily work behind one word
    // no recruiter uses — and its own href opened Employers, so tapping the
    // category landed on an arbitrary child. The pipeline is now one parent in
    // the order an agent works it, money is its own pair, the four reporting
    // pages are one tabbed destination, and the two things an agent opens every
    // morning (Tasks, Calendar) are top-level rather than three taps down.
    agent: [
      {
        items: [
          {
            title: "Today",
            titleAr: "اليوم",
            href: p("/agent"),
            icon: "LayoutDashboard",
            description: "Your queue, then the numbers",
            descriptionAr: "قائمة عملك، ثم الأرقام",
          },
          {
            title: "Tasks",
            titleAr: "المهام",
            href: p("/agent/tasks"),
            icon: "CheckSquare",
            description: "Follow-ups, calls & to-dos",
            descriptionAr: "المتابعات والمكالمات والمهام",
            badgeKey: "overdueTasks",
          },
          {
            title: "Calendar",
            titleAr: "التقويم",
            href: p("/agent/calendar"),
            icon: "CalendarDays",
            description: "Interviews, task due dates & follow-ups",
            descriptionAr: "المقابلات ومواعيد المهام والمتابعات",
          },
          {
            title: "Pipeline",
            titleAr: "خط العمل",
            href: p("/agent/leads"),
            icon: "Target",
            description: "Lead to placement, in order",
            descriptionAr: "من العميل المحتمل إلى التوظيف",
            children: [
              {
                title: "Leads",
                titleAr: "العملاء المحتملون",
                href: p("/agent/leads"),
                icon: "Target",
                description: "Prospect pipeline & follow-ups",
                descriptionAr: "خط العملاء المحتملين والمتابعات",
                group: "Win the account",
                groupAr: "كسب الحساب",
                badgeKey: "dueFollowUps",
              },
              {
                title: "Employers",
                titleAr: "أصحاب العمل",
                href: p("/agent/employers"),
                icon: "Building2",
                description: "Your assigned company accounts",
                descriptionAr: "حسابات الشركات المسندة إليك",
                group: "Win the account",
                groupAr: "كسب الحساب",
              },
              {
                title: "Jobs",
                titleAr: "الوظائف",
                href: p("/agent/jobs"),
                icon: "Briefcase",
                description: "Vacancies you are filling",
                descriptionAr: "الوظائف التي تعمل على شغلها",
                group: "Fill the vacancy",
                groupAr: "شغل الوظيفة",
              },
              {
                title: "Candidates",
                titleAr: "المرشحون",
                href: p("/agent/candidates"),
                icon: "Users",
                description: "Applications with AI match scores",
                descriptionAr: "الطلبات مع درجات المطابقة",
                group: "Fill the vacancy",
                groupAr: "شغل الوظيفة",
              },
              {
                title: "Job Seekers",
                titleAr: "الباحثون عن عمل",
                href: p("/agent/job-seekers"),
                icon: "UserSearch",
                description: "Browse the candidate database",
                descriptionAr: "تصفح قاعدة بيانات المرشحين",
                group: "Fill the vacancy",
                groupAr: "شغل الوظيفة",
              },
              {
                title: "Interviews",
                titleAr: "المقابلات",
                href: p("/agent/interviews"),
                icon: "Calendar",
                description: "Schedule & record outcomes",
                descriptionAr: "الجدولة وتسجيل النتائج",
                group: "Close the deal",
                groupAr: "إتمام الصفقة",
              },
              {
                title: "Offers",
                titleAr: "العروض",
                href: p("/agent/offers"),
                icon: "Gift",
                description: "Offers out & responses",
                descriptionAr: "العروض المرسلة والردود",
                group: "Close the deal",
                groupAr: "إتمام الصفقة",
              },
              {
                title: "Placements",
                titleAr: "التوظيفات",
                href: p("/agent/placements"),
                icon: "UserCheck",
                description: "Confirmed hires",
                descriptionAr: "التعيينات المؤكدة",
                group: "Close the deal",
                groupAr: "إتمام الصفقة",
              },
            ],
          },
          {
            title: "Earnings",
            titleAr: "الأرباح",
            href: p("/agent/commissions"),
            icon: "DollarSign",
            description: "What you have earned & billed",
            descriptionAr: "ما كسبته وما تمت فوترته",
            children: [
              {
                title: "Commissions",
                titleAr: "العمولات",
                href: p("/agent/commissions"),
                icon: "DollarSign",
                description: "Your earnings by status",
                descriptionAr: "أرباحك حسب الحالة",
              },
              {
                title: "Invoices",
                titleAr: "الفواتير",
                href: p("/agent/invoices"),
                icon: "ReceiptText",
                description: "Invoices raised against your accounts",
                descriptionAr: "الفواتير الصادرة على حساباتك",
              },
            ],
          },
          {
            // Was four sibling destinations — Reports, Targets, Target Report
            // and Commission Report — all reporting on the same agent. One
            // destination now; the other three are tabs on it.
            title: "Performance",
            titleAr: "الأداء",
            href: p("/agent/reports"),
            icon: "BarChart2",
            description: "Activity, targets & commission analytics",
            descriptionAr: "النشاط والأهداف وتحليلات العمولات",
          },
          {
            title: "Messages",
            titleAr: "الرسائل",
            href: p("/agent/messages"),
            icon: "MessageSquare",
            description: "Direct messages & team channels",
            descriptionAr: "الرسائل المباشرة وقنوات الفريق",
            badgeKey: "unreadMessages",
          },
          {
            title: "Referral Links",
            titleAr: "روابط الإحالة",
            href: p("/agent/referral-links"),
            icon: "Link2",
            description: "Share links & track sign-ups",
            descriptionAr: "شارك الروابط وتتبع التسجيلات",
          },
          {
            title: "Exhibition Requests",
            titleAr: "طلبات المعارض",
            href: p("/agent/exhibitions"),
            icon: "Globe",
            description: "Request & track exhibition participation",
            descriptionAr: "طلب وتتبع المشاركة في المعارض",
          },
          {
            title: "Resource Downloads",
            titleAr: "تحميل الموارد",
            href: p("/agent/resources"),
            icon: "BookOpen",
            description: "Brochures, decks & sales material",
            descriptionAr: "الكتيبات والعروض ومواد البيع",
          },
        ],
      },
    ],

    // Six rows, not thirteen. Every page the employer had is still here — the
    // stage pages sit under one Pipeline parent, and the configure-once pages
    // (workflows, matching weights, templates, sequences, billing) moved into
    // Settings, where they are looked for once instead of competing daily with
    // Applications. Messages left the sidebar for the topbar indicator on
    // desktop and the phone tab bar; see MessagesIndicator / bottomNavTabs.
    employer: [
      {
        items: [
          {
            title: "Home",
            titleAr: "الرئيسية",
            href: p("/employer"),
            icon: "LayoutDashboard",
            description: "Today's priorities & pipeline",
            descriptionAr: "أولويات اليوم وخط التوظيف",
          },
          {
            title: "Jobs",
            titleAr: "الوظائف",
            href: p("/employer/jobs"),
            icon: "Briefcase",
            description: "Post, edit and publish roles",
            descriptionAr: "نشر الوظائف وتحريرها",
            children: [
              {
                title: "All Jobs",
                titleAr: "كل الوظائف",
                href: p("/employer/jobs"),
                icon: "Briefcase",
                description: "Live, draft and paused roles",
                descriptionAr: "الوظائف النشطة والمسودات والمتوقفة",
              },
              {
                title: "Job Templates",
                titleAr: "قوالب الوظائف",
                href: p("/employer/job-templates"),
                icon: "LayoutTemplate",
                description: "Reuse a role you posted before",
                descriptionAr: "إعادة استخدام وظيفة نشرتها سابقًا",
              },
              {
                title: "Job Posters",
                titleAr: "ملصقات الوظائف",
                href: p("/employer/my-posters"),
                icon: "Image",
                description: "Shareable graphics for your roles",
                descriptionAr: "تصاميم قابلة للمشاركة لوظائفك",
              },
            ],
          },
          {
            // "Pipeline" named the mechanism; "Hiring" names what the employer
            // is doing. The row opens Applications on click — the stage pages
            // are reached from the tab strip on the section itself, so
            // grouping them costs no extra click.
            title: "Hiring",
            titleAr: "التوظيف",
            href: p("/employer/applications"),
            icon: "FileText",
            description: "Every candidate, applied to hired",
            descriptionAr: "كل مرشح من التقديم حتى التعيين",
            children: [
              {
                title: "Applications",
                titleAr: "الطلبات",
                href: p("/employer/applications"),
                icon: "FileText",
                description: "Review, shortlist and reject",
                descriptionAr: "المراجعة والاختيار والرفض",
              },
              {
                title: "Interviews",
                titleAr: "المقابلات",
                href: p("/employer/interviews"),
                icon: "Calendar",
                description: "Schedule, complete and score",
                descriptionAr: "الجدولة والإكمال والتقييم",
              },
              {
                title: "Offers",
                titleAr: "العروض",
                href: p("/employer/offers"),
                icon: "ScrollText",
                description: "Offers sent and accepted",
                descriptionAr: "العروض المرسلة والمقبولة",
              },
              {
                title: "Placements",
                titleAr: "التعيينات",
                href: p("/employer/placements"),
                icon: "UserCheck",
                description: "Confirmed hires and onboarding",
                descriptionAr: "التعيينات المؤكدة والانضمام",
              },
              {
                title: "Background Checks",
                titleAr: "التحقق من الخلفية",
                href: p("/employer/background-checks"),
                icon: "ShieldCheck",
                description: "Verification before a start date",
                descriptionAr: "التحقق قبل تاريخ المباشرة",
              },
            ],
          },
          {
            title: "Talent",
            titleAr: "المواهب",
            href: p("/employer/candidates"),
            icon: "Users",
            description: "Source candidates before they apply",
            descriptionAr: "ابحث عن مرشحين قبل أن يتقدموا",
            children: [
              {
                title: "Candidates",
                titleAr: "المرشحون",
                href: p("/employer/candidates"),
                icon: "UserSearch",
                description: "Search and score the talent pool",
                descriptionAr: "البحث في قاعدة المرشحين وتقييمهم",
              },
              {
                title: "Talent Pools",
                titleAr: "مجموعات المواهب",
                href: p("/employer/talent-pools"),
                icon: "FolderOpen",
                description: "Saved shortlists you can reuse",
                descriptionAr: "قوائم محفوظة يمكن إعادة استخدامها",
              },
            ],
          },
          {
            title: "Insights",
            titleAr: "التحليلات",
            href: p("/employer/analytics"),
            icon: "BarChart2",
            description: "How your hiring is performing",
            descriptionAr: "أداء عملية التوظيف لديك",
            children: [
              {
                title: "Hiring Analytics",
                titleAr: "تحليلات التوظيف",
                href: p("/employer/analytics"),
                icon: "BarChart2",
                description: "Pipeline, time to hire, offers",
                descriptionAr: "المسار ومدة التعيين والعروض",
              },
              {
                title: "Screening Answers",
                titleAr: "إجابات الفرز",
                href: p("/employer/screening-analytics"),
                icon: "ClipboardList",
                description: "How candidates answer each question",
                descriptionAr: "كيف يجيب المرشحون عن كل سؤال",
              },
            ],
          },
          {
            title: "Settings",
            titleAr: "الإعدادات",
            href: p("/employer/settings"),
            icon: "Settings",
            description: "Company, billing and hiring setup",
            descriptionAr: "الشركة والفوترة وإعداد التوظيف",
            children: [
              {
                title: "Company Profile",
                titleAr: "ملف الشركة",
                href: p("/employer/settings"),
                icon: "Building2",
                description: "Details, verification and notifications",
                descriptionAr: "البيانات والتحقق والإشعارات",
                group: "Company",
                groupAr: "الشركة",
              },
              {
                title: "Team Activity",
                titleAr: "نشاط الفريق",
                href: p("/employer/team/activity-logs"),
                icon: "Activity",
                description: "What your colleagues did",
                descriptionAr: "ما قام به زملاؤك",
                group: "Company",
                groupAr: "الشركة",
              },
              {
                title: "Actions On Your Behalf",
                titleAr: "الإجراءات نيابة عنك",
                href: p("/employer/activity-history"),
                icon: "History",
                description: "What agents and admins did for you",
                descriptionAr: "ما قام به الوكلاء والمسؤولون لحسابك",
                group: "Company",
                groupAr: "الشركة",
              },
              {
                title: "Subscription",
                titleAr: "الاشتراك",
                href: p("/employer/subscription"),
                icon: "Crown",
                description: "Plan, usage and limits",
                descriptionAr: "الخطة والاستخدام والحدود",
                group: "Billing",
                groupAr: "الفوترة",
              },
              {
                title: "Invoices",
                titleAr: "الفواتير",
                href: p("/employer/invoices"),
                icon: "ReceiptText",
                description: "Invoices and payment history",
                descriptionAr: "الفواتير وسجل الدفعات",
                group: "Billing",
                groupAr: "الفوترة",
              },
              {
                title: "Payment Setup",
                titleAr: "إعداد الدفع",
                href: p("/employer/payment-setup"),
                icon: "CreditCard",
                description: "Configure your payment gateway",
                descriptionAr: "إعداد بوابة الدفع",
                group: "Billing",
                groupAr: "الفوترة",
              },
              {
                title: "Hiring Workflows",
                titleAr: "مسارات التوظيف",
                href: p("/employer/workflow"),
                icon: "GitBranch",
                description: "Stages every candidate moves through",
                descriptionAr: "المراحل التي يمر بها كل مرشح",
                group: "Hiring setup",
                groupAr: "إعداد التوظيف",
              },
              {
                title: "AI Matching",
                titleAr: "المطابقة الذكية",
                href: p("/employer/matching-weights"),
                icon: "SlidersHorizontal",
                description: "What the match score weighs",
                descriptionAr: "ما الذي تعتمد عليه درجة التطابق",
                group: "Hiring setup",
                groupAr: "إعداد التوظيف",
              },
              {
                title: "Assessments",
                titleAr: "الاختبارات",
                href: p("/employer/assessments"),
                icon: "ClipboardCheck",
                description: "Skill tests you send to candidates",
                descriptionAr: "اختبارات المهارات التي ترسلها للمرشحين",
                group: "Hiring setup",
                groupAr: "إعداد التوظيف",
              },
              {
                title: "Communication Templates",
                titleAr: "قوالب المراسلة",
                href: p("/employer/comm-templates"),
                icon: "Mail",
                description: "Reusable candidate emails",
                descriptionAr: "رسائل جاهزة للمرشحين",
                group: "Hiring setup",
                groupAr: "إعداد التوظيف",
              },
              {
                title: "Email Sequences",
                titleAr: "سلاسل البريد",
                href: p("/employer/campaigns"),
                icon: "Layers",
                description: "Automated follow-up campaigns",
                descriptionAr: "حملات متابعة تلقائية",
                group: "Hiring setup",
                groupAr: "إعداد التوظيف",
              },
            ],
          },
        ],
      },
    ],

    job_seeker: [
      {
        items: [
          {
            title: "Home",
            titleAr: "الرئيسية",
            href: p("/job-seeker"),
            icon: "LayoutDashboard",
            description: "What needs your attention today",
            descriptionAr: "ما يحتاج إلى انتباهك اليوم",
          },
        ],
      },
      {
        // The four groups below are the four jobs a seeker actually does. They
        // replace a single "My Career" accordion that held seventeen flat
        // children — find, apply, track and build were one bucket, so nothing
        // in it could be found by what the seeker was trying to do.
        label: "Find work",
        labelAr: "ابحث عن عمل",
        items: [
          {
            title: "Jobs",
            titleAr: "الوظائف",
            href: p("/job-seeker/jobs"),
            icon: "Briefcase",
            description: "Search and browse matching jobs",
            descriptionAr: "ابحث وتصفح الوظائف المطابقة",
          },
          {
            title: "Saved Jobs",
            titleAr: "الوظائف المحفوظة",
            href: p("/job-seeker/saved-jobs"),
            icon: "Heart",
            description: "Jobs you bookmarked",
            descriptionAr: "الوظائف التي حفظتها",
          },
          {
            title: "Job Alerts",
            titleAr: "تنبيهات الوظائف",
            href: p("/job-seeker/saved-searches"),
            icon: "Bell",
            description: "Saved searches that notify you",
            descriptionAr: "عمليات البحث المحفوظة التي تنبهك",
          },
          {
            title: "Companies",
            titleAr: "الشركات",
            href: p("/job-seeker/companies"),
            icon: "Building2",
            description: "Explore employers on the platform",
            descriptionAr: "استكشف أصحاب العمل على المنصة",
          },
        ],
      },
      {
        label: "Track progress",
        labelAr: "تابع تقدمك",
        items: [
          {
            title: "Applications",
            titleAr: "طلباتي",
            href: p("/job-seeker/applications"),
            icon: "FileText",
            description: "Track every application you sent",
            descriptionAr: "تتبع كل طلب أرسلته",
          },
          {
            title: "Interviews",
            titleAr: "المقابلات",
            href: p("/job-seeker/interviews"),
            icon: "Calendar",
            badgeKey: "interviewsAwaitingResponse",
            description: "Confirm, decline or reschedule",
            descriptionAr: "التأكيد أو الرفض أو إعادة الجدولة",
          },
          {
            title: "Offers",
            titleAr: "العروض",
            href: p("/job-seeker/offers"),
            icon: "DollarSign",
            badgeKey: "pendingOffers",
            description: "Accept, decline or counter an offer",
            descriptionAr: "قبول أو رفض أو تقديم عرض مقابل",
          },
          {
            // Document signing and probation for a seeker who has been hired —
            // previously reachable only by expanding a placement row.
            title: "Onboarding",
            titleAr: "الانضمام",
            href: p("/job-seeker/onboarding"),
            icon: "ClipboardList",
            description: "Documents and tasks for your new role",
            descriptionAr: "المستندات والمهام لوظيفتك الجديدة",
          },
          {
            title: "Messages",
            titleAr: "الرسائل",
            href: p("/job-seeker/messages"),
            icon: "MessageSquare",
            badgeKey: "unreadMessages",
            description: "Support conversations",
            descriptionAr: "محادثات الدعم",
          },
        ],
      },
      {
        label: "Build your profile",
        labelAr: "ابنِ ملفك",
        items: [
          {
            title: "Profile",
            titleAr: "الملف الشخصي",
            href: p("/job-seeker/profile"),
            icon: "UserCircle",
            description: "Your profile and completeness",
            descriptionAr: "ملفك الشخصي ومدى اكتماله",
          },
          {
            title: "CV Builder",
            titleAr: "بناء السيرة الذاتية",
            href: p("/job-seeker/cv"),
            icon: "FileText",
            description: "Build and download your CV",
            descriptionAr: "بناء وتحميل سيرتك الذاتية",
          },
          {
            title: "Skills",
            titleAr: "المهارات",
            href: p("/job-seeker/skills"),
            icon: "Wrench",
            description: "Manage and verify your skills",
            descriptionAr: "إدارة مهاراتك والتحقق منها",
          },
          {
            title: "Documents",
            titleAr: "المستندات",
            href: p("/job-seeker/documents"),
            icon: "FolderOpen",
            description: "Certificates and supporting files",
            descriptionAr: "الشهادات والملفات الداعمة",
          },
          {
            title: "Portfolio",
            titleAr: "الأعمال",
            href: p("/job-seeker/portfolio"),
            icon: "FolderOpen",
            description: "Showcase your projects and work",
            descriptionAr: "اعرض مشاريعك وأعمالك",
          },
          {
            title: "Personal Details",
            titleAr: "البيانات الشخصية",
            href: p("/job-seeker/profile/personal-details"),
            icon: "UserCircle",
            description: "Gender, date of birth, address and languages",
            descriptionAr: "الجنس، تاريخ الميلاد، العنوان واللغات",
          },
          {
            title: "Job Preferences",
            titleAr: "تفضيلات الوظيفة",
            href: p("/job-seeker/preferences"),
            icon: "Target",
            description: "What you want matched to you",
            descriptionAr: "ما تريد أن يتم مطابقته معك",
          },
          {
            title: "Courses",
            titleAr: "الدورات",
            href: p("/job-seeker/courses"),
            icon: "BookOpen",
            description: "Learning and certification",
            descriptionAr: "التعلم والشهادات",
          },
        ],
      },
      {
        label: "Grow and account",
        labelAr: "النمو والحساب",
        items: [
          {
            title: "Profile Views",
            titleAr: "من شاهد ملفك",
            href: p("/job-seeker/profile-views"),
            icon: "Eye",
            description: "See who viewed your profile",
            descriptionAr: "عرض من شاهد ملفك الشخصي",
          },
          {
            title: "Profile Boost",
            titleAr: "تعزيز الملف الشخصي",
            href: p("/job-seeker/profile-boost"),
            icon: "TrendingUp",
            description: "Get noticed by more recruiters",
            descriptionAr: "اجعل ملفك أكثر ظهورًا للمسؤولين عن التوظيف",
          },
          {
            title: "Referral Program",
            titleAr: "برنامج الإحالة",
            href: p("/job-seeker/referral"),
            icon: "Gift",
            description: "Invite friends and earn rewards",
            descriptionAr: "ادعُ أصدقاءك واكسب مكافآت",
          },
          {
            title: "My Subscription",
            titleAr: "اشتراكي",
            href: p("/job-seeker/subscription"),
            icon: "Crown",
            description: "Plan, usage and invoices",
            descriptionAr: "الخطة والاستخدام والفواتير",
          },
          {
            title: "Settings",
            titleAr: "الإعدادات",
            href: p("/job-seeker/settings"),
            icon: "Settings",
            description: "Account preferences",
            descriptionAr: "تفضيلات الحساب",
          },
        ],
      },
    ],
  };
}

export function getNavGroups(role: UserRole, locale = "en"): NavGroup[] {
  return buildNav(locale)[role] ?? [];
}

/** Flat items for CommandMenu */
export function getAllNavItems(role: UserRole, locale = "en"): NavItem[] {
  const groups = getNavGroups(role, locale);
  return groups.flatMap((g) =>
    g.items.flatMap((item) => [item, ...(item.children ?? [])])
  );
}
