"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, Play, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { YouTubeFacade } from "@/components/shared/ConsentManager/YouTubeFacade";
import { parseYouTubeId } from "@/lib/cms/youtube";
import { formatDate } from "@/lib/ui/intlFormat";
import type { BlogPost, FAQ, Testimonial, Video } from "./types";
import { PublicImage } from "@/components/shared/PublicImage";

const SECTION = "container mx-auto px-4 pt-12 sm:px-6 lg:pt-16";
const HEADING = "text-3xl font-extrabold tracking-[-0.02em] text-foreground sm:text-4xl";

/** Columns follow the item count, so one or two cards are not stranded in the left of a three-column grid. */
function gridFor(count: number): string {
  if (count <= 1) return "mx-auto max-w-xl";
  if (count === 2) return "md:grid-cols-2 lg:mx-auto lg:max-w-4xl";
  return "md:grid-cols-2 lg:grid-cols-3";
}

/**
 * A third-party avatar URL (never loaded: it would reveal the visitor's IP before any cookie choice),
 * a broken URL or a deleted file falls back to the initial instead of a broken-image icon.
 */
function Avatar({ src, name }: { src: string; name: string }) {
  return (
    <PublicImage
      src={src}
      alt=""
      className="h-11 w-11 rounded-full object-cover"
      fallback={
        <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
          {name.charAt(0)}
        </span>
      }
    />
  );
}

function pick(isAr: boolean, en: string, ar: string): string {
  return isAr ? ar || en : en;
}

