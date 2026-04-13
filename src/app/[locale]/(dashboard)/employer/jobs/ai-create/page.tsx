"use client";

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bot, Loader2, Mic, MicOff, Send, Sparkles, WandSparkles } from "lucide-react";
import { VoiceInputStatus } from "@/components/shared/VoiceInputStatus";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import type { JobFormValues } from "@/components/features/employer/job-form/jobFormSchema";
import { toast } from "sonner";

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
}

interface ExtractedJob {
  title?: string;
  category?: string;
  location?: string | { country?: string; city?: string; isRemote?: boolean };
  description?: string;
  requirements?: string[] | ExtractedRequirements;
  salary?: ExtractedSalary;
  employmentType?: string;
  vacancies?: number;
  showSalary?: boolean;
}

const INITIAL_MESSAGE = `Hello! I can draft this job with a few basics first.

Tell me the role, location, top skills, and any salary or openings if you want to share them. You can type or use voice.

For example: "Senior React developer in Kochi, hybrid, Node and React, salary optional, 2 openings."`;

const AI_PREFILL_STORAGE_KEY = "job-ai-prefill";

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

function buildPrefill(job: ExtractedJob): Partial<JobFormValues> {
  const requirements = Array.isArray(job.requirements) ? {} : (job.requirements ?? {});

  return {
    title: job.title ?? "",
    category: job.category ?? "",
    description: job.description ?? "",
    location: normalizeLocation(job.location),
    requirements: {
      skills: extractSkills(job.requirements),
      experienceMin: requirements.experienceMin ?? 0,
      experienceMax: requirements.experienceMax ?? 10,
    },
    salary: {
      min: job.salary?.min ?? 0,
      max: job.salary?.max ?? 0,
      currency: job.salary?.currency ?? "USD",
      period: job.salary?.period ?? "monthly",
      isNegotiable: false,
    },
    showSalary: job.showSalary ?? Boolean((job.salary?.min ?? 0) > 0 || (job.salary?.max ?? 0) > 0),
    vacancies: job.vacancies,
    tags: extractSkills(job.requirements).slice(0, 6),
  };
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    startRecording,
    stopRecording,
    isRecording,
    isProcessing: isVoiceProcessing,
    error: voiceError,
  } = useVoiceInput({
    language: "auto",
    onTranscript: (text) => {
      setInput((current) => current ? `${current} ${text}` : text);
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || isRecording || isVoiceProcessing) return;

    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    const allMessages = [...messages, userMsg];
    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const systemContext = `You are an expert recruitment assistant helping employers create job postings for Gulf region positions. 

Based on the conversation:
1. Ask short clarifying questions, one at a time, until you know the role, location, core skills, description, and optional salary/openings.
2. Salary and vacancy count are optional. Do not force them.
3. Once you have enough info, output a concise summary and a JSON block for prefilling a job form.

When ready to draft the form, include at the end of your response:
<JOB_DATA>
{
  "title": "...",
  "category": "...",
  "location": { "city": "...", "country": "...", "isRemote": false },
  "description": "...",
  "requirements": { "skills": ["..."], "experienceMin": 0, "experienceMax": 0 },
  "salary": { "min": 0, "max": 0, "currency": "AED", "period": "monthly" },
  "showSalary": true,
  "vacancies": 1,
  "employmentType": "full_time"
}
</JOB_DATA>

Available categories: Technology, Finance, Healthcare, Engineering, Sales & Marketing, Operations, Human Resources, Education, Hospitality, Construction, Legal, Other
Employment types: full_time, part_time, contract, internship, freelance`;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          context: systemContext,
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

  async function toggleVoice() {
    if (isRecording) {
      stopRecording();
      return;
    }

    await startRecording();
  }

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
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary text-white rounded-tr-none"
                    : "bg-muted text-foreground rounded-tl-none"
                }`}>
                  {msg.content.replace(/<JOB_DATA>[\s\S]*?<\/JOB_DATA>/, "").trim()}
                  {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                    <span className="inline-block w-1 h-4 ml-0.5 bg-primary animate-pulse" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="border-t bg-background/95 p-3 space-y-2">
            <div className="flex items-end gap-2">
              <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Describe the role, location, skills, and optional salary or openings..."
                disabled={isStreaming || isRecording || isVoiceProcessing}
                rows={2}
                className="min-h-[52px] max-h-[128px] flex-1 resize-none rounded-xl border-border/60 bg-muted/20"
              />
              <Button
                type="button"
                variant="outline"
                onClick={toggleVoice}
                disabled={isStreaming || isVoiceProcessing}
                className={`h-10 w-10 rounded-xl p-0 transition-colors ${
                  isRecording
                    ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                    : isVoiceProcessing
                      ? "border-amber-200 bg-amber-50 text-amber-600"
                      : ""
                }`}
                title={isVoiceProcessing ? "Processing voice input" : isRecording ? "Stop voice input" : "Start voice input"}
                aria-label={isVoiceProcessing ? "Processing voice input" : isRecording ? "Stop voice input" : "Start voice input"}
                aria-pressed={isRecording}
              >
                {isVoiceProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming || isRecording || isVoiceProcessing}
                aria-label="Send AI prompt"
                className="btn-primary h-10 w-10 rounded-xl p-0 flex-shrink-0 flex items-center justify-center disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <VoiceInputStatus
              isRecording={isRecording}
              isProcessing={isVoiceProcessing}
              error={voiceError}
              recordingText="Recording... Speak now. Tap the mic to stop."
              idleText="Press Enter to send, use Shift+Enter for a new line, or tap the mic to dictate a longer brief."
            />
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
                <p><strong>Type:</strong> {extractedJob.employmentType ?? "—"}</p>
                {extractedJob.salary && (
                  <p><strong>Salary:</strong> {extractedJob.showSalary === false ? "Not disclosed" : `${extractedJob.salary.currency ?? "USD"} ${extractedJob.salary.min?.toLocaleString() ?? 0} – ${extractedJob.salary.max?.toLocaleString() ?? 0}`}</p>
                )}
                {extractSkills(extractedJob.requirements).length ? (
                  <div>
                    <strong>Requirements:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractSkills(extractedJob.requirements).map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
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
