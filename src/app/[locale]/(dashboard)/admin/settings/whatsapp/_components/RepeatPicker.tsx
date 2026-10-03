"use client";

import { useLocale, useTranslations } from "next-intl";
import { FieldError } from "@/components/shared/FieldError";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DAYS_OF_MONTH, DEFAULT_REPEAT, HOURS, WEEKDAY_ORDER, minuteOptions, pad2, weekdayName, type Repeat, type RepeatFrequency, type ScheduleErrors,
} from "./scheduleForm";

interface RepeatPickerProps {
  /** null: a stored timing the picker cannot show (only the API can set one). It is kept until the admin picks a repeat. */
  repeat: Repeat | null;
  onChange: (repeat: Repeat) => void;
  /** Hidden until the first Save, like the dialog's other errors. */
  error?: ScheduleErrors["repeat"];
}

// The same look and box as <Label>, which these groups cannot use (it labels one control).
const GROUP_LABEL = "text-sm font-medium leading-none tracking-tight";

/** Every day, week or month at a time of day. The dialog turns the choice into the cron the server stores (cronFromRepeat). */
export function RepeatPicker({ repeat, onChange, error }: RepeatPickerProps) {
  const t = useTranslations("adminWhatsApp");
  const locale = useLocale();
  const change = (patch: Partial<Repeat>) => onChange({ ...(repeat ?? DEFAULT_REPEAT), ...patch });
  const toggleDay = (day: number) => {
    if (!repeat) return;
    change({ weekdays: repeat.weekdays.includes(day) ? repeat.weekdays.filter((d) => d !== day) : [...repeat.weekdays, day] });
  };
  const daysError = error === "days" ? t("errRepeatDays") : undefined;
  const timeError = error === "time" ? t("errRepeatTime") : undefined;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="wa-sch-repeat">{t("fieldRepeat")}</Label>
          <Select value={repeat?.frequency ?? ""} onValueChange={(v) => change({ frequency: v as RepeatFrequency })}>
            <SelectTrigger id="wa-sch-repeat" className="min-h-11" aria-describedby={repeat ? undefined : "wa-sch-repeat-custom"}>
              <SelectValue placeholder={t("repeatChoose")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{t("repeatDaily")}</SelectItem>
              <SelectItem value="weekly">{t("repeatWeekly")}</SelectItem>
              <SelectItem value="monthly">{t("repeatMonthly")}</SelectItem>
            </SelectContent>
          </Select>
          {/* Named, never printed: the stored cron is not admin copy. */}
          {!repeat && <p id="wa-sch-repeat-custom" className="text-xs text-muted-foreground">{t("repeatCustom")}</p>}
        </div>
        {repeat && (
          <div role="group" aria-labelledby="wa-sch-time-label" aria-describedby={timeError ? "wa-sch-time-error" : undefined} className="space-y-1">
            <span id="wa-sch-time-label" className={GROUP_LABEL}>{t("fieldTime")}</span>
            {/* Hours and minutes read left to right in every locale. */}
            <div dir="ltr" className="flex items-center gap-2">
              <Select value={String(repeat.hour)} onValueChange={(v) => change({ hour: Number(v) })}>
                <SelectTrigger aria-label={t("fieldHour")} aria-invalid={timeError ? true : undefined} className="min-h-11 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{pad2(h)}</SelectItem>)}
                </SelectContent>
              </Select>
              <span aria-hidden="true">:</span>
              <Select value={String(repeat.minute)} onValueChange={(v) => change({ minute: Number(v) })}>
                <SelectTrigger aria-label={t("fieldMinute")} className="min-h-11 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {minuteOptions(repeat.minute).map((m) => <SelectItem key={m} value={String(m)}>{pad2(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <FieldError id="wa-sch-time-error" message={timeError} />
          </div>
        )}
      </div>

      {repeat?.frequency === "weekly" && (
        <div
          role="group"
          aria-labelledby="wa-sch-days-label"
          aria-describedby={daysError ? "wa-sch-days-error" : undefined}
          data-invalid={daysError ? "true" : undefined}
          className="space-y-1"
        >
          <span id="wa-sch-days-label" className={GROUP_LABEL}>{t("fieldWeekdays")}</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_ORDER.map((day) => {
              const on = repeat.weekdays.includes(day);
              return (
                <Button
                  key={day}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  aria-pressed={on}
                  aria-label={weekdayName(day, locale, "long")}
                  className="min-h-11 min-w-11 px-3"
                  onClick={() => toggleDay(day)}
                >
                  {weekdayName(day, locale, "short")}
                </Button>
              );
            })}
          </div>
          <FieldError id="wa-sch-days-error" message={daysError} />
        </div>
      )}

      {repeat?.frequency === "monthly" && (
        <div className="space-y-1">
          <Label htmlFor="wa-sch-dom">{t("fieldDayOfMonth")}</Label>
          <Select value={String(repeat.dayOfMonth)} onValueChange={(v) => change({ dayOfMonth: Number(v) })}>
            <SelectTrigger id="wa-sch-dom" aria-describedby="wa-sch-dom-help" className="min-h-11 sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DAYS_OF_MONTH.map((d) => <SelectItem key={d} value={String(d)}>{String(d)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p id="wa-sch-dom-help" className="text-xs text-muted-foreground">{t("dayOfMonthHelp")}</p>
        </div>
      )}
    </div>
  );
}
