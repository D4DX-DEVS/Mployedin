"use client";

import { useTranslations } from "next-intl";
import { Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/shared/PhoneInput";

export interface InvoiceIssuerBank {
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  branch: string;
  instructions: string;
}

/**
 * The FROM block and payment instructions printed on every invoice PDF.
 * `addressText` is the textarea's value; it is split into `addressLines` on
 * save, because an address is lines rather than one string.
 */
export interface InvoiceIssuerForm {
  legalName: string;
  addressText: string;
  country: string;
  taxRegNo: string;
  email: string;
  phone: string;
  website: string;
  bank: InvoiceIssuerBank;
  footerNote: string;
}

export const EMPTY_ISSUER: InvoiceIssuerForm = {
  legalName: "",
  addressText: "",
  country: "",
  taxRegNo: "",
  email: "",
  phone: "",
  website: "",
  bank: { bankName: "", accountName: "", accountNumber: "", iban: "", swift: "", branch: "", instructions: "" },
  footerNote: "",
};

interface InvoiceIssuerSectionProps {
  value: InvoiceIssuerForm;
  onChange: (update: (prev: InvoiceIssuerForm) => InvoiceIssuerForm) => void;
}

/**
 * Invoice issuer details, kept in settings rather than code so a change of
 * address or tax number does not need a deploy. Rendered inside the page's
 * panel, so it brings its own `panel-body` padding.
 */
export function InvoiceIssuerSection({ value, onChange }: InvoiceIssuerSectionProps) {
  const t = useTranslations("adminSettings");
  const set = (patch: Partial<InvoiceIssuerForm>) => onChange((prev) => ({ ...prev, ...patch }));
  const setBank = (patch: Partial<InvoiceIssuerBank>) =>
    onChange((prev) => ({ ...prev, bank: { ...prev.bank, ...patch } }));

  return (
    <>
      <div className="panel-body space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="issuer-legal-name" className="text-sm text-muted-foreground">{t("issuerLegalNameLabel")}</label>
            <Input id="issuer-legal-name" value={value.legalName} placeholder={t("issuerLegalNamePlaceholder")} onChange={(e) => set({ legalName: e.target.value })} />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="issuer-address" className="text-sm text-muted-foreground">{t("issuerAddressLabel")}</label>
            <Textarea id="issuer-address" rows={3} value={value.addressText} placeholder={t("issuerAddressPlaceholder")} onChange={(e) => set({ addressText: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t("issuerAddressHelp")}</p>
          </div>

          <div className="space-y-1">
            <label htmlFor="issuer-country" className="text-sm text-muted-foreground">{t("issuerCountryLabel")}</label>
            <Input id="issuer-country" value={value.country} onChange={(e) => set({ country: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label htmlFor="issuer-tax-reg" className="text-sm text-muted-foreground">{t("issuerTaxRegLabel")}</label>
            <Input id="issuer-tax-reg" value={value.taxRegNo} placeholder={t("issuerTaxRegPlaceholder")} onChange={(e) => set({ taxRegNo: e.target.value })} />
          </div>

          <div className="space-y-1">
            <label htmlFor="issuer-email" className="text-sm text-muted-foreground">{t("issuerEmailLabel")}</label>
            <Input id="issuer-email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
          </div>

          <PhoneInput id="issuer-phone" label={t("issuerPhoneLabel")} value={value.phone} onChange={(phone) => set({ phone })} />

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="issuer-website" className="text-sm text-muted-foreground">{t("issuerWebsiteLabel")}</label>
            <Input id="issuer-website" value={value.website} placeholder={t("issuerWebsitePlaceholder")} onChange={(e) => set({ website: e.target.value })} />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="issuer-footer" className="text-sm text-muted-foreground">{t("issuerFooterLabel")}</label>
            <Input id="issuer-footer" value={value.footerNote} placeholder={t("issuerFooterPlaceholder")} onChange={(e) => set({ footerNote: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t("issuerFooterHelp")}</p>
          </div>
        </div>
      </div>

      <div className="panel-body space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Banknote className="h-4 w-4 text-primary" aria-hidden="true" /> {t("issuerBankTitle")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("issuerBankDescription")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="issuer-bank-name" className="text-sm text-muted-foreground">{t("issuerBankNameLabel")}</label>
            <Input id="issuer-bank-name" value={value.bank.bankName} onChange={(e) => setBank({ bankName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor="issuer-account-name" className="text-sm text-muted-foreground">{t("issuerAccountNameLabel")}</label>
            <Input id="issuer-account-name" value={value.bank.accountName} onChange={(e) => setBank({ accountName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor="issuer-account-number" className="text-sm text-muted-foreground">{t("issuerAccountNumberLabel")}</label>
            <Input id="issuer-account-number" value={value.bank.accountNumber} onChange={(e) => setBank({ accountNumber: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor="issuer-iban" className="text-sm text-muted-foreground">{t("issuerIbanLabel")}</label>
            <Input id="issuer-iban" value={value.bank.iban} onChange={(e) => setBank({ iban: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor="issuer-swift" className="text-sm text-muted-foreground">{t("issuerSwiftLabel")}</label>
            <Input id="issuer-swift" value={value.bank.swift} onChange={(e) => setBank({ swift: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label htmlFor="issuer-branch" className="text-sm text-muted-foreground">{t("issuerBranchLabel")}</label>
            <Input id="issuer-branch" value={value.bank.branch} onChange={(e) => setBank({ branch: e.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="issuer-instructions" className="text-sm text-muted-foreground">{t("issuerInstructionsLabel")}</label>
            <Textarea id="issuer-instructions" rows={2} value={value.bank.instructions} placeholder={t("issuerInstructionsPlaceholder")} onChange={(e) => setBank({ instructions: e.target.value })} />
          </div>
        </div>
      </div>
    </>
  );
}
