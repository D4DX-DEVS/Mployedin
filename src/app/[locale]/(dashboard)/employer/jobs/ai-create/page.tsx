"use client";

import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bot, Globe, Loader2, Mic, Send, Sparkles, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function hasMalayalam(text: string): boolean {
  return /[\u0D00-\u0D7F]/.test(text);
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ExtractedRequirements {
  skills?: string[];
  experienceMin?: number;
  experienceMax?: number;
}

interface ExtractedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: "monthly" | "yearly" | "lpa";
  isNegotiable?: boolean;
}

interface ExtractedJob {
  title?: string;
  category?: string;
  location?: string | { country?: string; city?: string; isRemote?: boolean };
  description?: string;
  requirements?: string[] | ExtractedRequirements & { preferredSkills?: string[] };
  salary?: ExtractedSalary;
  employmentType?: string;
  workMode?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  vacancies?: number;
  showSalary?: boolean;
  tags?: string[];
  visibility?: string;
}

const INITIAL_MESSAGE = `Hello! I can draft this job with a few basics first.

Tell me the role, location, top skills, and any salary or openings if you want to share them. You can type or use voice.

For example: "Senior React developer in Kochi, hybrid, Node and React, salary optional, 2 openings."`;

const AI_PREFILL_STORAGE_KEY = "job-ai-prefill";
const VOICE_WAVE_BARS = [0.45, 0.8, 1, 0.65, 0.9, 0.55, 0.75] as const;
const DETECTED_LANGUAGE_LABELS: Record<string, string> = {
  "en-US": "English",
  "ar-SA": "Arabic",
  "ml-IN": "Malayalam",
  "hi-IN": "Hindi",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "ur-PK": "Urdu",
};

function extractSkills(requirements?: ExtractedJob["requirements"]): string[] {
  if (Array.isArray(requirements)) {
    return requirements.filter(Boolean).slice(0, 12);
  }

  return requirements?.skills?.filter(Boolean).slice(0, 12) ?? [];
}

function normalizeLocation(location?: ExtractedJob["location"]): JobFormValues["location"] {
  if (!location) {
    return { country: "", city: "", isRemote: false };
  }

  if (typeof location === "object") {
    return {
      country: location.country ?? "",
      city: location.city ?? "",
      isRemote: Boolean(location.isRemote),
    };
  }

  const isRemote = /remote/i.test(location);
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);

  return {
    city: isRemote ? "Remote" : (parts[0] ?? ""),
    country: isRemote ? (parts[1] ?? "Remote / Global") : (parts.slice(1).join(", ") || ""),
    isRemote,
  };
}

function normalizeEmploymentType(val?: string): JobFormValues["employmentType"] | undefined {
  const valid = ["full_time", "part_time", "contract", "internship", "freelance"] as const;
  if (!val) return undefined;
  const normalized = val.toLowerCase().replace(/[- ]/g, "_");
  return valid.includes(normalized as typeof valid[number]) ? normalized as typeof valid[number] : undefined;
}

function normalizeWorkMode(val?: string): JobFormValues["workMode"] | undefined {
  const map: Record<string, JobFormValues["workMode"]> = {
    onsite: "onsite", "on-site": "onsite", "on_site": "onsite", office: "onsite",
    hybrid: "hybrid",
    remote: "remote", wfh: "remote",
  };
  if (!val) return undefined;
  return map[val.toLowerCase()] ?? undefined;
}

