"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API, SectionCard, TemplateLabel, errorKindLabel, type Translator, type WaTemplate } from "./shared";

const SANDBOX = "__sandbox__";

/** A template is addressed by (name, language), the way Meta and the send API do: the same name exists once per language. */
const templateKey = (x: Pick<WaTemplate, "name" | "language">) => `${x.name}::${x.language}`;

interface TestResponse {
  outcome?: { status: string; messageId: string };
  error?: unknown;
  errorKind?: unknown;
}

/**
 * Copy for a failed send, chosen by HTTP status and the classified kind. The response's `error` and
 * `details` text is Meta's own wording or a validator's, so it is never rendered (only the `opted_out` code is compared).
 */
function failureCopy(httpStatus: number, data: TestResponse, t: Translator): string {
  if (httpStatus === 409 && data.error === "opted_out") return t("testOptedOut");
  if (httpStatus === 429) return t("testRateLimited");
  if (httpStatus === 400) return t("testInvalid");
  if (httpStatus === 502) {
    // No kind: the number was rejected before reaching Meta, or the request never got an answer.
    return typeof data.errorKind === "string" && data.errorKind
      ? `${t("testMetaError")}: ${errorKindLabel(data.errorKind, t)}`
      : t("testNotSent");
  }
  return t("testError");
}

/** `mode` is undefined until the status has loaded (and stays so if the load fails): the not-connected hint is shown only when the server says mock. */
export function TestTab({ mode }: { mode?: "live" | "mock" }) {
  const t = useTranslations("adminWhatsApp");
  const locale = useLocale();
  const [to, setTo] = useState("");
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [selected, setSelected] = useState<string>(SANDBOX);
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "mock" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API.templates}?status=APPROVED`)
      .then(async (r) => (r.ok ? ((await r.json()) as { templates?: WaTemplate[] }).templates ?? [] : []))
      .catch(() => [] as WaTemplate[])
      .then((list) => {
        if (!cancelled) setTemplates(list);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chosen = templates.find((x) => templateKey(x) === selected) ?? null;
  const pick = (key: string) => {
    setSelected(key);
    const count = templates.find((x) => templateKey(x) === key)?.bodyParamCount ?? 0;
    setParams(Array.from({ length: count }, (_, i) => (i === 0 ? "Admin" : `Test ${i + 1}`)));
  };

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      // Meta's sandbox template takes no variables; so does any approved template with none.
      const body = chosen
        ? { to, templateName: chosen.name, language: chosen.language, params: chosen.bodyParamCount > 0 ? params : [] }
        : { to, templateName: "hello_world", language: "en_US", params: [] };
      const res = await fetch(API.test, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as TestResponse;
      if (res.ok && data.outcome) {
        setResult(data.outcome.status === "mock" ? { tone: "mock", text: t("testMock") } : { tone: "ok", text: t("testSuccess", { id: data.outcome.messageId }) });
      } else {
        setResult({ tone: "error", text: failureCopy(res.status, data, t) });
      }
    } catch {
      toast.error(t("testError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard title={t("testTitle")} icon={Send}>
      <div className="panel-body space-y-4">
        <p className="text-sm text-muted-foreground">{t("testDesc")}</p>
        {mode === "mock" && <p className="text-xs text-muted-foreground">{t("modeMockHint")}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wa-test-to">{t("testPhone")}</Label>
            <Input id="wa-test-to" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+971501234567" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-test-template">{t("testTemplate")}</Label>
            <Select value={selected} onValueChange={pick}>
              <SelectTrigger id="wa-test-template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SANDBOX}>{t("testSandboxTemplate")}</SelectItem>
                {templates.map((x) => (
                  <SelectItem key={templateKey(x)} value={templateKey(x)}><TemplateLabel name={x.name} language={x.language} locale={locale} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {chosen && chosen.bodyParamCount > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {params.map((v, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`wa-test-param-${i}`}>{t("paramPlaceholder", { index: i + 1 })}</Label>
                <Input id={`wa-test-param-${i}`} value={v} onChange={(e) => setParams((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={send} disabled={sending || !to.trim()}>
            <Send className="w-3.5 h-3.5" /> {sending ? t("testSending") : t("testSend")}
          </Button>
          {result && (
            <p
              role={result.tone === "error" ? "alert" : "status"}
              className={`text-sm ${result.tone === "error" ? "text-destructive" : result.tone === "mock" ? "text-amber-600" : "text-green-600"}`}
            >
              {result.text}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
