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
  Eye,
  EyeOff,
  Settings,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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
    setError("");
    if (!currentPassword || !newPassword) {
      setError(isAr ? "جميع الحقول مطلوبة" : "All fields are required");
      return;
    }
    if (newPassword.length < 8) {
      setError(
        isAr
          ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
          : "Password must be at least 8 characters"
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(
        isAr ? "كلمات المرور غير متطابقة" : "Passwords do not match"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (isAr ? "حدث خطأ" : "Something went wrong"));
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        setResetOpen(false);
        setSuccess(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }, 1500);
    } catch {
      setError(isAr ? "خطأ في الاتصال" : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    router.refresh(); // Bust Next.js router cache so back-navigation re-runs the server auth check
    signOut({ callbackUrl: `/${locale}/login` });
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
            onSelect={() => setResetOpen(true)}
          >
            <KeyRound className="h-4 w-4" />
            <span className="font-medium text-sm">{isAr ? "تغيير كلمة المرور" : "Change Password"}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Logout */}
          <DropdownMenuItem
            className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10 rounded-md transition-colors"
            onSelect={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span className="font-medium text-sm">{isAr ? "تسجيل الخروج" : "Logout"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Change Password Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAr ? "تغيير كلمة المرور" : "Change Password"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "أدخل كلمة المرور الحالية والجديدة"
                : "Enter your current password and choose a new one"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Current Password */}
            <div className="space-y-2">
              <Label>{isAr ? "كلمة المرور الحالية" : "Current Password"}</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label>{isAr ? "كلمة المرور الجديدة" : "New Password"}</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label>
                {isAr ? "تأكيد كلمة المرور" : "Confirm Password"}
              </Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-600">
                {isAr
                  ? "تم تغيير كلمة المرور بنجاح!"
                  : "Password changed successfully!"}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={loading}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleResetPassword} disabled={loading}>
              {loading
                ? isAr
                  ? "جاري التغيير..."
                  : "Changing..."
                : isAr
                  ? "تغيير كلمة المرور"
                  : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
