import { useTranslations } from "next-intl";
import { responseTimeParts } from "@/lib/gdpr/responseTime";

/**
 * Words for request types and response times, shared by the table, the header
 * metric and the details dialog. Static keys, not t(`type_${x}`): a type
 * stored before a rename must fall back to its raw name instead of throwing a
 * missing-message error.
 */
export function useGdprLabels() {
  const t = useTranslations("adminGdpr");

  const TYPE_LABELS: Record<string, string> = {
    export: t("dataExportLabel"),
    delete: t("erasureLabel"),
    rectification: t("rectificationLabel"),
    restrict: t("restrictProcessingLabel"),
  };

  const typeLabel = (type: string): string => TYPE_LABELS[type] ?? type.replace(/_/g, " ");

  /** "12 min", "8.4 hrs", "1.3 days"; a dash before anything was handled. */
  const responseTime = (ms: number | null): string => {
    const parts = responseTimeParts(ms);
    if (!parts) return "—";
    // `count` picks the plural form ("1 day", Arabic dual); `value` is what is
    // printed, so the digits match the plain numbers in the other metrics.
    const args = { value: parts.value, count: Number(parts.value) };
    if (parts.unit === "minutes") return t("responseTimeMinutes", args);
    if (parts.unit === "hours") return t("responseTimeHours", args);
    return t("responseTimeDays", args);
  };

  return { typeLabel, responseTime };
}
