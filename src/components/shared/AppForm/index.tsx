/**
 * AppForm — shared form component suite
 * Exports: FormInput, FormSelect, FormMultiSelect, FormDatePicker, FormFileDrop, FormSwitch, FormPhone
 */
"use client";

import { useState, useRef, useEffect, useId, useMemo } from "react";
import { ChevronDown, X, Upload, Phone, Search, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

function joinIds(...ids: Array<string | undefined>) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function RequiredMark() {
  return <span aria-hidden="true" className="text-destructive">*</span>;
}

function FieldFeedback({ hint, error, hintId, errorId }: { hint?: string; error?: string; hintId: string; errorId: string }) {
  return (
    <>
      {error && <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p id={hintId} className="text-xs text-muted-foreground">{hint}</p>}
    </>
  );
}

// ──────────────────────────────────────────────────────────
// FormInput
// ──────────────────────────────────────────────────────────
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function FormInput({ label, error, hint, className = "", id, required, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...props }: FormInputProps) {
  const generatedId = useId();
  const controlId = id ?? `form-input-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}
      <input
        id={controlId}
        required={required}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={joinIds(ariaDescribedBy, error ? errorId : hint ? hintId : undefined)}
        className={`w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? "border-destructive focus:ring-destructive/40" : ""
        } ${className}`}
        {...props}
      />
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormTextarea
// ──────────────────────────────────────────────────────────
interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function FormTextarea({ label, error, hint, className = "", id, required, "aria-describedby": ariaDescribedBy, "aria-invalid": ariaInvalid, ...props }: FormTextareaProps) {
  const generatedId = useId();
  const controlId = id ?? `form-textarea-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}
      <textarea
        id={controlId}
        required={required}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={joinIds(ariaDescribedBy, error ? errorId : hint ? hintId : undefined)}
        className={`w-full rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none disabled:opacity-50 ${ error ? "border-destructive" : "" } ${className} chip-pad`}
        {...props}
      />
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormSelect
// ──────────────────────────────────────────────────────────
interface FormSelectOption { value: string; label: string; }
interface FormSelectProps {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  options: FormSelectOption[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function FormSelect({ label, error, hint, placeholder, options, value, onChange, required, disabled }: FormSelectProps & { searchable?: boolean }) {
  const generatedId = useId();
  const controlId = `form-select-${generatedId}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  return (
    <div
      className="space-y-1"
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
    >
      {label && (
        <label id={labelId} htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}
      <SearchableSelect
        id={controlId}
        ariaLabel={label ?? placeholder}
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-destructive" : undefined}
      />
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormMultiSelect
// ──────────────────────────────────────────────────────────
interface FormMultiSelectProps {
  label?: string;
  error?: string;
  hint?: string;
  placeholder?: string;
  options: FormSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  required?: boolean;
  maxSelections?: number;
}

export function FormMultiSelect({ label, error, hint, placeholder, options, value, onChange, required, maxSelections, searchable, groupLabel, popularOptions }: FormMultiSelectProps & { searchable?: boolean; groupLabel?: string; popularOptions?: FormSelectOption[] }) {
  const t = useTranslations("common");
  const generatedId = useId();
  const controlId = `form-multiselect-${generatedId}`;
  const labelId = `${controlId}-label`;
  const listboxId = `${controlId}-listbox`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else if (!maxSelections || value.length < maxSelections) {
      onChange([...value, v]);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const filteredPopular = useMemo(() => {
    if (!popularOptions || search) return [];
    return popularOptions;
  }, [popularOptions, search]);

  const regularOptions = useMemo(() => {
    if (!filteredPopular.length) return filtered;
    const popularValues = new Set(filteredPopular.map((option) => option.value));
    return filtered.filter((option) => !popularValues.has(option.value));
  }, [filtered, filteredPopular]);

  const visibleOptions = useMemo(
    () => [...filteredPopular, ...regularOptions],
    [filteredPopular, regularOptions]
  );

  // Also check popularOptions for labels not in main options
  const allOptionsMap = useMemo(() => {
    const map = new Map<string, string>();
    options.forEach((o) => map.set(o.value, o.label));
    popularOptions?.forEach((o) => map.set(o.value, o.label));
    return map;
  }, [options, popularOptions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    } else if (open && !searchable) {
      const selectedIndex = visibleOptions.findIndex((option) => value.includes(option.value));
      optionRefs.current[Math.max(selectedIndex, 0)]?.focus();
    }
  }, [open, searchable, value, visibleOptions]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    setSearch("");
    triggerRef.current?.focus();
  };

  const focusOption = (currentIndex: number, direction: 1 | -1) => {
    if (!visibleOptions.length) return;
    const nextIndex = (currentIndex + direction + visibleOptions.length) % visibleOptions.length;
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      {label && (
        <label id={labelId} htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
          {maxSelections && <span className="text-muted-foreground/60 font-normal"> ({t("maxSelections", { max: maxSelections })})</span>}
        </label>
      )}
      <div
        className={`min-h-10 rounded-lg border text-sm flex flex-wrap items-center gap-1 ${ error ? "border-destructive" : "" } chip-pad`}
      >
        {value.map((v) => {
          const selectedLabel = allOptionsMap.get(v) ?? v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={t("removeSkill", { skill: selectedLabel })}
            >
              <span aria-hidden="true">{selectedLabel}</span>
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          );
        })}
        <button
          ref={triggerRef}
          id={controlId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : placeholder ?? t("selectOptions")}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              closeAndRestoreFocus();
            }
          }}
          className="flex min-h-7 min-w-24 flex-1 items-center text-start text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {value.length === 0 ? placeholder ?? t("selectOptions") : null}
          <ChevronDown aria-hidden="true" className={`ms-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-[99] w-full top-full mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search aria-hidden="true" className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && visibleOptions.length) {
                      event.preventDefault();
                      optionRefs.current[0]?.focus();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      closeAndRestoreFocus();
                    }
                  }}
                  aria-label={t("searchEllipsis")}
                  placeholder={t("searchEllipsis")}
                  className="w-full h-8 ps-8 pe-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
          )}
          <div id={listboxId} role="listbox" aria-multiselectable="true" aria-labelledby={label ? labelId : undefined} className="max-h-48 overflow-y-auto">
            {filteredPopular.length > 0 && (
              <>
                <div role="presentation" className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/30">{t("popular")}</div>
                {filteredPopular.map((o, index) => (
                  <button
                    ref={(element) => { optionRefs.current[index] = element; }}
                    type="button"
                    role="option"
                    aria-selected={value.includes(o.value)}
                    aria-disabled={!value.includes(o.value) && Boolean(maxSelections && value.length >= maxSelections)}
                    key={`pop-${o.value}`}
                    onClick={() => toggle(o.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index, 1); }
                      else if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index, -1); }
                      else if (event.key === "Home") { event.preventDefault(); optionRefs.current[0]?.focus(); }
                      else if (event.key === "End") { event.preventDefault(); optionRefs.current[visibleOptions.length - 1]?.focus(); }
                      else if (event.key === "Escape") { event.preventDefault(); closeAndRestoreFocus(); }
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 ${
                      value.includes(o.value) ? "bg-primary/5 text-primary font-medium" : ""
                    }`}
                  >
                    {o.label}
                    {value.includes(o.value) && <span aria-hidden="true" className="text-primary text-xs">✓</span>}
                  </button>
                ))}
                <div role="presentation" className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/30">{groupLabel ?? t("all")}</div>
              </>
            )}
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{t("noResults")}</div>
            ) : (
              regularOptions.map((o, regularIndex) => {
                const index = filteredPopular.length + regularIndex;
                return (
                <button
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  role="option"
                  aria-selected={value.includes(o.value)}
                  aria-disabled={!value.includes(o.value) && Boolean(maxSelections && value.length >= maxSelections)}
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index, 1); }
                    else if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index, -1); }
                    else if (event.key === "Home") { event.preventDefault(); optionRefs.current[0]?.focus(); }
                    else if (event.key === "End") { event.preventDefault(); optionRefs.current[visibleOptions.length - 1]?.focus(); }
                    else if (event.key === "Escape") { event.preventDefault(); closeAndRestoreFocus(); }
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40 ${
                    value.includes(o.value) ? "bg-primary/5 text-primary font-medium" : ""
                  }`}
                >
                  {o.label}
                  {value.includes(o.value) && <span aria-hidden="true" className="text-primary text-xs">✓</span>}
                </button>
                );
              })
            )}
          </div>
        </div>
      )}
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormDatePicker
// ──────────────────────────────────────────────────────────
interface FormDatePickerProps {
  label?: string;
  error?: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
}

