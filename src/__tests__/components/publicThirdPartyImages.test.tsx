/**
 * @jest-environment jsdom
 *
 * No public page may make the visitor's browser load an image from a third-party
 * host: the request would carry their IP address and browser details before any
 * cookie choice (and after "Reject all"). CMS and user data can hold any URL, so
 * every public <img> goes through toPublicImageSrc, which keeps our own storage,
 * proxies Google/LinkedIn photos and refuses everything else.
 */
import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";

import { BannerCarousel } from "@/components/features/public/landing/BannerCarousel";
import { PostsSection, TestimonialsSection } from "@/components/features/public/landing/CmsSections";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const THIRD_PARTY = "https://i.pravatar.cc/300";
const OWN = "https://d4dx-storage.blr1.digitaloceanspaces.com/avatars/a.jpg";
const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c";

function testimonial(avatar: string) {
  return {
    _id: "t1", name: "Sara Khan", nameAr: "", designation: "Recruiter", designationAr: "", company: "Acme", companyAr: "",
    quote: "Great", quoteAr: "", avatar, rating: 5,
  };
}

function post(coverImage: string) {
  return {
    _id: "p1", title: "Hello", titleAr: "", slug: "hello", excerpt: "x", excerptAr: "", coverImage, author: "", publishedAt: "",
  } as never;
}

function banner(image: string) {
  return {
    _id: "b1", title: "Campaign", titleAr: "", subtitle: "", subtitleAr: "", image, linkUrl: "/en/jobs", linkText: "Go", linkTextAr: "",
  };
}

function imgSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
}

describe("CMS testimonial avatar", () => {
  it("does not load a third-party host: it shows the initial instead", () => {
    const { container } = render(<TestimonialsSection locale="en" testimonials={[testimonial(THIRD_PARTY)]} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.textContent).toContain("S");
  });

  it("loads our own storage directly", () => {
    const { container } = render(<TestimonialsSection locale="en" testimonials={[testimonial(OWN)]} />);
    expect(imgSources(container)).toEqual([OWN]);
  });

  it("loads a Google photo through the first-party proxy", () => {
    const { container } = render(<TestimonialsSection locale="en" testimonials={[testimonial(GOOGLE)]} />);
    expect(imgSources(container)).toEqual([`/api/proxy-image?url=${encodeURIComponent(GOOGLE)}`]);
  });
});

