/**
 * AppForm — shared form component suite
 * Exports: FormInput, FormSelect, FormMultiSelect, FormDatePicker, FormFileDrop, FormSwitch, FormPhone
 */
"use client";

import { useState, useRef } from "react";
import { ChevronDown, X, Upload, Phone } from "lucide-react";

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

export function FormSelect({ label, error, hint, placeholder, options, value, onChange, required, disabled }: FormSelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          className={`w-full h-10 rounded-lg border px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 bg-background ${
            error ? "border-destructive" : ""
          }`}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
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

export function FormMultiSelect({ label, error, hint, placeholder, options, value, onChange, required, maxSelections }: FormMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else if (!maxSelections || value.length < maxSelections) {
      onChange([...value, v]);
    }
  };

  const selectedLabels = options.filter((o) => value.includes(o.value));

  return (
    <div className="space-y-1 relative">
      {label && (
        <label className="block text-xs font-medium text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div
        onClick={() => setOpen(!open)}
        className={`min-h-10 rounded-lg border px-3 py-1.5 text-sm cursor-pointer flex flex-wrap items-center gap-1 focus:outline-none ${
          error ? "border-destructive" : ""
        }`}
      >
        {selectedLabels.length === 0 ? (
          <span className="text-muted-foreground">{placeholder ?? "Select options…"}</span>
        ) : (
          selectedLabels.map((o) => (
            <span key={o.value}
              onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {o.label} <X className="h-3 w-3" />
            </span>
          ))
        )}
        <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[99] w-full top-full mt-1 bg-background border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((o) => (
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
          ))}
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
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        className={`w-full h-10 rounded-lg border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
          error ? "border-destructive" : ""
        }`}
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  };

  const validateAndSet = (file: File) => {
    if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
      alert(`File must be under ${maxSizeMB}MB`);
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
          <div className="flex items-center justify-center gap-2 text-sm">
            <span className="font-medium text-primary">{value.name}</span>
            <span className="text-muted-foreground">({(value.size / 1024).toFixed(0)} KB)</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="hover:text-destructive"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground/60" />
            <p>Drop file here or <span className="text-primary">browse</span></p>
            {accept && <p className="text-xs mt-0.5">{accept.replace(/\./g, "").toUpperCase()} up to {maxSizeMB}MB</p>}
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
        <select
          value={countryCode}
          onChange={(e) => { setCountryCode(e.target.value); updateValue(e.target.value, number); }}
          className="h-10 rounded-lg border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
          ))}
        </select>
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
