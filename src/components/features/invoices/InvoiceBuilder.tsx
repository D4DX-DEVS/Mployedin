"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SUPPORTED_CURRENCIES, currencyForCountry } from "@/lib/currency";

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }));
import { csrfFetch } from "@/lib/security/csrf-client";
import { useDebounce } from "@/hooks/useDebounce";
import { findTaxPreset, INTERNATIONAL_TAX_PRESETS } from "@/lib/invoices/taxPresets";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Building2, FileText, FileCheck, ChevronLeft, ChevronRight,
  Plus, Trash2, Loader2, Search, Check, X, ChevronDown, MapPin, Users,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface Job {
  _id: string;
  title: string;
  employerId: { _id: string; companyName: string; industry?: string; country?: string } | string;
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
  location?: { country?: string; city?: string; isRemote?: boolean };
  salary?: { min?: number; max?: number; currency?: string; period?: string };
  status?: string;
  employmentType?: string;
  vacancies?: number;
  createdAt?: string;
}
interface Employer { _id: string; companyName: string; name?: string; companyEmail?: string; phone?: string; address?: string; country?: string; taxId?: string; employerProfileId?: string }
interface LineItem { id: string; description: string; quantity: number; unitPrice: number; amount: number }
interface AgentOption { _id: string; name: string; superAgentId?: string; regions: string[] }
interface SuperAgentOption { _id: string; name: string; regions: string[]; agentCount: number }

interface InvoiceBuilderProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCurrency?: string;
  searchScope?: "admin" | "standard";
  role?: "admin" | "super_agent" | "agent";
  mode?: "dialog" | "page";
}

// ── Default invoice types + dynamic custom ──────────────────────────────────
const DEFAULT_INVOICE_TYPES = [
  { value: "recruitment", label: "Recruitment Placement" },
  { value: "subscription", label: "Employer Subscription" },
  { value: "premium_posting", label: "Premium Job Posting" },
  { value: "featured_promotion", label: "Featured Employer Promotion" },
  { value: "exhibition", label: "Exhibition Billing" },
  { value: "bulk_hiring", label: "Bulk Hiring Package" },
  { value: "consulting", label: "Consulting Fee" },
  { value: "candidate_db", label: "Candidate Database Access" },
  { value: "visa_processing", label: "Visa Processing" },
  { value: "custom_enterprise", label: "Custom Enterprise Billing" },
];

/** Auto-generate description template based on invoice reason + job title */
function generateInvoiceDescription(reason: string, jobTitle?: string, employerName?: string): string {
  const job = jobTitle ?? "position";
  const emp = employerName ? ` — ${employerName}` : "";
  switch (reason) {
    case "recruitment": return `Recruitment placement fee for ${job}${emp}`;
    case "subscription": return `Employer subscription plan${emp}`;
    case "premium_posting": return `Premium job posting for ${job}${emp}`;
    case "featured_promotion": return `Featured employer promotion${emp}`;
    case "exhibition": return `Exhibition / event billing${emp}`;
    case "bulk_hiring": return `Bulk hiring package for ${job}${emp}`;
    case "consulting": return `Consulting fee${emp}`;
    case "candidate_db": return `Candidate database access${emp}`;
    case "visa_processing": return `Visa processing support for ${job}${emp}`;
    case "custom_enterprise": return `Enterprise billing${emp}`;
    default: return "";
  }
}

const DEFAULT_TAX_TYPES = [
  { value: "none", label: "No Tax" },
  { value: "gst", label: "GST (India, Singapore, Australia)" },
  { value: "vat", label: "VAT (UK, EU, UAE, Saudi)" },
  { value: "reverse_charge", label: "Reverse Charge (EU B2B)" },
  { value: "sales_tax", label: "Sales Tax (USA)" },
  { value: "service_tax", label: "Service Tax" },
  { value: "withholding_tax", label: "Withholding Tax (WHT)" },
  { value: "customs_duty", label: "Customs Duty" },
  { value: "excise", label: "Excise Tax" },
  { value: "cess", label: "Cess / Surcharge" },
  { value: "tds", label: "TDS (India)" },
  { value: "pst", label: "PST (Canada)" },
  { value: "hst", label: "HST (Canada)" },
  { value: "consumption_tax", label: "Consumption Tax (Japan)" },
];

const DEFAULT_STATUS_OPTIONS = [
  { value: "draft", label: "Save as Draft" },
  { value: "issued", label: "Issue Immediately" },
  { value: "pending_approval", label: "Submit for Approval" },
  { value: "sent", label: "Sent to Client" },
  { value: "on_hold", label: "On Hold" },
];

const PAYMENT_TERMS = [
  { value: "immediate", label: "Immediate" },
  { value: "net_7", label: "Net 7 days" },
  { value: "net_15", label: "Net 15 days" },
  { value: "net_30", label: "Net 30 days" },
  { value: "net_45", label: "Net 45 days" },
  { value: "net_60", label: "Net 60 days" },
  { value: "net_90", label: "Net 90 days" },
];

