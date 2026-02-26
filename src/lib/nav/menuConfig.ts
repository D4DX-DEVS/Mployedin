import type { UserRole } from "@/models/User";
import {
  LayoutDashboard,
  Briefcase,
  Users,
  UserCheck,
  FileText,
  Calendar,
  TrendingUp,
  Settings,
  Shield,
  Map,
  Bell,
  BarChart2,
  ClipboardList,
  Palette,
  Target,
  DollarSign,
  MessageSquare,
  BookOpen,
  Star,
} from "lucide-react";

export interface NavItem {
  title: string;
  titleAr: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
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
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "Recruitment",
        labelAr: "التوظيف",
        items: [
          {
            title: "Jobs",
            titleAr: "الوظائف",
            href: p("/admin/jobs"),
            icon: Briefcase,
          },
          {
            title: "Applications",
            titleAr: "الطلبات",
            href: p("/admin/applications"),
            icon: FileText,
          },
          {
            title: "Interviews",
            titleAr: "المقابلات",
            href: p("/admin/interviews"),
            icon: Calendar,
          },
          {
            title: "Placements",
            titleAr: "التوظيفات",
            href: p("/admin/placements"),
            icon: UserCheck,
          },
        ],
      },
      {
        label: "People",
        labelAr: "الأشخاص",
        items: [
          {
            title: "Employers",
            titleAr: "أصحاب العمل",
            href: p("/admin/employers"),
            icon: Briefcase,
          },
          {
            title: "Job Seekers",
            titleAr: "الباحثون عن عمل",
            href: p("/admin/job-seekers"),
            icon: Users,
          },
          {
            title: "Agents",
            titleAr: "الوكلاء",
            href: p("/admin/agents"),
            icon: Star,
          },
          {
            title: "Super Agents",
            titleAr: "الوكلاء الكبار",
            href: p("/admin/super-agents"),
            icon: Shield,
          },
          {
            title: "Users",
            titleAr: "المستخدمون",
            href: p("/admin/users"),
            icon: Users,
          },
        ],
      },
      {
        label: "Finance",
        labelAr: "المالية",
        items: [
          {
            title: "Commissions",
            titleAr: "العمولات",
            href: p("/admin/commissions"),
            icon: DollarSign,
          },
        ],
      },
      {
        label: "System",
        labelAr: "النظام",
        items: [
          {
            title: "Territories",
            titleAr: "المناطق",
            href: p("/admin/territories"),
            icon: Map,
          },
          {
            title: "Reports",
            titleAr: "التقارير",
            href: p("/admin/reports"),
            icon: BarChart2,
          },
          {
            title: "Audit Logs",
            titleAr: "سجلات التدقيق",
            href: p("/admin/audit"),
            icon: ClipboardList,
          },
          {
            title: "Task Board",
            titleAr: "لوحة المهام",
            href: p("/admin/tasks"),
            icon: ClipboardList,
          },
          {
            title: "Design System",
            titleAr: "نظام التصميم",
            href: p("/admin/design-system"),
            icon: Palette,
          },
          {
            title: "Settings",
            titleAr: "الإعدادات",
            href: p("/admin/settings"),
            icon: Settings,
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
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "Team",
        labelAr: "الفريق",
        items: [
          {
            title: "Agents",
            titleAr: "الوكلاء",
            href: p("/super-agent/agents"),
            icon: Star,
          },
          {
            title: "Leads",
            titleAr: "العملاء المحتملون",
            href: p("/super-agent/leads"),
            icon: Target,
          },
        ],
      },
      {
        label: "Overview",
        labelAr: "نظرة عامة",
        items: [
          {
            title: "Placements",
            titleAr: "التوظيفات",
            href: p("/super-agent/placements"),
            icon: UserCheck,
          },
          {
            title: "Commissions",
            titleAr: "العمولات",
            href: p("/super-agent/commissions"),
            icon: DollarSign,
          },
          {
            title: "Reports",
            titleAr: "التقارير",
            href: p("/super-agent/reports"),
            icon: BarChart2,
          },
        ],
      },
    ],

    agent: [
      {
        items: [
          {
            title: "Dashboard",
            titleAr: "لوحة التحكم",
            href: p("/agent"),
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "Work",
        labelAr: "العمل",
        items: [
          {
            title: "Employers",
            titleAr: "أصحاب العمل",
            href: p("/agent/employers"),
            icon: Briefcase,
          },
          {
            title: "Job Seekers",
            titleAr: "الباحثون عن عمل",
            href: p("/agent/job-seekers"),
            icon: Users,
          },
          {
            title: "Leads",
            titleAr: "العملاء المحتملون",
            href: p("/agent/leads"),
            icon: Target,
          },
          {
            title: "Interviews",
            titleAr: "المقابلات",
            href: p("/agent/interviews"),
            icon: Calendar,
          },
          {
            title: "Placements",
            titleAr: "التوظيفات",
            href: p("/agent/placements"),
            icon: UserCheck,
          },
        ],
      },
    ],

    employer: [
      {
        items: [
          {
            title: "Dashboard",
            titleAr: "لوحة التحكم",
            href: p("/employer"),
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "Hiring",
        labelAr: "التوظيف",
        items: [
          {
            title: "Jobs",
            titleAr: "الوظائف",
            href: p("/employer/jobs"),
            icon: Briefcase,
          },
          {
            title: "Applications",
            titleAr: "الطلبات",
            href: p("/employer/applications"),
            icon: FileText,
          },
          {
            title: "Interviews",
            titleAr: "المقابلات",
            href: p("/employer/interviews"),
            icon: Calendar,
          },
        ],
      },
    ],

    job_seeker: [
      {
        items: [
          {
            title: "Dashboard",
            titleAr: "لوحة التحكم",
            href: p("/job-seeker"),
            icon: LayoutDashboard,
          },
        ],
      },
      {
        label: "My Career",
        labelAr: "مسيرتي المهنية",
        items: [
          {
            title: "Profile",
            titleAr: "الملف الشخصي",
            href: p("/job-seeker/profile"),
            icon: Users,
          },
          {
            title: "Job Search",
            titleAr: "البحث عن وظيفة",
            href: p("/job-seeker/jobs"),
            icon: Briefcase,
          },
          {
            title: "Applications",
            titleAr: "طلباتي",
            href: p("/job-seeker/applications"),
            icon: FileText,
          },
          {
            title: "Interviews",
            titleAr: "مقابلاتي",
            href: p("/job-seeker/interviews"),
            icon: Calendar,
          },
          {
            title: "CV Builder",
            titleAr: "بناء السيرة الذاتية",
            href: p("/job-seeker/cv"),
            icon: FileText,
          },
          {
            title: "Courses",
            titleAr: "الدورات",
            href: p("/job-seeker/courses"),
            icon: BookOpen,
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
