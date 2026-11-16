"use client";

import { useTranslations } from "next-intl";
import { Award, Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toProfileLinkUrl } from "@/lib/jobSeeker/socialLinks";
import { emptyCertificate, type BuiltCertificate, type BuiltLink } from "./types";

interface ExtrasStepProps {
  certificates: BuiltCertificate[];
  onCertificatesChange: (next: BuiltCertificate[]) => void;
  linkedin: string;
  portfolio: string;
  otherLinks: BuiltLink[];
  onLinksChange: (patch: { linkedin?: string; portfolio?: string; otherLinks?: BuiltLink[] }) => void;
}

/** A link the profile cannot store, named so the seeker can fix it before saving. */
export function linkProblem(label: string, url: string): boolean {
  return Boolean(url.trim()) && !toProfileLinkUrl(label.trim() || "Website", url);
}

/** Certificates and courses, then LinkedIn / portfolio / other links. */
export function ExtrasStep({ certificates, onCertificatesChange, linkedin, portfolio, otherLinks, onLinksChange }: ExtrasStepProps) {
  const t = useTranslations("cvWizard.extras");
  const certs = certificates.length ? certificates : [emptyCertificate()];
  const updateCert = (i: number, patch: Partial<BuiltCertificate>) => onCertificatesChange(certs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const updateLink = (i: number, patch: Partial<BuiltLink>) => onLinksChange({ otherLinks: otherLinks.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Award className="h-4 w-4 text-blue-600" /> {t("certTitle")}</h3>
        {certs.map((c, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor={`cvw-cert-${i}`} className="text-xs">{t("certName")}</Label>
              <Input id={`cvw-cert-${i}`} value={c.name} onChange={(e) => updateCert(i, { name: e.target.value })} placeholder={t("certNamePlaceholder")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cvw-cert-by-${i}`} className="text-xs">{t("certIssuer")}</Label>
              <Input id={`cvw-cert-by-${i}`} value={c.issuer} onChange={(e) => updateCert(i, { issuer: e.target.value })} placeholder={t("certIssuerPlaceholder")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cvw-cert-year-${i}`} className="text-xs">{t("certYear")}</Label>
              <Input id={`cvw-cert-year-${i}`} inputMode="numeric" maxLength={4} value={c.year} onChange={(e) => updateCert(i, { year: e.target.value.replace(/\D/g, "") })} placeholder="2024" />
            </div>
            <button type="button" aria-label={t("remove")} onClick={() => onCertificatesChange(certs.filter((_, j) => j !== i))}
              className="flex h-10 w-10 items-center justify-center justify-self-end rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {certs.length < 15 && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onCertificatesChange([...certs, emptyCertificate()])}>
            <Plus className="h-4 w-4" /> {t("addCert")}
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Link2 className="h-4 w-4 text-blue-600" /> {t("linksTitle")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cvw-linkedin">LinkedIn</Label>
            <Input id="cvw-linkedin" value={linkedin} onChange={(e) => onLinksChange({ linkedin: e.target.value })} placeholder="linkedin.com/in/your-name" />
            {linkProblem("LinkedIn", linkedin) && <p className="text-xs text-red-600">{t("linkedinInvalid")}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cvw-portfolio">{t("portfolio")}</Label>
            <Input id="cvw-portfolio" value={portfolio} onChange={(e) => onLinksChange({ portfolio: e.target.value })} placeholder="yourname.com" />
            {linkProblem("Portfolio", portfolio) && <p className="text-xs text-red-600">{t("linkInvalid")}</p>}
          </div>
        </div>
        {otherLinks.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-start">
            <Input aria-label={t("linkName")} value={l.label} maxLength={50} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder={t("linkNamePlaceholder")} />
            <div className="space-y-1">
              <Input aria-label={t("linkUrl")} value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="github.com/your-name" />
              {linkProblem(l.label, l.url) && <p className="text-xs text-red-600">{t("linkInvalid")}</p>}
            </div>
            <button type="button" aria-label={t("remove")} onClick={() => onLinksChange({ otherLinks: otherLinks.filter((_, j) => j !== i) })}
              className="flex h-10 w-10 items-center justify-center justify-self-end rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {otherLinks.length < 4 && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onLinksChange({ otherLinks: [...otherLinks, { label: "", url: "" }] })}>
            <Plus className="h-4 w-4" /> {t("addLink")}
          </Button>
        )}
      </section>
    </div>
  );
}
