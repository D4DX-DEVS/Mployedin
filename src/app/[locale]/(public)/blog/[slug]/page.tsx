import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Calendar, User, Tag } from "lucide-react";
import { connectDB } from "@/lib/db/mongoose";
import BlogPost from "@/models/BlogPost";
import { sanitizeHtml } from "@/lib/security/html";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

interface Post {
  title: string;
  titleAr?: string;
  excerpt?: string;
  excerptAr?: string;
  body: string;
  bodyAr?: string;
  coverImage?: string;
  author?: string;
  tags?: string[];
  publishedAt?: Date | string | null;
}

/**
 * Same visibility rule as GET /api/public/blogs/[slug]. Server-rendered (JS-2):
 * the page used to be a client component that fetched after hydration, so the
 * document had the title "Blog", no h1 and no description until JS ran.
 * `cache` shares the one lookup between generateMetadata and the page.
 */
const getPost = cache(async (slug: string): Promise<Post | null> => {
  await connectDB();
  const post = await BlogPost.findOne({ slug: slug.toLowerCase(), isActive: true, status: "published" })
    .lean()
    .catch(() => null);
  return (post as Post | null) ?? null;
});

function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function localized(post: Post, isAr: boolean) {
  const title = (isAr ? post.titleAr || post.title : post.title) || post.title;
  const body = (isAr ? post.bodyAr || post.body : post.body) || "";
  const excerpt = isAr ? post.excerptAr || post.excerpt : post.excerpt;
  const description = (excerpt || plainText(body)).slice(0, 160);
  return { title, body, description };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: (await getTranslations("landing"))("articleNotFoundHeading") };

  const { title, description } = localized(post, locale === "ar");
  const canonicalUrl = `${BASE_URL}/${locale}/blog/${slug}`;
  const publishedTime = post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${BASE_URL}/en/blog/${slug}`,
        ar: `${BASE_URL}/ar/blog/${slug}`,
        "x-default": `${BASE_URL}/en/blog/${slug}`,
      },
    },
    openGraph: {
      title: `${title} | MPLOYEDIN`,
      description,
      type: "article",
      url: canonicalUrl,
      ...(post.coverImage ? { images: [{ url: post.coverImage, width: 1200, height: 630, alt: title }] } : {}),
      ...(publishedTime ? { publishedTime } : {}),
      authors: post.author ? [post.author] : undefined,
      tags: post.tags?.length ? post.tags : undefined,
    },
    twitter: {
      card: post.coverImage ? "summary_large_image" : "summary",
      title: `${title} | MPLOYEDIN`,
      description,
      ...(post.coverImage ? { images: [post.coverImage] } : {}),
    },
  };
}

export default async function BlogDetailPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const isAr = locale === "ar";
  const t = await getTranslations("landing");

  // Before any Suspense boundary, so a missing post is a real 404 rendered by
  // (public)/not-found.tsx inside the site header and footer.
  const post = await getPost(slug);
  if (!post) notFound();

  const { title, body } = localized(post, isAr);

  return (
    <article className="py-12">
      <div className="container mx-auto px-4 max-w-4xl">
        <Link href={`/${locale}/blog`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4 me-1.5 rtl:rotate-180" aria-hidden />
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
              <User className="h-4 w-4" aria-hidden />
              {post.author}
            </span>
          )}
          {post.publishedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden />
              <time dateTime={new Date(post.publishedAt).toISOString()}>
                {new Date(post.publishedAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </span>
          )}
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {post.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <Tag className="h-3 w-3" aria-hidden />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="mt-10 prose prose-neutral max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(body) }}
        />
      </div>
    </article>
  );
}
