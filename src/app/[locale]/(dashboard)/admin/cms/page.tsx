"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  Newspaper,
  Quote,
  Image,
  Video,
  FileText,
  Mail,
  LayoutDashboard,
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
    <div className="page-container">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CMS / Landing Page</h1>
          <p className="text-muted-foreground text-sm">Manage your public website content</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:border-primary/20"
          >
            <div className="flex items-center justify-between">
              <div className={`rounded-lg p-2.5 ${card.color}`}>
                {card.icon}
              </div>
              {loading ? (
                <div className="h-8 w-12 animate-pulse rounded bg-muted" />
              ) : (
                <span className="text-2xl font-bold">{card.count}</span>
              )}
            </div>
            <p className="mt-3 font-medium text-sm group-hover:text-primary transition-colors">{card.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
