"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2, Briefcase, Calculator, Percent, CreditCard,
  FileCheck, ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Job {
  _id: string;
  title: string;
  employerId: { _id: string; companyName: string } | string;
  agentId?: {
    _id?: string;
    commissionRate?: number;
    userId?: { name?: string; email?: string };
    superAgentId?: {
      _id?: string;
      overrideRate?: number;
      userId?: { name?: string };
    } | string;
  } | string;
}
interface Employer { _id: string; companyName: string; companyEmail?: string; phone?: string; address?: string; country?: string; taxId?: string; employerProfileId?: string }
interface LineItem { description: string; quantity: number; unitPrice: number; amount: number }

interface InvoiceBuilderProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCurrency?: string;
  searchScope?: "admin" | "standard";
  role?: "admin" | "super_agent" | "agent";
}

const INVOICE_CATEGORIES = [
  { value: "recruitment", label: "Recruitment Placement" },
  { value: "subscription", label: "Employer Subscription" },
  { value: "premium_posting", label: "Premium Job Posting" },
  { value: "featured_promotion", label: "Featured Employer Promotion" },
  { value: "exhibition", label: "Exhibition Billing" },
  { value: "bulk_hiring", label: "Bulk Hiring Package" },
  { value: "consulting", label: "Consulting Fee" },
  { value: "custom_enterprise", label: "Custom Enterprise Billing" },
];

const TAX_TYPES = [
  { value: "none", label: "No Tax" },
  { value: "gst", label: "GST" },
  { value: "vat", label: "VAT" },
  { value: "reverse_charge", label: "Reverse Charge" },
];

const PAYMENT_TERMS = [
  { value: "immediate", label: "Immediate" },
  { value: "net_7", label: "Net 7 days" },
  { value: "net_15", label: "Net 15 days" },
  { value: "net_30", label: "Net 30 days" },
  { value: "net_45", label: "Net 45 days" },
  { value: "net_60", label: "Net 60 days" },
  { value: "net_90", label: "Net 90 days" },
  { value: "custom", label: "Custom" },
];

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }));

const STEPS = [
  { id: 1, label: "Employer Details", icon: Building2 },
  { id: 2, label: "Service Details", icon: Briefcase },
  { id: 3, label: "Pricing", icon: Calculator },
  { id: 4, label: "Commission", icon: Percent },
  { id: 5, label: "Payment Terms", icon: CreditCard },
  { id: 6, label: "Review & Generate", icon: FileCheck },
];

function getEmployerId(employer: Employer): string {
  return employer.employerProfileId ?? employer._id;
}

function isPopulatedJobEmployer(employerId: Job["employerId"]): employerId is Exclude<Job["employerId"], string> {
  return typeof employerId === "object" && employerId !== null;
}

function mergeById<T extends { _id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item._id, item]));

  for (const item of incoming) {
    const existing = merged.get(item._id);
    merged.set(item._id, existing ? { ...existing, ...item } : item);
  }

  return Array.from(merged.values());
}