function buildPrefill(job: ExtractedJob): Partial<JobFormValues> {
  const requirements = Array.isArray(job.requirements) ? {} : (job.requirements ?? {});
  const preferredSkills = !Array.isArray(job.requirements) ? (job.requirements?.preferredSkills ?? []) : [];

  return {
    title: job.title ?? "",
    category: job.category ?? "",
    description: job.description ?? "",
    location: normalizeLocation(job.location),
    employmentType: normalizeEmploymentType(job.employmentType),
    workMode: normalizeWorkMode(job.workMode),
    requirements: {
      skills: extractSkills(job.requirements),
      preferredSkills: preferredSkills.filter(Boolean).slice(0, 30),
      experienceMin: requirements.experienceMin ?? 0,
      experienceMax: requirements.experienceMax ?? 10,
    },
    responsibilities: job.responsibilities?.filter(Boolean).slice(0, 20) ?? [],
    qualifications: job.qualifications?.filter(Boolean).slice(0, 20) ?? [],
    benefits: job.benefits?.filter(Boolean).slice(0, 20) ?? [],
    salary: {
      min: job.salary?.min ?? 0,
      max: job.salary?.max ?? 0,
      currency: job.salary?.currency ?? "USD",
      period: job.salary?.period ?? "monthly",
      isNegotiable: job.salary?.isNegotiable ?? false,
    },
    showSalary: job.showSalary ?? Boolean((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0),
    vacancies: job.vacancies,
    tags: job.tags?.length ? job.tags.slice(0, 6) : extractSkills(job.requirements).slice(0, 6),
  };
}

function getDetectedLanguageLabel(language: string | null): string | null {
  if (!language) {
    return null;
  }

  return DETECTED_LANGUAGE_LABELS[language] ?? language;
}

const VOICE_LANGUAGES = [
  { code: "auto", label: "Auto", flag: "🌐" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "Arabic", flag: "🇸🇦" },
  { code: "ml", label: "Malayalam", flag: "🇮🇳" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
  { code: "ur", label: "Urdu", flag: "🇵🇰" },
  { code: "ta", label: "Tamil", flag: "🇮🇳" },
  { code: "te", label: "Telugu", flag: "🇮🇳" },
];

// ─── Markdown renderer ─────────────────────────────────────────
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*"))
      return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="rounded bg-black/10 px-1 font-mono text-[0.88em] dark:bg-white/10">{part.slice(1, -1)}</code>;
    return part;
  });
}

function renderMarkdown(text: string) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const indent = bi > 0 ? "mt-2" : "";
    if (/^\d+\.\s/m.test(block)) {
      const items = block.split(/\n/).filter(Boolean);
      return (
        <ol key={bi} className={`list-decimal list-inside space-y-0.5 ${indent}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item.replace(/^\d+\.\s*/, ""))}</li>
          ))}
        </ol>
      );
    }
    if (/^[-•*]\s/m.test(block)) {
      const items = block.split(/\n/).filter(Boolean);
      return (
        <ul key={bi} className={`list-disc list-inside space-y-0.5 ${indent}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item.replace(/^[-•*]\s*/, ""))}</li>
          ))}
        </ul>
      );
    }
    const lines = block.split("\n");
    return (
      <p key={bi} className={indent}>
        {lines.map((line, li) => (
          <Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </Fragment>
        ))}
      </p>
    );
  });
}

