"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Calendar, User, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeHtml } from "@/lib/security/html";

interface Post {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  body: string;
  bodyAr: string;
  coverImage: string;
  author: string;
  tags: string[];
  publishedAt: string;
}

export default function BlogDetailPage() {
  const pathname = usePathname();
  const parts = pathname.split("/");
  const locale = parts[1] || "en";
  const slug = parts[parts.length - 1];
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/public/blogs/${slug}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => d && setPost(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">{t("articleNotFoundHeading")}</h1>
        <Link href={`/${locale}/blog`}>
          <Button variant="outline">{t("backToBlogLink")}</Button>
        </Link>
      </div>
    );
  }

  const title = isAr ? post.titleAr || post.title : post.title;
  const body = isAr ? post.bodyAr || post.body : post.body;

  return (
    <article className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href={`/${locale}/blog`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {t("backToBlogLink")}
        </Link>

        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={title}
            className="w-full rounded-xl object-cover max-h-[400px] mb-8"
          />
        )}

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{title}</h1>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
          {post.author && (
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {post.author}
            </span>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {new Date(post.publishedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {post.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="mt-10 prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
        />
      </div>
    </article>
  );
}
