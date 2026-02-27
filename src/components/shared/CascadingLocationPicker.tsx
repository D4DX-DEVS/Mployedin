"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Globe,
  CheckSquare,
  Loader2,
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

interface CascadingLocationPickerProps {
  /** Selected city IDs */
  selectedCityIds: string[];
  /** Selected state IDs (all cities in these states are included) */
  selectedStateIds: string[];
  /** Called when selections change */
  onChange: (cityIds: string[], stateIds: string[]) => void;
  /** Label text */
  label?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Error message */
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
  // Data state
  const [countries, setCountries] = useState<LocationItem[]>([]);
  const [states, setStates] = useState<LocationItem[]>([]);
  const [cities, setCities] = useState<LocationItem[]>([]);

  // UI state
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    (LocationItem & { stateName: string; countryName: string; countryCode: string })[]
  >([]);
  const [searching, setSearching] = useState(false);

  // Track names for display badges
  const [nameCache, setNameCache] = useState<Map<string, { name: string; type: "city" | "state" }>>(
    new Map()
  );

  // Load countries on mount
  useEffect(() => {
    fetch("/api/filters/locations?level=countries")
      .then((r) => r.json())
      .then((data) => setCountries(data.countries ?? []))
      .catch(console.error);
  }, []);

  // Load states when country changes
  useEffect(() => {
    if (!selectedCountry) {
      setStates([]);
      return;
    }
    setLoadingStates(true);
    fetch(`/api/filters/locations?level=states&countryId=${selectedCountry}`)
      .then((r) => r.json())
      .then((data) => setStates(data.states ?? []))
      .catch(console.error)
      .finally(() => setLoadingStates(false));
  }, [selectedCountry]);

  // Load cities when state changes
  useEffect(() => {
    if (!selectedState) {
      setCities([]);
      return;
    }
    setLoadingCities(true);
    fetch(`/api/filters/locations?level=cities&stateId=${selectedState}`)
      .then((r) => r.json())
      .then((data) => setCities(data.cities ?? []))
      .catch(console.error)
      .finally(() => setLoadingCities(false));
  }, [selectedState]);

