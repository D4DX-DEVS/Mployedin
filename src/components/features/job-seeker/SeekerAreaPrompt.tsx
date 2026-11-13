"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeekerAreaField, hasSeekerArea, type SeekerAreaValue } from "./SeekerAreaField";
import { areaFromCv, findCatalogueArea } from "@/lib/onboarding/cvPrefill";
import { FALLBACK_PHONE_COUNTRIES } from "@/lib/phone/countries";

/**
 * Asks a signed-in job seeker which city (or region) they live in when their
 * profile has none (client rollout row "city/state asking time of login").
 * The area is what maps a seeker to the agents and super agent who cover it.
 * Sign-up already asks; this catches everyone who got in another way —
 * imports, apply-without-account, social sign-in before the step existed.
 * "Not now" holds it back for the rest of this browser session only.
 */

const DISMISS_KEY = "mployedin.seekerAreaPrompt.dismissed";
const EMPTY: SeekerAreaValue = { countryCode: "", city: null, region: null };

function dismissedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Private mode / blocked storage: it simply asks again next page load.
  }
}

/**
 * The area a profile's free-text location names, for the picker to start from.
 * Sign-up's CV/LinkedIn pre-fill does the matching (exact catalogue names
 * only); a line without commas ("Malappuram Kerala") is also tried word by
 * word, town first. Null when even the country can't be told.
 */
export async function areaFromProfileLocation(location?: string, phone?: string, country?: string): Promise<SeekerAreaValue | null> {
  const dialCode = phone?.trim().match(/^\+\d{1,4}/)
    ? FALLBACK_PHONE_COUNTRIES
      .map((c) => c.dialCode)
      .filter((code) => phone.replace(/\s+/g, "").startsWith(code))
      .sort((a, b) => b.length - a.length)[0]
    : undefined;
  // "Malappuram, Kerala" names no country: the profile's own country field
  // supplies it (the phone number is the last resort).
  const text = location?.trim() ?? "";
  const withCountry = country?.trim() && !text.toLowerCase().includes(country.trim().toLowerCase())
    ? [text, country.trim()].filter(Boolean).join(", ")
    : text;
  const found = areaFromCv({ location: withCountry, dialCode });
  if (!found) return null;
  const words = found.places.flatMap((place) => (place.includes(" ") ? place.split(/\s+/) : []));
  const places = [...new Set([...found.places, ...words])].filter((p) => p.length > 1);
  const match = await findCatalogueArea(found.countryCode, places);
  return match ? { countryCode: found.countryCode, ...match } : { countryCode: found.countryCode, city: null, region: null };
}

export function SeekerAreaPrompt() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SeekerAreaValue>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (dismissedThisSession()) return;
    let live = true;
    fetch("/api/job-seekers/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data: { profile?: { area?: unknown; currentLocation?: string; phone?: string; country?: string } } | null) => {
        // Only a profile that loaded and has no area; never on an error.
        if (!live || !data?.profile || data.profile.area) return;
        // The profile usually says where they live already ("Malappuram Kerala",
        // "Tirur, Kerala, India"): start from that, so they only confirm.
        const found = await areaFromProfileLocation(data.profile.currentLocation, data.profile.phone, data.profile.country);
        if (!live) return;
        if (found) {
          setDraft(found);
          setPrefilled(Boolean(found.city || found.region));
        }
        setOpen(true);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const later = () => {
    rememberDismissed();
    setOpen(false);
  };

  const save = async () => {
    if (!hasSeekerArea(draft)) {
      setError(t("seekerArea.required"));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/job-seekers/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.city ? { cityId: draft.city.id } : { stateId: draft.region?.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      toast.success(t("seekerArea.saved"));
    } catch {
      toast.error(t("seekerArea.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving && !next) later(); }}>
      <DialogContent ref={setContainer} className="overflow-visible sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("seekerArea.promptTitle")}</DialogTitle>
          <DialogDescription>{t("seekerArea.promptDescription")}</DialogDescription>
        </DialogHeader>
        <SeekerAreaField
          value={draft}
          onChange={(next) => { setDraft(next); setError(""); setPrefilled(false); }}
          error={error}
          container={container}
          modal
        />
        {prefilled && <p className="text-xs text-muted-foreground">{t("seekerArea.prefilledFromProfile")}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={later} disabled={saving}>{t("seekerArea.notNow")}</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
