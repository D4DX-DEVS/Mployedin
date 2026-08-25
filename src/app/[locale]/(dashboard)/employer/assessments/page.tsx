"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  ClipboardCheck, Plus, Trash2, Edit, Users, BarChart3,
  Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHero } from "@/components/shared/PageHero";

interface Assessment {
  _id: string;
  title: string;
  description?: string;
  skills: string[];
  questions: { id: string; question: string; type: string; points: number }[];
  totalPoints: number;
  passingScore: number;
  timeLimit: number;
  isActive: boolean;
  attemptsAllowed: number;
  totalAttempts: number;
  avgScore: number;
  createdAt: string;
}

export default function EmployerAssessmentsPage() {
  const t = useTranslations("employerAssessments");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assessments");
      if (res.ok) {
        const data = await res.json();
        setAssessments(data.assessments ?? []);
      } else {
        toast.error(t("toastLoadFailed"));
      }
    } catch {
      toast.error(t("toastLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAssessments(); }, [fetchAssessments]);

  return (
    <div className="page-container">
      <PageHero
        icon={ClipboardCheck}
        title={t("title")}
        description={t("description")}
        actions={assessments.length > 0 ? (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("createAssessment")}
          </button>
        ) : undefined}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={<ClipboardCheck className="w-5 h-5 text-primary" />} label={t("totalTests")} value={assessments.length} />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} label={t("active")} value={assessments.filter(a => a.isActive).length} />
        <StatCard icon={<Users className="w-5 h-5 text-blue-600" />} label={t("totalAttempts")} value={assessments.reduce((s, a) => s + a.totalAttempts, 0)} />
        <StatCard icon={<BarChart3 className="w-5 h-5 text-purple-600" />} label={t("avgScore")} value={`${assessments.length > 0 ? Math.round(assessments.reduce((s, a) => s + a.avgScore, 0) / assessments.length) : 0}%`} />
      </div>

      {/* Assessment List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : assessments.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="font-semibold text-foreground mb-1">{t("noAssessments")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("noAssessmentsDesc")}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            {t("createAssessment")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => (
            <div key={assessment._id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === assessment._id ? null : assessment._id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${assessment.isActive ? "bg-green-500/10" : "bg-muted"}`}>
                    <ClipboardCheck className={`w-5 h-5 ${assessment.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{assessment.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{assessment.questions.length} {t("questions")}</span>
                      <span>•</span>
                      <span>{assessment.timeLimit} {t("min")}</span>
                      <span>•</span>
                      <span>{assessment.totalAttempts} {t("attempts")}</span>
                      <span>•</span>
                      <span>{t("pass", { score: assessment.passingScore })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 flex-wrap">
                    {assessment.skills.slice(0, 3).map((skill) => (
                      <span key={skill} className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
                        {skill}
                      </span>
                    ))}
                  </div>
                  {expandedId === assessment._id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {expandedId === assessment._id && (
                <div className="px-4 pb-4 border-t border-border pt-3">
                  {assessment.description && (
                    <p className="text-sm text-muted-foreground mb-3">{assessment.description}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {assessment.questions.map((q, i) => (
                      <div key={q.id} className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Q{i + 1} • {q.type.replace("_", " ")} • {q.points} pts</p>
                        <p className="text-sm text-foreground line-clamp-2">{q.question}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" /> {t("avgScoreLabel", { score: assessment.avgScore })}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {t("minutes", { count: assessment.timeLimit })}</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {t("attemptsAllowed", { count: assessment.attemptsAllowed })}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAssessmentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchAssessments(); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-xl flex items-center gap-3 card-pad">
      <div className="p-2 bg-muted rounded-lg">{icon}</div>
      <div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CreateAssessmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("employerAssessments");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [timeLimit, setTimeLimit] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [questions, setQuestions] = useState<{ id: string; question: string; type: string; options: string[]; correctAnswer: string; points: number; order: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addQuestion = () => {
    setQuestions([...questions, {
      id: `q_${Date.now()}`,
      question: "",
      type: "multiple_choice",
      options: ["", "", "", ""],
      correctAnswer: "",
      points: 10,
      order: questions.length,
    }]);
  };

  const updateQuestion = (idx: number, updates: Partial<typeof questions[0]>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], ...updates };
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || questions.length === 0) {
      toast.error(t("toastTitleRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          skills: skills.split(",").map(s => s.trim()).filter(Boolean),
          timeLimit,
          passingScore,
          questions: questions.map(q => ({
            ...q,
            options: q.type === "multiple_choice" ? q.options.filter(Boolean) : undefined,
          })),
        }),
      });
      if (res.ok) {
        toast.success(t("toastCreated"));
        onCreated();
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("toastFailed"));
      }
    } catch { toast.error(t("toastNetwork")); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto panel-body" onClick={e => e.stopPropagation()}>
        <h2 className="heading-section font-bold text-foreground mb-4">{t("createTitle")}</h2>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">{t("titleLabel")}</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full mt-1 border border-border rounded-lg bg-background chip-pad" placeholder={t("titlePlaceholder")} required />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{t("descriptionLabel")}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full mt-1 border border-border rounded-lg bg-background chip-pad" rows={2} placeholder={t("descPlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground">{t("skillsLabel")}</label>
              <input type="text" value={skills} onChange={e => setSkills(e.target.value)} className="w-full mt-1 border border-border rounded-lg bg-background chip-pad" placeholder={t("skillsPlaceholder")} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium text-foreground">{t("timeLabel")}</label>
                <input type="number" value={timeLimit} onChange={e => setTimeLimit(+e.target.value)} className="w-full mt-1 border border-border rounded-lg bg-background chip-pad" min={5} max={180} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">{t("passLabel")}</label>
                <input type="number" value={passingScore} onChange={e => setPassingScore(+e.target.value)} className="w-full mt-1 border border-border rounded-lg bg-background chip-pad" min={1} max={100} />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">{t("questionsCount", { count: questions.length })}</label>
              <button type="button" onClick={addQuestion} className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-lg hover:bg-primary/20">
                {t("addQuestion")}
              </button>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-border rounded-lg bg-muted/30 chip-pad">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("questionNumber", { number: idx + 1 })}</span>
                    <Select value={q.type} onValueChange={v => updateQuestion(idx, { type: v })}>
                      <SelectTrigger aria-label={t("questionType")} className="h-7 w-auto gap-1 rounded px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="multiple_choice">{t("multipleChoice")}</SelectItem>
                        <SelectItem value="true_false">{t("trueFalse")}</SelectItem>
                        <SelectItem value="short_answer">{t("shortAnswer")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <input type="number" value={q.points} onChange={e => updateQuestion(idx, { points: +e.target.value })} className="w-16 text-xs px-2 py-1 border border-border rounded bg-background" min={1} />
                    <span className="text-xs text-muted-foreground">{t("pts")}</span>
                    <button type="button" onClick={() => removeQuestion(idx)} aria-label={t("removeQuestion")} className="ms-auto text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <input type="text" value={q.question} onChange={e => updateQuestion(idx, { question: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background mb-2" placeholder={t("questionPlaceholder")} />
                  {q.type === "multiple_choice" && (
                    <div className="grid grid-cols-2 gap-1">
                      {q.options.map((opt, oi) => (
                        <input key={oi} type="text" value={opt} onChange={e => {
                          const opts = [...q.options]; opts[oi] = e.target.value; updateQuestion(idx, { options: opts });
                        }} className="px-2 py-1 text-xs border border-border rounded bg-background" placeholder={t("optionPlaceholder", { number: oi + 1 })} />
                      ))}
                    </div>
                  )}
                  <input type="text" value={q.correctAnswer} onChange={e => updateQuestion(idx, { correctAnswer: e.target.value })} className="w-full mt-1 px-2 py-1 text-xs border border-border rounded bg-background" placeholder={t("correctAnswer")} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent">{t("cancel")}</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {submitting ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
