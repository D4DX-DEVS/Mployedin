"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BriefcaseBusiness, FileUser, Home, Menu, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmployerBottomNavProps {
  locale: string;
  onMore: () => void;
}

export function EmployerBottomNav({ locale, onMore }: EmployerBottomNavProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const items = [
    { label: t("home"), href: `/${locale}/employer`, icon: Home, activePaths: [`/${locale}/employer`] },
    {
      label: t("jobs"),
      href: `/${locale}/employer/jobs`,
      icon: BriefcaseBusiness,
      activePaths: [
        `/${locale}/employer/jobs`,
        `/${locale}/employer/job-templates`,
        `/${locale}/employer/my-posters`,
      ],
    },
    {
      label: t("pipeline"),
      href: `/${locale}/employer/applications`,
      icon: FileUser,
      activePaths: [
        `/${locale}/employer/applications`,
        `/${locale}/employer/interviews`,
        `/${locale}/employer/offers`,
        `/${locale}/employer/placements`,
        `/${locale}/employer/background-checks`,
      ],
    },
    {
      label: t("inbox"),
      href: `/${locale}/employer/messages`,
      icon: MessageSquare,
      activePaths: [`/${locale}/employer/messages`],
    },
  ];

  return (
    <nav
      aria-label={t("employerMobileNavigation")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex min-h-16 items-stretch">
        {items.map(({ label, href, icon: Icon, activePaths }) => {
          const active = activePaths.some((path) => pathname === path || (path !== `/${locale}/employer` && pathname.startsWith(`${path}/`)));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              prefetch={false}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              {active && <span aria-hidden className="absolute inset-x-[22%] top-0 h-0.5 rounded-b-full bg-primary" />}
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium text-muted-foreground"
          aria-label={t("openMoreMenu")}
        >
          <Menu className="h-5 w-5" />
          <span>{t("more")}</span>
        </button>
      </div>
    </nav>
  );
}