export function VideosSection({ locale, videos }: { locale: string; videos: Video[] }) {
  const t = useTranslations("landing");
  const tCommon = useTranslations("common");
  const isAr = locale === "ar";
  // Only YouTube links can be framed (click-to-load, owner decision D5). Anything else the CMS holds,
  // such as an older Vimeo record, is skipped and does not use up one of the three places.
  const playable = videos
    .map((video) => ({ video, videoId: parseYouTubeId(video.url) }))
    .filter((item): item is { video: Video; videoId: string } => item.videoId !== null)
    .slice(0, 3);
  if (playable.length === 0) return null;
  const labels = {
    play: t("youtubePlay"),
    watchOnYoutube: t("youtubeWatchOn"),
    notice: t("youtubeNotice"),
    always: t("youtubeAlways"),
    alwaysHint: t("youtubeAlwaysHint"),
    newTab: tCommon("opensInNewTab"),
  };

  return (
    <section className={SECTION}>
      <div className="mb-6 max-w-2xl">
        <h2 className={HEADING}>{t("learnWorkflow")}</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">{t("learnWorkflowDesc")}</p>
      </div>
      <div className={`grid gap-5 ${playable.length === 1 ? "mx-auto max-w-4xl" : playable.length === 2 ? "md:grid-cols-2 xl:mx-auto xl:max-w-5xl" : "md:grid-cols-2 xl:grid-cols-3"}`}>
        {playable.map(({ video, videoId }) => (
          <article key={video._id} className="flex flex-col gap-2.5">
            <YouTubeFacade videoId={videoId} title={pick(isAr, video.title, video.titleAr)} labels={labels} locale={locale} />
            <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-primary">
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {t("watch")}
            </div>
            <h3 className="text-lg font-extrabold text-foreground">{pick(isAr, video.title, video.titleAr)}</h3>
            {(video.description || video.descriptionAr) && (
              <p className="text-sm leading-6 text-muted-foreground">{pick(isAr, video.description, video.descriptionAr)}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function TestimonialsSection({ locale, testimonials }: { locale: string; testimonials: Testimonial[] }) {
  const t = useTranslations("landing");
  const isAr = locale === "ar";
  if (testimonials.length === 0) return null;

  return (
    <section className={SECTION}>
      <h2 className={`${HEADING} mb-6 max-w-3xl`}>{t("testimonialHeading")}</h2>
      <div className={`grid gap-4 ${gridFor(Math.min(testimonials.length, 3))}`}>
        {testimonials.slice(0, 3).map((item) => {
          const name = pick(isAr, item.name, item.nameAr);
          const company = pick(isAr, item.company, item.companyAr);
          return (
            <figure key={item._id} className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-6">
              <div className="flex gap-0.5" role="img" aria-label={`${item.rating} / 5`}>
                {Array.from({ length: item.rating }).map((_, star) => (
                  <Star key={star} className="h-[18px] w-[18px] fill-amber-400 text-amber-400" aria-hidden="true" />
                ))}
              </div>
              <blockquote className="text-base leading-7 text-foreground">&ldquo;{pick(isAr, item.quote, item.quoteAr)}&rdquo;</blockquote>
              <figcaption className="mt-auto flex items-center gap-3 border-t border-border/60 pt-4">
                <Avatar src={item.avatar} name={name} />
                <span>
                  <span className="block text-sm font-extrabold text-foreground">{name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {pick(isAr, item.designation, item.designationAr)}
                    {company && `, ${company}`}
                  </span>
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

export function PostsSection({ locale, posts }: { locale: string; posts: BlogPost[] }) {
  const t = useTranslations("landing");
  const isAr = locale === "ar";
  if (posts.length === 0) return null;

  return (
    <section className={SECTION}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 className={`${HEADING} max-w-2xl`}>{t("blogHeading2")}</h2>
        <Link href={`/${locale}/blog`}>
          <Button variant="outline" size="lg" className="rounded-xl font-bold">{t("visitBlog")}</Button>
        </Link>
      </div>
      <div className={`grid gap-4 ${gridFor(Math.min(posts.length, 3))}`}>
        {posts.slice(0, 3).map((post) => (
          <Link
            key={post._id}
            href={`/${locale}/blog/${post.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-shadow hover:shadow-md"
          >
            <PublicImage src={post.coverImage} alt="" className="h-40 w-full object-cover" />
            <div className="flex flex-col gap-2 p-5">
              <h3 className="text-lg font-extrabold leading-snug text-foreground transition-colors group-hover:text-primary">
                {pick(isAr, post.title, post.titleAr)}
              </h3>
              <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{pick(isAr, post.excerpt, post.excerptAr)}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                {post.author && <span>{post.author}</span>}
                {post.author && post.publishedAt && <span aria-hidden="true">·</span>}
                {post.publishedAt && <span>{formatDate(new Date(post.publishedAt))}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FaqSection({ locale, faqs }: { locale: string; faqs: FAQ[] }) {
  const t = useTranslations("landing");
  const isAr = locale === "ar";
  const [openId, setOpenId] = useState<string | null>(null);
  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="container mx-auto max-w-3xl px-4 pt-12 sm:px-6 lg:pt-16">
      <h2 className={`${HEADING} mb-5 text-center`}>{t("faqHeading2")}</h2>
      <div className="border-b border-border/70">
        {faqs.slice(0, 6).map((faq) => {
          const open = openId === faq._id;
          return (
            <div key={faq._id} className="border-t border-border/70">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : faq._id)}
                aria-expanded={open}
                aria-controls={`landing-faq-${faq._id}`}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-1 py-4 text-start"
              >
                <span className="text-base font-extrabold leading-snug text-foreground sm:text-lg">{pick(isAr, faq.question, faq.questionAr)}</span>
                {open ? <ChevronUp className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" />}
              </button>
              {open && (
                <p id={`landing-faq-${faq._id}`} className="px-1 pb-5 text-base leading-7 text-muted-foreground">
                  {pick(isAr, faq.answer, faq.answerAr)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {faqs.length > 6 && (
        <div className="mt-5 text-center">
          <Link href={`/${locale}/faq`}>
            <Button variant="outline" size="lg" className="rounded-xl font-bold">{t("viewAllFaqs2")}</Button>
          </Link>
        </div>
      )}
    </section>
  );
}