// Simplified to 2 steps: create + review
const STEPS = [
  { id: 1, label: "Create Invoice", icon: FileText },
  { id: 2, label: "Review & Generate", icon: FileCheck },
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

export function InvoiceBuilder({ open, onClose, onSuccess, defaultCurrency = "AED", searchScope = "standard", role = "agent", mode = "dialog" }: InvoiceBuilderProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const attemptedEmployerBackfillsRef = useRef<Set<string>>(new Set());

  // ── Step 1: Job & Company ──────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [jobSearchError, setJobSearchError] = useState<string | null>(null);
  const [totalJobCount, setTotalJobCount] = useState(-1); // -1 = not loaded yet
  const [loadingCount, setLoadingCount] = useState(false);
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

  // Admin cascade filters: Super Agent → Agent → Employer → Jobs
  const [superAgents, setSuperAgents] = useState<SuperAgentOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedSuperAgentFilter, setSelectedSuperAgentFilter] = useState("");
  const [selectedAgentFilter, setSelectedAgentFilter] = useState("");
  const [selectedEmployerFilter, setSelectedEmployerFilter] = useState("");
  const [loadingFilters, setLoadingFilters] = useState(false);
  // Advanced location filters
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState("");
  // Cascade employers fetched from API (for SA/admin when agent is selected)
  const [cascadeEmployers, setCascadeEmployers] = useState<Array<{ _id: string; companyName: string }>>([]);
  const [loadingCascadeEmployers, setLoadingCascadeEmployers] = useState(false);
  // Duplicate invoice warning
  const [duplicateWarning, setDuplicateWarning] = useState<{ invoiceNumber: string; status: string } | null>(null);

  // ── Step 2: Invoice Details (merged: service + pricing + commission + payment) ──
  const [category, setCategory] = useState("recruitment");
  const [customCategory, setCustomCategory] = useState("");
  const [showAddType, setShowAddType] = useState(false);
  const [customInvoiceTypes, setCustomInvoiceTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [customTaxTypes, setCustomTaxTypes] = useState<Array<{ value: string; label: string }>>([]);
  const [showAddTaxType, setShowAddTaxType] = useState(false);
  const [customTaxLabel, setCustomTaxLabel] = useState("");
  const [customStatuses, setCustomStatuses] = useState<Array<{ value: string; label: string }>>([]);
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [customStatusLabel, setCustomStatusLabel] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [lineItems, setLineItems] = useState<LineItem[]>([{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  const [taxType, setTaxType] = useState("none");
  const [taxPercent, setTaxPercent] = useState(0);
  const [agentRate, setAgentRate] = useState(0);
  const [superAgentRate, setSuperAgentRate] = useState(0);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [customAgentRate, setCustomAgentRate] = useState(0);
  const [customSuperAgentRate, setCustomSuperAgentRate] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [customPaymentDays, setCustomPaymentDays] = useState(30);
  const [customPaymentTerms, setCustomPaymentTerms] = useState<Array<{ value: string; label: string }>>([]);
  const [showAddPaymentTerm, setShowAddPaymentTerm] = useState(false);
  const [customPaymentLabel, setCustomPaymentLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState(role === "agent" ? "pending_approval" : "issued");

  const debouncedJobSearch = useDebounce(jobSearch, 300);
  const allInvoiceTypes = [...DEFAULT_INVOICE_TYPES, ...customInvoiceTypes];
  const allPaymentTerms = [...PAYMENT_TERMS, ...customPaymentTerms];
  const allTaxTypes = [...DEFAULT_TAX_TYPES, ...customTaxTypes];
  const allStatusOptions = role === "agent"
    ? [{ value: "pending_approval", label: "Submit for Approval" }]
    : [...DEFAULT_STATUS_OPTIONS, ...customStatuses];

  // ── Reset form ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStep(1);
      setJobs([]); setEmployers([]);
      setJobSearch(""); setJobSearchError(null); setEmployerSearchError(null);
      setTotalJobCount(-1); setLoadingCount(false);
      attemptedEmployerBackfillsRef.current = new Set();
      setSelectedJobId(""); setSelectedEmployerId("");
      setBillingCompanyName(""); setBillingAddress(""); setBillingCountry(""); setBillingTaxId("");
      setBillingContactPerson(""); setBillingEmail(""); setBillingPhone("");
      setSelectedSuperAgentFilter(""); setSelectedAgentFilter(""); setSelectedEmployerFilter("");
      setSelectedRegionFilter(""); setShowAdvancedFilters(false);
      setCascadeEmployers([]);
      setDuplicateWarning(null);
      setCategory("recruitment"); setCustomCategory(""); setShowAddType(false); setDescription("");
      setShowAddTaxType(false); setCustomTaxLabel("");
      setShowAddStatus(false); setCustomStatusLabel("");
      setLineItems([{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
      setTaxType("none"); setTaxPercent(0);
      setCurrency(defaultCurrency); setPaymentTerms("net_30"); setCustomPaymentDays(30);
      setDueDate(""); setNotes(""); setInternalNotes("");
      setInvoiceStatus(role === "agent" ? "pending_approval" : "issued");
      setAgentRate(0); setSuperAgentRate(0);
      setCommissionEnabled(false); setCustomAgentRate(0); setCustomSuperAgentRate(0);
    }
  }, [open, defaultCurrency, role]);

  // ── Load user invoice defaults on open ─────────────────────────────────────
  useEffect(() => {
    if (!open || role === "admin") return;
    const endpoint = role === "super_agent"
      ? "/api/super-agent/settings/invoice-defaults"
      : "/api/agent/settings/invoice-defaults";
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.invoiceDefaults) return;
        const d = data.invoiceDefaults;
        if (d.defaultCurrency) setCurrency(d.defaultCurrency);
        if (d.defaultPaymentTerms) setPaymentTerms(d.defaultPaymentTerms);
        if (d.customPaymentDays) setCustomPaymentDays(d.customPaymentDays);
        if (d.defaultTaxType) setTaxType(d.defaultTaxType);
        if (d.defaultTaxPercent != null) setTaxPercent(d.defaultTaxPercent);
        if (d.defaultCategory) setCategory(d.defaultCategory);
        if (d.defaultNotes) setNotes(d.defaultNotes);
        if (d.billingCompanyName) setBillingCompanyName(d.billingCompanyName);
        if (d.billingContactPerson) setBillingContactPerson(d.billingContactPerson);
        if (d.billingEmail) setBillingEmail(d.billingEmail);
        if (d.billingPhone) setBillingPhone(d.billingPhone);
        if (d.billingAddress) setBillingAddress(d.billingAddress);
        if (d.billingCountry) setBillingCountry(d.billingCountry);
        if (d.billingTaxId) setBillingTaxId(d.billingTaxId);
      })
      .catch(() => {});
  }, [open, role]);

  // ── Fetch super agents & agents for admin cascade filter ──────────────────
  useEffect(() => {
    if (!open || role !== "admin") return;
    setLoadingFilters(true);
    Promise.all([
      fetch("/api/admin/super-agents?limit=500").then(r => r.ok ? r.json() : null),
      fetch("/api/admin/agents?limit=500").then(r => r.ok ? r.json() : null),
    ]).then(([saData, agData]) => {
      // Helper to extract region names from populated state/city arrays
      const extractRegions = (states?: { name?: string }[], cities?: { name?: string }[]): string[] => {
        const names = new Set<string>();
        (states ?? []).forEach(s => { if (s?.name) names.add(s.name); });
        (cities ?? []).forEach(c => { if (c?.name) names.add(c.name); });
        return Array.from(names);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saList: SuperAgentOption[] = (saData?.superAgents ?? []).map((sa: any) => ({
        _id: sa.superAgentProfile?._id ?? sa._id,
        name: sa.name ?? sa.email ?? sa._id,
        regions: extractRegions(sa.superAgentProfile?.assignedStateIds, sa.superAgentProfile?.assignedCityIds),
        agentCount: sa.superAgentProfile?.agentCount ?? sa.superAgentProfile?.agents?.length ?? 0,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agList: AgentOption[] = (agData?.agents ?? []).map((ag: any) => ({
        _id: ag.agentProfile?._id ?? ag._id,
        name: ag.name ?? ag.email ?? ag._id,
        superAgentId: typeof ag.agentProfile?.superAgentId === "object" ? ag.agentProfile.superAgentId._id : ag.agentProfile?.superAgentId,
        regions: extractRegions(ag.agentProfile?.assignedStateIds, ag.agentProfile?.assignedCityIds),
      }));
      setSuperAgents(saList);
      setAgents(agList);
    }).catch(() => {}).finally(() => setLoadingFilters(false));
  }, [open, role]);

  // ── Super agent filter for super_agent role ───────────────────────────────
  useEffect(() => {
    if (!open || role !== "super_agent") return;
    setLoadingFilters(true);
    // SA agents API returns { items: [{ _id: userId, agentId, name, email, ... }] }
    fetch("/api/super-agent/agents?limit=100").then(r => r.ok ? r.json() : null).then(data => {
      const agList: AgentOption[] = (data?.items ?? []).map((ag: { _id: string; agentId?: string; name?: string; email?: string }) => ({
        _id: ag.agentId ?? ag._id,
        name: ag.name ?? ag.email ?? ag._id,
        regions: [],
      }));
      setAgents(agList);
    }).catch(() => {}).finally(() => setLoadingFilters(false));
  }, [open, role]);

  // ── Region-based filtering ─────────────────────────────────────────────────
  const allRegions = useMemo(() => {
    const regionSet = new Set<string>();
    superAgents.forEach(sa => sa.regions.forEach(r => regionSet.add(r)));
    agents.forEach(ag => ag.regions.forEach(r => regionSet.add(r)));
    return Array.from(regionSet).sort();
  }, [superAgents, agents]);

  const regionFilteredSuperAgents = selectedRegionFilter
    ? superAgents.filter(sa => sa.regions.some(r => r === selectedRegionFilter))
    : superAgents;

  const regionFilteredAgents = selectedRegionFilter
    ? agents.filter(ag => ag.regions.some(r => r === selectedRegionFilter))
    : agents;

  const filteredAgents = selectedSuperAgentFilter
    ? regionFilteredAgents.filter(a => a.superAgentId === selectedSuperAgentFilter)
    : regionFilteredAgents;

  // ── Fetch jobs (with agent + employer filter for cascade) ────────────────
  // Smart count: fetches total count, and auto-loads all jobs when count is small (≤ 20)
  const AUTO_LOAD_THRESHOLD = 20;
  const fetchJobCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const endpoint = searchScope === "admin" ? "/api/admin/jobs" : "/api/jobs";
      // First get count
      const countParams = new URLSearchParams({ limit: "1", page: "1" });
      if (searchScope !== "admin") countParams.set("invoiceableOnly", "true");
      if (selectedAgentFilter) countParams.set("agentId", selectedAgentFilter);
      if (selectedEmployerFilter) countParams.set("employerId", selectedEmployerFilter);
      const res = await fetch(`${endpoint}?${countParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const total = data.pagination?.total ?? 0;
        setTotalJobCount(total);
        // Auto-load all jobs when count is small — no search needed
        if (total > 0 && total <= AUTO_LOAD_THRESHOLD) {
          const allParams = new URLSearchParams({ limit: String(total), page: "1" });
          if (searchScope !== "admin") allParams.set("invoiceableOnly", "true");
          if (selectedAgentFilter) allParams.set("agentId", selectedAgentFilter);
          if (selectedEmployerFilter) allParams.set("employerId", selectedEmployerFilter);
          const allRes = await fetch(`${endpoint}?${allParams.toString()}`);
          if (allRes.ok) {
            const allData = await allRes.json();
            setJobs(allData.jobs ?? []);
          }
        }
      } else {
        setTotalJobCount(0);
      }
    } catch {
      setTotalJobCount(0);
    } finally {
      setLoadingCount(false);
    }
  }, [searchScope, selectedAgentFilter, selectedEmployerFilter]);

  // Search: fetches matching jobs when user types a query
  const fetchJobs = useCallback(async (search: string) => {
    if (!search.trim()) {
      setJobs([]);
      return;
    }
    setLoadingJobs(true);
    setJobSearchError(null);
    try {
      const endpoint = searchScope === "admin" ? "/api/admin/jobs" : "/api/jobs";
      const params = new URLSearchParams({ limit: "30", page: "1" });
      if (searchScope !== "admin") params.set("invoiceableOnly", "true");
      params.set("search", search.trim());
      if (selectedAgentFilter) params.set("agentId", selectedAgentFilter);
      if (selectedEmployerFilter) params.set("employerId", selectedEmployerFilter);
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const total = data.pagination?.total ?? data.jobs?.length ?? 0;
        setTotalJobCount(total);
        setJobs(data.jobs ?? []);
      } else {
        setJobSearchError("Jobs could not be loaded right now.");
      }
    } catch {
      setJobSearchError("Jobs could not be loaded right now.");
    } finally {
      setLoadingJobs(false);
    }
  }, [searchScope, selectedAgentFilter, selectedEmployerFilter]);

  const fetchEmployers = useCallback(async (search: string) => {
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
      }
    } catch {
      setEmployerSearchError("Employers could not be loaded right now.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debouncedJobSearch.trim()) {
      void fetchJobs(debouncedJobSearch);
    } else {
      // No search query — just get the count, don't load all jobs
      setJobs([]);
      void fetchJobCount();
    }
  }, [open, debouncedJobSearch, fetchJobs, fetchJobCount]);

  // When cascade filter changes, clear job selection and re-fetch count
  useEffect(() => {
    setSelectedJobId("");
    setSelectedEmployerId("");
    setJobs([]);
    setTotalJobCount(-1);
    if (open) void fetchJobCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentFilter, selectedEmployerFilter]);

  // When super agent filter changes, clear agent + employer
  useEffect(() => {
    setSelectedAgentFilter("");
    setSelectedEmployerFilter("");
  }, [selectedSuperAgentFilter]);

  // When agent filter changes, clear employer
  useEffect(() => {
    setSelectedEmployerFilter("");
  }, [selectedAgentFilter]);

  // Fetch employers for the selected agent (cascade: Agent → Employer → Jobs)
  useEffect(() => {
    if (!open || !(role === "super_agent" || role === "admin")) {
      setCascadeEmployers([]);
      return;
    }
    if (!selectedAgentFilter) {
      setCascadeEmployers([]);
      return;
    }
    setLoadingCascadeEmployers(true);
    const params = new URLSearchParams({ limit: "200", page: "1" });
    if (role === "super_agent") params.set("agentId", selectedAgentFilter);

    const endpoint = role === "admin"
      ? `/api/employers?agentId=${selectedAgentFilter}&limit=200&page=1`
      : `/api/employers?${params.toString()}`;

    fetch(endpoint)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const list = (data?.employers ?? []).map((e: { _id: string; employerProfileId?: string; companyName?: string }) => ({
          _id: e.employerProfileId ?? e._id,
          companyName: e.companyName ?? "Unknown",
        }));
        setCascadeEmployers(list);
      })
      .catch(() => setCascadeEmployers([]))
      .finally(() => setLoadingCascadeEmployers(false));
  }, [open, role, selectedAgentFilter]);

  // When job selected, auto-populate employer + commission rates + description
  useEffect(() => {
    if (selectedJobId) {
      const job = jobs.find(j => j._id === selectedJobId);
      if (job) {
        const empId = isPopulatedJobEmployer(job.employerId) ? job.employerId._id : job.employerId;
        const assignedAgent = typeof job.agentId === "object" ? job.agentId : undefined;
        const assignedSuperAgent = assignedAgent && typeof assignedAgent.superAgentId === "object"
          ? assignedAgent.superAgentId : undefined;
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
        // Auto-fill first line item description from job + reason
        const empName = populatedEmployer?.companyName;
        const desc = generateInvoiceDescription(category, job.title, empName);
        if (desc) {
          setLineItems(prev => {
            const updated = [...prev];
            if (!updated[0].description) {
              updated[0] = { ...updated[0], description: desc };
            }
            return updated;
          });
        }
        return;
      }
    }
    setSelectedEmployerId("");
    setAgentRate(0);
    setSuperAgentRate(0);
  }, [selectedJobId, jobs, category]);

  // Check for duplicate invoice when job + employer are selected
  useEffect(() => {
    if (!selectedJobId || !selectedEmployerId) {
      setDuplicateWarning(null);
      return;
    }
    const params = new URLSearchParams({ jobId: selectedJobId, employerId: selectedEmployerId });
    fetch(`/api/invoices/check-duplicate?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.exists) {
          setDuplicateWarning({ invoiceNumber: data.invoiceNumber, status: data.status });
        } else {
          setDuplicateWarning(null);
        }
      })
      .catch(() => setDuplicateWarning(null));
  }, [selectedJobId, selectedEmployerId]);

  // Fetch full employer profile by ID for billing auto-fill
  const fetchEmployerById = useCallback(async (empId: string) => {
    try {
      const res = await fetch(`/api/employers?limit=1&search=`);
      if (!res.ok) return;
      const data = await res.json();
      // Search returns all employers; find the matching one by ID
      const match = (data.employers ?? []).find(
        (e: Employer) => (e.employerProfileId ?? e._id) === empId || e._id === empId
      );
      if (match) {
        const normalized = { ...match, _id: getEmployerId(match) };
        setEmployers((current) => mergeById(current, [normalized]));
      }
    } catch { /* silent */ }
  }, []);

  // When employer selected, auto-populate billing
  useEffect(() => {
    if (selectedEmployerId) {
      const emp = employers.find(e => e._id === selectedEmployerId);
      if (emp) {
        setBillingCompanyName(emp.companyName || "");
        setBillingContactPerson(emp.name || "");
        setBillingEmail(emp.companyEmail || "");
        setBillingPhone(emp.phone || "");
        setBillingAddress(emp.address || "");
        setBillingCountry(emp.country || "");
        setBillingTaxId(emp.taxId || "");
        // Only skip backfill if we have core billing fields (email/phone), not just country from job populate
        const hasCoreBillingFields = Boolean(emp.companyEmail || emp.phone);
        if (hasCoreBillingFields) return;
      }
      // Fetch full employer data by searching — ensures email, phone, address, taxId are populated
      if (!attemptedEmployerBackfillsRef.current.has(selectedEmployerId)) {
        attemptedEmployerBackfillsRef.current.add(selectedEmployerId);
        const selectedJobDoc = jobs.find((job) => job._id === selectedJobId);
        if (selectedJobDoc && isPopulatedJobEmployer(selectedJobDoc.employerId) && selectedJobDoc.employerId.companyName) {
          void fetchEmployers(selectedJobDoc.employerId.companyName);
        } else {
          void fetchEmployerById(selectedEmployerId);
        }
      }
    }
  }, [selectedEmployerId, employers, jobs, selectedJobId, fetchEmployers, fetchEmployerById]);

  // Auto-detect tax + currency when billing country changes
  useEffect(() => {
    if (!billingCountry) return;
    const preset = findTaxPreset(billingCountry);
    if (preset) {
      setTaxType(preset.taxType);
      setTaxPercent(preset.defaultRate);
      // Auto-set currency from country code
      const ci = currencyForCountry(preset.countryCode);
      if (ci) setCurrency(ci.code);
    }
  }, [billingCountry]);

  // ── Calculations (mirrors backend: subtotal - discount + tax + serviceCharge) ──
  const subtotal = lineItems.reduce((s, li) => s + (li.quantity * li.unitPrice), 0);
  const discountPercent = 0; // placeholder for future UI integration
  const serviceCharge = 0;   // placeholder for future UI integration
  const discountAmount = Math.round(subtotal * discountPercent / 100 * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = taxType !== "none" ? Math.round(afterDiscount * taxPercent / 100 * 100) / 100 : 0;
  const totalAmount = Math.round((afterDiscount + taxAmount + serviceCharge) * 100) / 100;
  // Commission calculation:
  // - super_agent: uses profile rates from job populate (always visible, editable)
  // - admin: uses profile rates by default; can override via toggle
  // - agent: no control — backend applies profile rates server-side
  const effectiveAgentRate = role === "agent"
    ? agentRate
    : role === "super_agent"
      ? agentRate
      : commissionEnabled ? customAgentRate : agentRate;
  const effectiveSuperAgentRate = role === "agent"
    ? superAgentRate
    : role === "super_agent"
      ? superAgentRate
      : commissionEnabled ? customSuperAgentRate : superAgentRate;
  const combinedRate = effectiveAgentRate + effectiveSuperAgentRate;
  const combinedRateExceeds = combinedRate > 100;
  const agentCommission = Math.round(totalAmount * effectiveAgentRate / 100 * 100) / 100;
  const superAgentCommission = Math.round(totalAmount * effectiveSuperAgentRate / 100 * 100) / 100;
  const companyNet = Math.round((totalAmount - agentCommission - superAgentCommission) * 100) / 100;

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].amount = updated[index].quantity * updated[index].unitPrice;
      return updated;
    });
  };

  const addLineItem = () => setLineItems(prev => [...prev, { id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, amount: 0 }]);

  const removeLineItem = (index: number) => {
    if (lineItems.length <= 1) return;
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const addCustomType = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (allInvoiceTypes.some(t => t.value === value)) {
      toast.error("This type already exists");
      return;
    }
    setCustomInvoiceTypes(prev => [...prev, { value, label: trimmed }]);
    setCategory(value);
    setCustomCategory("");
    setShowAddType(false);
  };

  const addCustomTaxType = () => {
    const trimmed = customTaxLabel.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (allTaxTypes.some(t => t.value === value)) {
      toast.error("This tax type already exists");
      return;
    }
    setCustomTaxTypes(prev => [...prev, { value, label: trimmed }]);
    setTaxType(value);
    setCustomTaxLabel("");
    setShowAddTaxType(false);
  };

  const addCustomPaymentTerm = () => {
    const trimmed = customPaymentLabel.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (allPaymentTerms.some(t => t.value === value)) {
      toast.error("This payment term already exists");
      return;
    }
    setCustomPaymentTerms(prev => [...prev, { value, label: trimmed }]);
    setPaymentTerms(value);
    setCustomPaymentLabel("");
    setShowAddPaymentTerm(false);
  };

  const addCustomStatus = () => {
    const trimmed = customStatusLabel.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, "_");
    if (allStatusOptions.some(t => t.value === value)) {
      toast.error("This status already exists");
      return;
    }
    setCustomStatuses(prev => [...prev, { value, label: trimmed }]);
    setInvoiceStatus(value);
    setCustomStatusLabel("");
    setShowAddStatus(false);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedJobId) { toast.error("Please select a job first"); setStep(1); return; }
    if (!selectedEmployerId) { toast.error("Please select an employer"); setStep(1); return; }
    if (lineItems.some(li => !li.description || li.unitPrice <= 0)) { toast.error("Please fill all line items with description and price"); setStep(1); return; }
    if (combinedRateExceeds) { toast.error(`Combined commission rate (${combinedRate.toFixed(1)}%) exceeds 100%. Please adjust rates.`); return; }
    if (totalAmount <= 0) { toast.error("Invoice total must be greater than zero"); setStep(1); return; }

    setSubmitting(true);
    try {
      const payload = {
        jobId: selectedJobId,
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
        ...(role === "super_agent" ? {
          overrideAgentRate: agentRate,
          overrideSuperAgentRate: superAgentRate,
        } : role === "admin" ? {
          overrideAgentRate: commissionEnabled ? customAgentRate : agentRate,
          overrideSuperAgentRate: commissionEnabled ? customSuperAgentRate : superAgentRate,
        } : {}),
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
      case 1: return !!selectedJobId && !!selectedEmployerId && !duplicateWarning && !combinedRateExceeds && lineItems.every(li => li.description && li.unitPrice > 0) && totalAmount > 0;
      default: return true;
    }
  };

  const fmt = (v: number) => `${currency} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const selectedJob = jobs.find((j) => j._id === selectedJobId);
  const selectedEmployer = employers.find((e) => e._id === selectedEmployerId);
  const selectedAgent = selectedJob && typeof selectedJob.agentId === "object" ? selectedJob.agentId : undefined;
  const selectedSuperAgent = selectedAgent && typeof selectedAgent.superAgentId === "object" ? selectedAgent.superAgentId : undefined;

  const statusOptions = allStatusOptions;

  // Build employer filter options: prefer API-fetched cascade employers when agent is selected
  const employerFilterOptions = useMemo(() => {
    if (cascadeEmployers.length > 0) {
      // Deduplicate by companyName (keep first _id per unique name)
      const nameMap = new Map<string, string>();
      cascadeEmployers
        .sort((a, b) => a.companyName.localeCompare(b.companyName))
        .forEach(e => { if (!nameMap.has(e.companyName)) nameMap.set(e.companyName, e._id); });
      return [
        { value: "", label: "All Employers" },
        ...Array.from(nameMap.entries()).map(([name, id]) => ({ value: id, label: name })),
      ];
    }
    // Fallback: derive from loaded jobs (deduped by name)
    const nameMap = new Map<string, string>();
    jobs.forEach((job) => {
      if (isPopulatedJobEmployer(job.employerId) && !nameMap.has(job.employerId.companyName)) {
        nameMap.set(job.employerId.companyName, job.employerId._id);
      }
    });
    return [{ value: "", label: "All Employers" }, ...Array.from(nameMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, id]) => ({ value: id, label: name }))];
  }, [jobs, cascadeEmployers]);

  // Client-side filter for auto-loaded jobs (when user types but jobs were pre-loaded)
  const filteredJobs = useMemo(() => {
    let result = jobs;
    // Server-side employer filter handles filtering via cascade re-fetch;
    // no client-side employer filter needed here.
    if (!debouncedJobSearch.trim() || totalJobCount > AUTO_LOAD_THRESHOLD) return result;
    const q = debouncedJobSearch.toLowerCase();
    return result.filter((job) => {
      const employer = isPopulatedJobEmployer(job.employerId) ? job.employerId.companyName : "";
      const city = job.location?.city ?? "";
      return job.title.toLowerCase().includes(q) || employer.toLowerCase().includes(q) || city.toLowerCase().includes(q);
    });
  }, [jobs, debouncedJobSearch, totalJobCount]);

  const superAgentOptions = [{ value: "", label: "All Super Agents" }, ...regionFilteredSuperAgents.map(sa => ({
    value: sa._id,
    label: sa.agentCount > 0 ? `${sa.name} (${sa.agentCount} agents)` : sa.name,
  }))];
  const agentOptions = [{ value: "", label: "All Agents" }, ...filteredAgents.map(ag => ({ value: ag._id, label: ag.name }))];

  const previewStatusLabel = (allStatusOptions.find(s => s.value === invoiceStatus)?.label ?? invoiceStatus).toUpperCase();
  const previewStatusClass = invoiceStatus === "pending_approval" ? "text-sky-600" : invoiceStatus === "draft" ? "text-amber-600" : invoiceStatus === "issued" ? "text-emerald-600" : "text-violet-600";

  // ── Shared inner content ─────────────────────────────────────────────────
  const headerContent = (
    <>
      <div className="flex items-center justify-between">
        <h1 className={mode === "page" ? "text-xl font-bold" : "text-lg font-semibold"}>New Invoice</h1>
      </div>
      {/* Step indicator */}
      <div className="mt-3 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => setStep(s.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                step === s.id
                  ? "bg-primary text-primary-foreground"
                  : step > s.id
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-4 bg-border" />}
          </div>
        ))}
      </div>
    </>
  );

  const footerContent = (
    <div className="flex shrink-0 items-center justify-between border-t border-border/80 bg-muted/30 px-6 py-3">
      <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onClose()} className="h-9 gap-1.5 rounded-lg">
        <ChevronLeft className="h-4 w-4" />
        {step > 1 ? "Back" : "Cancel"}
      </Button>
      <div className="flex items-center gap-2">
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="h-9 gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={() => { setInvoiceStatus("draft"); handleSubmit(); }}
              disabled={submitting}
              className="h-9 gap-1.5 rounded-lg"
            >
              Save as Draft
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} className="h-9 gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><FileCheck className="h-4 w-4" /> {role === "agent" ? "Submit Invoice" : "Save and Send"}</>}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const sidebarContent = (role === "admin" || role === "super_agent") && (
    <div className="hidden w-[300px] shrink-0 self-start sticky top-[73px] max-h-[calc(100vh-10rem)] overflow-y-auto bg-muted/20 p-4 lg:block">
      <div className="space-y-4">
        {/* Invoice Summary */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Summary</p>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{fmt(subtotal)}</span>
            </div>
            {taxType !== "none" && taxPercent > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxType.toUpperCase()} {taxPercent}%)</span>
                <span className="font-medium">{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount{discountPercent > 0 ? ` (${discountPercent}%)` : ""}</span>
              <span className="font-medium">-{fmt(discountAmount)}</span>
            </div>
            <div className="border-t border-border/70 pt-2" />
            <div className="flex justify-between">
              <span className="text-sm font-semibold">Total Amount</span>
              <span className="text-lg font-bold text-primary">{fmt(totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Payment Terms */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Terms</p>
          <div className="mt-2 text-xs">
            <p className="font-medium">{allPaymentTerms.find(t => t.value === paymentTerms)?.label ?? paymentTerms}</p>
            {dueDate && <p className="mt-1 text-muted-foreground">Due on {dueDate}</p>}
          </div>
        </div>

        {/* Commission Preview (Internal) */}
        <div className={`rounded-xl border p-4 ${combinedRateExceeds ? "border-rose-300 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20" : "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"}`}>
          <div className="flex items-center justify-between">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${combinedRateExceeds ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}>Commission Split</p>
            {role === "admin" && (selectedAgent || selectedSuperAgent) && (
              <button
                type="button"
                onClick={() => {
                  setCommissionEnabled(!commissionEnabled);
                  if (!commissionEnabled) {
                    setCustomAgentRate(agentRate);
                    setCustomSuperAgentRate(superAgentRate);
                  }
                }}
                className={`rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${commissionEnabled ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {commissionEnabled ? "Custom ✓" : "Override"}
              </button>
            )}
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {(selectedAgent || agentRate > 0) ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {selectedAgent?.userId?.name ? `Agent (${selectedAgent.userId.name})` : "Agent Commission"}
                  </span>
                  <span className="font-medium">{effectiveAgentRate}% &nbsp; {fmt(agentCommission)}</span>
                </div>
                {role === "admin" && commissionEnabled && (
                  <input
                    type="range" min={0} max={50} step={0.5}
                    value={customAgentRate}
                    onChange={(e) => setCustomAgentRate(parseFloat(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sky-200 accent-sky-600 dark:bg-sky-800"
                  />
                )}
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground/60 italic">No agent assigned</span>
                <span className="text-muted-foreground/60">—</span>
              </div>
            )}
            {(selectedSuperAgent || superAgentRate > 0) ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {selectedSuperAgent?.userId?.name ? `SA (${selectedSuperAgent.userId.name})` : "Super Agent Commission"}
                  </span>
                  <span className="font-medium">{effectiveSuperAgentRate}% &nbsp; {fmt(superAgentCommission)}</span>
                </div>
                {role === "admin" && commissionEnabled && (
                  <input
                    type="range" min={0} max={50} step={0.5}
                    value={customSuperAgentRate}
                    onChange={(e) => setCustomSuperAgentRate(parseFloat(e.target.value))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-indigo-200 accent-indigo-600 dark:bg-indigo-800"
                  />
                )}
              </div>
            ) : !selectedAgent ? null : (
              <div className="flex justify-between">
                <span className="text-muted-foreground/60 italic">No super agent</span>
                <span className="text-muted-foreground/60">—</span>
              </div>
            )}
            {combinedRateExceeds && (
              <div className="mt-1 rounded-md bg-rose-100 px-2 py-1.5 dark:bg-rose-900/30">
                <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                  ⚠ Combined rate ({combinedRate.toFixed(1)}%) exceeds 100% — invoice will be rejected
                </p>
              </div>
            )}
            <div className="border-t border-amber-200/70 pt-1.5 dark:border-amber-800/40">
              <div className={`flex justify-between font-medium ${companyNet < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                <span>Platform Revenue</span>
                <span>{fmt(companyNet)}</span>
              </div>
            </div>
            <p className="mt-1 text-[9px] italic text-amber-600/80 dark:text-amber-400/60">Internal — not visible to employer</p>
          </div>
        </div>

        {/* Notes to Customer */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes to Customer</p>
          <p className="mt-2 text-xs text-muted-foreground whitespace-pre-line">
            {notes || "Thanks for your business.\nWe appreciate your trust in our services."}
          </p>
        </div>

        {/* Payment Gateway */}
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Gateway (After Generation)</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="h-4 w-4 rounded bg-sky-100 dark:bg-sky-900/50" />
              <span>Razorpay</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="h-4 w-4 rounded bg-violet-100 dark:bg-violet-900/50" />
              <span>Stripe</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div className="h-4 w-4 rounded bg-emerald-100 dark:bg-emerald-900/50" />
              <span>Bank Transfer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Shared step content (used by both page and dialog mode) ─────────────────
  const stepContent = (
    <>
  
            {/* ═══════════════════════════════════════════════════════════════════
                STEP 1: Job & Company
                ═══════════════════════════════════════════════════════════════════ */}
            {step === 1 && (
              <div className="space-y-5">
                {/* Admin cascade filters: Region → Super Agent → Agent → Jobs (optional) */}
                {(role === "admin" || role === "super_agent") && (
                  <details className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/60 to-transparent dark:border-sky-900/40 dark:from-sky-950/30">
                    {/* Header — clickable to expand */}
                    <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-sky-100 dark:bg-sky-900/50">
                          <Users className="h-3 w-3 text-sky-700 dark:text-sky-300" />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                          {role === "admin" ? "Filter by Team" : "Filter by Agent"}
                        </p>
                        <span className="text-[10px] text-muted-foreground">(optional)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(selectedSuperAgentFilter || selectedAgentFilter || selectedEmployerFilter) && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                            Filtered
                          </span>
                        )}
                        {role === "admin" && !loadingFilters && (
                          <span className="text-[10px] text-muted-foreground">{regionFilteredSuperAgents.length} SA · {filteredAgents.length} agents</span>
                        )}
                        <ChevronDown className="h-4 w-4 text-sky-500 transition-transform [[open]>&]:rotate-180" />
                      </div>
                    </summary>
  
                    {/* Advanced location filters — collapsible */}
                    {role === "admin" && allRegions.length > 0 && (
                      <div className="mx-4 mt-3">
                        <button
                          type="button"
                          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                          className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-sky-300/60 bg-sky-50/50 px-3 py-1.5 text-[11px] font-medium text-sky-600 transition-colors hover:bg-sky-100/60 dark:border-sky-800/40 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-900/30"
                        >
                          <MapPin className="h-3 w-3" />
                          Narrow by Region
                          <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`} />
                          {selectedRegionFilter && (
                            <span className="ml-1 rounded-full bg-sky-200 px-1.5 py-0.5 text-[9px] font-semibold text-sky-800 dark:bg-sky-800 dark:text-sky-200">
                              {selectedRegionFilter}
                            </span>
                          )}
                        </button>
                        {showAdvancedFilters && (
                          <div className="mt-2 flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-[10px] text-muted-foreground">Region / State</Label>
                              <SearchableSelect
                                id="inv-region-filter"
                                className="mt-1 h-8 w-full rounded-lg border-border bg-card text-xs"
                                options={[
                                  { value: "", label: "All Regions" },
                                  ...allRegions.map(r => {
                                    const saCount = superAgents.filter(sa => sa.regions.includes(r)).length;
                                    return { value: r, label: `${r} (${saCount} SA)` };
                                  }),
                                ]}
                                value={selectedRegionFilter}
                                onValueChange={(v) => {
                                  setSelectedRegionFilter(v);
                                  setSelectedSuperAgentFilter("");
                                  setSelectedAgentFilter("");
                                  setSelectedEmployerFilter("");
                                }}
                                placeholder="All Regions"
                                container={dialogContentRef.current}
                                modal
                              />
                            </div>
                            {selectedRegionFilter && (
                              <button
                                type="button"
                                onClick={() => { setSelectedRegionFilter(""); setSelectedSuperAgentFilter(""); setSelectedAgentFilter(""); setSelectedEmployerFilter(""); }}
                                className="mb-0.5 rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                                title="Clear region filter"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
  
                    {/* SA → Agent → Employer cascade */}
                    <div className="space-y-3 p-4">
                      {role === "admin" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Super Agent</Label>
                            <SearchableSelect
                              id="inv-sa-filter"
                              className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                              options={superAgentOptions}
                              value={selectedSuperAgentFilter}
                              onValueChange={(v) => { setSelectedSuperAgentFilter(v); setSelectedAgentFilter(""); setSelectedEmployerFilter(""); }}
                              placeholder="All Super Agents"
                              loading={loadingFilters}
                              container={dialogContentRef.current}
                              modal
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Agent</Label>
                            <SearchableSelect
                              id="inv-ag-filter"
                              className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                              options={agentOptions}
                              value={selectedAgentFilter}
                              onValueChange={(v) => { setSelectedAgentFilter(v); setSelectedEmployerFilter(""); }}
                              placeholder="All Agents"
                              loading={loadingFilters}
                              container={dialogContentRef.current}
                              modal
                            />
                          </div>
                        </div>
                      )}
                      {role === "super_agent" && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Agent</Label>
                          <SearchableSelect
                            id="inv-ag-filter"
                            className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                            options={agentOptions}
                            value={selectedAgentFilter}
                            onValueChange={(v) => { setSelectedAgentFilter(v); setSelectedEmployerFilter(""); }}
                            placeholder="All Agents"
                            loading={loadingFilters}
                            container={dialogContentRef.current}
                            modal
                          />
                        </div>
                      )}
                      {/* Employer filter — shown when agent selected (cascade) or jobs loaded with employer data */}
                      {(employerFilterOptions.length > 1 || loadingCascadeEmployers) && (
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            <Building2 className="mr-1 inline-block h-3 w-3" />Employer
                          </Label>
                          <SearchableSelect
                            id="inv-emp-filter"
                            className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                            options={employerFilterOptions}
                            value={selectedEmployerFilter}
                            onValueChange={setSelectedEmployerFilter}
                            placeholder={selectedAgentFilter ? "Select employer…" : "All Employers"}
                            loading={loadingCascadeEmployers}
                            container={dialogContentRef.current}
                            modal
                          />
                          {selectedAgentFilter && cascadeEmployers.length === 0 && !loadingCascadeEmployers && (
                            <p className="mt-1 text-[10px] text-muted-foreground">No employers found for this agent</p>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                )}
  
                {/* Job select — inline search + results */}
                <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
                        <span className="text-[10px] font-bold text-primary">1</span>
                      </div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-foreground">Select Job *</Label>
                    </div>
                    {loadingCount ? (
                      <span className="text-[10px] text-muted-foreground">Loading…</span>
                    ) : totalJobCount > 0 ? (
                      <span className="text-[10px] text-muted-foreground">{totalJobCount.toLocaleString()} jobs total</span>
                    ) : totalJobCount === 0 ? (
                      <span className="text-[10px] text-amber-600">No jobs found</span>
                    ) : null}
                  </div>
  
                  {/* Selected job chip */}
                  {selectedJobId && selectedJob && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          {selectedJob.title}
                        </span>
                        {isPopulatedJobEmployer(selectedJob.employerId) && (
                          <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            — {selectedJob.employerId.companyName}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedJobId(""); setJobSearch(""); }}
                        className="shrink-0 rounded-full p-0.5 text-emerald-600 hover:bg-emerald-200 dark:hover:bg-emerald-800"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Duplicate invoice warning */}
                  {duplicateWarning && (
                    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                      <div className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Invoice Already Exists</p>
                          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                            An active invoice <span className="font-mono font-semibold">{duplicateWarning.invoiceNumber}</span> (status: <span className="capitalize">{duplicateWarning.status.replace(/_/g, " ")}</span>) already exists for this job and employer. Creating another will be rejected.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
  
                  {/* Job Details Card — shown after selection (admin) */}
                  {selectedJobId && selectedJob && role === "admin" && (
                    <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-xs sm:grid-cols-5">
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Job ID</p>
                        <p className="mt-0.5 font-mono font-medium text-foreground">{selectedJob._id.slice(-8).toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Employer</p>
                        <p className="mt-0.5 font-medium text-foreground">{isPopulatedJobEmployer(selectedJob.employerId) ? selectedJob.employerId.companyName : "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Position</p>
                        <p className="mt-0.5 font-medium text-foreground">{selectedJob.title}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Location</p>
                        <p className="mt-0.5 font-medium text-foreground">{selectedJob.location?.city ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold uppercase text-muted-foreground">Type</p>
                        <p className="mt-0.5 font-medium capitalize text-foreground">{selectedJob.employmentType?.replace(/_/g, " ") ?? "Permanent"}</p>
                      </div>
                    </div>
                  )}
  
                  {/* Search input — always visible */}
                  {!selectedJobId && (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="inv-job-search"
                          className="h-10 rounded-lg pl-9 pr-3 text-sm"
                          placeholder="Search jobs by title or employer…"
                          value={jobSearch}
                          onChange={(e) => setJobSearch(e.target.value)}
                          autoComplete="off"
                        />
                        {loadingJobs && (
                          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                        )}
                      </div>
  
                      {/* Results list — shown when searching OR auto-loaded (small count) */}
                      {(debouncedJobSearch.trim() || loadingJobs || (jobs.length > 0 && totalJobCount <= AUTO_LOAD_THRESHOLD)) ? (
                        <div className="mt-2 max-h-[35vh] overflow-y-auto rounded-lg border border-border/50">
                          {filteredJobs.length > 0 ? (
                            <>
                              {filteredJobs.map((job) => {
                                const employer = isPopulatedJobEmployer(job.employerId) ? job.employerId : null;
                                const city = job.location?.city;
                                const sal = job.salary;
                                const salaryText = sal?.min && sal?.max
                                  ? `${(sal.currency ?? "AED")} ${sal.min.toLocaleString()}–${sal.max.toLocaleString()}`
                                  : sal?.min ? `${(sal.currency ?? "AED")} ${sal.min.toLocaleString()}+` : null;
                                const typeLabel = job.employmentType?.replace(/_/g, " ") ?? "";
                                return (
                                  <button
                                    key={job._id}
                                    type="button"
                                    onClick={() => setSelectedJobId(job._id)}
                                    className="flex w-full items-start gap-3 border-b border-border/30 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        {employer && (
                                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <Building2 className="h-3 w-3 shrink-0" />{employer.companyName}
                                          </span>
                                        )}
                                        {city && (
                                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                            <MapPin className="h-3 w-3 shrink-0" />{city}
                                          </span>
                                        )}
                                        {salaryText && (
                                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{salaryText}</span>
                                        )}
                                        {typeLabel && (
                                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">{typeLabel}</span>
                                        )}
                                      </div>
                                    </div>
                                    {job.status && (
                                      <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                        job.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" :
                                        job.status === "closed" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" :
                                        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                      }`}>{job.status}</span>
                                    )}
                                  </button>
                                );
                              })}
                              {totalJobCount > filteredJobs.length && (
                                <p className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                                  Showing {filteredJobs.length} of {totalJobCount.toLocaleString()} — refine your search to see more
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                              {jobSearchError ?? (loadingJobs || loadingCount ? "Loading jobs…" : "No matching jobs found.")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/60 py-6 text-center">
                          <Search className="h-5 w-5 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">
                            {loadingCount
                              ? "Loading jobs…"
                              : totalJobCount > 0
                                ? <><span className="font-medium text-foreground">{totalJobCount.toLocaleString()}</span> jobs available</>
                                : totalJobCount === 0
                                  ? "No jobs available for the selected filters."
                                  : "Loading…"
                            }
                          </p>
                          {totalJobCount > 0 && (
                            <p className="text-[11px] text-muted-foreground/70">
                              Type a job title or employer name above to search
                            </p>
                          )}
                        </div>
                      )}
  
                      {jobSearchError && <p className="mt-1 text-xs text-rose-600">{jobSearchError}</p>}
                    </>
                  )}
                </div>
  
                {employerSearchError && <p className="text-xs text-rose-600">{employerSearchError}</p>}
  
                {/* ── Inline Invoice Details (shown after job selected) ──────── */}
                {selectedJob && (
                  <div className="space-y-4">
                    {/* Employer + auto-detected tax & currency — click to override */}
                    <details className="rounded-lg border border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 px-3 py-2">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          {selectedEmployer?.companyName ?? (isPopulatedJobEmployer(selectedJob.employerId) ? selectedJob.employerId.companyName : "—")}
                        </span>
                        <div className="ml-auto flex items-center gap-1.5">
                          {currency && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {currency}
                            </span>
                          )}
                          {billingCountry && findTaxPreset(billingCountry) && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                              {findTaxPreset(billingCountry)!.label}
                            </span>
                          )}
                          <ChevronDown className="h-3.5 w-3.5 text-emerald-500 transition-transform [[open]>&]:rotate-180" />
                        </div>
                      </summary>
                      <div className="grid gap-3 border-t border-emerald-200/50 px-3 py-3 dark:border-emerald-900/30 sm:grid-cols-3">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Currency</Label>
                          <SearchableSelect
                            id="inv-currency-override"
                            className="mt-1 h-8 w-full rounded-lg border-border bg-card text-xs"
                            options={CURRENCY_OPTIONS}
                            value={currency}
                            onValueChange={setCurrency}
                            placeholder="Currency"
                            container={dialogContentRef.current}
                            modal
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Tax Type</Label>
                          <SearchableSelect
                            id="inv-tax-override"
                            className="mt-1 h-8 w-full rounded-lg border-border bg-card text-xs"
                            options={allTaxTypes}
                            value={taxType}
                            onValueChange={(val) => {
                              setTaxType(val);
                              if (val === "none") {
                                setTaxPercent(0);
                              } else {
                                const bc = billingCountry?.trim().toUpperCase();
                                const match = bc
                                  ? INTERNATIONAL_TAX_PRESETS.find(p => p.taxType === val && (p.countryCode.toUpperCase() === bc || p.country.toUpperCase() === bc))
                                  : undefined;
                                const fallback = INTERNATIONAL_TAX_PRESETS.find(p => p.taxType === val && p.defaultRate > 0);
                                const rate = (match ?? fallback)?.defaultRate;
                                if (rate !== undefined) setTaxPercent(rate);
                                // types not in presets (WHT, sales_tax, etc.) keep current %
                              }
                            }}
                            placeholder="Tax type"
                            container={dialogContentRef.current}
                            modal
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Tax %</Label>
                          <Input
                            type="number" min={0} max={100} step={0.5}
                            className="mt-1 h-8 rounded-lg text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={taxPercent || ""}
                            onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)}
                            disabled={taxType === "none"}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </details>
  
                    {/* Invoice Meta — Date, Category, Terms, Due Date */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
                      <div>
                        <Label className="mb-1 block text-xs font-medium text-muted-foreground">Invoice Date</Label>
                        <Input
                          type="date"
                          className="h-9 rounded-lg border-border/60 text-sm"
                          defaultValue={new Date().toISOString().split("T")[0]}
                          readOnly
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-muted-foreground">Invoice Category *</Label>
                          {!showAddType && (
                            <button type="button" onClick={() => setShowAddType(true)} className="text-[10px] font-medium text-primary hover:underline">+ Add custom</button>
                          )}
                        </div>
                        {showAddType ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <Input
                              autoFocus
                              className="h-9 flex-1 rounded-lg text-sm"
                              placeholder="e.g. Relocation Fee"
                              value={customCategory}
                              onChange={e => setCustomCategory(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomType(); } if (e.key === "Escape") setShowAddType(false); }}
                            />
                            <Button type="button" size="sm" variant="default" className="h-9 px-3 text-xs" onClick={addCustomType} disabled={!customCategory.trim()}>Add</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() => { setShowAddType(false); setCustomCategory(""); }}>✕</Button>
                          </div>
                        ) : (
                        <SearchableSelect
                          id="inv-reason"
                          className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                          options={allInvoiceTypes}
                          value={category}
                          onValueChange={(v) => {
                            setCategory(v);
                            const empName = selectedEmployer?.companyName ?? (isPopulatedJobEmployer(selectedJob.employerId) ? selectedJob.employerId.companyName : undefined);
                            const desc = generateInvoiceDescription(v, selectedJob.title, empName);
                            if (desc) {
                              setLineItems(prev => {
                                const updated = [...prev];
                                if (!updated[0].description || updated[0].description === generateInvoiceDescription(category, selectedJob.title, empName)) {
                                  updated[0] = { ...updated[0], description: desc };
                                }
                                return updated;
                              });
                            }
                          }}
                          placeholder="Select category…"
                          container={dialogContentRef.current}
                          modal
                        />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-muted-foreground">Terms</Label>
                          {!showAddPaymentTerm && (
                            <button type="button" onClick={() => setShowAddPaymentTerm(true)} className="text-[10px] font-medium text-primary hover:underline">+ Add custom</button>
                          )}
                        </div>
                        {showAddPaymentTerm ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <Input
                              autoFocus
                              className="h-9 flex-1 rounded-lg text-sm"
                              placeholder="e.g. Net 120 days"
                              value={customPaymentLabel}
                              onChange={e => setCustomPaymentLabel(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") { e.preventDefault(); addCustomPaymentTerm(); }
                                if (e.key === "Escape") setShowAddPaymentTerm(false);
                              }}
                            />
                            <Button type="button" size="sm" variant="default" className="h-9 px-3 text-xs" onClick={addCustomPaymentTerm} disabled={!customPaymentLabel.trim()}>Add</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() => { setShowAddPaymentTerm(false); setCustomPaymentLabel(""); }}>✕</Button>
                          </div>
                        ) : (
                        <SearchableSelect
                          id="inv-pay-terms"
                          className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                          options={allPaymentTerms}
                          value={paymentTerms}
                          onValueChange={setPaymentTerms}
                          container={dialogContentRef.current}
                          modal
                        />
                        )}
                      </div>
                      <div>
                        <Label className="mb-1 block text-xs font-medium text-muted-foreground">Due Date</Label>
                        <Input
                          type="date"
                          className="h-9 rounded-lg border-border/60 text-sm"
                          value={dueDate}
                          onChange={e => setDueDate(e.target.value)}
                        />
                      </div>
                    </div>
  
                    {/* Line Items — ERP-style table */}
                    <div className="rounded-lg border border-border/60 bg-card">
                      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item Table</p>
                        <Button variant="outline" size="sm" onClick={addLineItem} className="h-7 gap-1 rounded-lg text-[10px]">
                          <Plus className="h-3 w-3" /> Add New Row
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                              <th className="w-[36px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</th>
                              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                              <th className="w-[70px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</th>
                              <th className="w-[110px] px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Rate ({currency})</th>
                              <th className="w-[80px] px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tax</th>
                              <th className="w-[110px] px-2 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount ({currency})</th>
                              <th className="w-[36px] px-2 py-2.5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.map((li, i) => {
                              const itemTax = taxType !== "none" ? (li.quantity * li.unitPrice * taxPercent / 100) : 0;
                              const itemTotal = (li.quantity * li.unitPrice) + itemTax;
                              return (
                              <tr key={li.id} className="border-b border-border/30 last:border-b-0">
                                <td className="px-2 py-2 text-center text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-2">
                                  <Input className="h-9 rounded border-border/50 text-sm" value={li.description} onChange={e => updateLineItem(i, "description", e.target.value)} placeholder="Enter description" />
                                </td>
                                <td className="px-2 py-2">
                                  <Input type="number" min={1} className="h-9 rounded border-border/50 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={li.quantity} onChange={e => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)} />
                                </td>
                                <td className="px-2 py-2">
                                  <Input type="number" min={0} step="0.01" className="h-9 rounded border-border/50 text-right text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={li.unitPrice || ""} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <span className="inline-block rounded bg-muted/60 px-2 py-1 text-[10px] font-medium">
                                    {taxType !== "none" ? `${taxPercent}%` : "—"}
                                  </span>
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <span className="text-sm font-semibold">{itemTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </td>
                                <td className="px-2 py-2">
                                  <Button variant="ghost" size="sm" onClick={() => removeLineItem(i)} disabled={lineItems.length <= 1} className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
  
                    {/* Total Summary */}
                    <div className="rounded-lg border border-border/70 bg-card">
                      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                        <span className="text-xs text-muted-foreground">Subtotal</span>
                        <span className="text-sm font-medium">{fmt(subtotal)}</span>
                      </div>
                      {taxType !== "none" && taxPercent > 0 && (
                        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                          <span className="text-xs text-muted-foreground">Tax ({taxType.toUpperCase()} {taxPercent}%)</span>
                          <span className="text-sm font-medium">{fmt(taxAmount)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between bg-primary/5 px-4 py-3">
                        <span className="text-sm font-semibold">Total ({currency})</span>
                        <span className="text-lg font-bold text-primary">{fmt(totalAmount)}</span>
                      </div>
                    </div>
  
                    {/* Customer Notes */}
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">Customer Notes</Label>
                      <Textarea className="mt-1.5 rounded-lg border-border/60 text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Thanks for your business." />
                      <p className="mt-1 text-[10px] text-muted-foreground">Will be displayed on the invoice</p>
                    </div>
  
                    {/* Internal Notes — hidden from customer */}
                    {(role === "admin" || role === "super_agent") && (
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Internal Notes (not shown on invoice)</Label>
                        <Textarea className="mt-1.5 rounded-lg border-border/60 text-sm" rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Finance team notes…" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
  
            {/* ═══════════════════════════════════════════════════════════════════
                STEP 2: Review & Generate
                ═══════════════════════════════════════════════════════════════════ */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between border-b border-border/70 pb-3">
                    <div>
                      <p className="text-lg font-bold text-foreground">INVOICE PREVIEW</p>
                      <p className="mt-1 text-sm font-medium text-primary capitalize">{allInvoiceTypes.find(t => t.value === category)?.label ?? category}</p>
                      <p className="mt-0.5 text-xs">Status: <span className={previewStatusClass}>{previewStatusLabel}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{billingCompanyName || "—"}</p>
                      <p className="text-xs text-muted-foreground">{billingEmail}</p>
                      {billingCountry && <p className="text-xs text-muted-foreground">{billingCountry}</p>}
                      {billingTaxId && <p className="text-[10px] text-muted-foreground">Tax ID: {billingTaxId}</p>}
                    </div>
                  </div>
  
                  {/* Invoice Meta */}
                  <div className="mt-3 grid grid-cols-2 gap-4 rounded-lg bg-muted/30 px-4 py-3 text-xs sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Invoice Date</p>
                      <p className="mt-0.5 font-medium">{new Date().toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Terms</p>
                      <p className="mt-0.5 font-medium">{allPaymentTerms.find(t => t.value === paymentTerms)?.label ?? paymentTerms}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Due Date</p>
                      <p className="mt-0.5 font-medium">{dueDate || "Per terms"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Currency</p>
                      <p className="mt-0.5 font-medium">{currency}</p>
                    </div>
                  </div>
  
                  {/* Line Items Table */}
                  <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item Details</th>
                          <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rate</th>
                          <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li) => (
                          <tr key={li.id} className="border-t border-border/50">
                            <td className="px-3 py-2.5 text-sm">{li.description || "—"}</td>
                            <td className="px-3 py-2.5 text-center">{li.quantity}</td>
                            <td className="px-3 py-2.5 text-right">{fmt(li.unitPrice)}</td>
                            <td className="px-3 py-2.5 text-right font-medium">{fmt(li.quantity * li.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
  
                  {/* Total Summary */}
                  <div className="ml-auto mt-4 max-w-xs">
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium">{fmt(subtotal)}</span></div>
                      {taxType !== "none" && taxPercent > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxType.toUpperCase()} {taxPercent}%)</span><span className="font-medium">{fmt(taxAmount)}</span></div>
                      )}
                      <div className="border-t border-border/70 pt-2" />
                      <div className="flex justify-between text-sm font-bold"><span>Total ({currency})</span><span className="text-primary">{fmt(totalAmount)}</span></div>
                    </div>
                  </div>
  
                  {/* Payment & Billing Details */}
                  <div className="mt-4 grid gap-4 border-t border-border/50 pt-4 sm:grid-cols-2">
                    <div className="text-xs">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Billing To</p>
                      <p className="mt-1.5 font-medium">{billingCompanyName}</p>
                      {billingContactPerson && <p className="text-muted-foreground">{billingContactPerson}</p>}
                      {billingEmail && <p className="text-muted-foreground">{billingEmail}</p>}
                      {billingPhone && <p className="text-muted-foreground">{billingPhone}</p>}
                      {billingAddress && <p className="text-muted-foreground">{billingAddress}</p>}
                    </div>
                    <div className="text-xs">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Job Reference</p>
                      <p className="mt-1.5 font-medium">{selectedJob?.title ?? "—"}</p>
                      {selectedJob && isPopulatedJobEmployer(selectedJob.employerId) && (
                        <p className="text-muted-foreground">{selectedJob.employerId.companyName}</p>
                      )}
                      {selectedJob?.location?.city && <p className="text-muted-foreground">{selectedJob.location.city}</p>}
                    </div>
                  </div>
  
                  {notes && (
                    <div className="mt-4 border-t border-border/50 pt-3 text-xs">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Notes</p>
                      <p className="mt-1 text-muted-foreground">{notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
    </>
  );

  if (mode === "page") {
    return (
      <div ref={dialogContentRef}>
        {/* Header — sticky at top of scroll area */}
        <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 px-6 py-4 backdrop-blur-sm">
          {headerContent}
        </div>

        {/* Body: Main + Sidebar */}
        <div className="flex">
          {/* Main content */}
          <div className="min-w-0 flex-1 border-r border-border/50 px-6 py-5">

            {stepContent}

            {/* Footer inline */}
            <div className="mt-6">
              {footerContent}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              RIGHT SIDEBAR — Admin only (Invoice Summary, Commission, Payment)
              ═══════════════════════════════════════════════════════════════════ */}
          {sidebarContent}
        </div>
      </div>
    );
  }

  // ── Commission summary for dialog mode (agent view) ──────────────────────
  const dialogCommissionSummary = (selectedAgent || selectedSuperAgent || agentRate > 0 || superAgentRate > 0) && totalAmount > 0 && (
    <div className={`mt-4 rounded-xl border p-4 ${combinedRateExceeds ? "border-rose-300 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20" : "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${combinedRateExceeds ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}>
        {role === "agent" ? "Your Commission" : "Commission Split"}
      </p>
      <div className="mt-2 space-y-1.5 text-xs">
        {effectiveAgentRate > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {selectedAgent?.userId?.name ? `Agent (${selectedAgent.userId.name})` : "Agent Commission"}
            </span>
            <span className="font-medium text-sky-700 dark:text-sky-300">{effectiveAgentRate}% &nbsp; {fmt(agentCommission)}</span>
          </div>
        )}
        {effectiveSuperAgentRate > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {selectedSuperAgent?.userId?.name ? `SA (${selectedSuperAgent.userId.name})` : "Super Agent"}
            </span>
            <span className="font-medium text-indigo-700 dark:text-indigo-300">{effectiveSuperAgentRate}% &nbsp; {fmt(superAgentCommission)}</span>
          </div>
        )}
        <div className="border-t border-amber-200/70 pt-1.5 dark:border-amber-800/40">
          <div className={`flex justify-between font-medium ${companyNet < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"}`}>
            <span>Platform Revenue</span>
            <span>{fmt(companyNet)}</span>
          </div>
        </div>
        {combinedRateExceeds && (
          <p className="mt-1 text-[10px] font-semibold text-rose-600">Combined rate ({combinedRate.toFixed(1)}%) exceeds 100%</p>
        )}
        <p className="mt-1 text-[9px] italic text-amber-600/80 dark:text-amber-400/60">Internal — not visible to employer</p>
      </div>
    </div>
  );

  // ── DIALOG MODE: Standard popup for agent/super_agent ──────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent ref={dialogContentRef} className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border/80 px-6 py-4 pr-12">
          <DialogTitle className="text-lg font-semibold">New Invoice</DialogTitle>
          <div className="mt-3 flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => setStep(s.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    step === s.id
                      ? "bg-primary text-primary-foreground"
                      : step > s.id
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="mx-1 h-px w-4 bg-border" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {stepContent}
          {dialogCommissionSummary}
        </div>

        {/* Footer */}
        {footerContent}
      </DialogContent>
    </Dialog>
  );
}
