/**
 * Fixtures shared by the bulk CV export tests (the hook and the dialog): manifest
 * rows, fake fetch responses, an AbortSignal-aware promise wrapper and small
 * Blob helpers. Nothing here mocks a module; each test file does that itself.
 */
import type { CvExportAllowedItem, CvExportDeniedItem, CvExportManifestItem } from "@/lib/cv/cvExportTypes";

export const seekerId = (n: number) => String(n).padStart(24, "0");

export function allowed(n: number, over: Partial<CvExportAllowedItem> = {}): CvExportAllowedItem {
  const base = `/api/employers/candidates/${seekerId(n)}/cv`;
  return {
    seekerId: seekerId(n),
    name: `Name ${n}`,
    hasStandardised: true,
    hasOriginal: true,
    originalIsBuilt: false,
    originalUrl: base,
    builtUrl: `${base}?kind=built`,
    ...over,
  };
}

export function denied(n: number): CvExportDeniedItem {
  return { seekerId: seekerId(n), denied: true };
}

export const itemsFor = (rows: CvExportManifestItem[]) => rows.map((row) => ({ seekerId: row.seekerId }));

export interface FakeResponse {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  blob: () => Promise<Blob>;
}

export function fakeResponse(status: number, opts: { json?: unknown; type?: string; body?: string } = {}): FakeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? (opts.type ?? null) : null) },
    json: async () => opts.json,
    blob: async () => new Blob([opts.body ?? "file"], { type: opts.type ?? "" }),
  };
}

export const asResponse = (response: FakeResponse) => response as unknown as Response;

/** What GET ...?kind=built answers for a candidate with content. */
export const BUILT_JSON = { hasContent: true, identity: { fullName: "N", email: "", phone: "" }, profile: {} };

/** Rejects like fetch does when the signal fires. */
export function abortable<T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const pdfBlob = () => new Blob(["%PDF-standardised"], { type: "application/pdf" });

/** jsdom's Blob has no arrayBuffer(); FileReader does. */
export function blobToBuffer(blob: Blob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
