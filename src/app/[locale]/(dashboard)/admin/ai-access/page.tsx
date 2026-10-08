"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BrainCircuit, Plus, Copy, Check, KeyRound, Ban, Play, RefreshCw,
  AlertCircle, CheckCircle2, Activity, BookOpen, FileJson, Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { TableBodySkeleton } from "@/components/ui/loading";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDate, formatDateTime } from "@/lib/ui/intlFormat";
import { toast } from "sonner";

interface PlatformKey {
  _id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  expiresAt?: string | null;
  rateLimitPerMin: number;
  totalRequests: number;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  createdByName?: string | null;
}

const TRY_ENDPOINTS = ["/api/insights/overview", "/api/insights/jobs?limit=2", "/api/insights/schema"] as const;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — value is selectable */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function CodeBlock({ code, copyLabel }: { code: string; copyLabel: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted/40 p-3 pe-12 text-xs leading-relaxed" dir="ltr">
        <code>{code}</code>
      </pre>
      <div className="absolute end-1 top-1">
        <CopyButton value={code} label={copyLabel} />
      </div>
    </div>
  );
}

export default function AdminAiAccessPage() {
  const t = useTranslations("aiAccess");
  const ta = useTranslations("a11y");
  const { confirm, ConfirmDialogNode } = useConfirm();

  const [keys, setKeys] = useState<PlatformKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", pii: false, rateLimitPerMin: 120, expiresInDays: "" });
  const [newKey, setNewKey] = useState<string | null>(null);

  const [tryPath, setTryPath] = useState<string>(TRY_ENDPOINTS[0]);
  const [tryResult, setTryResult] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);

  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/ai-access");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { keys: PlatformKey[] };
      setKeys(data.keys ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  const activeCount = useMemo(() => keys.filter((k) => k.isActive).length, [keys]);
  const totalRequests = useMemo(() => keys.reduce((a, k) => a + (k.totalRequests ?? 0), 0), [keys]);

  const resetForm = () => {
    setForm({ name: "", pii: false, rateLimitPerMin: 120, expiresInDays: "" });
    setNewKey(null);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setCreating(true);
    try {
      const res = await csrfFetch("/api/admin/ai-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          pii: form.pii,
          rateLimitPerMin: form.rateLimitPerMin,
          ...(form.expiresInDays ? { expiresInDays: Number(form.expiresInDays) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t("createFailed"));
        return;
      }
      setNewKey(data.key?.key ?? null);
      toast.success(t("created"));
      void fetchKeys();
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: PlatformKey) => {
    const ok = await confirm({
      title: t("revokeTitle"),
      message: t("revokeMessage", { name: key.name }),
      confirmLabel: t("revoke"),
      variant: "destructive",
    });
    if (!ok) return;
    const res = await csrfFetch(`/api/admin/ai-access/${key._id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(t("revoked"));
      void fetchKeys();
    } else {
      toast.error(t("revokeFailed"));
    }
  };

  const handleTry = async () => {
    setTrying(true);
    setTryResult(null);
    try {
      const res = await fetch(tryPath);
      const text = JSON.stringify(await res.json(), null, 2);
      setTryResult(`HTTP ${res.status}\n${text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text}`);
    } catch {
      setTryResult(t("tryFailed"));
    } finally {
      setTrying(false);
    }
  };

  const base = origin || "https://your-domain";
  const curlExample = `curl -H "Authorization: Bearer mpi_YOUR_KEY" \\\n  "${base}/api/insights/overview"`;
  const mcpUrl = `${base}/api/mcp`;

  return (
    <div className="page-container">
      {ConfirmDialogNode}
      <DashboardPageHeader
        compact
        compactOnMobile
        icon={BrainCircuit}
        title={t("title")}
        description={t("description")}
        metrics={[
          { label: t("activeKeys"), value: activeCount, icon: CheckCircle2, iconClassName: "text-status-selected", iconSurfaceClassName: "bg-status-selected-bg" },
          { label: t("totalKeys"), value: keys.length, icon: KeyRound, iconClassName: "text-muted-foreground", iconSurfaceClassName: "bg-muted/30" },
          { label: t("totalRequests"), value: totalRequests, icon: Activity, iconClassName: "text-status-shortlisted", iconSurfaceClassName: "bg-status-shortlisted-bg" },
        ]}
        actions={
          <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
            <DialogTrigger asChild>
              <Button size="lg" className="gap-2 rounded-xl px-4 text-sm font-semibold">
                <Plus className="h-4 w-4" />
                {t("createKey")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("createKey")}</DialogTitle>
              </DialogHeader>
              {newKey ? (
                <div className="space-y-3">
                  <p className="flex items-start gap-2 rounded-lg border border-status-shortlisted/20 bg-status-shortlisted-bg p-3 text-sm font-medium text-status-shortlisted">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {t("keyShownOnce")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-muted/40 p-2 font-mono text-xs" dir="ltr">{newKey}</code>
                    <CopyButton value={newKey} label={ta("copy")} />
                  </div>
                  <Button className="w-full" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    {t("done")}
                  </Button>
                </div>
              ) : (
                <div className="mt-2 space-y-4">
                  <div className="field">
                    <Label htmlFor="ai-key-name">{t("nameLabel")}</Label>
                    <Input
                      id="ai-key-name"
                      value={form.name}
                      maxLength={100}
                      placeholder={t("namePlaceholder")}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <Label htmlFor="ai-key-pii">{t("piiLabel")}</Label>
                      <p className="text-xs text-muted-foreground">{t("piiHelp")}</p>
                    </div>
                    <Switch id="ai-key-pii" checked={form.pii} onCheckedChange={(v) => setForm({ ...form, pii: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="field">
                      <Label htmlFor="ai-key-rate">{t("rateLimitLabel")}</Label>
                      <Input
                        id="ai-key-rate"
                        type="number"
                        min={10}
                        max={1000}
                        value={form.rateLimitPerMin}
                        onChange={(e) => setForm({ ...form, rateLimitPerMin: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <Label htmlFor="ai-key-expiry">{t("expiresInDaysLabel")}</Label>
                      <Input
                        id="ai-key-expiry"
                        type="number"
                        min={1}
                        max={3650}
                        placeholder={t("neverExpires")}
                        value={form.expiresInDays}
                        onChange={(e) => setForm({ ...form, expiresInDays: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button className="w-full" onClick={handleCreate} disabled={creating}>
                    {t("createKey")}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <section className="workspace-panel-surface overflow-hidden rounded-2xl panel-body">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("keysHeading")}</h2>
          <Button variant="outline" size="iconDense" onClick={fetchKeys} disabled={loading} aria-label={t("refresh")} title={t("refresh")}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {loadError ? (
          <div className="mt-4">
            <ErrorState onRetry={fetchKeys} />
          </div>
        ) : !loading && keys.length === 0 ? (
          <EmptyState icon={KeyRound} title={t("emptyTitle")} description={t("emptyDescription")} className="mt-4" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colPrefix")}</TableHead>
                  <TableHead>{t("colScopes")}</TableHead>
                  <TableHead>{t("colCreated")}</TableHead>
                  <TableHead>{t("colLastUsed")}</TableHead>
                  <TableHead className="text-end">{t("colRequests")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead className="text-end">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableBodySkeleton rows={3} cols={8} />
                ) : (
                  keys.map((k) => {
                    const expired = Boolean(k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now());
                    return (
                      <TableRow key={k._id}>
                        <TableCell className="font-medium">
                          {k.name}
                          {k.createdByName ? <div className="text-xs text-muted-foreground">{t("byCreator", { name: k.createdByName })}</div> : null}
                        </TableCell>
                        <TableCell><code className="font-mono text-xs" dir="ltr">{k.keyPrefix}…</code></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <Badge key={s} variant={s === "pii:read" ? "warning" : "secondary"} className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(k.createdAt)}</TableCell>
                        <TableCell className="text-sm">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : t("never")}</TableCell>
                        <TableCell className="text-end tabular-nums">{k.totalRequests ?? 0}</TableCell>
                        <TableCell>
                          {!k.isActive ? (
                            <Badge variant="outline">{t("statusRevoked")}</Badge>
                          ) : expired ? (
                            <Badge variant="outline">{t("statusExpired")}</Badge>
                          ) : (
                            <Badge>{t("statusActive")}</Badge>
                          )}
                          <div className="text-xs text-muted-foreground">{t("perMinute", { count: k.rateLimitPerMin })}</div>
                        </TableCell>
                        <TableCell className="text-end">
                          {k.isActive ? (
                            <Button variant="ghost" size="sm" className="gap-1.5 text-status-rejected" onClick={() => handleRevoke(k)}>
                              <Ban className="h-3.5 w-3.5" />
                              {t("revoke")}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="workspace-panel-surface rounded-2xl panel-body space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("quickStartHeading")}</h2>
          <p className="text-sm text-muted-foreground">{t("quickStartIntro")}</p>
        </div>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />{t("curlHeading")}</h3>
          <CodeBlock code={curlExample} copyLabel={ta("copy")} />
        </div>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium"><Plug className="h-4 w-4" />{t("mcpHeading")}</h3>
          <p className="text-xs text-muted-foreground">{t("mcpHelp")}</p>
          <CodeBlock code={mcpUrl} copyLabel={ta("copy")} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/insights/schema" target="_blank" rel="noopener noreferrer"><BookOpen className="h-3.5 w-3.5" />{t("schemaLink")}</a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/insights/openapi.json" target="_blank" rel="noopener noreferrer"><FileJson className="h-3.5 w-3.5" />{t("openapiLink")}</a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/llms.txt" target="_blank" rel="noopener noreferrer"><BookOpen className="h-3.5 w-3.5" />{t("docsLink")}</a>
          </Button>
        </div>

        <div className="space-y-2 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium"><Play className="h-4 w-4" />{t("tryHeading")}</h3>
          <p className="text-xs text-muted-foreground">{t("tryHelp")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {TRY_ENDPOINTS.map((p) => (
              <Badge
                key={p}
                variant={tryPath === p ? "default" : "outline"}
                className="cursor-pointer select-none font-mono"
                onClick={() => setTryPath(p)}
              >
                {p}
              </Badge>
            ))}
            <Button size="sm" onClick={handleTry} disabled={trying} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              {t("tryButton")}
            </Button>
          </div>
          {tryResult ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-muted/40 p-3 text-xs" dir="ltr">{tryResult}</pre>
          ) : null}
        </div>
      </section>
    </div>
  );
}
