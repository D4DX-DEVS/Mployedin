"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "next-intl";
import {
  X, Sparkles, Loader2, ChevronDown, ChevronUp,
  Copy, Check, Printer, AlertTriangle, Lightbulb, Target,
  History, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { csrfFetch } from "@/lib/security/csrf-client";

interface Question {
  question: string;
  tests: string;
  strongAnswer: string;
  redFlag: string;
}

type QuestionType = "technical" | "behavioral" | "culture_fit" | "situational";

interface SavedSet {
  _id: string;
  questionType: QuestionType;
  questions: Question[];
  createdAt: string;
}

interface Props {
  interviewId?: string;
  jobTitle: string;
  candidateName?: string;
  skills?: string[];
  experienceYears?: number;
  onClose: () => void;
}

const TABS: { key: QuestionType; label: string; color: string }[] = [
  { key: "technical",    label: "Technical",    color: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "behavioral",   label: "Behavioral",   color: "bg-violet-100 text-violet-700 border-violet-200" },
  { key: "culture_fit",  label: "Culture Fit",  color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "situational",  label: "Situational",  color: "bg-amber-100 text-amber-700 border-amber-200" },
];

export function AIInterviewQuestionsPanel({
  interviewId,
  jobTitle,
  candidateName,
  skills = [],
  experienceYears = 3,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<QuestionType>("technical");
  const [count, setCount] = useState("8");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  // Current (latest) questions per type
  const [questionsByType, setQuestionsByType] = useState<Partial<Record<QuestionType, Question[]>>>({});
  // Full history per type (all previous saved sets, newest first)
  const [historyByType, setHistoryByType] = useState<Partial<Record<QuestionType, SavedSet[]>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const locale = useLocale();
  const isRtl = locale === "ar";

  const questions = questionsByType[activeTab] ?? [];
  const history = historyByType[activeTab] ?? [];

  // Load saved question history on mount
  const loadHistory = useCallback(async () => {
    if (!interviewId) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ai/interview-questions?interviewId=${interviewId}`);
      if (!res.ok) return;
      const data = await res.json();
      const byType = data.history as Record<string, SavedSet[]>;

      setHistoryByType(byType);

      // Pre-populate latest questions per type from history
      const latest: Partial<Record<QuestionType, Question[]>> = {};
      for (const type of TABS.map((t) => t.key)) {
        const sets = byType[type];
        if (sets?.length) {
          latest[type] = sets[0].questions;
        }
      }
      setQuestionsByType(latest);
    } catch {
      // Silently fail — user can still generate fresh
    } finally {
      setHistoryLoading(false);
    }
  }, [interviewId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function generate(type: QuestionType) {
    setLoading(true);
    setError("");
    setExpanded({});
    try {
      const res = await csrfFetch("/api/ai/interview-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          jobTitle,
          candidateName,
          skills,
          experienceYears,
          questionType: type,
          count: Number(count),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to generate questions");
      }
      const data = await res.json();
      setQuestionsByType((prev) => ({ ...prev, [type]: data.questions }));

      // Refresh history to include the newly saved set
      if (interviewId) {
        loadHistory();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(type: QuestionType) {
    setActiveTab(type);
    setError("");
    setShowHistory(false);
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function getAllDisplayQuestions(): Question[] {
    if (showHistory) {
      // Flatten all history sets for the active tab
      return history.flatMap((s) => s.questions);
    }
    return questions;
  }

  function copyAll() {
    const allQ = getAllDisplayQuestions();
    const text = allQ
      .map((q, i) => `Q${i + 1}: ${q.question}\n→ Tests: ${q.tests}\n→ Strong answer: ${q.strongAnswer}\n→ Red flag: ${q.redFlag}`)
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function printQuestions() {
    const allQ = getAllDisplayQuestions();
    const html = `
      <html><head><title>Interview Questions — ${jobTitle}</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:700px;margin:auto}
      h1{font-size:18px;margin-bottom:4px}p.meta{color:#666;font-size:13px;margin-bottom:20px}
      .q{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:14px}
      .q h3{font-size:14px;font-weight:600;margin:0 0 8px}
      .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;margin:6px 0 2px}
      .val{font-size:13px;color:#374151}
      .redflag{color:#dc2626}</style></head>
      <body>
      <h1>Interview Questions: ${jobTitle}</h1>
      <p class="meta">${candidateName ? `Candidate: ${candidateName} · ` : ""}Type: ${activeTab.replace("_", " ")} · ${allQ.length} questions</p>
      ${allQ.map((q, i) => `
        <div class="q">
          <h3>Q${i + 1}: ${q.question}</h3>
          <div class="label">Tests</div><div class="val">${q.tests}</div>
          <div class="label">Strong Answer</div><div class="val">${q.strongAnswer}</div>
          <div class="label redflag">Red Flag</div><div class="val">${q.redFlag}</div>
        </div>`).join("")}
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;
  const totalHistorySets = history.length;

  function renderQuestionCard(q: Question, idx: number, keyPrefix: string) {
    const key = `${keyPrefix}-${idx}`;
    return (
      <div key={key} className="rounded-xl border bg-card overflow-hidden">
        <button
          className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => toggleExpand(key)}
        >
          <span className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center border ${activeTabMeta.color}`}>
            {idx + 1}
          </span>
          <p className="flex-1 text-sm font-medium leading-snug">{q.question}</p>
          {expanded[key]
            ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
        </button>

        {expanded[key] && (
          <div className="border-t divide-y text-xs">
            <div className="px-4 py-3 flex gap-2">
              <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Tests</p>
                <p className="text-foreground/80">{q.tests}</p>
              </div>
            </div>
            <div className="px-4 py-3 flex gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-700 uppercase tracking-wide text-[10px] mb-1">Strong Answer</p>
                <p className="text-foreground/80">{q.strongAnswer}</p>
              </div>
            </div>
            <div className="px-4 py-3 flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-600 uppercase tracking-wide text-[10px] mb-1">Red Flag</p>
                <p className="text-foreground/80">{q.redFlag}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div className={cn(
        "fixed inset-y-0 z-[70] flex flex-col bg-background w-full max-w-xl shadow-2xl overflow-hidden animate-in duration-300",
        isRtl ? "left-0 border-r border-border/60 slide-in-from-left" : "right-0 border-l border-border/60 slide-in-from-right"
      )}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">AI Interview Questions</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {jobTitle}{candidateName ? ` · ${candidateName}` : ""}
            </p>
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {skills.slice(0, 6).map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px] h-4 px-1.5">{s}</Badge>
                ))}
                {skills.length > 6 && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">+{skills.length - 6}</Badge>
                )}
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs + Controls */}
        <div className="px-5 pt-4 pb-3 border-b shrink-0 space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {TABS.map((tab) => {
              const tabHistory = historyByType[tab.key];
              const totalQ = tabHistory?.reduce((sum, s) => sum + s.questions.length, 0) ?? 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all
                    ${activeTab === tab.key
                      ? tab.color
                      : "bg-muted text-muted-foreground border-transparent hover:border-border"}`}
                >
                  {tab.label}
                  {totalQ > 0 && (
                    <span className="ml-1 opacity-60">({totalQ})</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Questions:</span>
            <SearchableSelect
              className="h-7 w-16 text-xs"
              options={["5", "8", "10", "15"].map((n) => ({ value: n, label: n }))}
              value={count}
              onValueChange={setCount}
            />
            <Button
              size="sm" className="h-7 text-xs gap-1.5 flex-1"
              onClick={() => generate(activeTab)}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {loading ? "Generating..." : questions.length ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {/* History toggle */}
          {totalHistorySets > 1 && (
            <button
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${showHistory ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setShowHistory((p) => !p)}
            >
              <History className="w-3.5 h-3.5" />
              {showHistory ? "Show latest only" : `View all history (${totalHistorySets} sets)`}
            </button>
          )}
        </div>

        {/* Questions List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {(loading || historyLoading) && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {historyLoading ? "Loading saved questions..." : `Generating ${count} ${activeTabMeta.label.toLowerCase()} questions...`}
              </p>
            </div>
          )}

          {!loading && !historyLoading && questions.length === 0 && !error && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Sparkles className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Click &quot;Generate&quot; to create {activeTabMeta.label.toLowerCase()} questions
              </p>
            </div>
          )}

          {/* Show history view — all sets grouped by date */}
          {!loading && !historyLoading && showHistory && history.length > 0 && (
            <>
              {history.map((set, setIdx) => (
                <div key={set._id}>
                  <div className="flex items-center gap-2 mb-2 mt-1">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {formatDate(set.createdAt)} · {set.questions.length} questions
                      {setIdx === 0 && <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">Latest</Badge>}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {set.questions.map((q, qi) => renderQuestionCard(q, qi, `h-${set._id}`))}
                  </div>
                  {setIdx < history.length - 1 && (
                    <div className="border-t border-dashed border-border/60 my-4" />
                  )}
                </div>
              ))}
            </>
          )}

          {/* Show latest questions (default view) */}
          {!loading && !historyLoading && !showHistory && questions.map((q, i) => renderQuestionCard(q, i, "current"))}
        </div>

        {/* Footer Actions */}
        {getAllDisplayQuestions().length > 0 && (
          <div className="px-5 py-3 border-t flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={copyAll}>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy All"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={printQuestions}>
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <p className="text-xs text-muted-foreground ms-auto flex items-center">
              {getAllDisplayQuestions().length} questions · {activeTabMeta.label}
            </p>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
