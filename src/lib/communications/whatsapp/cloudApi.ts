/**
 * Meta WhatsApp Cloud API (Graph API) client. The only file that knows URLs
 * and payload shapes. No SDK: Meta's Node SDK is archived, and the surface we
 * use is four endpoints.
 *
 * Error contract: an HTTP response with a non-2xx status throws a
 * WhatsAppApiError built from the Graph `error` body. A failure with no HTTP
 * response at all (DNS, connection reset, the 15 s timeout) is not a
 * WhatsAppApiError: it is rethrown as a plain Error with the original `name`
 * (TimeoutError, AbortError, TypeError), the message scrubbed of credentials,
 * and a `cause: { code }` when the system gave one (ECONNREFUSED). The original
 * error is never rethrown, because fetch can echo the bearer token in its
 * message. The send facade records it as a generic failure with no error kind.
 */
import { getWhatsAppEnv } from "./config";
import { WhatsAppApiError } from "./errors";
import { scrubError } from "./redact";

export const GRAPH_BASE = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;

export interface MetaTemplateComponent {
  type: string; // "BODY" | "HEADER" | "FOOTER" | "BUTTONS"
  format?: string;
  text?: string;
  example?: unknown;
}

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
  quality_score?: { score?: string };
  rejected_reason?: string;
}

interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
  fbtrace_id?: string;
}

async function graphRequest<T>(url: URL, init: RequestInit = {}): Promise<T> {
  const env = getWhatsAppEnv();
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${env.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    // fetch echoes a malformed Authorization header ("Bearer …") in its TypeError, and every caller
    // logs, stores or relays what we throw: so it leaves here as a scrubbed copy, never the original.
    throw scrubError(err);
  }
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = ((json as { error?: GraphError } | null)?.error ?? {}) as GraphError;
    throw new WhatsAppApiError({
      code: err.code,
      message: err.message ?? `Graph API responded ${res.status}`,
      httpStatus: res.status,
      subcode: err.error_subcode,
      details: err.error_data?.details,
      fbtraceId: err.fbtrace_id,
    });
  }
  return json as T;
}

function graphUrl(path: string, query?: Record<string, string>): URL {
  const env = getWhatsAppEnv();
  const url = new URL(`${GRAPH_BASE}/${env.apiVersion}/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  return url;
}

interface SendResponse {
  messages?: Array<{ id: string }>;
  contacts?: Array<{ input: string; wa_id: string }>;
}

function toSendResult(res: SendResponse): { messageId: string; waId?: string } {
  return { messageId: res.messages?.[0]?.id ?? "unknown", waId: res.contacts?.[0]?.wa_id };
}

export async function sendTemplateMessage(input: {
  to: string;
  name: string;
  language: string;
  bodyParams?: string[];
}): Promise<{ messageId: string; waId?: string }> {
  const env = getWhatsAppEnv();
  const template: Record<string, unknown> = { name: input.name, language: { code: input.language } };
  if (input.bodyParams && input.bodyParams.length > 0) {
    template.components = [{ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) }];
  }
  const res = await graphRequest<SendResponse>(graphUrl(`${env.phoneNumberId}/messages`), {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to: input.to, type: "template", template }),
  });
  return toSendResult(res);
}

export async function sendTextMessage(input: { to: string; body: string; previewUrl?: boolean }): Promise<{ messageId: string; waId?: string }> {
  const env = getWhatsAppEnv();
  const res = await graphRequest<SendResponse>(graphUrl(`${env.phoneNumberId}/messages`), {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { preview_url: input.previewUrl ?? false, body: input.body },
    }),
  });
  return toSendResult(res);
}

export async function markMessageRead(messageId: string): Promise<void> {
  const env = getWhatsAppEnv();
  await graphRequest(graphUrl(`${env.phoneNumberId}/messages`), {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
  });
}

export async function listTemplates(): Promise<MetaTemplate[]> {
  const env = getWhatsAppEnv();
  if (!env.businessAccountId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is not set — template sync unavailable");
  const out: MetaTemplate[] = [];
  let next: URL | null = graphUrl(`${env.businessAccountId}/message_templates`, {
    fields: "id,name,language,status,category,components,quality_score,rejected_reason",
    limit: "100",
  });
  while (next) {
    const page: { data?: MetaTemplate[]; paging?: { next?: string } } = await graphRequest(next);
    out.push(...(page.data ?? []));
    next = page.paging?.next ? pagingUrl(page.paging.next) : null;
  }
  return out;
}

/** `paging.next` arrives as an absolute URL; it carries our bearer token on the follow-up, so it must stay on the Graph host. */
function pagingUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.origin !== GRAPH_BASE) throw new Error("Graph API returned an unexpected pagination URL");
  return url;
}

export async function getPhoneNumberInfo(): Promise<{
  verifiedName?: string;
  displayPhoneNumber?: string;
  qualityRating?: string;
  messagingLimitTier?: string;
}> {
  const env = getWhatsAppEnv();
  const res = await graphRequest<{
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
    messaging_limit_tier?: string;
  }>(graphUrl(env.phoneNumberId, { fields: "verified_name,display_phone_number,quality_rating,messaging_limit_tier" }));
  return {
    verifiedName: res.verified_name,
    displayPhoneNumber: res.display_phone_number,
    qualityRating: res.quality_rating,
    messagingLimitTier: res.messaging_limit_tier,
  };
}
