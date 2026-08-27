"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Globe, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Comprehensive country list */
const ALL_COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium",
  "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil",
  "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada",
  "Chad", "Chile", "China", "Colombia", "Congo", "Costa Rica", "Croatia", "Cuba",
  "Cyprus", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
  "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Guinea", "Haiti",
  "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
  "Iraq", "Ireland", "Israel", "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon",
  "Libya", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives",
  "Mali", "Malta", "Mauritius", "Mexico", "Moldova", "Monaco", "Mongolia",
  "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Palestine", "Panama", "Paraguay", "Peru",
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saudi Arabia", "Senegal", "Serbia", "Sierra Leone", "Singapore", "Slovakia",
  "Slovenia", "Somalia", "South Africa", "South Korea", "Spain", "Sri Lanka",
  "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan",
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe", "Remote / Global",
] as const;

interface CountrySelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CountrySelect({
  value,
  onValueChange,
  placeholder = "Select country…",
  disabled = false,
  className,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [customCountries, setCustomCountries] = React.useState<string[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allOptions = React.useMemo(
    () => [...ALL_COUNTRIES, ...customCountries],
    [customCountries]
  );

  const filtered = React.useMemo(() => {
    if (!search.trim()) return allOptions;
    const q = search.toLowerCase();
    return allOptions.filter((c) => c.toLowerCase().includes(q));
  }, [search, allOptions]);

  const canAddCustom = React.useMemo(() => {
    if (!search.trim() || search.trim().length < 2) return false;
    const q = search.trim().toLowerCase();
    return !allOptions.some((c) => c.toLowerCase() === q);
  }, [search, allOptions]);

  const handleAddCustom = () => {
    const name = search.trim();
    if (!name) return;
    setCustomCountries((prev) => [...prev, name]);
    onValueChange(name);
    setOpen(false);
  };

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          {value ? (
            <span className="flex items-center gap-2 min-w-0">
              <Globe className="h-4 w-4 shrink-0 text-primary/60" />
              <span className="font-medium truncate">{value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ms-auto h-4 w-4 shrink-0 opacity-40" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 overflow-hidden z-[10001]"
        align="start"
        sideOffset={6}
        style={{
          width: "max-content",
          minWidth: "var(--radix-popover-trigger-width)",
          maxWidth: "min(22rem, calc(100vw - 2rem))",
        }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border/40 panel-head">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or type a country…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {/* List */}
        <div className="max-h-[280px] overflow-y-auto overscroll-contain p-1.5">
          {/* Add custom option */}
          {canAddCustom && (
            <button
              type="button"
              onClick={handleAddCustom}
              className="flex w-full items-center gap-3 rounded-lg text-sm text-primary hover:bg-primary/5 transition-colors mb-1 border border-dashed border-primary/30 chip-pad"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="font-medium">Add &quot;{search.trim()}&quot;</span>
            </button>
          )}

          {filtered.length === 0 && !canAddCustom ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No country found. Type to add a custom one.
            </p>
          ) : (
            filtered.map((country) => {
              const isSelected = value === country;
              return (
                <button
                  key={country}
                  type="button"
                  onClick={() => {
                    onValueChange(country);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    isSelected
                      ? "bg-primary/8 text-primary"
                      : "text-foreground hover:bg-accent/50"
                  )}
                >
                  <Globe className={cn(
                    "h-4 w-4 shrink-0",
                    isSelected ? "text-primary" : "text-muted-foreground/50"
                  )} />
                  <span className="font-medium">{country}</span>
                  {isSelected && (
                    <Check className="ms-auto h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