describe("CMS blog cover on the landing page", () => {
  it("does not load a third-party host", () => {
    const { container } = render(<PostsSection locale="en" posts={[post("https://images.unsplash.com/photo-1")]} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("loads our own storage directly", () => {
    const { container } = render(<PostsSection locale="en" posts={[post(OWN)]} />);
    expect(imgSources(container)).toEqual([OWN]);
  });
});

describe("CMS banner image", () => {
  it("does not load a third-party host", () => {
    const { container } = render(<BannerCarousel locale="en" banners={[banner("https://images.unsplash.com/photo-1")]} />);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("loads our own storage and same-origin paths", () => {
    expect(imgSources(render(<BannerCarousel locale="en" banners={[banner(OWN)]} />).container)).toEqual([OWN]);
    expect(imgSources(render(<BannerCarousel locale="en" banners={[banner("/desktop-banner.jpg")]} />).container)).toEqual(["/desktop-banner.jpg"]);
  });
});

/**
 * Source guard. Every file a public visitor's browser renders (all of app/[locale]/(public) and
 * components/features/public, plus the shared components named below) may draw an image only through
 * PublicImage, which applies toPublicImageSrc. A raw <img> is allowed only with a same-origin literal
 * src such as "/logo.png". Tags are found by scanning to the closing ">" outside braces, so
 * self-closing and plain <img ...> tags are both caught, and an arrow function inside an attribute
 * does not end the tag early.
 */
const SRC = path.resolve(__dirname, "../..");
const PUBLIC_DIRS = ["app/[locale]/(public)", "components/features/public"];

/** Components that draw CMS or user images and are not under a public directory. */
const OTHER_PUBLICIMAGE_SITES = [
  // Only the job seeker's dashboard renders it (job cards), but it shows employer-supplied logos, so it uses PublicImage too.
  "components/features/job-seeker/JobSummaryCard.tsx",
];

/** Every .ts/.tsx source under a directory, relative to src. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const PUBLIC_FILES = PUBLIC_DIRS.flatMap(sourceFiles);

/** Each <img ...> tag, up to its closing ">" outside braces. */
function imgTags(source: string): string[] {
  const tags: string[] = [];
  const open = /<img(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source))) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

/** The src attribute of a tag as written, or "(no src)". */
function srcOf(tag: string): string {
  const at = tag.search(/\ssrc=/);
  if (at < 0) return "(no src)";
  const from = at + tag.slice(at).indexOf("=") + 1;
  if (tag[from] === '"' || tag[from] === "'") return tag.slice(from, tag.indexOf(tag[from], from + 1) + 1);
  let depth = 0;
  for (let i = from; i < tag.length; i++) {
    if (tag[i] === "{") depth++;
    else if (tag[i] === "}" && --depth === 0) return tag.slice(from, i + 1);
  }
  return tag.slice(from);
}

const SAME_ORIGIN_LITERAL = /^["']\/(?!\/)[^"'\\]*["']$/;
const rawImages = (source: string) => imgTags(source).map(srcOf).filter((src) => !SAME_ORIGIN_LITERAL.test(src));

describe("the <img> scanner this guard relies on", () => {
  it("finds self-closing and plain tags, and reads brace and quoted src values", () => {
    const source = [
      '<img src="/logo.png" alt="" />',
      "<img src={post.cover} alt={t('x')} onError={() => setFailed(true)}>",
      '<img\n  alt="x"\n  src={a ? b : c}\n/>',
      '<imgx src="https://x.test/a.png" />',
      "<img {...rest} />",
    ].join("\n");
    expect(imgTags(source).map(srcOf)).toEqual(['"/logo.png"', "{post.cover}", "{a ? b : c}", "(no src)"]);
  });

  it("accepts only a same-origin literal as raw", () => {
    expect(rawImages('<img src="/logo.png" />')).toEqual([]);
    expect(rawImages('<img src="//i.pravatar.cc/1" />')).toEqual(['"//i.pravatar.cc/1"']);
    expect(rawImages('<img src="https://i.pravatar.cc/1">')).toEqual(['"https://i.pravatar.cc/1"']);
    expect(rawImages("<img src={post.cover}>")).toEqual(["{post.cover}"]);
  });
});

describe("public render sites", () => {
  it("finds the public files it is meant to scan", () => {
    expect(PUBLIC_FILES.length).toBeGreaterThan(20);
    expect(PUBLIC_FILES).toContain("app/[locale]/(public)/blog/[slug]/page.tsx");
    expect(PUBLIC_FILES).toContain("components/features/public/LegalPage.tsx");
    expect(PUBLIC_FILES).toContain("components/features/public/landing/CmsSections.tsx");
  });

  it.each(PUBLIC_FILES)("%s: no raw <img> with a CMS or user src", (file) => {
    expect(rawImages(readFileSync(path.join(SRC, file), "utf8"))).toEqual([]);
  });

  it.each(PUBLIC_FILES)("%s: CMS rich text goes through sanitizePublicHtml, never sanitizeHtml", (file) => {
    expect(readFileSync(path.join(SRC, file), "utf8")).not.toMatch(/\bsanitizeHtml\(/);
  });

  it.each([
    "components/features/public/landing/CmsSections.tsx",
    "components/features/public/landing/BannerCarousel.tsx",
    "app/[locale]/(public)/blog/page.tsx",
    "app/[locale]/(public)/blog/[slug]/page.tsx",
    "app/[locale]/(public)/companies/page.tsx",
    "app/[locale]/(public)/companies/[id]/page.tsx",
    ...OTHER_PUBLICIMAGE_SITES,
  ])("%s: draws its images through PublicImage", (file) => {
    const source = readFileSync(path.join(SRC, file), "utf8");
    expect(source).toContain("<PublicImage");
    expect(source).toContain('from "@/components/shared/PublicImage"');
    expect(rawImages(source)).toEqual([]);
  });

  it.each(["app/[locale]/(public)/blog/[slug]/page.tsx"])(
    "%s: renders its rich text with sanitizePublicHtml",
    (file) => {
      const source = readFileSync(path.join(SRC, file), "utf8");
      expect(source).toMatch(/dangerouslySetInnerHTML=\{\{ __html: sanitizePublicHtml\(/);
    },
  );

  // The legal pages add anchors and fold-outs after sanitising (lib/cms/legalLayout.ts), so the HTML they
  // render is layoutLegalHtml's output — which must only ever be fed sanitised HTML.
  it("LegalPage sanitises before laying out, and renders only the laid-out result", () => {
    const source = readFileSync(path.join(SRC, "components/features/public/LegalPage.tsx"), "utf8");
    expect(source).toMatch(/layoutLegalHtml\(sanitizePublicHtml\(body\)/);
    expect(source).toMatch(/dangerouslySetInnerHTML=\{\{ __html: layout\.html \}\}/);
    expect(source.match(/dangerouslySetInnerHTML/g)).toHaveLength(1);
  });

  it("PublicImage is the one place that renders the <img>, through toPublicImageSrc", () => {
    const source = readFileSync(path.join(SRC, "components/shared/PublicImage.tsx"), "utf8");
    expect(source).toContain('from "@/lib/images/externalAvatar"');
    expect(source).toMatch(/toPublicImageSrc\(/);
    expect(imgTags(source).map(srcOf)).toEqual(["{resolved}"]);
  });
});
