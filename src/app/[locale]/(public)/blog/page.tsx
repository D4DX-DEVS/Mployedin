"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BlogPost {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  excerpt: string;
  excerptAr: string;
  coverImage: string;
  author: string;
  tags: string[];
  publishedAt: string;
}

export default function BlogListingPage() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "en";
  const isAr = locale === "ar";
  const t = useTranslations("landing");

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 9;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set("search", search);

    fetch(`/api/public/blogs?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setPosts(d.items ?? []);
        setTotalPages(d.pagination?.pages ?? 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">{t("blogHeading")}</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">{t("blogSubtitle")}</p>
        </div>

        <form onSubmit={handleSearch} className="relative max-w-md mx-auto mb-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchArticlesPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </form>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && posts.length === 0 && (
          <p className="text-center text-muted-foreground py-20">{t("noArticlesFound")}</p>
        )}

        {!loading && posts.length > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link key={post._id} href={`/${locale}/blog/${post.slug}`} className="group">
                  <article className="rounded-xl border bg-card overflow-hidden h-full flex flex-col transition-shadow group-hover:shadow-md">
                    {post.coverImage ? (
                      <img src={post.coverImage} alt="" className="h-48 w-full object-cover" />
                    ) : (
                      <div className="h-48 bg-muted flex items-center justify-center">
                        <span className="text-4xl font-bold text-muted-foreground/30">M</span>
                      </div>
                    )}
                    <div className="p-5 flex-1 flex flex-col">
                      <h2 className="font-semibold text-lg group-hover:text-primary transition-colors line-clamp-2">
                        {isAr ? post.titleAr || post.title : post.title}
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-3 flex-1">
                        {isAr ? post.excerptAr || post.excerpt : post.excerpt}
                      </p>
                      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground border-t pt-3">
                        {post.author && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {post.author}
                          </span>
                        )}
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(post.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {post.tags?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-10">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  {t("previousPage")}
                </Button>
                <span className="flex items-center px-3 text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  {t("nextPage")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
