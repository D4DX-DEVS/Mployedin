// Add missing translation keys for footer, profile dropdown, maintenance, public pages
// Then rewrite components to use useTranslations
// Run: node _rewrite_remaining_i18n.js

const fs = require("fs");
const path = require("path");

const messagesDir = path.join(__dirname, "messages");
const srcBase = path.join(__dirname, "src");

// ── Load current messages ──
const en = JSON.parse(fs.readFileSync(path.join(messagesDir, "en.json"), "utf-8"));
const ar = JSON.parse(fs.readFileSync(path.join(messagesDir, "ar.json"), "utf-8"));

// ── Add missing keys ──

// Footer namespace
if (!en.footer) en.footer = {};
if (!ar.footer) ar.footer = {};

const footerKeys = {
  digitalPlatform: { en: "Digital hiring platform", ar: "منصة توظيف رقمية" },
  description: {
    en: "MPLOYEDIN brings job discovery, AI matching, and employer workflows into one cleaner hiring experience for Gulf markets.",
    ar: "مبلويدين تربط فرق التوظيف والمواهب ببحث أسرع، مطابقة أذكى، وتجربة توظيف أكثر وضوحًا عبر أسواق الخليج."
  },
  aiMatching: { en: "AI-powered matching", ar: "مطابقة مدعومة بالذكاء الاصطناعي" },
  fasterScreening: { en: "Faster candidate screening", ar: "فرز أسرع للمرشحين" },
  smarterHiring: { en: "Smarter Gulf hiring", ar: "توظيف خليجي أكثر ذكاءً" },
  browseJobs: { en: "Browse jobs", ar: "تصفح الوظائف" },
  forEmployers: { en: "For employers", ar: "لأصحاب العمل" },
  followUs: { en: "Follow us", ar: "تابعنا" },
  allRights: { en: "All rights reserved.", ar: "جميع الحقوق محفوظة." },
  platform: { en: "Platform", ar: "المنصة" },
  discoverJobs: { en: "Discover jobs", ar: "اكتشف الوظائف" },
  buildProfile: { en: "Build your profile", ar: "أنشئ ملفك" },
  hiringSolutions: { en: "Hiring solutions", ar: "حلول التوظيف" },
  workspaceLogin: { en: "Workspace login", ar: "مساحة العمل" },
  resources: { en: "Resources", ar: "الموارد" },
  blogLink: { en: "Blog", ar: "المدونة" },
  faqLink: { en: "FAQ", ar: "الأسئلة الشائعة" },
  talkToUs: { en: "Talk to us", ar: "تحدث معنا" },
  company: { en: "Company", ar: "الشركة" },
  privacy: { en: "Privacy", ar: "الخصوصية" },
  cookies: { en: "Cookies", ar: "الكوكيز" },
  support: { en: "Support", ar: "الدعم" },
  homepage: { en: "Homepage", ar: "الصفحة الرئيسية" },
};

for (const [key, val] of Object.entries(footerKeys)) {
  en.footer[key] = val.en;
  ar.footer[key] = val.ar;
}

// Profile dropdown namespace
if (!en.profileDropdown) en.profileDropdown = {};
if (!ar.profileDropdown) ar.profileDropdown = {};

