"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, AlertCircle, CheckCircle2, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { toast } from "sonner";
import logger from "@/lib/logger";
import { ScreeningQuestionField, isUnanswered, type ScreeningAnswer, type ScreeningQuestion } from "./_components/ScreeningQuestionField";

interface ScreeningData {
  answered: boolean;
  jobTitle?: string;
  screeningQuestions?: ScreeningQuestion[];
  answers?: Array<{
    questionId: string;
    questionLabel: string;
    answer: unknown;
  }>;
  answeredAt?: string;
}

export default function ScreeningAnswersPage() {
  const { id, locale } = useParams<{ id: string; locale: string }>();
  const router = useRouter();
  const t = useTranslations("screeningQuestions");
  const tc = useTranslations("common");
  const { goBack } = useBackNavigation(`/${locale}/job-seeker/applications/${id}`);

  const [data, setData] = useState<ScreeningData | null>(null);
  const [answers, setAnswers] = useState<Record<string, ScreeningAnswer>>({});
  // Required questions left empty on the last Submit.
  const [missing, setMissing] = useState<string[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The employer has not sent questions for this application (yet).
  const [notSent, setNotSent] = useState(false);

  // Fetch screening questions
  useEffect(() => {
    const fetchScreening = async () => {
      try {
        const res = await fetch(`/api/applications/${id}/screening-answers`);
        if (!res.ok) {
          if (res.status === 404) {
            setError(t("notFound"));
          } else if (res.status === 400) {
            setNotSent(true);
          } else {
            setError(t("errorFetching"));
          }
          return;
        }
        const json = (await res.json()) as ScreeningData;
        setData(json);

        // If already answered, initialize with existing answers
        if (json.answered && json.answers) {
          const answersMap: Record<string, ScreeningAnswer> = {};
          for (const ans of json.answers) {
            if (typeof ans.answer === "string" || Array.isArray(ans.answer)) answersMap[ans.questionId] = ans.answer as ScreeningAnswer;
          }
          setAnswers(answersMap);
        }
      } catch {
        logger.error("Error fetching screening questions");
        setError(t("errorFetching"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchScreening();
  }, [id, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.screeningQuestions) return;

    const questions = data.screeningQuestions;
    const empty = questions.filter((q) => q.required && isUnanswered(answers[q.id])).map((q) => q.id);
    setMissing(empty);
    if (empty.length > 0) {
      toast.error(t("answerAllRequired"));
      return;
    }
    // Optional questions left blank are not sent (the API needs an answer per entry).
    const submitAnswers = questions
      .filter((q) => !isUnanswered(answers[q.id]))
      .map((q) => ({ questionId: q.id, questionLabel: q.label, answer: answers[q.id] }));
    if (submitAnswers.length === 0) {
      toast.error(t("answerAtLeastOne"));
      return;
    }

    setIsPending(true);
    try {

      const res = await fetch(`/api/applications/${id}/screening-answers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: submitAnswers }),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error || t("errorSubmitting"));
        return;
      }

      toast.success(t("submitted"));
      // Redirect back to application
      setTimeout(() => {
        router.push(`/${locale}/job-seeker/applications/${id}`);
      }, 1000);
    } catch {
      logger.error("Error submitting screening answers");
      toast.error(t("errorSubmitting"));
    } finally {
      setIsPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (notSent) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} />
          {tc("back")}
        </button>
        <EmptyState icon={ClipboardList} title={t("nothingToAnswerTitle")} description={t("nothingToAnswerBody")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} />
          {tc("back")}
        </button>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">{t("error")}</h3>
            <p className="text-sm text-red-800 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (data?.answered) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} />
          {tc("back")}
        </button>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-green-900 mb-2">
            {t("alreadyAnswered")}
          </h2>
          <p className="text-sm text-green-800">
            {t("answeredOn", {
              date: data.answeredAt
                ? new Date(data.answeredAt).toLocaleDateString()
                : "—",
            })}
          </p>
        </div>
      </div>
    );
  }

  if (!data?.screeningQuestions || data.screeningQuestions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={goBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={16} />
          {tc("back")}
        </button>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900">{t("noQuestions")}</h3>
            <p className="text-sm text-amber-800 mt-1">{t("noQuestionsMsg")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={goBack}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft size={16} />
        {tc("back")}
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t("title", { jobTitle: data.jobTitle || "Position" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {data.screeningQuestions.map((question, idx) => (
          <ScreeningQuestionField
            key={question.id}
            question={question}
            index={idx}
            value={answers[question.id]}
            invalid={missing.includes(question.id)}
            onChange={(next) => {
              setAnswers((prev) => ({ ...prev, [question.id]: next }));
              setMissing((prev) => prev.filter((qid) => qid !== question.id));
            }}
          />
        ))}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={isPending}
            className="flex-1"
          >
            {isPending ? t("submitting") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={isPending}
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
