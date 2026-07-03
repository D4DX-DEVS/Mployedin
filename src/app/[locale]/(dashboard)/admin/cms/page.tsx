"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  HelpCircle,
  ImageIcon,
  FileText,
  Mail,
  Newspaper,
  Quote,
  Video,
  Sparkles,
  LayoutDashboard,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface StatCard {
  label: string;
  count: number;
  href: string;
  icon: React.ReactNode;
  color: string;
  chipBg: string;
}

export default function CmsOverviewPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const t = useTranslations("adminCms");
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleType, setModuleType] = useState("all");

  useEffect(() => {
    async function loadStats() {
      try {
        const endpoints = [
          { key: "faqs", url: "/api/admin/cms/faqs?limit=1" },
          { key: "blogs", url: "/api/admin/cms/blogs?limit=1" },
          { key: "testimonials", url: "/api/admin/cms/testimonials?limit=1" },
          { key: "banners", url: "/api/admin/cms/banners?limit=1" },
          { key: "videos", url: "/api/admin/cms/videos?limit=1" },
          { key: "staticPages", url: "/api/admin/cms/static-pages?limit=1" },
          { key: "contacts", url: "/api/admin/cms/contact-submissions?limit=1" },
        ];
        const results = await Promise.all(
          endpoints.map(async (ep) => {
            try {
              const r = await fetch(ep.url);
              const d = await r.json();
              return { key: ep.key, total: d.pagination?.total ?? 0 };
            } catch {
              return { key: ep.key, total: 0 };
            }
          })
        );
        const map: Record<string, number> = {};
        results.forEach((r) => { map[r.key] = r.total; });
        setStats(map);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const totalRecords = Object.values(stats).reduce((s, v) => s + v, 0);

  const allCards: StatCard[] = [
    { label: t("faqsLabel"), count: stats.faqs ?? 0, href: `/${locale}/admin/cms/faqs`, icon: <HelpCircle className="h-5 w-5" />, color: "text-blue-600", chipBg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: t("blogPostsLabel"), count: stats.blogs ?? 0, href: `/${locale}/admin/cms/blogs`, icon: <Newspaper className="h-5 w-5" />, color: "text-emerald-600", chipBg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: t("testimonialsLabel"), count: stats.testimonials ?? 0, href: `/${locale}/admin/cms/testimonials`, icon: <Quote className="h-5 w-5" />, color: "text-purple-600", chipBg: "bg-purple-50 dark:bg-purple-950/30" },
    { label: t("bannersLabel"), count: stats.banners ?? 0, href: `/${locale}/admin/cms/banners`, icon: <ImageIcon className="h-5 w-5" />, color: "text-orange-600", chipBg: "bg-orange-50 dark:bg-orange-950/30" },
    { label: t("videosLabel"), count: stats.videos ?? 0, href: `/${locale}/admin/cms/videos`, icon: <Video className="h-5 w-5" />, color: "text-red-600", chipBg: "bg-red-50 dark:bg-red-950/30" },
    { label: t("staticPagesLabel"), count: stats.staticPages ?? 0, href: `/${locale}/admin/cms/static-pages`, icon: <FileText className="h-5 w-5" />, color: "text-cyan-600", chipBg: "bg-cyan-50 dark:bg-cyan-950/30" },
    { label: t("contactInboxLabel"), count: stats.contacts ?? 0, href: `/${locale}/admin/cms/contact-submissions`, icon: <Mail className="h-5 w-5" />, color: "text-amber-600", chipBg: "bg-amber-50 dark:bg-amber-950/30" },
  ];

  const hasActiveFilters = Boolean(moduleSearch.trim()) || moduleType !== "all";

  const cards = allCards.filter((card) => {
    const matchesSearch =
      !moduleSearch.trim() ||
      card.label.toLowerCase().includes(moduleSearch.trim().toLowerCase());
    const matchesType = moduleType === "all" || card.label === moduleType;
    return matchesSearch && matchesType;
  });

  const moduleTypeOptions = [
    { value: "all", label: t("allModulesOption") },
    ...allCards.map((c) => ({ value: c.label, label: c.label })),
  ];

  return (
    <div className="page-container space-y-6">
      {/* Hero Section */}
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              {t("cmsWorkspaceLabel")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
              {t("pageTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("pageDescription")}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t("platformTotal")}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {loading ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" /> : totalRecords.toLocaleString()} {t("recordsText")}
              </p>
              <p className="text-xs text-muted-foreground">{allCards.length} {t("contentModulesLabel", { count: allCards.length })}</p>
            </div>
          </div>
        </div>

        {/* Summary stats row */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([
            { label: t("totalRecordsLabel"), value: totalRecords, note: t("totalRecordsNote"), icon: LayoutDashboard, tone: "text-sky-600", chip: "bg-sky-50 dark:bg-sky-950/30" },
            { label: t("contentModulesCount"), value: allCards.length, note: t("contentModulesNote"), icon: FileText, tone: "text-emerald-600", chip: "bg-emerald-50 dark:bg-emerald-950/30" },
            { label: t("blogPostsLabel"), value: stats.blogs ?? 0, note: t("blogPostsNote"), icon: Newspaper, tone: "text-violet-600", chip: "bg-violet-50 dark:bg-violet-950/30" },
            { label: t("contactMessagesLabel"), value: stats.contacts ?? 0, note: t("contactMessagesNote"), icon: Mail, tone: "text-amber-600", chip: "bg-amber-50 dark:bg-amber-950/30" },
          ] as const).map(({ label, value, note, icon: Icon, tone, chip }) => (
            <div key={label} className="workspace-glass-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
                    {loading ? <span className="inline-block h-10 w-12 animate-pulse rounded bg-muted" /> : value}
                  </p>
                </div>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${chip}`}>
                  <Icon className={`h-5 w-5 ${tone}`} />
                </span>
              </div>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border/30 pt-5">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/10 dark:hover:bg-white/5"
          >
            <Filter className="h-4 w-4 text-muted-foreground" />
            {showFilters ? t("hideFiltersButton") : t("showFiltersButton")}
            {hasActiveFilters && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {t("activeFiltersBadge")}
              </Badge>
            )}
            {showFilters ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setModuleSearch("");
                setModuleType("all");
              }}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("clearFiltersButton")}
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 space-y-3 rounded-[20px] border border-border/30 bg-background/40 p-4 backdrop-blur-sm dark:bg-background/20">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                className="h-11 rounded-xl border-border bg-card pl-9 text-sm shadow-none"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("moduleSelectLabel")}</label>
                <SearchableSelect
                  className="h-11 w-full rounded-xl border-border bg-card"
                  options={moduleTypeOptions}
                  value={moduleType}
                  onValueChange={setModuleType}
                  placeholder={t("moduleSelectPlaceholder")}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="workspace-panel-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{t("contentModulesHeading")}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {hasActiveFilters
              ? t("contentModulesFilteredDescription", { count: cards.length, total: allCards.length })
              : t("contentModulesDescription")}
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
            <p className="text-sm font-medium text-foreground">{t("noModulesMessage")}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setModuleSearch("");
                setModuleType("all");
              }}
            >
              {t("clearFiltersButton")}
            </Button>
          </div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="workspace-subtle-surface group rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.chipBg}`}>
                  <span className={card.color}>{card.icon}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground/55 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">{card.label}</h3>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {loading ? <div className="h-8 w-12 animate-pulse rounded bg-muted" /> : card.count.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("recordsText")}</p>
            </Link>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
