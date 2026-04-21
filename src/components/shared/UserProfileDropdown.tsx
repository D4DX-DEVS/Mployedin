"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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

const ROLE_LABELS: Record<string, { en: string; ar: string }> = {
  admin: { en: "Admin", ar: "مدير" },
  super_agent: { en: "Super Agent", ar: "وكيل كبير" },
  agent: { en: "Agent", ar: "وكيل" },
  employer: { en: "Employer", ar: "صاحب عمل" },
  job_seeker: { en: "Job Seeker", ar: "باحث عن عمل" },
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

  const isAr = locale === "ar";
  const roleBadge = ROLE_LABELS[userRole] ?? { en: userRole, ar: userRole };

  const formatLastLogin = useCallback(
    (dateStr?: string) => {
      if (!dateStr) return isAr ? "غير متوفر" : "N/A";
      const d = new Date(dateStr);
      return d.toLocaleDateString(isAr ? "ar-AE" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [isAr]
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
      // Race signOut against a timeout so the user is never stuck
      await Promise.race([
        signOut({ redirect: false }),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {
      // Even if signOut fails, navigate to login — the server session
      // will be invalidated on next request anyway.
    } finally {
      // Hard navigation clears all client state; no router.refresh() needed
      window.location.href = `/${locale}/login`;
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
          {/* User info header */}
          <DropdownMenuLabel className="font-normal">
            <button
              type="button"
              onClick={() => {
                const profilePath = userRole === "job_seeker" ? `/${locale}/job-seeker/profile` : userRole === "employer" ? `/${locale}/employer/profile` : null;
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

          {/* Role */}
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>{isAr ? "الدور" : "Role"}</span>
              <span className="ml-auto inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {isAr ? roleBadge.ar : roleBadge.en}
              </span>
            </div>
          </div>

          {/* Last Login */}
          <div className="px-2 py-1.5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>{isAr ? "آخر تسجيل دخول" : "Last Login"}</span>
              <span className="ml-auto text-xs">
                {formatLastLogin(lastLogin)}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Settings */}
          {(userRole === "job_seeker" || userRole === "employer") && (
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
              onSelect={() => {
                const settingsPath = userRole === "job_seeker" ? `/${locale}/job-seeker/settings` : `/${locale}/employer/settings`;
                router.push(settingsPath);
              }}
            >
              <Settings className="h-4 w-4" />
              <span className="font-medium text-sm">{isAr ? "الإعدادات" : "Settings"}</span>
            </DropdownMenuItem>
          )}

          {/* Reset Password */}
          <DropdownMenuItem
            className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
            onSelect={() => { setResetOpen(true); setResetStatus("idle"); }}
          >
            <KeyRound className="h-4 w-4" />
            <span className="font-medium text-sm">{isAr ? "إعادة تعيين كلمة المرور" : "Reset Password"}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 rounded-md transition-colors"
            onSelect={() => setLogoutOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            <span className="font-medium text-sm">{isAr ? "تسجيل الخروج" : "Logout"}</span>
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
                <DialogTitle>{isAr ? "تسجيل الخروج" : "Log Out"}</DialogTitle>
                <DialogDescription className="mt-1">
                  {isAr
                    ? "هل أنت متأكد أنك تريد تسجيل الخروج من حسابك؟"
                    : "Are you sure you want to log out of your account?"}
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
              {isAr ? "إلغاء" : "Cancel"}
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
                  {isAr ? "جاري الخروج..." : "Logging out..."}
                </>
              ) : (
                <>
                  <LogOut className="h-3.5 w-3.5" />
                  {isAr ? "تسجيل الخروج" : "Log Out"}
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
              {isAr ? "إعادة تعيين كلمة المرور" : "Reset Password"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "سيتم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني"
                : "A password reset link will be sent to your email address"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-foreground truncate">{userEmail}</p>
            </div>

            {resetStatus === "success" && (
              <p className="text-sm text-green-600">
                {isAr
                  ? "تم إرسال رابط إعادة التعيين! تحقق من بريدك الإلكتروني."
                  : "Reset link sent! Check your email."}
              </p>
            )}
            {resetStatus === "error" && (
              <p className="text-sm text-destructive">
                {isAr ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again."}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={loading}
            >
              {resetStatus === "success" ? (isAr ? "إغلاق" : "Close") : (isAr ? "إلغاء" : "Cancel")}
            </Button>
            {resetStatus !== "success" && (
              <Button onClick={handleResetPassword} disabled={loading}>
                {loading
                  ? isAr
                    ? "جاري الإرسال..."
                    : "Sending..."
                  : isAr
                    ? "إرسال رابط إعادة التعيين"
                    : "Send Reset Link"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
