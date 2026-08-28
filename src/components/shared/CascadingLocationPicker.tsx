"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MapPin,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Globe,
  CheckSquare,
  Square,
  Loader2,
  Check,
  ChevronsUpDown,
} from "lucide-react";

interface LocationItem {
  _id: string;
  name: string;
  nameAr?: string;
  code?: string;
  slug?: string;
  countryId?: string;
  stateId?: string;
}

/* ── Inline searchable select (no portal — works inside Dialog) ── */
function InlineSearchSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  loading = false,
}: {
  value: string;
  onChange: (id: string) => void;
  options: LocationItem[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) =>
        o.name.toLowerCase().includes(query.toLowerCase()) ||
        (o.code ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const selectedLabel = options.find((o) => o._id === value)?.name;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(!open); setQuery(""); } }}
        className="flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-border/60 bg-background px-3 text-sm shadow-sm shadow-black/[0.04] transition-all duration-200 hover:border-border focus:outline-none focus:ring-1 focus:ring-ring/50 focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selectedLabel ? "truncate" : "truncate text-muted-foreground"}>
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </span>
          ) : (
            selectedLabel ?? placeholder
          )}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[200px] rounded-xl border border-border/50 bg-popover shadow-lg shadow-black/[0.08] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 border-b border-border/30 panel-head">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1 scrollbar-none">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">No results found</div>
            ) : (
              filtered.map((opt) => {
                const isActive = opt._id === value;
                return (
                  <button
                    key={opt._id}
                    type="button"
                    onClick={() => { onChange(opt._id); setOpen(false); setQuery(""); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent/40 text-foreground"
                    }`}
                  >
                    <Check className={`h-3.5 w-3.5 shrink-0 ${isActive ? "opacity-100 text-primary" : "opacity-0"}`} />
                    <span className="truncate">{opt.name}</span>
                    {opt.code && (
                      <span className="ml-auto text-[11px] text-muted-foreground/60 font-mono">{opt.code}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main location picker ── */

interface CascadingLocationPickerProps {
  selectedCityIds: string[];
  selectedStateIds: string[];
  onChange: (cityIds: string[], stateIds: string[]) => void;
  label?: string;
  readOnly?: boolean;
  error?: string;
}

export function CascadingLocationPicker({
  selectedCityIds,
  selectedStateIds,
  onChange,
  label = "Assigned Locations",
  readOnly = false,
  error,
}: CascadingLocationPickerProps) {
  const tc = useTranslations("common");

  const [countries, setCountries] = useState<LocationItem[]>([]);
  const [states, setStates] = useState<LocationItem[]>([]);
  const [cities, setCities] = useState<LocationItem[]>([]);

  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [citySearch, setCitySearch] = useState("");

  const [nameCache, setNameCache] = useState<Map<string, { name: string; type: "city" | "state" }>>(
    new Map()
  );

  useEffect(() => {
    fetch("/api/filters/locations?level=countries")
      .then((r) => r.json())
      .then((data) => setCountries(data.countries ?? []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const unresolvedCities = selectedCityIds.filter((id) => !nameCache.has(id));
    const unresolvedStates = selectedStateIds.filter((id) => !nameCache.has(id));
    if (unresolvedCities.length === 0 && unresolvedStates.length === 0) return;

    const params = new URLSearchParams({ level: "resolve" });
    if (unresolvedCities.length > 0) params.set("cityIds", unresolvedCities.join(","));
    if (unresolvedStates.length > 0) params.set("stateIds", unresolvedStates.join(","));

    fetch(`/api/filters/locations?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setNameCache((prev) => {
          const next = new Map(prev);
          for (const c of data.cities ?? []) next.set(c._id, { name: c.name, type: "city" });
          for (const s of data.states ?? []) next.set(s._id, { name: s.name, type: "state" });
          return next;
        });
      })
      .catch(console.error);
  }, [selectedCityIds, selectedStateIds]);

  useEffect(() => {
    if (!selectedCountry) { setStates([]); return; }
    setLoadingStates(true);
    fetch(`/api/filters/locations?level=states&countryId=${selectedCountry}`)
      .then((r) => r.json())
      .then((data) => setStates(data.states ?? []))
      .catch(console.error)
      .finally(() => setLoadingStates(false));
  }, [selectedCountry]);

  useEffect(() => {
    if (!selectedState) { setCities([]); setCitySearch(""); return; }
    setLoadingCities(true);
    setCitySearch("");
    fetch(`/api/filters/locations?level=cities&stateId=${selectedState}`)
      .then((r) => r.json())
      .then((data) => setCities(data.cities ?? []))
      .catch(console.error)
      .finally(() => setLoadingCities(false));
  }, [selectedState]);

  const filteredCities = useMemo(() => {
    if (!citySearch) return cities;
    const q = citySearch.toLowerCase();
    return cities.filter((c) => c.name.toLowerCase().includes(q));
  }, [cities, citySearch]);

  const selectedCitiesInState = useMemo(() => {
    return cities.filter((c) => selectedCityIds.includes(c._id));
  }, [cities, selectedCityIds]);

  const isEntireStateSelected = selectedStateIds.includes(selectedState);
  const allCitiesInStateSelected = !isEntireStateSelected && cities.length > 0 && cities.every((c) => selectedCityIds.includes(c._id));

  const toggleCity = useCallback(
    (cityId: string, cityName: string) => {
      if (readOnly) return;
      const has = selectedCityIds.includes(cityId);
      const newCities = has
        ? selectedCityIds.filter((id) => id !== cityId)
        : [...selectedCityIds, cityId];
      onChange(newCities, selectedStateIds);
      if (!has) setNameCache((prev) => new Map(prev).set(cityId, { name: cityName, type: "city" }));
    },
    [readOnly, selectedCityIds, selectedStateIds, onChange]
  );

  const toggleState = useCallback(
    (stateId: string, stateName: string) => {
      if (readOnly) return;
      const has = selectedStateIds.includes(stateId);
      const newStates = has
        ? selectedStateIds.filter((id) => id !== stateId)
        : [...selectedStateIds, stateId];
      let newCities = selectedCityIds;
      if (!has) {
        const citiesInState = cities.filter((c) => c.stateId === stateId).map((c) => c._id);
        newCities = selectedCityIds.filter((id) => !citiesInState.includes(id));
        setNameCache((prev) => new Map(prev).set(stateId, { name: stateName, type: "state" }));
      }
      onChange(newCities, newStates);
    },
    [readOnly, selectedCityIds, selectedStateIds, cities, onChange]
  );

  const selectAllFilteredCities = useCallback(() => {
    if (readOnly) return;
    const newIds = new Set(selectedCityIds);
    for (const c of filteredCities) {
      newIds.add(c._id);
      setNameCache((prev) => new Map(prev).set(c._id, { name: c.name, type: "city" }));
    }
    onChange(Array.from(newIds), selectedStateIds);
  }, [readOnly, selectedCityIds, selectedStateIds, filteredCities, onChange]);

  const deselectAllFilteredCities = useCallback(() => {
    if (readOnly) return;
    const removeSet = new Set(filteredCities.map((c) => c._id));
    onChange(selectedCityIds.filter((id) => !removeSet.has(id)), selectedStateIds);
  }, [readOnly, selectedCityIds, selectedStateIds, filteredCities, onChange]);

  const removeItem = useCallback(
    (id: string, type: "city" | "state") => {
      if (readOnly) return;
      if (type === "state") {
        onChange(selectedCityIds, selectedStateIds.filter((s) => s !== id));
      } else {
        onChange(selectedCityIds.filter((c) => c !== id), selectedStateIds);
      }
    },
    [readOnly, selectedCityIds, selectedStateIds, onChange]
  );

  const totalSelections = selectedCityIds.length + selectedStateIds.length;

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-medium">
          {label}
          {totalSelections > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{totalSelections}</Badge>
          )}
        </Label>
      )}

      {/* Selected items chips */}
      {totalSelections > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-border/50 bg-muted/10 min-h-[36px]">
          {selectedStateIds.map((id) => (
            <Badge key={`state-${id}`} variant="default" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20">
              <Globe className="h-3 w-3" />
              {nameCache.get(id)?.name ?? `State ${id.slice(-4)}`} (all cities)
              {!readOnly && (
                <button type="button" onClick={() => removeItem(id, "state")} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {selectedCityIds.map((id) => (
            <Badge key={`city-${id}`} variant="secondary" className="text-xs gap-1">
              <MapPin className="h-3 w-3" />
              {nameCache.get(id)?.name ?? `City ${id.slice(-4)}`}
              {!readOnly && (
                <button type="button" onClick={() => removeItem(id, "city")} className="ml-0.5 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Toggle panel */}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpandedPanel(!expandedPanel)}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4" />
            {expandedPanel ? "Close location picker" : "Select locations"}
          </span>
          {expandedPanel ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      )}

      {/* Picker panel */}
      {expandedPanel && !readOnly && (
        <div className="rounded-lg border border-border/50 bg-card space-y-3 chip-pad">

          {/* Country & State row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1">Country</Label>
              <InlineSearchSelect
                value={selectedCountry}
                onChange={(v) => { setSelectedCountry(v); setSelectedState(""); }}
                options={countries}
                placeholder={tc("selectCountry")}
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1">{tc("stateRegion")}</Label>
              <InlineSearchSelect
                value={selectedState}
                onChange={setSelectedState}
                options={states}
                placeholder={tc("selectState")}
                disabled={!selectedCountry}
                loading={loadingStates}
              />
            </div>
          </div>

          {/* Cities / Region panel */}
          {selectedState && (
            <div className="rounded-lg border border-border/40 bg-background overflow-hidden">
              {/* Header bar */}
              <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-muted/20 panel-head">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  {tc("cities")}
                  {!loadingCities && cities.length > 0 && (
                    <Badge variant="secondary" className="text-[11px] h-4 px-1.5">
                      {selectedCitiesInState.length}/{cities.length}
                    </Badge>
                  )}
                  {loadingCities && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>

                <div className="flex items-center gap-1">
                  {/* Select entire state */}
                  <Button
                    type="button"
                    variant={isEntireStateSelected ? "default" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-[11px] rounded-md"
                    onClick={() => {
                      const st = states.find((s) => s._id === selectedState);
                      if (st) toggleState(st._id, st.name);
                    }}
                  >
                    {isEntireStateSelected ? (
                      <><CheckSquare className="h-3 w-3" /> Entire state</>
                    ) : (
                      <><Globe className="h-3 w-3" /> All state</>
                    )}
                  </Button>

                  {!isEntireStateSelected && cities.length > 0 && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] rounded-md"
                        onClick={selectAllFilteredCities}
                      >
                        <CheckSquare className="h-3 w-3" /> All
                      </Button>
                      {selectedCitiesInState.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px] rounded-md text-destructive hover:text-destructive"
                          onClick={deselectAllFilteredCities}
                        >
                          <Square className="h-3 w-3" /> Clear
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {isEntireStateSelected ? (
                <div className="px-4 py-6 text-center">
                  <CheckSquare className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-sm font-medium text-primary">{tc("allCitiesSelected")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All {cities.length} cities in this state are included
                  </p>
                </div>
              ) : (
                <>
                  {/* City search */}
                  {cities.length > 6 && (
                    <div className="relative border-b border-border/20 px-3 py-2">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                      <input
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                        placeholder="Search cities..."
                        className="w-full bg-transparent pl-6 text-sm outline-none placeholder:text-muted-foreground/40"
                      />
                      {citySearch && (
                        <button
                          type="button"
                          onClick={() => setCitySearch("")}
                          className="absolute right-5 top-1/2 -translate-y-1/2"
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* City grid */}
                  <div className="max-h-52 overflow-y-auto scrollbar-none p-2">
                    {loadingCities ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading cities...
                      </div>
                    ) : filteredCities.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        {citySearch ? "No cities match your search" : tc("noCitiesFound")}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-0.5">
                        {filteredCities.map((city) => {
                          const isSelected = selectedCityIds.includes(city._id);
                          return (
                            <label
                              key={city._id}
                              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm cursor-pointer transition-all duration-100 ${
                                isSelected
                                  ? "bg-primary/8 text-primary ring-1 ring-primary/20"
                                  : "hover:bg-muted/50"
                              }`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleCity(city._id, city.name)}
                                className="h-3.5 w-3.5"
                              />
                              <span className={`truncate text-xs ${isSelected ? "font-medium" : ""}`}>
                                {city.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer summary */}
                  {selectedCitiesInState.length > 0 && !allCitiesInStateSelected && (
                    <div className="border-t border-border/20 bg-muted/10 px-3 py-1.5 text-[11px] text-muted-foreground">
                      {selectedCitiesInState.length} of {cities.length} cities selected
                    </div>
                  )}
                  {allCitiesInStateSelected && (
                    <div className="border-t border-border/20 bg-primary/5 px-3 py-1.5 text-[11px] text-primary font-medium">
                      All {cities.length} cities selected
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