const profileKeys = {
  role: { en: "Role", ar: "الدور" },
  lastLogin: { en: "Last Login", ar: "آخر تسجيل دخول" },
  notAvailable: { en: "N/A", ar: "غير متوفر" },
  settings: { en: "Settings", ar: "الإعدادات" },
  resetPassword: { en: "Reset Password", ar: "إعادة تعيين كلمة المرور" },
  logout: { en: "Logout", ar: "تسجيل الخروج" },
  logOut: { en: "Log Out", ar: "تسجيل الخروج" },
  logoutConfirm: { en: "Are you sure you want to log out of your account?", ar: "هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  loggingOut: { en: "Logging out...", ar: "جاري الخروج..." },
  resetTitle: { en: "Reset Password", ar: "إعادة تعيين كلمة المرور" },
  resetDescription: { en: "A password reset link will be sent to your email address", ar: "سيتم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني" },
  resetSuccess: { en: "Reset link sent! Check your email.", ar: "تم إرسال رابط إعادة التعيين! تحقق من بريدك الإلكتروني." },
  resetError: { en: "Something went wrong. Please try again.", ar: "حدث خطأ. حاول مرة أخرى." },
  close: { en: "Close", ar: "إغلاق" },
  sending: { en: "Sending...", ar: "جاري الإرسال..." },
  sendResetLink: { en: "Send Reset Link", ar: "إرسال رابط إعادة التعيين" },
  admin: { en: "Admin", ar: "مدير" },
  superAgent: { en: "Super Agent", ar: "وكيل كبير" },
  agent: { en: "Agent", ar: "وكيل" },
  employer: { en: "Employer", ar: "صاحب عمل" },
  jobSeeker: { en: "Job Seeker", ar: "باحث عن عمل" },
};

for (const [key, val] of Object.entries(profileKeys)) {
  en.profileDropdown[key] = val.en;
  ar.profileDropdown[key] = val.ar;
}

// Maintenance namespace
if (!en.maintenance) en.maintenance = {};
if (!ar.maintenance) ar.maintenance = {};

const maintenanceKeys = {
  title: { en: "Under Maintenance", ar: "الموقع تحت الصيانة" },
  adminSignIn: { en: "Admin Sign In", ar: "تسجيل دخول المسؤول" },
};

for (const [key, val] of Object.entries(maintenanceKeys)) {
  en.maintenance[key] = val.en;
  ar.maintenance[key] = val.ar;
}

// Public pages keys - add to landing namespace
const landingExtra = {
  privacyTitle: { en: "Privacy Policy", ar: "سياسة الخصوصية" },
  cookiesTitle: { en: "Cookie Policy", ar: "سياسة ملفات تعريف الارتباط" },
  blogTitle: { en: "Blog – Gulf Recruitment Insights", ar: "مدونة MPLOYEDIN — رؤى سوق العمل الخليجي" },
  faqPageTitle: { en: "FAQ – Frequently Asked Questions", ar: "الأسئلة الشائعة" },
  contactPageTitle: { en: "Contact Us", ar: "تواصل معنا" },
  contentLoading: { en: "Loading...", ar: "جاري التحميل..." },
  readMore: { en: "Read more", ar: "اقرأ المزيد" },
  publishedOn: { en: "Published on", ar: "نُشر في" },
  share: { en: "Share", ar: "مشاركة" },
  relatedPosts: { en: "Related Posts", ar: "مقالات ذات صلة" },
  minRead: { en: "min read", ar: "دقيقة قراءة" },
  noPosts: { en: "No posts found", ar: "لم يتم العثور على مقالات" },
};

for (const [key, val] of Object.entries(landingExtra)) {
  if (!en.landing[key]) en.landing[key] = val.en;
  if (!ar.landing[key]) ar.landing[key] = val.ar;
}

// Register page keys
const registerKeys = {
  createYourAccount: { en: "Create your account", ar: "أنشئ حسابك" },
  startYourJourney: { en: "Start your journey with Mployedin", ar: "ابدأ رحلتك مع مبلويدين" },
  fullName: { en: "Full Name", ar: "الاسم الكامل" },
  fullNamePlaceholder: { en: "Enter your full name", ar: "أدخل اسمك الكامل" },
  confirmPassword: { en: "Confirm Password", ar: "تأكيد كلمة المرور" },
  confirmPasswordPlaceholder: { en: "Re-enter your password", ar: "أعد إدخال كلمة المرور" },
  agreeToTerms: { en: "I agree to the", ar: "أوافق على" },
  termsOfService: { en: "Terms of Service", ar: "شروط الخدمة" },
  and: { en: "and", ar: "و" },
  creatingAccount: { en: "Creating account...", ar: "جاري إنشاء الحساب..." },
  passwordsDoNotMatch: { en: "Passwords do not match", ar: "كلمات المرور غير متطابقة" },
  registrationFailed: { en: "Registration failed. Please try again.", ar: "فشل التسجيل. حاول مرة أخرى." },
};

for (const [key, val] of Object.entries(registerKeys)) {
  if (!en.auth[key]) en.auth[key] = val.en;
  if (!ar.auth[key]) ar.auth[key] = val.ar;
}

// ── Save updated messages ──
fs.writeFileSync(path.join(messagesDir, "en.json"), JSON.stringify(en, null, 2) + "\n", "utf-8");
fs.writeFileSync(path.join(messagesDir, "ar.json"), JSON.stringify(ar, null, 2) + "\n", "utf-8");
console.log("✅ Messages updated (en.json + ar.json)");

// ── Rewrite components ──

const writes = {};

// ─── PublicFooter.tsx ───
writes["components/shared/PublicFooter.tsx"] = `"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, Mail, MapPin } from "lucide-react";

type FooterVariant = "full" | "embedded";

interface PublicFooterProps {
  locale: string;
  variant?: FooterVariant;
}

type FooterLink = {
  href: string;
  label: string;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const WHATSAPP_URL = "https://whatsapp.com/channel/0029VaiIpxg2ER6cM4IX4D41";
const INSTAGRAM_URL = "https://www.instagram.com/mployedin_jobs?igsh=MTE1MzJob3p5ZDFhMA==";
const COMPANY_ADDRESS = "MPLOYEDIN UK LTD, X2 Greenleaf Walk, Southall, UB1 1FR";
const SUPPORT_EMAIL = "support@mployedin.com";

type SocialIconProps = {
  className?: string;
};

function WhatsAppIcon({ className }: SocialIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19.05 4.94A9.9 9.9 0 0 0 12 2a9.93 9.93 0 0 0-8.62 14.9L2 22l5.24-1.37A10 10 0 0 0 12 22a9.93 9.93 0 0 0 7.05-17.06ZM12 20.17a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.11.81.83-3.03-.2-.31A8.1 8.1 0 1 1 12 20.17Zm4.44-6.05c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.94-1.2 7.3 7.3 0 0 1-1.34-1.67c-.14-.24-.02-.37.1-.5.1-.1.24-.26.36-.39.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.79-.2-.47-.4-.41-.54-.42h-.46a.9.9 0 0 0-.66.3c-.22.24-.86.84-.86 2.05 0 1.2.88 2.37 1 2.53.12.16 1.73 2.64 4.18 3.7.58.26 1.04.41 1.4.53.59.18 1.13.15 1.56.09.47-.07 1.4-.57 1.6-1.13.2-.56.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28Z" />
    </svg>
  );
}

function InstagramIcon({ className }: SocialIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.25" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.35" cy="6.65" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function PublicFooter({ locale, variant = "full" }: PublicFooterProps) {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  const isEmbedded = variant === "embedded";

  const platformSection: FooterSection = {
    title: t("platform"),
    links: [
      { href: \`/\${locale}/jobs\`, label: t("discoverJobs") },
      { href: \`/\${locale}/register\`, label: t("buildProfile") },
      { href: \`/\${locale}/employer-register\`, label: t("hiringSolutions") },
      { href: \`/\${locale}/login\`, label: t("workspaceLogin") },
    ],
  };

  const resourcesSection: FooterSection = {
    title: t("resources"),
    links: [
      { href: \`/\${locale}/blog\`, label: t("blogLink") },
      { href: \`/\${locale}/faq\`, label: t("faqLink") },
      { href: \`/\${locale}/contact\`, label: t("talkToUs") },
    ],
  };

  const companySection: FooterSection = {
    title: t("company"),
    links: [
      { href: \`/\${locale}/privacy\`, label: t("privacy") },
      { href: \`/\${locale}/cookies\`, label: t("cookies") },
      { href: \`/\${locale}/contact\`, label: t("support") },
      { href: \`/\${locale}\`, label: t("homepage") },
    ],
  };

  const linkSections = isEmbedded
    ? [platformSection, companySection]
    : [platformSection, resourcesSection, companySection];

  const platformHighlights = [
    t("aiMatching"),
    t("fasterScreening"),
    t("smarterHiring"),
  ];

  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[hsl(var(--brand-blue-dark))] text-white"
    >
      <div className={\`container mx-auto px-4 sm:px-6 \${isEmbedded ? "py-6" : "py-8 lg:py-10"}\`}>
        <div className={\`grid gap-10 \${isEmbedded ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"}\`}>
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55">
                {t("digitalPlatform")}
              </p>
              <Image src="/logo.png" alt="Mployedin" width={156} height={42} className="mt-3 h-10 w-auto object-contain brightness-0 invert" style={{ width: "auto" }} />
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/72 sm:text-[15px]">
                {t("description")}
              </p>
            </div>

            {!isEmbedded && (
              <ul className="flex flex-wrap gap-2" role="list">
                {platformHighlights.map((highlight) => (
                  <li
                    key={highlight}
                    className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/78"
                  >
                    {highlight}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={\`/\${locale}/jobs\`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[hsl(var(--brand-blue-dark))] transition-transform hover:-translate-y-0.5"
              >
                {t("browseJobs")}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!isEmbedded && (
                <Link
                  href={\`/\${locale}/employer-register\`}
                  className="inline-flex h-10 items-center rounded-full border border-white/18 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  {t("forEmployers")}
                </Link>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <div className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                <p className="text-sm leading-6 text-white/74">
                  {COMPANY_ADDRESS}
                </p>
              </div>
              <div className="flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-white/80" />
                <a
                  href={\`mailto:\${SUPPORT_EMAIL}\`}
                  className="min-w-0 text-sm leading-6 text-white/74 transition-colors [overflow-wrap:anywhere] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span id={\`footer-social-\${locale}-\${variant}\`} className="text-sm font-medium text-white/78">
                {t("followUs")}
              </span>
              <nav aria-labelledby={\`footer-social-\${locale}-\${variant}\`} className="flex items-center gap-3">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(37,211,102,0.38)] bg-white/[0.04] text-[#25D366] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(37,211,102,0.6)] hover:bg-[rgba(37,211,102,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <WhatsAppIcon className="h-5 w-5" />
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(247,119,55,0.34)] bg-white/[0.04] text-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(247,119,55,0.6)] hover:bg-[linear-gradient(135deg,rgba(64,93,230,0.12),rgba(225,48,108,0.16),rgba(252,176,69,0.18))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
              </nav>
            </div>
          </div>

          <div className={\`grid gap-8 \${isEmbedded ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"}\`}>
            {linkSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-white/58">{section.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {section.links.map((link) => (
                    <li key={\`\${section.title}-\${link.href}\`}>
                      <Link href={link.href} className="text-sm leading-6 text-white/72 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-4 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} MPLOYEDIN. {t("allRights")}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href={\`/\${locale}/privacy\`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("privacy")}
            </Link>
            <Link href={\`/\${locale}/cookies\`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("cookies")}
            </Link>
            <Link href={\`/\${locale}/contact\`} className="transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t("support")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
`;

// ─── UserProfileDropdown.tsx ───
writes["components/shared/UserProfileDropdown.tsx"] = `"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LogOut,
  KeyRound,
  User as UserIcon,
  Shield,
  Clock,
  Settings,
  Mail,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ROLE_KEYS: Record<string, string> = {
  admin: "admin",
  super_agent: "superAgent",
  agent: "agent",
  employer: "employer",
  job_seeker: "jobSeeker",
};

interface UserProfileDropdownProps {
  userName: string;
  userEmail: string;
  userRole: string;
  lastLogin?: string;
  locale: string;
  companyLogo?: string;
}

export function UserProfileDropdown({
  userName,
  userEmail,
  userRole,
  lastLogin,
  locale,
  companyLogo,
}: UserProfileDropdownProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<"idle" | "success" | "error">("idle");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: session } = useSession();
  const userImage = session?.user?.image;
  const router = useRouter();
  const t = useTranslations("profileDropdown");
  const isAr = locale === "ar";

  const roleKey = ROLE_KEYS[userRole] ?? userRole;

  const formatLastLogin = useCallback(
    (dateStr?: string) => {
      if (!dateStr) return t("notAvailable");
      const d = new Date(dateStr);
      return d.toLocaleDateString(isAr ? "ar-AE" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [isAr, t]
  );

  const handleResetPassword = async () => {
    setLoading(true);
    setResetStatus("idle");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      if (res.ok) {
        setResetStatus("success");
      } else {
        setResetStatus("error");
      }
    } catch {
      setResetStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await Promise.race([
        signOut({ redirect: false }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {
      // Even if signOut fails, navigate to login
    } finally {
      window.location.href = \`/\${locale}/login\`;
    }
  };

  const initials = userName
    ? userName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "U";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-9 w-9 items-center justify-center rounded-full brand-gradient text-white text-sm font-semibold shrink-0 shadow-soft ring-2 ring-background cursor-pointer hover:ring-primary/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden">
            {companyLogo ? (
              <Image src={companyLogo} alt="Company logo" width={36} height={36} className="w-full h-full object-contain" unoptimized />
            ) : userImage ? (
              <Image src={userImage} alt={userName} width={36} height={36} className="w-full h-full object-cover" unoptimized />
            ) : (
              initials
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-72 bg-background z-50 shadow-xl border border-border/60 rounded-xl overflow-hidden p-1"
          sideOffset={8}
        >
          <DropdownMenuLabel className="font-normal">
            <button
              type="button"
              onClick={() => {
                const profilePath = userRole === "job_seeker" ? \`/\${locale}/job-seeker/profile\` : userRole === "employer" ? \`/\${locale}/employer/profile\` : null;
                if (profilePath) router.push(profilePath);
              }}
              className="flex items-start gap-3 py-1 w-full text-left hover:opacity-80 transition-opacity cursor-pointer"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full brand-gradient text-white text-sm font-semibold shrink-0 overflow-hidden">
                {companyLogo ? (
                  <Image src={companyLogo} alt="Company logo" width={40} height={40} className="w-full h-full object-contain" unoptimized />
                ) : userImage ? (
                  <Image src={userImage} alt={userName} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                ) : (
                  initials
                )}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-sm font-semibold leading-none truncate">
                  {userName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {userEmail}
                </p>
              </div>
            </button>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{t("role")}</span>
              <span className="ml-auto inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {t(roleKey)}
              </span>
            </div>
          </div>

          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{t("lastLogin")}</span>
              <span className="ml-auto text-xs">
                {formatLastLogin(lastLogin)}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {(userRole === "job_seeker" || userRole === "employer" || userRole === "super_agent" || userRole === "agent") && (
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
              onSelect={() => {
                const pathMap: Record<string, string> = {
                  job_seeker: \`/\${locale}/job-seeker/settings\`,
                  employer: \`/\${locale}/employer/settings\`,
                  super_agent: \`/\${locale}/super-agent/settings\`,
                  agent: \`/\${locale}/agent/settings\`,
                };
                router.push(pathMap[userRole] ?? \`/\${locale}/settings\`);
              }}
            >
              <Settings className="h-4 w-4" />
              <span className="font-medium text-sm">{t("settings")}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
            onSelect={() => { setResetOpen(true); setResetStatus("idle"); }}
          >
            <KeyRound className="h-4 w-4" />
            <span className="font-medium text-sm">{t("resetPassword")}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 rounded-md transition-colors"
            onSelect={() => setLogoutOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            <span className="font-medium text-sm">{t("logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Logout Confirmation Dialog */}
      <Dialog open={logoutOpen} onOpenChange={(open) => { if (!loggingOut) setLogoutOpen(open); }}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => { if (loggingOut) e.preventDefault(); }}>
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div className="pt-0.5">
                <DialogTitle>{t("logOut")}</DialogTitle>
                <DialogDescription className="mt-1">
                  {t("logoutConfirm")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLogoutOpen(false)}
              disabled={loggingOut}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("loggingOut")}
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  {t("logOut")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("resetTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("resetDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-foreground truncate">{userEmail}</p>
            </div>

            {resetStatus === "success" && (
              <p className="text-sm text-green-600">
                {t("resetSuccess")}
              </p>
            )}
            {resetStatus === "error" && (
              <p className="text-sm text-destructive">
                {t("resetError")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={loading}
            >
              {resetStatus === "success" ? t("close") : t("cancel")}
            </Button>
            {resetStatus !== "success" && (
              <Button onClick={handleResetPassword} disabled={loading}>
                {loading ? t("sending") : t("sendResetLink")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
`;

// ─── Maintenance page ───
writes["app/[locale]/maintenance/page.tsx"] = null; // read first

for (const [relPath, content] of Object.entries(writes)) {
  if (content === null) continue;
  const fullPath = path.join(srcBase, relPath);
  fs.writeFileSync(fullPath, content, "utf-8");
  console.log("OK " + relPath);
}

console.log("\nDone! Footer + UserProfileDropdown rewritten with useTranslations.");
