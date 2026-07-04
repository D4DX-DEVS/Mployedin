/**
 * AppForm — shared form component suite
 * Exports: FormInput, FormSelect, FormMultiSelect, FormDatePicker, FormFileDrop, FormSwitch, FormPhone
 */
"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, X, Upload, Phone, Search, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";

// ──────────────────────────────────────────────────────────
// FormInput
// ──────────────────────────────────────────────────────────
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function FormInput({ label, error, hint, className = "", ...props }: FormInputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {props.required && <span className="text-destructive">*</span>}
        </label>
      )}
      <input
        className={`w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? "border-destructive focus:ring-destructive/40" : ""
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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

export function FormTextarea({ label, error, hint, className = "", ...props }: FormTextareaProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {props.required && <span className="text-destructive">*</span>}
        </label>
      )}
      <textarea
        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none disabled:opacity-50 ${
          error ? "border-destructive" : ""
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={error ? "border-destructive" : undefined}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const selectedLabels = options.filter((o) => value.includes(o.value));
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
    }
  }, [open, searchable]);

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
          {maxSelections && <span className="text-muted-foreground/60 font-normal"> ({t("maxSelections", { max: maxSelections })})</span>}
        </label>
      )}
      <div
        onClick={() => setOpen(!open)}
        className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm cursor-pointer flex flex-wrap items-center gap-1 focus:outline-none ${
          error ? "border-destructive" : ""
        }`}
      >
        {selectedLabels.length === 0 && value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder ?? t("selectOptions")}</span>
        ) : (
          value.map((v) => (
            <span key={v}
              onClick={(e) => { e.stopPropagation(); toggle(v); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {allOptionsMap.get(v) ?? v} <X className="h-3 w-3" />
            </span>
          ))
        )}
        <ChevronDown className={`ms-auto h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[99] w-full top-full mt-1 bg-background border rounded-lg shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchEllipsis")}
                  className="w-full h-8 ps-8 pe-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto">
            {filteredPopular.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/30">{t("popular")}</div>
                {filteredPopular.map((o) => (
                  <div
                    key={`pop-${o.value}`}
                    onClick={() => toggle(o.value)}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 flex items-center justify-between ${
                      value.includes(o.value) ? "bg-primary/5 text-primary font-medium" : ""
                    }`}
                  >
                    {o.label}
                    {value.includes(o.value) && <span className="text-primary text-xs">✓</span>}
                  </div>
                ))}
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-muted/30">{groupLabel ?? t("all")}</div>
              </>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{t("noResults")}</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  onClick={() => toggle(o.value)}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-muted/40 flex items-center justify-between ${
                    value.includes(o.value) ? "bg-primary/5 text-primary font-medium" : ""
                  }`}
                >
                  {o.label}
                  {value.includes(o.value) && <span className="text-primary text-xs">✓</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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

export function FormDatePicker({ label, error, hint, value, onChange, min, max, required, disabled }: FormDatePickerProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <DateTimePicker
        mode="date"
        value={value}
        onChange={onChange}
        minDate={min ? new Date(min) : undefined}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      toast.error(t("fileUnderLimit", { size: maxSizeMB }));
      return;
    }
    onChange(file);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all ${
          error ? "border-destructive" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSet(f); }}
          className="hidden"
        />
        {value ? (
          <div className="space-y-2">
            {previewUrl && (
              <img src={previewUrl} alt={value.name} className="mx-auto max-h-24 rounded-md object-contain border border-border/40" />
            )}
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium text-primary truncate max-w-[200px]">{value.name}</span>
              <span className="text-muted-foreground">({(value.size / 1024).toFixed(0)} KB)</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
                className="hover:text-destructive"><X className="h-4 w-4" /></button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground/60" />
            <p>{t("dropFileHere")} <span className="text-primary">{t("browse")}</span></p>
            {accept && <p className="text-xs mt-0.5">{t("fileTypesUpTo", { types: accept.replace(/\./g, "").toUpperCase(), size: maxSizeMB })}</p>}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
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
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-medium">{label}</p>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
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
  const [countryCode, setCountryCode] = useState("+971");
  const number = value.startsWith("+") ? value.replace(/^\+\d+\s?/, "") : value;

  const updateValue = (code: string, num: string) => {
    onChange(`${code} ${num}`);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="flex gap-2">
        <div className="w-24">
          <Select value={countryCode} onValueChange={(value) => { setCountryCode(value); updateValue(value, number); }}>
            <SelectTrigger className="h-10 rounded-lg">
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
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="tel"
            value={number}
            onChange={(e) => updateValue(countryCode, e.target.value)}
            placeholder="50 123 4567"
            required={required}
            className={`w-full h-10 rounded-lg border pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              error ? "border-destructive" : ""
            }`}
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
