"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ExtractedJob {
  title?: string;
  category?: string;
  location?: string;
  description?: string;
  requirements?: string[];
  salary?: { min?: number; max?: number; currency?: string };
  employmentType?: string;
}

const INITIAL_MESSAGE = `Hello! I'm your AI hiring assistant. Tell me about the position you want to fill and I'll help you create a comprehensive job posting.

For example: "I need a Senior React Developer in Dubai with 5+ years experience, AED 15,000-20,000 salary"

Or just describe what you're looking for in plain English!`;

export default function EmployerAIJobCreatePage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_MESSAGE }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [extractedJob, setExtractedJob] = useState<ExtractedJob | null>(null);
  const [creating, setCreating] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

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
1. Ask clarifying questions to gather all needed info (title, location, salary, requirements)
2. Once you have enough info, output a formatted job summary AND a JSON block

When ready to create the job, include at the end of your response:
<JOB_DATA>
{
  "title": "...",
  "category": "...",
  "location": "...",
  "description": "...",
  "requirements": [...],
  "salary": { "min": 0, "max": 0, "currency": "AED" },
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

  const createJob = async () => {
    if (!extractedJob) return;
    setCreating(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extractedJob,
          status: "draft",
          approvalStatus: "pending",
        }),
      });
      if (res.ok) {
        router.push("../jobs");
      } else {
        toast.error("Failed to create job. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="AI Job Creator"
        description="Describe the role you need in natural language — AI will build the job posting for you"
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
          <div className="border-t p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="Describe the role you need…"
              disabled={isStreaming}
              className="input-field flex-1 h-9"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="btn-primary h-9 w-9 p-0 flex-shrink-0 flex items-center justify-center disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
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
              <p className="text-xs text-muted-foreground">
                Keep chatting — once you&apos;ve provided enough details, the job preview will appear here.
              </p>
            ) : (
              <div className="space-y-2 text-xs">
                <p><strong>Title:</strong> {extractedJob.title ?? "—"}</p>
                <p><strong>Category:</strong> {extractedJob.category ?? "—"}</p>
                <p><strong>Location:</strong> {extractedJob.location ?? "—"}</p>
                <p><strong>Type:</strong> {extractedJob.employmentType ?? "—"}</p>
                {extractedJob.salary && (
                  <p><strong>Salary:</strong> {extractedJob.salary.currency} {extractedJob.salary.min?.toLocaleString()} – {extractedJob.salary.max?.toLocaleString()}</p>
                )}
                {extractedJob.requirements?.length ? (
                  <div>
                    <strong>Requirements:</strong>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {extractedJob.requirements.map((r, i) => (
                        <li key={i} className="text-muted-foreground">{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  onClick={createJob}
                  disabled={creating}
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create Job Draft"}
                </button>
              </div>
            )}
          </div>

          <div className="card-base">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Or use manual form</p>
            <a href="../jobs/new"
              className="btn-outline block w-full text-center text-xs">
              → Manual Job Form
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
