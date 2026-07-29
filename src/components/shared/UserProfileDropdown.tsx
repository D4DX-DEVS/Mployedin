"use client";

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
  Bell,
  Crown,
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
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

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
  const tNotifications = useTranslations("notificationsPage");
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
      // Clear idle timeout tracker
      localStorage.removeItem("mployedin_last_activity");
      await Promise.race([
        signOut({ redirect: false }).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch {
      // Even if signOut fails, navigate to login
    } finally {
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
          <button
            aria-label="Open user menu"
            className="flex h-11 w-11 items-center justify-center rounded-full brand-gradient text-white text-sm font-semibold shrink-0 shadow-soft ring-2 ring-background cursor-pointer hover:ring-primary/20 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden"
          >
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
            <div className="flex items-start gap-3 py-1 w-full text-left">
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
            </div>
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

          {/* Theme + locale live here on every breakpoint — three standalone
              controls crowded the topbar and left no room on phones.
              onSelect preventDefault so toggling does not close the menu. */}
          <div
            className="flex items-center justify-between gap-2 px-2 py-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="truncate text-sm text-muted-foreground">{t("preferences")}</span>
            {/* Force the switcher to its compact flag-only width — its sm: breakpoint
                is viewport-based and would overflow this 288px menu. */}
            <div className="flex shrink-0 items-center gap-2 [&>div:first-child]:!w-16 [&>div:first-child]:[&_span]:hidden">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>

          <DropdownMenuSeparator />

          {userRole === "job_seeker" && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("quickLinks")}
              </div>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/interviews`)}
              >
                <Video className="h-4 w-4" />
                <span className="text-sm">{t("interviews")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/offers`)}
              >
                <Gift className="h-4 w-4" />
                <span className="text-sm">{t("offers")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/calendar`)}
              >
                <Calendar className="h-4 w-4" />
                <span className="text-sm">{t("calendar")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/saved-searches`)}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">{t("savedSearches")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/documents`)}
              >
                <FileText className="h-4 w-4" />
                <span className="text-sm">{t("documents")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/cv`)}
              >
                <BookOpen className="h-4 w-4" />
                <span className="text-sm">{t("cvBuilder")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/companies`)}
              >
                <Building2 className="h-4 w-4" />
                <span className="text-sm">{t("companies")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
                onSelect={() => router.push(`/${locale}/job-seeker/subscription`)}
              >
                <Crown className="h-4 w-4" />
                <span className="text-sm">{t("subscription")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          {(userRole === "job_seeker" || userRole === "employer" || userRole === "super_agent" || userRole === "agent") && (
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
              onSelect={() => {
                const pathMap: Record<string, string> = {
                  job_seeker: `/${locale}/job-seeker/settings`,
                  employer: `/${locale}/employer/settings`,
                  super_agent: `/${locale}/super-agent/settings`,
                  agent: `/${locale}/agent/settings`,
                };
                router.push(pathMap[userRole] ?? `/${locale}/settings`);
              }}
            >
              <Settings className="h-4 w-4" />
              <span className="font-medium text-sm">{t("settings")}</span>
            </DropdownMenuItem>
          )}

          {userRole === "job_seeker" && (
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-md hover:bg-muted/50 transition-colors"
              onSelect={() => router.push(`/${locale}/job-seeker/subscription`)}
            >
              <Crown className="h-4 w-4" />
              <span className="font-medium text-sm">{t("subscription")}</span>
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
