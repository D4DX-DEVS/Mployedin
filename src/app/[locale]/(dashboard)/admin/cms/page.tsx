"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  HelpCircle,
  Image,
  FileText,
  Mail,
  Newspaper,
  Quote,
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

  return (
    <div className="page-container space-y-4">
      <section className="workspace-panel-surface overflow-hidden rounded-[20px]">
        {/* Compact header */}
        <div className="flex flex-col gap-3 border-b border-border/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">CMS / Landing Page</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage the public-facing content surfaces for MPLOYEDIN.</p>
          </div>
          {!loading && (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              {Object.values(stats).reduce((s, v) => s + v, 0).toLocaleString()} total records · {cards.length} modules
            </span>
          )}
        </div>

        {/* Card grid */}
        <div className="p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="group rounded-2xl border border-border/60 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_44px_-36px_rgba(2,132,199,0.45)]"
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
        </div>
      </section>
    </div>
  );
}
