/**
 * @jest-environment node
 *
 * Provider (Google / LinkedIn) profile photos must reach the browser through
 * /api/proxy-image, or the visitor's IP and browser details go to a third party
 * on page view. The CSP no longer lists those hosts in img-src, so a render site
 * that skips toSafeImageSrc shows a broken image and a console error. Radix
 * AvatarImage (and so UserAvatar) rewrites inside the component; the sites below
 * draw a photo with a raw <img> and must call it themselves.
 *
 * The guards read the `src` attribute of each <img> itself: a file that imports
 * toSafeImageSrc and wraps one photo is not enough if it draws a second one raw.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

interface RenderSite {
  file: string;
  /** <img src> expressions in the file that are not a person's photo, with the reason. */
  notAPhoto?: Record<string, string>;
}

const RAW_IMG_AVATAR_SITES: RenderSite[] = [
  { file: "app/[locale]/(dashboard)/agent/settings/page.tsx" },
  { file: "app/[locale]/(dashboard)/super-agent/settings/page.tsx" },
  { file: "app/[locale]/(dashboard)/employer/talent-pools/page.tsx" },
  { file: "app/[locale]/(dashboard)/job-seeker/cv/page.tsx" },
  { file: "app/[locale]/(dashboard)/job-seeker/cv/templates.tsx" },
  { file: "components/features/dm/DirectMessageChat.tsx" },
  { file: "components/features/dm/NewChatSearch.tsx" },
  { file: "components/features/dm/UnifiedMessagesPage.tsx" },
  // Public pages (CmsSections and the rest) draw every CMS or user image through PublicImage,
  // guarded by publicThirdPartyImages.test.tsx.
];

const WRAPPER = "toSafeImageSrc(";

/** What an avatar-ish expression looks like, for files that are not listed above. */
const PHOTO_LIKE = /avatar|photo|picture|userImage|user\??\.image|profileImage/i;

function read(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "__tests__" || name === "node_modules") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full) && !full.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Reads one attribute value starting at `i`: `{expression}` (balanced) or a quoted string. */
function readValue(text: string, i: number): [string, number] {
  const first = text[i];
  if (first === "{") {
    let depth = 0;
    let quote: string | null = null;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (quote) {
        if (ch === "\\") j++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) return [text.slice(i + 1, j).trim(), j + 1];
    }
    return [text.slice(i + 1).trim(), text.length];
  }
  if (first === '"' || first === "'") {
    const end = text.indexOf(first, i + 1);
    const stop = end === -1 ? text.length : end + 1;
    return [text.slice(i, stop), stop];
  }
  return ["", i];
}

/**
 * The `src` of every `<img ...>` in a source string, as written: the text inside
 * `{...}`, or the quoted literal. Walks the tag attribute by attribute, so a `>`
 * inside an arrow function in another attribute does not end it early.
 */
function imgSrcExpressions(source: string): string[] {
  const found: string[] = [];
  const open = /<img(?=[\s/>])/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source))) {
    let i = match.index + match[0].length;
    while (i < source.length) {
      while (/\s/.test(source[i] ?? "")) i++;
      if (source[i] === ">" || source.startsWith("/>", i)) break;
      if (source[i] === "{") {
        i = readValue(source, i)[1];
        continue;
      }
      const name = /^[\w:.-]+/.exec(source.slice(i))?.[0];
      if (!name) {
        i++;
        continue;
      }
      i += name.length;
      if (source[i] !== "=") continue;
      const [value, next] = readValue(source, i + 1);
      i = next;
      if (name === "src") found.push(value);
    }
  }
  return found;
}

/** True only for one call to toSafeImageSrc that spans the whole expression (no `?? raw` fallback). */
function isWrappedCall(expression: string): boolean {
  const expr = expression.trim();
  if (!expr.startsWith(WRAPPER)) return false;
  let depth = 0;
  for (let i = WRAPPER.length - 1; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")" && --depth === 0) return i === expr.length - 1;
  }
  return false;
}

