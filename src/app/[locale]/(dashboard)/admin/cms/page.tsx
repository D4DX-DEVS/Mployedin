"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  HelpCircle,
  Image,
  FileText,
  LayoutDashboard,
  Mail,
  Newspaper,
  Quote,
  Sparkles,
  Video,
} from "lucide-react";

interface StatCard {
  label: string;
  count: number;
  href: string;
  icon: React.ReactNode;
  color: string;
}

export default function CmsOverviewPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

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

  const cards: StatCard[] = [
    { label: "FAQs", count: stats.faqs ?? 0, href: `/${locale}/admin/cms/faqs`, icon: <HelpCircle className="h-6 w-6" />, color: "bg-blue-500/10 text-blue-600" },
    { label: "Blog Posts", count: stats.blogs ?? 0, href: `/${locale}/admin/cms/blogs`, icon: <Newspaper className="h-6 w-6" />, color: "bg-emerald-500/10 text-emerald-600" },
    { label: "Testimonials", count: stats.testimonials ?? 0, href: `/${locale}/admin/cms/testimonials`, icon: <Quote className="h-6 w-6" />, color: "bg-purple-500/10 text-purple-600" },
    { label: "Banners", count: stats.banners ?? 0, href: `/${locale}/admin/cms/banners`, icon: <Image className="h-6 w-6" />, color: "bg-orange-500/10 text-orange-600" },
    { label: "Videos", count: stats.videos ?? 0, href: `/${locale}/admin/cms/videos`, icon: <Video className="h-6 w-6" />, color: "bg-red-500/10 text-red-600" },
    { label: "Static Pages", count: stats.staticPages ?? 0, href: `/${locale}/admin/cms/static-pages`, icon: <FileText className="h-6 w-6" />, color: "bg-cyan-500/10 text-cyan-600" },
    { label: "Contact Inbox", count: stats.contacts ?? 0, href: `/${locale}/admin/cms/contact-submissions`, icon: <Mail className="h-6 w-6" />, color: "bg-amber-500/10 text-amber-600" },
  ];

  const totalContentItems = Object.values(stats).reduce((sum, value) => sum + value, 0);
  const contactItems = stats.contacts ?? 0;
  const liveModules = cards.length;
  const bannerItems = stats.banners ?? 0;

  return (
    <div className="page-container space-y-6">
      <section className="workspace-hero-surface overflow-hidden rounded-[28px] p-6 sm:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="workspace-glass-panel inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              CMS workspace
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2rem]">CMS / Landing Page</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage the public-facing content surfaces for MPLOYEDIN from one modern admin workspace, with direct access to every landing-page destination.
            </p>
          </div>

          <div className="workspace-glass-panel rounded-2xl px-4 py-3 text-left sm:min-w-[240px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Publishing scope</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{loading ? "Loading..." : `${totalContentItems.toLocaleString()} content records`}</p>
            <p className="text-xs text-muted-foreground">Across FAQs, blogs, testimonials, banners, videos, static pages, and contact submissions.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Modules</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{liveModules}</p>
                <p className="mt-1 text-xs text-muted-foreground">Connected CMS destinations available in this workspace.</p>
              </div>
              <div className="workspace-tone-sky rounded-2xl p-2.5">
                <LayoutDashboard className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Content items</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{loading ? "-" : totalContentItems.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Total records currently indexed across CMS sections.</p>
              </div>
              <div className="workspace-tone-indigo rounded-2xl p-2.5">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contact inbox</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{loading ? "-" : contactItems.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Inbound messages currently visible to the admin team.</p>
              </div>
              <div className="workspace-tone-amber rounded-2xl p-2.5">
                <Mail className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="workspace-glass-panel rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Banners</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{loading ? "-" : bannerItems.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hero and promotional creatives available for landing pages.</p>
              </div>
              <div className="workspace-tone-emerald rounded-2xl p-2.5">
                <Image className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-panel-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Content destinations</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Jump directly into the CMS surfaces that need work</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each section keeps its existing admin tooling while inheriting the updated workspace shell.</p>
          </div>
          <div className="workspace-muted-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            {liveModules} modules available
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="workspace-subtle-surface group rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-2xl p-2.5 ${card.color}`}>
                  {card.icon}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/55 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-foreground">{card.label}</h3>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {loading ? <div className="h-8 w-12 animate-pulse rounded bg-muted" /> : card.count.toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