  // Search cities
  useEffect(() => {
    if (!search || search.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/filters/locations?search=${encodeURIComponent(search)}`);
        const data = await res.json();
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Toggle a city
  const toggleCity = useCallback(
    (cityId: string, cityName: string) => {
      if (readOnly) return;
      const has = selectedCityIds.includes(cityId);
      const newCities = has
        ? selectedCityIds.filter((id) => id !== cityId)
        : [...selectedCityIds, cityId];
      onChange(newCities, selectedStateIds);
      if (!has) {
        setNameCache((prev) => new Map(prev).set(cityId, { name: cityName, type: "city" }));
      }
    },
    [readOnly, selectedCityIds, selectedStateIds, onChange]
  );

  // Toggle entire state
  const toggleState = useCallback(
    (stateId: string, stateName: string) => {
      if (readOnly) return;
      const has = selectedStateIds.includes(stateId);
      const newStates = has
        ? selectedStateIds.filter((id) => id !== stateId)
        : [...selectedStateIds, stateId];
      // When adding a state, remove any individually selected cities from that state
      let newCities = selectedCityIds;
      if (!has) {
        const citiesInState = cities
          .filter((c) => c.stateId === stateId)
          .map((c) => c._id);
        newCities = selectedCityIds.filter((id) => !citiesInState.includes(id));
        setNameCache((prev) => new Map(prev).set(stateId, { name: stateName, type: "state" }));
      }
      onChange(newCities, newStates);
    },
    [readOnly, selectedCityIds, selectedStateIds, cities, onChange]
  );

  // Remove a selection chip
  const removeItem = useCallback(
    (id: string, type: "city" | "state") => {
      if (readOnly) return;
      if (type === "state") {
        onChange(
          selectedCityIds,
          selectedStateIds.filter((s) => s !== id)
        );
      } else {
        onChange(
          selectedCityIds.filter((c) => c !== id),
          selectedStateIds
        );
      }
    },
    [readOnly, selectedCityIds, selectedStateIds, onChange]
  );

  // Whether a city's parent state is fully selected
  const isCityInSelectedState = useCallback(
    (cityStateId?: string) => {
      if (!cityStateId) return false;
      return selectedStateIds.includes(cityStateId);
    },
    [selectedStateIds]
  );

  const totalSelections = selectedCityIds.length + selectedStateIds.length;

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-medium">
          {label}
          {totalSelections > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {totalSelections}
            </Badge>
          )}
        </Label>
      )}

      {/* Selected items display */}
      {totalSelections > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-md border border-border/50 bg-muted/10 min-h-[36px]">
          {selectedStateIds.map((id) => (
            <Badge
              key={`state-${id}`}
              variant="default"
              className="text-xs gap-1 bg-primary/10 text-primary border-primary/20"
            >
              <Globe className="h-3 w-3" />
              {nameCache.get(id)?.name ?? `State ${id.slice(-4)}`}
              {" (all cities)"}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeItem(id, "state")}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {selectedCityIds.map((id) => (
            <Badge
              key={`city-${id}`}
              variant="secondary"
              className="text-xs gap-1"
            >
              <MapPin className="h-3 w-3" />
              {nameCache.get(id)?.name ?? `City ${id.slice(-4)}`}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeItem(id, "city")}
                  className="ml-0.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Picker panel toggle */}
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
          {expandedPanel ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Picker panel */}
      {expandedPanel && !readOnly && (
        <div className="rounded-lg border border-border/50 bg-card p-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Search cities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded border border-border/30 divide-y divide-border/20">
              {searchResults.map((result) => {
                const isSelected = selectedCityIds.includes(result._id) || isCityInSelectedState(result.stateId);
                return (
                  <button
                    key={result._id}
                    type="button"
                    onClick={() => toggleCity(result._id, result.name)}
                    disabled={isCityInSelectedState(result.stateId)}
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                      isSelected ? "bg-primary/5 text-primary" : "hover:bg-muted/50"
                    } disabled:opacity-50`}
                  >
                    <span className="font-medium">{result.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {result.stateName}, {result.countryName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Cascading selects */}
          {!search && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Country select */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1">Country</Label>
                <Select value={selectedCountry} onValueChange={(v) => { setSelectedCountry(v); setSelectedState(""); }}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c._id} value={c._id} className="text-sm">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* State select */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1">State / Region</Label>
                <Select
                  value={selectedState}
                  onValueChange={setSelectedState}
                  disabled={!selectedCountry || loadingStates}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={loadingStates ? "Loading..." : "Select state"} />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s._id} value={s._id} className="text-sm">
                        {s.name}
                        {selectedStateIds.includes(s._id) && " ✓"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* State-level "Select all" button */}
              <div className="flex items-end">
                {selectedState && (
                  <Button
                    type="button"
                    variant={selectedStateIds.includes(selectedState) ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      const st = states.find((s) => s._id === selectedState);
                      if (st) toggleState(st._id, st.name);
                    }}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {selectedStateIds.includes(selectedState) ? "State selected" : "Select entire state"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* City list for selected state */}
          {selectedState && !search && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1">
                Cities
                {loadingCities && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
              </Label>
              <div className="max-h-48 overflow-y-auto rounded border border-border/30 divide-y divide-border/10">
                {selectedStateIds.includes(selectedState) ? (
                  <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                    <CheckSquare className="h-5 w-5 mx-auto mb-1 text-primary" />
                    All cities in this state are selected
                  </div>
                ) : cities.length === 0 && !loadingCities ? (
                  <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                    No cities found
                  </div>
                ) : (
                  cities.map((city) => {
                    const isSelected = selectedCityIds.includes(city._id);
                    return (
                      <label
                        key={city._id}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCity(city._id, city.name)}
                          className="accent-primary h-3.5 w-3.5"
                        />
                        <span className={isSelected ? "text-primary font-medium" : ""}>
                          {city.name}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
