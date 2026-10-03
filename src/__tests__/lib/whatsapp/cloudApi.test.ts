/**
 * @jest-environment node
 */
import { sendTemplateMessage, sendTextMessage, listTemplates, getPhoneNumberInfo, markMessageRead } from "@/lib/communications/whatsapp/cloudApi";
import { WhatsAppApiError } from "@/lib/communications/whatsapp/errors";

const fetchMock = jest.fn();

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(body) });
}
function fail(status: number, error: Record<string, unknown>) {
  return Promise.resolve({ ok: false, status, text: async () => JSON.stringify({ error }) });
}

const KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"];

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WHATSAPP_ACCESS_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "777";
  process.env.WHATSAPP_APP_SECRET = "sec";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify";
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

/** The error a call rejects with; a call that resolves fails the test. */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected the call to reject");
}

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [URL, RequestInit];

describe("sendTemplateMessage", () => {
  it("posts a template payload with body parameters and returns the wamid", async () => {
    fetchMock.mockReturnValueOnce(ok({ messages: [{ id: "wamid.1" }], contacts: [{ input: "971501234567", wa_id: "971501234567" }] }));
    const res = await sendTemplateMessage({ to: "971501234567", name: "mployedin_application_status", language: "en", bodyParams: ["Sara", "Shortlisted"] });
    expect(res).toEqual({ messageId: "wamid.1", waId: "971501234567" });
    const [url, init] = lastCall();
    expect(String(url)).toBe("https://graph.facebook.com/v24.0/555/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      to: "971501234567",
      type: "template",
      template: {
        name: "mployedin_application_status",
        language: { code: "en" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Sara" }, { type: "text", text: "Shortlisted" }] }],
      },
    });
  });

  it("omits components when the template has no parameters", async () => {
    fetchMock.mockReturnValueOnce(ok({ messages: [{ id: "wamid.2" }] }));
    await sendTemplateMessage({ to: "971501234567", name: "hello_world", language: "en_US" });
    expect(JSON.parse(String(lastCall()[1].body)).template).toEqual({ name: "hello_world", language: { code: "en_US" } });
  });

  it("throws a classified WhatsAppApiError on a Graph error", async () => {
    fetchMock.mockReturnValueOnce(fail(400, { message: "Re-engagement message", type: "OAuthException", code: 131047, fbtrace_id: "tr1", error_data: { details: "outside window" } }));
    await expect(sendTemplateMessage({ to: "971501234567", name: "x", language: "en" })).rejects.toMatchObject({
      name: "WhatsAppApiError", code: 131047, httpStatus: 400, kind: "outside_window", details: "outside window", fbtraceId: "tr1",
    });
  });

  it("carries the Graph error_subcode through", async () => {
    fetchMock.mockReturnValueOnce(fail(401, { message: "Session has expired", code: 190, error_subcode: 463, fbtrace_id: "tr2" }));
    await expect(sendTemplateMessage({ to: "971501234567", name: "x", language: "en" })).rejects.toMatchObject({
      code: 190, subcode: 463, httpStatus: 401, kind: "auth", retryable: false,
    });
  });

  it("classifies a non-JSON 5xx body (gateway page) as an unknown, retryable error with a numeric httpStatus", async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 502, text: async () => "<html>Bad Gateway</html>" }));
    const err = await sendTemplateMessage({ to: "971501234567", name: "x", language: "en" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhatsAppApiError);
    expect(err).toMatchObject({ httpStatus: 502, kind: "unknown", retryable: true, message: "Graph API responded 502" });
    expect((err as WhatsAppApiError).code).toBeUndefined();
  });

  // Was `expect(err).toBe(netErr)`: a transport failure is now rethrown as a scrubbed copy, so the
  // assertion is on name and message instead of identity.
  it("rethrows a transport failure (no HTTP response) as a plain Error with the same name and message, not a WhatsAppApiError", async () => {
    const netErr = new TypeError("fetch failed");
    fetchMock.mockReturnValueOnce(Promise.reject(netErr));
    const err = await sendTemplateMessage({ to: "971501234567", name: "x", language: "en" }).catch((e: unknown) => e);
    expect(err).not.toBe(netErr);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WhatsAppApiError);
    expect(err).toMatchObject({ name: "TypeError", message: "fetch failed" });
    expect((err as Error).cause).toBeUndefined();
  });

  describe("a transport failure that carries the access token", () => {
    const TOKEN = "SECRETTOKEN123";
    const call = () => rejection(sendTemplateMessage({ to: "971501234567", name: "x", language: "en" }));
    const everything = (e: Error) => JSON.stringify({ name: e.name, message: e.message, stack: e.stack, cause: e.cause });

    it("is rethrown without the token in its message, stack or cause, and keeps its name", async () => {
      fetchMock.mockReturnValueOnce(Promise.reject(new TypeError(`Headers.append: "Bearer ${TOKEN}" is an invalid header value.`)));
      const err = await call();
      expect(err.name).toBe("TypeError");
      expect(err.message).toBe('Headers.append: "Bearer [redacted]" is an invalid header value.');
      expect(everything(err)).not.toContain(TOKEN);
      expect(err).not.toBeInstanceOf(WhatsAppApiError);
    });

    it("blanks the configured token even without a Bearer prefix", async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = "EAAB-secret-value";
      fetchMock.mockReturnValueOnce(Promise.reject(new Error("connect failed for EAAB-secret-value")));
      const err = await call();
      expect(err.message).toBe("connect failed for [redacted]");
    });

    it("also scrubs a failure while reading the response body", async () => {
      fetchMock.mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, text: async () => { throw new TypeError(`bad Bearer ${TOKEN}`); } }));
      const err = await call();
      expect(err.message).toBe("bad Bearer [redacted]");
      expect(everything(err)).not.toContain(TOKEN);
    });

    it("covers every request, including the read receipt the webhook sends for each inbound message", async () => {
      fetchMock.mockImplementation(() => Promise.reject(new TypeError(`Headers.append: "Bearer ${TOKEN}" is invalid`)));
      for (const run of [() => markMessageRead("wamid.in"), () => getPhoneNumberInfo(), () => sendTextMessage({ to: "971501234567", body: "Hi" }), () => listTemplates()]) {
        const err = await rejection(run());
        expect(everything(err)).not.toContain(TOKEN);
        expect(err.message).toBe('Headers.append: "Bearer [redacted]" is invalid');
      }
    });

    it("rethrows a thrown non-Error as an Error with a scrubbed message", async () => {
      fetchMock.mockReturnValueOnce(Promise.reject(`boom Bearer ${TOKEN}`));
      const err = await call();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("boom Bearer [redacted]");
    });
  });

  describe("a transport failure with no token in it", () => {
    const call = () => rejection(sendTemplateMessage({ to: "971501234567", name: "x", language: "en" }));

    it("keeps the TimeoutError name of the 15 s abort", async () => {
      fetchMock.mockReturnValueOnce(Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError")));
      const err = await call();
      expect(err.name).toBe("TimeoutError");
      expect(err.message).toBe("The operation was aborted due to timeout");
    });

    it("keeps the AbortError name", async () => {
      fetchMock.mockReturnValueOnce(Promise.reject(new DOMException("This operation was aborted", "AbortError")));
      expect((await call()).name).toBe("AbortError");
    });

    it("keeps the system code from the cause (undici's `fetch failed`) as a plain { code }, not the original cause", async () => {
      const cause = Object.assign(new Error("connect ECONNREFUSED 157.240.1.1:443"), { code: "ECONNREFUSED" });
      const netErr = new TypeError("fetch failed", { cause });
      fetchMock.mockReturnValueOnce(Promise.reject(netErr));
      const err = await call();
      expect(err.message).toBe("fetch failed");
      expect(err.cause).toEqual({ code: "ECONNREFUSED" });
      expect(err.cause).not.toBe(cause);
    });
  });

  it("sends an abort signal so a hung request cannot block the caller", async () => {
    fetchMock.mockReturnValueOnce(ok({ messages: [{ id: "wamid.4" }] }));
    await sendTemplateMessage({ to: "971501234567", name: "x", language: "en" });
    expect(lastCall()[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("never puts the access token in a thrown error", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "EAAB-secret-value";
    fetchMock.mockReturnValueOnce(fail(401, { message: "Invalid OAuth access token", code: 190 }));
    const err = await sendTemplateMessage({ to: "971501234567", name: "x", language: "en" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhatsAppApiError);
    expect(JSON.stringify(err)).not.toContain("EAAB-secret-value");
    expect(String((err as Error).message)).not.toContain("EAAB-secret-value");
    expect(String(lastCall()[0])).not.toContain("EAAB-secret-value");
  });

  it("throws the not-configured error without calling Graph when env is missing", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    await expect(sendTemplateMessage({ to: "971501234567", name: "x", language: "en" })).rejects.toThrow(/not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendTextMessage", () => {
  it("posts a text payload", async () => {
    fetchMock.mockReturnValueOnce(ok({ messages: [{ id: "wamid.3" }] }));
    await sendTextMessage({ to: "971501234567", body: "Hello" });
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "971501234567", type: "text", text: { preview_url: false, body: "Hello" },
    });
  });

  it("honours previewUrl", async () => {
    fetchMock.mockReturnValueOnce(ok({ messages: [{ id: "wamid.5" }] }));
    await sendTextMessage({ to: "971501234567", body: "See https://x.co", previewUrl: true });
    expect(JSON.parse(String(lastCall()[1].body)).text.preview_url).toBe(true);
  });
});

describe("markMessageRead", () => {
  it("posts a read status", async () => {
    fetchMock.mockReturnValueOnce(ok({ success: true }));
    await markMessageRead("wamid.in");
    expect(JSON.parse(String(lastCall()[1].body))).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.in" });
  });
});

describe("listTemplates", () => {
  it("follows paging.next and concatenates", async () => {
    fetchMock
      .mockReturnValueOnce(ok({ data: [{ id: "1", name: "a", language: "en", status: "APPROVED", category: "UTILITY" }], paging: { next: "https://graph.facebook.com/v24.0/777/message_templates?after=abc" } }))
      .mockReturnValueOnce(ok({ data: [{ id: "2", name: "b", language: "ar", status: "PENDING", category: "MARKETING" }] }));
    const all = await listTemplates();
    expect(all.map((t) => t.id)).toEqual(["1", "2"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/777/message_templates?");
    expect(String(fetchMock.mock.calls[1][0])).toContain("after=abc");
  });
  it("refuses without a WABA id", async () => {
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "";
    await expect(listTemplates()).rejects.toThrow(/WHATSAPP_BUSINESS_ACCOUNT_ID/);
  });
  it("requests the template fields and sends the bearer token on every page", async () => {
    fetchMock
      .mockReturnValueOnce(ok({ data: [], paging: { next: "https://graph.facebook.com/v24.0/777/message_templates?after=abc" } }))
      .mockReturnValueOnce(ok({ data: [] }));
    await listTemplates();
    const first = new URL(String(fetchMock.mock.calls[0][0]));
    expect(first.searchParams.get("fields")).toBe("id,name,language,status,category,components,quality_score,rejected_reason");
    expect(first.searchParams.get("limit")).toBe("100");
    for (const call of fetchMock.mock.calls as Array<[URL, RequestInit]>) {
      expect((call[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
    }
  });
  it("does not follow a paging.next that points off the Graph host (the bearer token would leak)", async () => {
    fetchMock.mockReturnValueOnce(ok({ data: [{ id: "1", name: "a", language: "en", status: "APPROVED", category: "UTILITY" }], paging: { next: "https://evil.example/steal?after=abc" } }));
    await expect(listTemplates()).rejects.toThrow(/pagination/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getPhoneNumberInfo", () => {
  it("maps Meta's snake_case fields", async () => {
    fetchMock.mockReturnValueOnce(ok({ verified_name: "MPLOYEDIN", display_phone_number: "+971 4 000 0000", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K" }));
    expect(await getPhoneNumberInfo()).toEqual({ verifiedName: "MPLOYEDIN", displayPhoneNumber: "+971 4 000 0000", qualityRating: "GREEN", messagingLimitTier: "TIER_1K" });
    const url = new URL(String(lastCall()[0]));
    expect(url.pathname).toBe("/v24.0/555");
    expect(url.searchParams.get("fields")).toBe("verified_name,display_phone_number,quality_rating,messaging_limit_tier");
  });
});