export function InvoiceBuilder({ open, onClose, onSuccess, defaultCurrency = "AED", searchScope = "standard", role = "agent" }: InvoiceBuilderProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const attemptedEmployerBackfillsRef = useRef<Set<string>>(new Set());

  // Step 1 - Employer
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingEmployers, setLoadingEmployers] = useState(false);
  const [jobSearchError, setJobSearchError] = useState<string | null>(null);
  const [employerSearchError, setEmployerSearchError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedEmployerId, setSelectedEmployerId] = useState("");
  const [billingCompanyName, setBillingCompanyName] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCountry, setBillingCountry] = useState("");
  const [billingTaxId, setBillingTaxId] = useState("");
  const [billingContactPerson, setBillingContactPerson] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");

  // Step 2 - Service
  const [category, setCategory] = useState("recruitment");
  const [description, setDescription] = useState("");

  // Step 3 - Pricing / Line Items
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [serviceCharge, setServiceCharge] = useState(0);
  const [taxType, setTaxType] = useState("none");
  const [taxPercent, setTaxPercent] = useState(0);
  const [currency, setCurrency] = useState(defaultCurrency);

  // Step 4 - Commission (read-only display, auto-calculated)
  const [agentRate, setAgentRate] = useState(0);
  const [superAgentRate, setSuperAgentRate] = useState(0);

  // Step 5 - Payment
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [customPaymentDays, setCustomPaymentDays] = useState(30);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState(role === "agent" ? "pending_approval" : "issued");
  const debouncedJobSearch = useDebounce(jobSearch, 300);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setStep(1);
      setJobs([]); setEmployers([]);
      setJobSearch("");
      setJobSearchError(null); setEmployerSearchError(null);
      attemptedEmployerBackfillsRef.current = new Set();
      setSelectedJobId(""); setSelectedEmployerId("");
      setBillingCompanyName(""); setBillingAddress(""); setBillingCountry(""); setBillingTaxId("");
      setBillingContactPerson(""); setBillingEmail(""); setBillingPhone("");
      setCategory("recruitment"); setDescription("");
      setLineItems([{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
      setDiscountPercent(0); setServiceCharge(0); setTaxType("none"); setTaxPercent(0);
      setCurrency(defaultCurrency); setPaymentTerms("net_30"); setCustomPaymentDays(30);
      setDueDate(""); setNotes(""); setInternalNotes(""); setInvoiceStatus(role === "agent" ? "pending_approval" : "issued");
      setAgentRate(0); setSuperAgentRate(0);
    }
  }, [open, defaultCurrency, role]);

  const fetchJobs = useCallback(async (search: string) => {
    setLoadingJobs(true);
    setJobSearchError(null);

    try {
      const endpoint = searchScope === "admin" ? "/api/admin/jobs" : "/api/jobs";
      const params = new URLSearchParams({ limit: "25", page: "1" });
      if (searchScope !== "admin") params.set("invoiceableOnly", "true");
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setJobs((current) => mergeById(current, data.jobs ?? []));
      } else {
        setJobSearchError("Jobs could not be loaded right now.");
      }
    } catch {
      setJobSearchError("Jobs could not be loaded right now.");
    } finally {
      setLoadingJobs(false);
    }
  }, [searchScope]);

  const fetchEmployers = useCallback(async (search: string) => {
    setLoadingEmployers(true);
    setEmployerSearchError(null);

    try {
      const params = new URLSearchParams({ limit: "25", page: "1" });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/employers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const normalizedEmployers = (data.employers ?? []).map((employer: Employer) => ({
          ...employer,
          _id: getEmployerId(employer),
        }));
        setEmployers((current) => mergeById(current, normalizedEmployers));
      } else {
        setEmployerSearchError("Employers could not be loaded right now.");
      }
    } catch {
      setEmployerSearchError("Employers could not be loaded right now.");
    } finally {
      setLoadingEmployers(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchJobs(debouncedJobSearch);
  }, [open, debouncedJobSearch, fetchJobs]);

  // When job selected, auto-populate employer
  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j._id === selectedJobId);
      if (job) {
        const empId = isPopulatedJobEmployer(job.employerId) ? job.employerId._id : job.employerId;
        const assignedAgent = typeof job.agentId === "object" ? job.agentId : undefined;
        const assignedSuperAgent = assignedAgent && typeof assignedAgent.superAgentId === "object"
          ? assignedAgent.superAgentId
          : undefined;

        const populatedEmployer = isPopulatedJobEmployer(job.employerId) ? job.employerId : null;

        if (populatedEmployer) {
          setEmployers((current) => mergeById(current, [{
            _id: populatedEmployer._id,
            companyName: populatedEmployer.companyName,
          }]));
        }

        setAgentRate(assignedAgent?.commissionRate ?? 0);
        setSuperAgentRate(assignedSuperAgent?.overrideRate ?? 0);
        setSelectedEmployerId(empId);
        return;
      }
    }

    setSelectedEmployerId("");
    setAgentRate(0);
    setSuperAgentRate(0);
  }, [selectedJobId, jobs]);

  // When employer selected, auto-populate billing
  useEffect(() => {
    if (selectedEmployerId) {
      const emp = employers.find(e => e._id === selectedEmployerId);
      if (emp) {
        setBillingCompanyName(emp.companyName || "");
        setBillingEmail(emp.companyEmail || "");
        setBillingPhone(emp.phone || "");
        setBillingAddress(emp.address || "");
        setBillingCountry(emp.country || "");
        setBillingTaxId(emp.taxId || "");
        const hasFullBillingProfile = Boolean(emp.companyEmail || emp.phone || emp.address || emp.country || emp.taxId);
        if (hasFullBillingProfile) return;
      }

      const selectedJob = jobs.find((job) => job._id === selectedJobId);
  if (selectedJob && isPopulatedJobEmployer(selectedJob.employerId) && selectedJob.employerId.companyName) {
        if (attemptedEmployerBackfillsRef.current.has(selectedEmployerId)) {
          return;
        }

        attemptedEmployerBackfillsRef.current.add(selectedEmployerId);
        void fetchEmployers(selectedJob.employerId.companyName);
      }
    }
  }, [selectedEmployerId, employers, jobs, selectedJobId, fetchEmployers]);

  // Calculations
  const subtotal = lineItems.reduce((s, li) => s + (li.quantity * li.unitPrice), 0);
  const discountAmount = Math.round(subtotal * discountPercent / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round(afterDiscount * taxPercent / 100 * 100) / 100;
  const totalAmount = Math.round((afterDiscount + taxAmount + serviceCharge) * 100) / 100;

  const agentCommission = Math.round(totalAmount * agentRate / 100 * 100) / 100;
  const superAgentCommission = Math.round(totalAmount * superAgentRate / 100 * 100) / 100;
  const companyGross = totalAmount;
  const companyNet = Math.round((totalAmount - agentCommission - superAgentCommission) * 100) / 100;

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].amount = updated[index].quantity * updated[index].unitPrice;
      return updated;
    });
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedJobId) { toast.error("Please select a job first"); setStep(1); return; }
    if (!selectedEmployerId) { toast.error("Please select an employer"); setStep(1); return; }
    if (lineItems.some(li => !li.description || li.unitPrice <= 0)) { toast.error("Please fill all line items"); setStep(3); return; }

    setSubmitting(true);
    try {
      const payload = {
        jobId: selectedJobId || undefined,
        employerId: selectedEmployerId,
        amount: subtotal,
        currency,
        lineItems: lineItems.map(li => ({
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          amount: li.quantity * li.unitPrice,
        })),
        discountPercent,
        taxType,
        taxPercent,
        serviceCharge,
        paymentTerms,
        customPaymentDays: paymentTerms === "custom" ? customPaymentDays : undefined,
        dueDate: dueDate || undefined,
        billingDetails: {
          companyName: billingCompanyName,
          contactPerson: billingContactPerson,
          email: billingEmail,
          phone: billingPhone,
          address: billingAddress,
          country: billingCountry,
          taxId: billingTaxId,
        },
        notes: notes || undefined,
        internalNotes: internalNotes || undefined,
        status: invoiceStatus,
      };

      const res = await csrfFetch("/api/invoices/recruitment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create invoice");
      }

      const data = await res.json();
      toast.success(data.message ?? "Invoice created successfully");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedJobId && !!selectedEmployerId;
      case 2: return !!category;
      case 3: return lineItems.every(li => li.description && li.unitPrice > 0);
      case 4: return true;
      case 5: return true;
      default: return true;
    }
  };

  const fmt = (v: number) => `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const selectedJob = jobs.find((job) => job._id === selectedJobId);
  const selectedEmployer = employers.find((employer) => employer._id === selectedEmployerId);
  const selectedAgent = selectedJob && typeof selectedJob.agentId === "object" ? selectedJob.agentId : undefined;
  const selectedSuperAgent = selectedAgent && typeof selectedAgent.superAgentId === "object" ? selectedAgent.superAgentId : undefined;
  const statusOptions = role === "agent"
    ? [{ value: "pending_approval", label: "Submit for Approval" }]
    : [{ value: "draft", label: "Save as Draft" }, { value: "issued", label: "Issue Immediately" }, { value: "pending_approval", label: "Submit for Approval" }];
  const previewStatusLabel = invoiceStatus === "pending_approval"
    ? "PENDING APPROVAL"
    : invoiceStatus === "draft"
      ? "DRAFT"
      : "ISSUED";
  const previewStatusClass = invoiceStatus === "pending_approval"
    ? "text-sky-600"
    : invoiceStatus === "draft"
      ? "text-amber-600"
      : "text-emerald-600";
  const jobOptions = jobs.map((job) => ({
      value: job._id,
      label: isPopulatedJobEmployer(job.employerId) && job.employerId.companyName
        ? `${job.title} - ${job.employerId.companyName}`
        : job.title,
    }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent ref={dialogContentRef} className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/80 px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Professional Invoice Builder</DialogTitle>
          {/* Step Indicator */}
          <div className="mt-3 flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    step === s.id
                      ? "bg-primary text-primary-foreground"
                      : step > s.id
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <s.icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {i < STEPS.length - 1 && <div className="mx-0.5 h-px w-3 bg-border" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div ref={bodyRef} className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {/* STEP 1: Employer Details */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Recruitment Job & Billing Details</h3>
              <div className="rounded-xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
                Select the placement job first. The employer and commission setup are then pulled from that assignment so the invoice follows the real recruitment workflow.
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Placement Job *</Label>
                  <SearchableSelect
                    id="inv-job"
                    className="mt-1 h-10 w-full rounded-lg border-border bg-card"
                    options={jobOptions}
                    value={selectedJobId}
                    onValueChange={setSelectedJobId}
                    searchValue={jobSearch}
                    onSearchValueChange={setJobSearch}
                    searchPlaceholder="Search jobs by title or employer"
                    loading={loadingJobs}
                    emptyMessage={jobSearchError ?? (debouncedJobSearch ? "No matching jobs found." : "No jobs available yet.")}
                    placeholder="Search and select the billed job"
                    container={dialogContentRef.current}
                    modal
                  />
                  {jobSearchError ? <p className="mt-2 text-xs text-rose-600">{jobSearchError}</p> : null}
                </div>
                <div>
                  <Label className="text-xs">Employer</Label>
                  <div className="mt-1 flex min-h-10 items-center rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm">
                    {selectedEmployer?.companyName
                      ?? (selectedJob && isPopulatedJobEmployer(selectedJob.employerId) ? selectedJob.employerId.companyName : "Select a job to lock the employer")}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Employer is derived from the selected job and cannot be changed independently.</p>
                  {employerSearchError ? <p className="mt-2 text-xs text-rose-600">{employerSearchError}</p> : null}
                </div>
              </div>
              {selectedJob ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected Job</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedJob.title}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned Agent Rate</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{agentRate}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedAgent?.userId?.name ?? selectedAgent?.userId?.email ?? "No assigned agent profile"}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Supervisor Override</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{superAgentRate}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedSuperAgent?.userId?.name ?? "No super agent override"}</p>
                  </div>
                </div>
              ) : null}
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Information</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-xs">Company Name</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingCompanyName} onChange={e => setBillingCompanyName(e.target.value)} /></div>
                  <div><Label className="text-xs">Contact Person</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingContactPerson} onChange={e => setBillingContactPerson(e.target.value)} /></div>
                  <div><Label className="text-xs">Email</Label><Input disabled={!selectedJobId} type="email" className="mt-1 h-9 rounded-lg" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} /></div>
                  <div><Label className="text-xs">Phone</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingPhone} onChange={e => setBillingPhone(e.target.value)} /></div>
                  <div className="sm:col-span-2"><Label className="text-xs">Address</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingAddress} onChange={e => setBillingAddress(e.target.value)} /></div>
                  <div><Label className="text-xs">Country</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} /></div>
                  <div><Label className="text-xs">Tax ID / GSTIN / VAT</Label><Input disabled={!selectedJobId} className="mt-1 h-9 rounded-lg" value={billingTaxId} onChange={e => setBillingTaxId(e.target.value)} /></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Service Details */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Recruitment Service Details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Invoice Type</Label>
                  <div className="mt-1 flex min-h-10 items-center rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm font-medium text-foreground">
                    Recruitment placement invoice
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">This flow is optimized for employer invoices tied to a specific job placement.</p>
                </div>
                <div>
                  <Label className="text-xs">Currency</Label>
                  <SearchableSelect
                    id="inv-currency"
                    className="mt-1 h-10 w-full rounded-lg border-border bg-card"
                    options={CURRENCY_OPTIONS}
                    value={currency}
                    onValueChange={setCurrency}
                    placeholder="Select currency"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="mt-1 rounded-lg" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Invoice description..." />
              </div>
            </div>
          )}

          {/* STEP 3: Pricing / Line Items */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Line Items & Pricing</h3>
                <Button variant="outline" size="sm" onClick={addLineItem} className="h-8 gap-1.5 rounded-lg text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_100px_100px_32px] items-end gap-2 rounded-lg border border-border/60 bg-secondary/20 p-3">
                    <div><Label className="text-[10px]">Description</Label><Input className="mt-0.5 h-8 rounded text-sm" value={li.description} onChange={e => updateLineItem(i, "description", e.target.value)} /></div>
                    <div><Label className="text-[10px]">Qty</Label><Input type="number" min={1} className="mt-0.5 h-8 rounded text-sm" value={li.quantity} onChange={e => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)} /></div>
                    <div><Label className="text-[10px]">Unit Price</Label><Input type="number" min={0} step="0.01" className="mt-0.5 h-8 rounded text-sm" value={li.unitPrice} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} /></div>
                    <div><Label className="text-[10px]">Amount</Label><div className="mt-0.5 flex h-8 items-center rounded bg-muted/50 px-2 text-sm font-medium">{fmt(li.quantity * li.unitPrice)}</div></div>
                    <Button variant="ghost" size="sm" onClick={() => removeLineItem(i)} disabled={lineItems.length <= 1} className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div><Label className="text-xs">Discount %</Label><Input type="number" min={0} max={100} step={0.5} className="mt-1 h-9 rounded-lg" value={discountPercent} onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Service Charge</Label><Input type="number" min={0} step={0.01} className="mt-1 h-9 rounded-lg" value={serviceCharge} onChange={e => setServiceCharge(parseFloat(e.target.value) || 0)} /></div>
                <div>
                  <Label className="text-xs">Tax Type</Label>
                  <SearchableSelect id="inv-tax-type" className="mt-1 h-9 w-full rounded-lg border-border bg-card" options={TAX_TYPES} value={taxType} onValueChange={setTaxType} />
                </div>
                <div><Label className="text-xs">Tax %</Label><Input type="number" min={0} max={100} step={0.5} className="mt-1 h-9 rounded-lg" value={taxPercent} onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)} disabled={taxType === "none"} /></div>
              </div>

              {/* Pricing Summary */}
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
                  {discountPercent > 0 && <div className="flex justify-between text-emerald-600"><span>Discount ({discountPercent}%)</span><span>-{fmt(discountAmount)}</span></div>}
                  {serviceCharge > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Service Charge</span><span>{fmt(serviceCharge)}</span></div>}
                  {taxPercent > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxType.toUpperCase()} {taxPercent}%)</span><span>{fmt(taxAmount)}</span></div>}
                  <div className="border-t border-border/70 pt-1.5" />
                  <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-primary">{fmt(totalAmount)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Commission Engine */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Commission Engine</h3>
              <p className="text-xs text-muted-foreground">Commission percentages come from the assigned agent and super-agent setup. These are estimated payout figures; final saved commissions still apply platform country override rules when they exist.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Agent Rate Source</p>
                  <p className="mt-2 text-xl font-semibold text-sky-600">{agentRate}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedAgent?.userId?.name ?? selectedAgent?.userId?.email ?? "No assigned agent profile"}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Super Agent Override</p>
                  <p className="mt-2 text-xl font-semibold text-indigo-600">{superAgentRate}%</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedSuperAgent?.userId?.name ?? "No super agent override"}</p>
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commission Breakdown</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Billed Invoice Amount</span><span className="font-medium">{fmt(totalAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated Agent Payout ({agentRate}%)</span><span className="font-medium text-sky-600">{fmt(agentCommission)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated Super Agent Payout ({superAgentRate}%)</span><span className="font-medium text-indigo-600">{fmt(superAgentCommission)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxType !== "none" ? `${taxPercent}%` : "—"})</span><span className="font-medium text-amber-600">{fmt(taxAmount)}</span></div>
                  <div className="border-t border-border/70 pt-1.5" />
                  <div className="flex justify-between"><span className="text-muted-foreground">Company Gross Revenue</span><span className="font-bold">{fmt(companyGross)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Company Net Revenue</span><span className="font-bold text-emerald-600">{fmt(companyNet)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Payment Terms */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Payment Terms & Notes</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Payment Terms</Label>
                  <SearchableSelect id="inv-pay-terms" className="mt-1 h-10 w-full rounded-lg border-border bg-card" options={PAYMENT_TERMS} value={paymentTerms} onValueChange={setPaymentTerms} />
                </div>
                {paymentTerms === "custom" && (
                  <div><Label className="text-xs">Custom Days</Label><Input type="number" min={1} className="mt-1 h-10 rounded-lg" value={customPaymentDays} onChange={e => setCustomPaymentDays(parseInt(e.target.value) || 30)} /></div>
                )}
                <div><Label className="text-xs">Due Date (override)</Label><Input type="date" className="mt-1 h-10 rounded-lg" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                <div>
                  <Label className="text-xs">Invoice Status</Label>
                  <SearchableSelect
                    id="inv-status"
                    className="mt-1 h-10 w-full rounded-lg border-border bg-card"
                    options={statusOptions}
                    value={invoiceStatus}
                    onValueChange={setInvoiceStatus}
                  />
                  {role === "agent" ? <p className="mt-2 text-xs text-muted-foreground">Finance approval is required before the employer receives this invoice.</p> : null}
                </div>
              </div>
              <div><Label className="text-xs">Notes (visible on invoice)</Label><Textarea className="mt-1 rounded-lg" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment instructions, bank details, etc." /></div>
              <div><Label className="text-xs">Internal Notes (finance team only)</Label><Textarea className="mt-1 rounded-lg" rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Internal remarks..." /></div>
            </div>
          )}

          {/* STEP 6: Review & Generate */}
          {step === 6 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Invoice Preview</h3>
              <div className="rounded-xl border border-border bg-card p-5">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border/70 pb-4">
                  <div>
                    <p className="text-lg font-bold text-foreground">INVOICE</p>
                    <p className="text-xs text-muted-foreground">Recruitment Placement</p>
                    <p className="mt-1 text-xs text-muted-foreground">Status: <span className={previewStatusClass}>{previewStatusLabel}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{billingCompanyName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{billingEmail}</p>
                    <p className="text-xs text-muted-foreground">{billingPhone}</p>
                  </div>
                </div>

                {/* Billing */}
                <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-muted-foreground">BILL TO</p>
                    <p className="mt-1 font-medium">{billingCompanyName}</p>
                    <p className="text-muted-foreground">{billingAddress}</p>
                    <p className="text-muted-foreground">{billingCountry}</p>
                    {billingTaxId && <p className="text-muted-foreground">Tax ID: {billingTaxId}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-muted-foreground">DETAILS</p>
                    <p className="mt-1">Terms: {PAYMENT_TERMS.find(t => t.value === paymentTerms)?.label}</p>
                    <p>Currency: {currency}</p>
                    {dueDate && <p>Due: {dueDate}</p>}
                  </div>
                </div>

                {/* Line Items */}
                <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50"><th className="px-3 py-2 text-left font-semibold">Description</th><th className="px-3 py-2 text-right font-semibold">Qty</th><th className="px-3 py-2 text-right font-semibold">Unit Price</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr></thead>
                    <tbody>
                      {lineItems.map((li, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2">{li.description || "—"}</td>
                          <td className="px-3 py-2 text-right">{li.quantity}</td>
                          <td className="px-3 py-2 text-right">{fmt(li.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(li.quantity * li.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="ml-auto mt-3 max-w-xs space-y-1 text-xs">
                  <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
                  {discountPercent > 0 && <div className="flex justify-between text-emerald-600"><span>Discount ({discountPercent}%)</span><span>-{fmt(discountAmount)}</span></div>}
                  {serviceCharge > 0 && <div className="flex justify-between"><span>Service Charge</span><span>{fmt(serviceCharge)}</span></div>}
                  {taxPercent > 0 && <div className="flex justify-between"><span>Tax ({taxType.toUpperCase()} {taxPercent}%)</span><span>{fmt(taxAmount)}</span></div>}
                  <div className="border-t border-border/70 pt-1" />
                  <div className="flex justify-between text-sm font-bold"><span>Total</span><span className="text-primary">{fmt(totalAmount)}</span></div>
                </div>

                {/* Commission */}
                {(agentRate > 0 || superAgentRate > 0) && (
                  <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs">
                    <p className="font-semibold text-muted-foreground">COMMISSION SPLIT</p>
                    <div className="mt-1 space-y-0.5">
                      {agentRate > 0 && <p>Agent: {agentRate}% = {fmt(agentCommission)}</p>}
                      {superAgentRate > 0 && <p>Super Agent: {superAgentRate}% = {fmt(superAgentCommission)}</p>}
                      <p className="font-medium">Company Net: {fmt(companyNet)}</p>
                    </div>
                  </div>
                )}

                {notes && <div className="mt-3 text-xs text-muted-foreground"><p className="font-semibold">Notes:</p><p>{notes}</p></div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between border-t border-border/80 px-6 py-3">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onClose()} className="h-9 gap-1.5 rounded-lg">
            <ChevronLeft className="h-4 w-4" />
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          <div className="flex items-center gap-2">
            {step < 6 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="h-9 gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="h-9 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><FileCheck className="h-4 w-4" /> {role === "agent" ? "Submit Invoice" : "Generate Invoice"}</>}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
