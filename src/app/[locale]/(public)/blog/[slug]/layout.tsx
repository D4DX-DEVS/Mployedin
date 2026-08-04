import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://mployedin-8a4rc.ondigitalocean.app";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;

  try {
    const res = await fetch(`${BASE_URL}/api/public/blogs/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Article Not Found" };

    const post = await res.json();
    const isAr = locale === "ar";
    const title = (isAr ? post.titleAr || post.title : post.title) || "Blog";
    const description = isAr
      ? (post.excerptAr || post.bodyAr || "").slice(0, 160)
      : (post.excerpt || post.body || "").slice(0, 160);
    const canonicalUrl = `${BASE_URL}/${locale}/blog/${slug}`;

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
        ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
        authors: post.author ? [post.author] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} | MPLOYEDIN`,
        description,
        ...(post.coverImage ? { images: [post.coverImage] } : {}),
      },
    };
  } catch {
    return { title: "Blog" };
  }
}

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