describe("the <img> scanner these guards rely on", () => {
  it("reads brace, string and template expressions, in multi-line and self-closing tags", () => {
    const source = `
      <img src={a.b} alt="x" />
      <img
        alt={t("a > b")}
        className={\`h-\${n} w-\${n}\`}
        src={toSafeImageSrc(other.avatar ?? other.logo)}
        onError={() => setFailed(true)}
      />
      <img src="/static.png" />
      <img {...props} src='/single.png'>
    `;
    expect(imgSrcExpressions(source)).toEqual(["a.b", "toSafeImageSrc(other.avatar ?? other.logo)", '"/static.png"', "'/single.png'"]);
  });

  it("does not mistake other tags for an <img>", () => {
    expect(imgSrcExpressions('<Image src={user.avatar} /><imgFoo src={x} /><picture src={y}>')).toEqual([]);
    expect(imgSrcExpressions("<img alt='no src' />")).toEqual([]);
  });

  it("accepts one toSafeImageSrc call and nothing that leaks a raw value around it", () => {
    expect(isWrappedCall("toSafeImageSrc(user.avatar)")).toBe(true);
    expect(isWrappedCall("toSafeImageSrc(user.avatar ?? user.logo)")).toBe(true);
    expect(isWrappedCall("toSafeImageSrc(fn(a, b))")).toBe(true);
    expect(isWrappedCall("toSafeImageSrc(user.avatar) ?? user.avatar")).toBe(false);
    expect(isWrappedCall("cond ? toSafeImageSrc(a) : a")).toBe(false);
    expect(isWrappedCall("user.avatar")).toBe(false);
    expect(isWrappedCall("")).toBe(false);
  });

  it("flags a raw photo in a file that also imports and uses toSafeImageSrc elsewhere (the gap the old guard had)", () => {
    const source = `
      import { toSafeImageSrc } from "@/lib/images/externalAvatar";
      export const A = () => <img src={toSafeImageSrc(user.avatar)} alt="" />;
      export const B = () => <img src={user.avatar} alt="" />;
    `;
    expect(source.includes("toSafeImageSrc")).toBe(true); // what the old guard stopped at
    const unwrapped = imgSrcExpressions(source).filter((expr) => !isWrappedCall(expr));
    expect(unwrapped).toEqual(["user.avatar"]);
  });
});

describe("provider avatar render sites", () => {
  it("ui/avatar.tsx rewrites inside AvatarImage", () => {
    const source = read("components/ui/avatar.tsx");
    expect(source).toContain('from "@/lib/images/externalAvatar"');
    // An options object ({ width }) may follow `src`; the photo itself still goes through the rewrite.
    expect(source).toMatch(/src=\{[^}]*toSafeImageSrc\(src(?:, \{ [^{}]* \})?\)[^}]*\}/);
  });

  it.each(RAW_IMG_AVATAR_SITES.map((site) => [site.file, site] as const))(
    "%s: every photo <img src> is itself a toSafeImageSrc call",
    (_file, site) => {
      const source = read(site.file);
      expect(source).toContain('from "@/lib/images/externalAvatar"');
      const sources = imgSrcExpressions(source);
      expect(sources.length).toBeGreaterThan(0);
      const unwrapped = sources.filter((expr) => !isWrappedCall(expr) && !(site.notAPhoto && expr in site.notAPhoto));
      expect(unwrapped).toEqual([]);
      // an exception that no longer matches an <img> is a stale excuse: delete it
      for (const excused of Object.keys(site.notAPhoto ?? {})) expect(sources).toContain(excused);
    },
  );

  it("the CV PDF export (every react-pdf template reads its photo through safePhoto) rewrites in safePhoto", () => {
    const source = read("app/[locale]/(dashboard)/job-seeker/cv/pdf/shared.tsx");
    expect(source).toContain('from "@/lib/images/externalAvatar"');
    const body = /export function safePhoto\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    expect(body).toMatch(/return toSafeImageSrc\(src(?:, \{ [^{}]* \})?\)/);
    expect(body).not.toMatch(/return src\b/);
  });

  it("no other <img> in src (.ts or .tsx) draws an avatar, photo or user image without it", () => {
    const listed = RAW_IMG_AVATAR_SITES.map((site) => path.normalize(site.file));
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (listed.some((site) => file.endsWith(site))) continue;
      if (file.endsWith(path.normalize("components/ui/avatar.tsx"))) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes("<img")) continue;
      for (const expr of imgSrcExpressions(source)) {
        if (PHOTO_LIKE.test(expr) && !isWrappedCall(expr)) offenders.push(`${path.relative(SRC, file)}: src={${expr}}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
