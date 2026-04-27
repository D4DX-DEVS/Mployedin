/**
 * Add missing translation keys for shared components, auth pages, and public pages.
 * Run: node scripts/add-missing-translations.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const enPath = path.join(root, "messages", "en.json");
const arPath = path.join(root, "messages", "ar.json");

const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
const ar = JSON.parse(fs.readFileSync(arPath, "utf-8"));

// ── Auth keys ──
const authNew = {
  welcomeBack: "Welcome back",
  enterCredentials: "Please enter your credentials to access your account.",
  emailAddress: "Email address",
  emailPlaceholder: "name@example.com",
  forgotPasswordLink: "Forgot password?",
  rememberEmail: "Remember my email",
  orContinueWith: "or continue with",
  googleSignInFailed: "Google sign-in failed. Please try again.",
  somethingWentWrong: "Something went wrong. Please try again.",
  createAccount: "Create account",
  postJobsAsEmployer: "Post jobs as employer",
  showPassword: "Show password",
  hidePassword: "Hide password",
  signingIn: "Signing in...",
  oauthAccountNotLinked: "This email is already registered with a different sign-in method. Please use your original sign-in method.",
};
const authNewAr = {
  welcomeBack: "مرحبًا بعودتك",
  enterCredentials: "يرجى إدخال بيانات الاعتماد الخاصة بك للوصول إلى حسابك.",
  emailAddress: "عنوان البريد الإلكتروني",
  emailPlaceholder: "name@example.com",
  forgotPasswordLink: "نسيت كلمة المرور؟",
  rememberEmail: "تذكر بريدي الإلكتروني",
  orContinueWith: "أو المتابعة عبر",
  googleSignInFailed: "فشل تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.",
  somethingWentWrong: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
  createAccount: "إنشاء حساب",
  postJobsAsEmployer: "نشر وظائف كصاحب عمل",
  showPassword: "إظهار كلمة المرور",
  hidePassword: "إخفاء كلمة المرور",
  signingIn: "جارٍ تسجيل الدخول...",
  oauthAccountNotLinked: "هذا البريد الإلكتروني مسجل بالفعل بطريقة تسجيل دخول مختلفة. يرجى استخدام طريقة التسجيل الأصلية.",
};
Object.assign(en.auth, authNew);
Object.assign(ar.auth, authNewAr);

// ── Landing / public page keys ──
const landingNew = {
  home: en.landing.home || "Home",
  blog: en.landing.blog || "Blog",
  faqTitle: "FAQ",
  contactTitle: en.landing.contactTitle || "Contact Us",
  getStartedBtn: "Get Started",
  cookiePolicy: en.landing.cookiePolicy || "Cookie Policy",
};
const landingNewAr = {
  home: ar.landing?.home || "الرئيسية",
  blog: ar.landing?.blog || "المدونة",
  faqTitle: "الأسئلة الشائعة",
  contactTitle: ar.landing?.contactTitle || "اتصل بنا",
  getStartedBtn: "ابدأ الآن",
  cookiePolicy: ar.landing?.cookiePolicy || "سياسة ملفات تعريف الارتباط",
};
Object.assign(en.landing, landingNew);
Object.assign(ar.landing, landingNewAr);

// ── Common keys (shared UI) ──
const commonNew = {
  notifications: "Notifications",
  markAllRead: "Mark all read",
  noUnreadNotifications: "No unread notifications",
  tryAgain: "Try Again",
  somethingWentWrong: "Something went wrong",
  noResultsFound: "No results found.",
  switchToArabic: "العربية",
  switchToEnglish: "English",
};
const commonNewAr = {
  notifications: "الإشعارات",
  markAllRead: "تحديد الكل كمقروء",
  noUnreadNotifications: "لا توجد إشعارات غير مقروءة",
  tryAgain: "حاول مرة أخرى",
  somethingWentWrong: "حدث خطأ ما",
  noResultsFound: "لم يتم العثور على نتائج.",
  switchToArabic: "العربية",
  switchToEnglish: "English",
};
if (!en.common) en.common = {};
if (!ar.common) ar.common = {};
Object.assign(en.common, commonNew);
Object.assign(ar.common, commonNewAr);

// Write back
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + "\n", "utf-8");
fs.writeFileSync(arPath, JSON.stringify(ar, null, 2) + "\n", "utf-8");
console.log("✅ Added missing translation keys to en.json and ar.json");