export function FormDatePicker({ label, error, hint, value, onChange, min, required }: FormDatePickerProps) {
  const generatedId = useId();
  const controlId = `form-date-${generatedId}`;
  const labelId = `${controlId}-label`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  return (
    <div
      className="space-y-1"
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
    >
      {label && (
        <span id={labelId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </span>
      )}
      <DateTimePicker
        mode="date"
        label={label}
        className="[&>label]:sr-only"
        value={value}
        onChange={onChange}
        minDate={min ? new Date(min) : undefined}
        required={required}
      />
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormFileDrop
// ──────────────────────────────────────────────────────────
interface FormFileDropProps {
  label?: string;
  error?: string;
  hint?: string;
  accept?: string;
  maxSizeMB?: number;
  value?: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
}

export function FormFileDrop({ label, error, hint, accept, maxSizeMB = 10, value, onChange, required }: FormFileDropProps) {
  const t = useTranslations("common");
  const generatedId = useId();
  const controlId = `form-file-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const requirementsId = `${controlId}-requirements`;
  const errorId = `${controlId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejection, setRejection] = useState("");

  // Generate preview URL for image files
  useEffect(() => {
    if (value && value.type.startsWith("image/")) {
      const url = URL.createObjectURL(value);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [value]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  };

  const validateAndSet = (file: File) => {
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      setRejection(t("fileUnderLimit", { size: maxSizeMB }));
      return;
    }
    setRejection("");
    onChange(file);
  };

  const displayedError = error || rejection;
  const describedBy = joinIds(
    displayedError ? errorId : hint ? hintId : undefined,
    accept ? requirementsId : undefined
  );

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}
      <input
        ref={inputRef}
        id={controlId}
        type="file"
        accept={accept}
        required={required && !value}
        aria-invalid={displayedError ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) validateAndSet(file);
        }}
        className="peer sr-only"
      />
      <label
        htmlFor={controlId}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={`block border-2 border-dashed rounded-lg text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${ displayedError ? "border-destructive" : "" } card-pad`}
      >
        {value ? (
          <div className="space-y-2">
            {previewUrl && (
              <img src={previewUrl} alt={value.name} className="mx-auto max-h-24 rounded-md object-contain border border-border/40" />
            )}
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText aria-hidden="true" className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium text-primary truncate max-w-[200px]">{value.name}</span>
              <span className="text-muted-foreground">({(value.size / 1024).toFixed(0)} KB)</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <Upload aria-hidden="true" className="h-6 w-6 mx-auto mb-1 text-muted-foreground/60" />
            <p>{t("dropFileHere")} <span className="text-primary">{t("browse")}</span></p>
          </div>
        )}
      </label>
      {value && (
        <button
          type="button"
          onClick={() => {
            setRejection("");
            if (inputRef.current) inputRef.current.value = "";
            onChange(null);
          }}
          aria-label={t("removeSkill", { skill: value.name })}
          className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          {t("removeSkill", { skill: value.name })}
        </button>
      )}
      {accept && (
        <p id={requirementsId} className="text-xs text-muted-foreground">
          {t("fileTypesUpTo", { types: accept.replace(/\./g, "").toUpperCase(), size: maxSizeMB })}
        </p>
      )}
      <FieldFeedback hint={hint} error={displayedError} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormSwitch
// ──────────────────────────────────────────────────────────
interface FormSwitchProps {
  label?: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function FormSwitch({ label, description, checked, onChange, disabled }: FormSwitchProps) {
  const generatedId = useId();
  const controlId = `form-switch-${generatedId}`;
  const descriptionId = `${controlId}-description`;
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <label htmlFor={controlId} className="text-sm font-medium cursor-pointer">{label}</label>}
          {description && <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <button
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : description}
        aria-describedby={label && description ? descriptionId : undefined}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FormPhone
// ──────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: "+971", flag: "🇦🇪", label: "UAE" },
  { code: "+966", flag: "🇸🇦", label: "KSA" },
  { code: "+974", flag: "🇶🇦", label: "Qatar" },
  { code: "+968", flag: "🇴🇲", label: "Oman" },
  { code: "+973", flag: "🇧🇭", label: "Bahrain" },
  { code: "+965", flag: "🇰🇼", label: "Kuwait" },
  { code: "+44",  flag: "🇬🇧", label: "UK" },
  { code: "+1",   flag: "🇺🇸", label: "US" },
  { code: "+91",  flag: "🇮🇳", label: "India" },
  { code: "+92",  flag: "🇵🇰", label: "Pakistan" },
  { code: "+20",  flag: "🇪🇬", label: "Egypt" },
];

interface FormPhoneProps {
  label?: string;
  error?: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function FormPhone({ label, error, hint, value, onChange, required }: FormPhoneProps) {
  const t = useTranslations("common");
  const generatedId = useId();
  const controlId = `form-phone-${generatedId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const [countryCode, setCountryCode] = useState("+971");
  const number = value.startsWith("+") ? value.replace(/^\+\d+\s?/, "") : value;

  const updateValue = (code: string, num: string) => {
    onChange(`${code} ${num}`);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={controlId} className="block text-xs font-medium text-muted-foreground">
          {label} {required && <RequiredMark />}
        </label>
      )}
      <div className="flex gap-2">
        <div className="w-24">
          <Select value={countryCode} onValueChange={(value) => { setCountryCode(value); updateValue(value, number); }}>
            <SelectTrigger aria-label={t("selectCountry")} aria-describedby={error ? errorId : hint ? hintId : undefined} className="h-10 rounded-lg">
              <SelectValue placeholder="Select code" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_CODES.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.flag} {c.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1">
          <Phone aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id={controlId}
            type="tel"
            dir="ltr"
            value={number}
            onChange={(e) => updateValue(countryCode, e.target.value)}
            placeholder="50 123 4567"
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={`w-full h-10 rounded-lg border ps-9 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              error ? "border-destructive" : ""
            }`}
          />
        </div>
      </div>
      <FieldFeedback hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
