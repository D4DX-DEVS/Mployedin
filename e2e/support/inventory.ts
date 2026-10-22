import type { BrowserContext, Cookie, Page } from "@playwright/test";
import { REGISTRY } from "../../src/lib/consent/registry";
import type { RegistryItem } from "../../src/lib/consent/registry";

/**
 * What a browser holds for this site, and which other hosts it contacted, checked
 * against the cookie registry (src/lib/consent/registry.ts): the same list the
 * banner, the Cookie Policy and the Jest inventory guard read.
 *
 * Used by e2e/cookie-consent.spec.ts and e2e/consent-signed-in.spec.ts on a
 * production build (Next dev keeps its own IndexedDB, `__next_debug_channel`,
 * and dev behaviour proves less).
 */

export type Kind = RegistryItem["kind"];

export interface Inventory {
  cookies: Cookie[];
  localStorage: string[];
  sessionStorage: string[];
  indexedDB: string[];
  caches: string[];
  serviceWorkers: number;
}

/** A registry name ("x" or a prefix "x*") against a real key. */
export function nameMatches(pattern: string, key: string): boolean {
  return pattern.endsWith("*") ? key.startsWith(pattern.slice(0, -1)) : key === pattern;
}

export function rowFor(kind: Kind, key: string): RegistryItem | undefined {
  return REGISTRY.find((row) => row.kind === kind && nameMatches(row.name, key));
}

/** True when `key` of `kind` is a row in the necessary category (strictly necessary, or set by a user action). */
export function isNecessary(kind: Kind, key: string): boolean {
  return rowFor(kind, key)?.category === "necessary";
}

/** True when `key` of `kind` is a row whose basis is "strictly-necessary" (no user action needed). */
export function isStrictlyNecessary(kind: Kind, key: string): boolean {
  return rowFor(kind, key)?.basis === "strictly-necessary";
}

/** The thirdPartyHost row covering `url` (host, and the row's path when it names one). */
export function hostRowFor(url: URL): RegistryItem | undefined {
  const host = url.hostname.toLowerCase();
  return REGISTRY.filter((row) => row.kind === "thirdPartyHost").find((row) => {
    const slash = row.name.indexOf("/");
    const pattern = (slash === -1 ? row.name : row.name.slice(0, slash)).toLowerCase();
    const path = slash === -1 ? "" : row.name.slice(slash);
    const hostOk = pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern;
    return hostOk && url.pathname.startsWith(path);
  });
}

/** Everything the page's origin holds right now. */
export async function inventory(page: Page): Promise<Inventory> {
  const inPage = await page.evaluate(async () => {
    const keys = (storage: Storage) => {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key !== null) out.push(key);
      }
      return out;
    };
    const databases = typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((db) => db.name ?? "") : [];
    const cacheNames = "caches" in window ? await caches.keys() : [];
    const registrations = "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0;
    return { local: keys(localStorage), session: keys(sessionStorage), databases, cacheNames, registrations };
  });
  return {
    cookies: await page.context().cookies(),
    localStorage: inPage.local,
    sessionStorage: inPage.session,
    indexedDB: inPage.databases,
    caches: inPage.cacheNames,
    serviceWorkers: inPage.registrations,
  };
}

export interface InventoryOptions {
  /**
   * After "Reject all": mployedin_a11y may remain as a SESSION cookie (registry:
   * "12 months (session if not allowed)", owner decision D1). With an expiry it fails.
   */
  afterReject?: boolean;
  /**
   * Which necessary rows count. "strict" (the default, for a visitor who has
   * done nothing but load pages and answer the banner): only rows whose basis is
   * strictly necessary, plus the keys in `expected`. "necessary": also the
   * user-action rows (a signed-in session doing its work: drafts, AI threads).
   */
  allow?: "strict" | "necessary";
  /** User-action keys this case's own clicks are expected to leave (cookie / storage names). */
  expected?: string[];
}

function describeRow(kind: Kind, key: string): string {
  const row = rowFor(kind, key);
  return row ? `${row.category}, ${row.basis}` : "no registry row";
}

/**
 * Everything that is not allowed in the inventory: storage outside the allowed
 * rows, any IndexedDB database, Cache Storage or service worker. An empty list
 * is a pass.
 */