export default function EmployerAIJobCreatePage() {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_MESSAGE }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJob, setExtractedJob] = useState<ExtractedJob | null>(null);
  const [voiceLanguage, setVoiceLanguage] = useState("auto");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const {
    state: voiceState,
    startRecording,
    cancelRecording,
    submitRecording,
    isRecording,
    isProcessing: isVoiceProcessing,
    durationMs,
    durationLabel,
    detectedLanguage,
    clearTranscript,
    error: voiceError,
  } = useVoiceInput({
    language: voiceLanguage,
    mode: "explicitSend",
    maxDurationMs: 60000,
    onTranscript: (text) => {
      setInput((current) => current ? `${current} ${text}` : text);
      requestAnimationFrame(() => autoResize());
    },
  });

  const detectedLanguageLabel = getDetectedLanguageLabel(detectedLanguage);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || isRecording || isVoiceProcessing) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsStreaming(true);

    const allMessages = [...messages, userMsg];
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          context: "job_creator",
        }),
      });

      if (!res.ok || !res.body) throw new Error("Stream error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: accumulated };
          return copy;
        });
      }

      // Try to extract job data
      const jobDataMatch = accumulated.match(/<JOB_DATA>([\s\S]*?)<\/JOB_DATA>/);
      if (jobDataMatch) {
        try {
          const jobData = JSON.parse(jobDataMatch[1].trim());
          setExtractedJob(jobData);
          toast.success("Draft details are ready to review in the form.");
        } catch { /* ignore parse errors */ }
      }
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { ...copy[copy.length - 1], content: "Sorry, something went wrong. Please try again." };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const reviewInForm = () => {
    if (!extractedJob) return;
    try {
      sessionStorage.setItem(AI_PREFILL_STORAGE_KEY, JSON.stringify(buildPrefill(extractedJob)));
      router.push(`/${locale}/employer/jobs/new?mode=manual&prefill=ai`);
    } catch {
      toast.error("Failed to open the review form. Please try again.");
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="AI Job Creator"
        description="Answer a few basics with typing or voice. AI will prefill the full job form for review before anything is saved."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Chat panel */}
        <div className="md:col-span-2 flex flex-col card-base h-[500px]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-none"
                    : "bg-muted text-foreground rounded-tl-none",
                  hasMalayalam(msg.content) && "font-malayalam"
                )}>
                  {(() => {
                    const hasJobData = /<JOB_DATA>[\s\S]*?<\/JOB_DATA>/.test(msg.content);
                    const displayText = msg.content.replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/, "").trim();
                    if (msg.role === "assistant") {
                      return (
                        <div className="prose-sm prose-p:my-0 prose-li:my-0">
                          {renderMarkdown(displayText)}
                          {hasJobData && !isStreaming && (
                            <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-green-800 text-xs">
                              <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="font-medium">Draft ready — check the Job Preview panel on the right →</span>
                            </div>
                          )}
                          {isStreaming && i === messages.length - 1 && (
                            <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
                          )}
                        </div>
                      );
                    }
                    return (
                      <>
                        <span className="whitespace-pre-wrap">{displayText}</span>
                        {isStreaming && i === messages.length - 1 && (
                          <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="border-t bg-background/95 p-3 space-y-2">
            <div className="space-y-3">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  if (detectedLanguage) {
                    clearTranscript();
                  }
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Describe the role, location, skills, and optional salary or openings..."
                disabled={isStreaming || isRecording || isVoiceProcessing}
                rows={1}
                className="min-h-[44px] max-h-[200px] flex-1 resize-none rounded-xl border-border/60 bg-muted/20 overflow-y-auto transition-[height] duration-100"
              />
              {voiceState === "recording" ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelRecording}
                    className="h-10 rounded-xl border-border/60 px-3 text-muted-foreground hover:text-foreground"
                    aria-label="Cancel voice input"
                  >
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    <div className="flex items-end gap-0.5 h-4" aria-hidden="true">
                      {VOICE_WAVE_BARS.map((height, index) => (
                        <span
                          key={index}
                          className="w-0.5 rounded-full bg-current origin-bottom"
                          style={{
                            height: `${height * 100}%`,
                            animation: "voiceBar 0.8s ease-in-out infinite alternate",
                            animationDelay: `${index * 0.1}s`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium leading-none">Listening...</p>
                      <p className="mt-1 text-xs text-red-700/80">Tap send when you're ready.</p>
                    </div>
                    <span
                      className="ml-auto font-mono text-sm tabular-nums"
                      aria-label={`Recording length ${Math.max(1, Math.floor(durationMs / 1000))} seconds`}
                    >
                      {durationLabel}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={submitRecording}
                    className="h-10 rounded-xl px-4"
                    aria-label="Send voice input"
                  >
                    <Send className="mr-1.5 h-4 w-4" /> Send
                  </Button>
                </div>
              ) : voiceState === "processing" ? (
                <div
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  className="flex items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="font-medium">Processing voice...</span>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-2">
                  {/* Voice language picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowLangPicker((v) => !v)}
                      disabled={isRecording || isVoiceProcessing}
                      className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted disabled:opacity-40"
                      title="Voice language"
                    >
                      <Globe className="h-3 w-3" />
                      <span>{(VOICE_LANGUAGES.find((l) => l.code === voiceLanguage) ?? VOICE_LANGUAGES[0]).flag} {voiceLanguage.toUpperCase()}</span>
                    </button>
                    {showLangPicker && (
                      <div className="absolute bottom-full right-0 mb-1 z-50 w-36 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                        {VOICE_LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => { setVoiceLanguage(lang.code); setShowLangPicker(false); }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-muted transition-colors",
                              lang.code === voiceLanguage && "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            <span>{lang.flag}</span>
                            <span>{lang.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void startRecording()}
                    disabled={isStreaming}
                    className="h-10 w-10 rounded-xl border-border/60 p-0 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    title="Start voice input"
                    aria-label="Start voice input"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || isStreaming}
                    aria-label="Send AI prompt"
                    className="btn-primary h-10 w-10 rounded-xl p-0 flex-shrink-0 flex items-center justify-center disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="min-h-5" aria-live="polite" aria-atomic="true">
              {voiceError ? (
                <p role="alert" className="text-xs text-destructive">
                  {voiceError}
                </p>
              ) : voiceState === "idle" && detectedLanguageLabel ? (
                <p className="text-[11px] text-muted-foreground/80">
                  Detected language: {detectedLanguageLabel}
                </p>
              ) : voiceState === "idle" ? (
                <p className="text-[11px] text-muted-foreground/70 text-center sm:text-left">
                  Press Enter to send, use Shift+Enter for a new line, or tap the mic to dictate a longer brief.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Extracted job preview */}
        <div className="space-y-3">
          <div className={`card-base p-5 space-y-3 transition-all ${extractedJob ? "border-green-300 bg-green-50/30" : ""}`}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Job Preview</h3>
            </div>
            {!extractedJob ? (
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>AI will ask for these basics first:</p>
                <div className="grid gap-2">
                  <div className="rounded-xl border border-dashed border-border px-3 py-2">Role and team</div>
                  <div className="rounded-xl border border-dashed border-border px-3 py-2">Location and work setup</div>
                  <div className="rounded-xl border border-dashed border-border px-3 py-2">Key skills and requirements</div>
                  <div className="rounded-xl border border-dashed border-border px-3 py-2">Optional salary and openings</div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <p><strong>Title:</strong> {extractedJob.title ?? "—"}</p>
                <p><strong>Category:</strong> {extractedJob.category ?? "—"}</p>
                <p><strong>Location:</strong> {typeof extractedJob.location === "string" ? extractedJob.location : [extractedJob.location?.city, extractedJob.location?.country].filter(Boolean).join(", ") || "—"}</p>
                <p><strong>Type:</strong> {extractedJob.employmentType ? extractedJob.employmentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</p>
                <p><strong>Work Mode:</strong> {extractedJob.workMode ? extractedJob.workMode.replace(/\b\w/g, (c) => c.toUpperCase()) : "—"}</p>
                {extractedJob.salary && (extractedJob.salary.min || extractedJob.salary.max) ? (
                  <p><strong>Salary:</strong> {extractedJob.showSalary === false ? "Not disclosed" : `${extractedJob.salary.currency ?? "USD"} ${extractedJob.salary.min?.toLocaleString() ?? 0} – ${extractedJob.salary.max?.toLocaleString() ?? 0}`}</p>
                ) : (
                  <p><strong>Salary:</strong> <span className="text-muted-foreground italic">Not specified (optional)</span></p>
                )}
                {extractSkills(extractedJob.requirements).length ? (
                  <div>
                    <strong>Required Skills:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractSkills(extractedJob.requirements).map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {extractedJob.responsibilities?.length ? (
                  <div>
                    <strong>Responsibilities:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractedJob.responsibilities.slice(0, 5).map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
                      ))}
                      {extractedJob.responsibilities.length > 5 && <li className="text-muted-foreground italic">+{extractedJob.responsibilities.length - 5} more</li>}
                    </ul>
                  </div>
                ) : null}
                {extractedJob.benefits?.length ? (
                  <div>
                    <strong>Benefits:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractedJob.benefits.map((b, i) => (
                        <li key={i} className="text-muted-foreground">{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="rounded-lg bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
                  Nothing is saved yet. Review and submit in the full form.
                </p>
                <Button onClick={reviewInForm} className="w-full gap-2 text-xs">
                  <WandSparkles className="h-4 w-4" /> Review in Full Form
                </Button>
              </div>
            )}
          </div>

          <div className="card-base">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Or use manual form</p>
            <a href={`/${locale}/employer/jobs/new?mode=manual`}
              className="btn-outline block w-full text-center text-xs">
              → Manual Job Form
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