export function violations(inv: Inventory, options: InventoryOptions = {}): string[] {
  const out: string[] = [];
  const ok = (kind: Kind, key: string) =>
    (options.expected ?? []).includes(key) || (options.allow === "necessary" ? isNecessary(kind, key) : isStrictlyNecessary(kind, key));
  for (const cookie of inv.cookies) {
    if (options.afterReject && cookie.name === "mployedin_a11y") {
      if (cookie.expires !== -1) out.push(`cookie mployedin_a11y has an expiry after Reject all (${cookie.expires}); it must be a session cookie`);
      continue;
    }
    if (!ok("cookie", cookie.name)) out.push(`cookie ${cookie.name} (${describeRow("cookie", cookie.name)})`);
  }
  for (const key of inv.localStorage) if (!ok("localStorage", key)) out.push(`localStorage ${key} (${describeRow("localStorage", key)})`);
  for (const key of inv.sessionStorage) if (!ok("sessionStorage", key)) out.push(`sessionStorage ${key} (${describeRow("sessionStorage", key)})`);
  for (const name of inv.indexedDB) out.push(`IndexedDB ${name}`);
  for (const name of inv.caches) out.push(`Cache Storage ${name}`);
  if (inv.serviceWorkers > 0) out.push(`${inv.serviceWorkers} service worker registration(s)`);
  return out;
}

/**
 * Records every host other than the site the browser contacts, or tries to:
 * real requests (pages, frames, popups and workers of the context), WebSockets
 * (which are not requests: page "websocket" events, and the context's socket
 * route), loads the Content-Security-Policy blocked (they never become requests,
 * so a stray third-party image would otherwise go unseen), and third-party
 * addresses left in the DOM (img/iframe/script src, preconnect and prefetch links).
 * Third-party WebSockets are closed by the route before they connect.
 */
export class HostRecorder {
  readonly urls: string[] = [];
  private readonly origin: string;

  private constructor(baseURL: string) {
    this.origin = new URL(baseURL).host;
  }

  static async attach(context: BrowserContext, baseURL: string): Promise<HostRecorder> {
    const recorder = new HostRecorder(baseURL);
    context.on("request", (request) => recorder.note(request.url()));
    const watchSockets = (page: Page) => page.on("websocket", (socket) => recorder.note(socket.url()));
    context.pages().forEach(watchSockets);
    context.on("page", watchSockets);
    const origin = new URL(baseURL).host;
    await context.routeWebSocket(
      (url) => url.host !== origin,
      (socket) => {
        recorder.note(socket.url());
        void socket.close({ code: 1008, reason: "third-party WebSocket blocked by the consent E2E" });
      },
    );
    await context.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __cspBlocked: string[] }).__cspBlocked = seen;
      document.addEventListener("securitypolicyviolation", (event) => seen.push(event.blockedURI), true);
    });
    return recorder;
  }

  note(raw: string): void {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (!/^(https?|wss?):$/.test(url.protocol)) return;
    if (url.host === this.origin || url.hostname === "localhost" || url.hostname === "127.0.0.1") return;
    this.urls.push(url.href);
  }

  /** Adds what the page's CSP blocked and the third-party addresses in its DOM. */
  async collect(page: Page): Promise<void> {
    const found = await page
      .evaluate(() => {
        const blocked = (window as unknown as { __cspBlocked?: string[] }).__cspBlocked ?? [];
        const attrs = Array.from(document.querySelectorAll("img[src], iframe[src], script[src], source[src], video[src], audio[src], link[href]"))
          .filter((el) => el.tagName !== "LINK" || /preconnect|dns-prefetch|prefetch|preload|stylesheet|icon|modulepreload/i.test(el.getAttribute("rel") ?? ""))
          .map((el) => (el as HTMLImageElement).src || (el as HTMLLinkElement).href);
        const srcsets = Array.from(document.querySelectorAll("img[srcset], source[srcset]")).flatMap((el) =>
          (el.getAttribute("srcset") ?? "").split(",").map((part) => new URL(part.trim().split(/\s+/)[0] || "/", location.href).href),
        );
        return [...blocked, ...attrs, ...srcsets];
      })
      .catch(() => [] as string[]);
    for (const url of found) this.note(url);
  }

  /** Hosts contacted (or attempted) that are not allowed here. */
  offenders(allow: (row: RegistryItem) => boolean = (row) => row.basis === "strictly-necessary"): string[] {
    return [
      ...new Set(
        this.urls
          .filter((raw) => {
            const row = hostRowFor(new URL(raw));
            return !row || !allow(row);
          })
          .map((raw) => {
            const url = new URL(raw);
            const row = hostRowFor(url);
            return `${url.host}${url.pathname.slice(0, 40)} (${row ? `${row.basis} row ${row.name}` : "no registry row"})`;
          }),
      ),
    ];
  }

  clear(): void {
    this.urls.length = 0;
  }
}
