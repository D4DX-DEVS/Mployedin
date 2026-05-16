"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useDebounce } from "@/hooks/useDebounce";
import { findTaxPreset } from "@/lib/invoices/taxPresets";
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
interface LineItem { description: string; quantity: number; unitPrice: number; amount: number }
interface AgentOption { _id: string; name: string; superAgentId?: string; regions: string[] }
interface SuperAgentOption { _id: string; name: string; regions: string[]; agentCount: number }

interface InvoiceBuilderProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCurrency?: string;
  searchScope?: "admin" | "standard";
  role?: "admin" | "super_agent" | "agent";
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
  { value: "custom_enterprise", label: "Custom Enterprise Billing" },
];

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
  { value: "custom", label: "Custom" },
];

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.label}` }));

// Simplified to 3 steps (was 6)
const STEPS = [
  { id: 1, label: "Job & Company", icon: Building2 },
  { id: 2, label: "Invoice Details", icon: FileText },
  { id: 3, label: "Review & Generate", icon: FileCheck },
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
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
  const [taxType, setTaxType] = useState("none");
  const [taxPercent, setTaxPercent] = useState(0);
  const [agentRate, setAgentRate] = useState(0);
  const [superAgentRate, setSuperAgentRate] = useState(0);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [customAgentRate, setCustomAgentRate] = useState(0);
  const [customSuperAgentRate, setCustomSuperAgentRate] = useState(0);
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [customPaymentDays, setCustomPaymentDays] = useState(30);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState(role === "agent" ? "pending_approval" : "issued");

  const debouncedJobSearch = useDebounce(jobSearch, 300);
  const allInvoiceTypes = [...DEFAULT_INVOICE_TYPES, ...customInvoiceTypes];
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
      setCategory("recruitment"); setCustomCategory(""); setShowAddType(false); setDescription("");
      setShowAddTaxType(false); setCustomTaxLabel("");
      setShowAddStatus(false); setCustomStatusLabel("");
      setLineItems([{ description: "", quantity: 1, unitPrice: 0, amount: 0 }]);
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

  // When job selected, auto-populate employer + commission rates
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
        return;
      }
    }
    setSelectedEmployerId("");
    setAgentRate(0);
    setSuperAgentRate(0);
  }, [selectedJobId, jobs]);

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

  // Auto-detect tax when billing country changes
  useEffect(() => {
    if (!billingCountry) return;
    const preset = findTaxPreset(billingCountry);
    if (preset) {
      setTaxType(preset.taxType);
      setTaxPercent(preset.defaultRate);
    }
  }, [billingCountry]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const subtotal = lineItems.reduce((s, li) => s + (li.quantity * li.unitPrice), 0);
  const taxAmount = taxType !== "none" ? Math.round(subtotal * taxPercent / 100 * 100) / 100 : 0;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
  const effectiveAgentRate = commissionEnabled ? customAgentRate : agentRate;
  const effectiveSuperAgentRate = commissionEnabled ? customSuperAgentRate : superAgentRate;
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

  const addLineItem = () => setLineItems(prev => [...prev, { description: "", quantity: 1, unitPrice: 0, amount: 0 }]);

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
    if (lineItems.some(li => !li.description || li.unitPrice <= 0)) { toast.error("Please fill all line items with description and price"); setStep(2); return; }

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
        discountPercent: 0,
        taxType,
        taxPercent,
        serviceCharge: 0,
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
        ...(commissionEnabled && (role === "admin" || role === "super_agent") ? {
          overrideAgentRate: customAgentRate,
          overrideSuperAgentRate: customSuperAgentRate,
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
      case 1: return !!selectedJobId && !!selectedEmployerId;
      case 2: return lineItems.every(li => li.description && li.unitPrice > 0);
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent ref={dialogContentRef} className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border/80 px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Create Invoice</DialogTitle>
          {/* Simplified 3-step indicator */}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 1: Job & Company
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Admin cascade filters: Region → Super Agent → Agent → Jobs */}
              {(role === "admin" || role === "super_agent") && (
                <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/60 to-transparent dark:border-sky-900/40 dark:from-sky-950/30">
                  {/* Header with count summary */}
                  <div className="flex items-center justify-between px-4 pt-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-sky-100 dark:bg-sky-900/50">
                        <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300">1</span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                        {role === "admin" ? "Filter by Team" : "Filter by Agent"}
                      </p>
                    </div>
                    {role === "admin" && !loadingFilters && (
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{regionFilteredSuperAgents.length} SA</span>
                        <span>{filteredAgents.length} agents</span>
                      </div>
                    )}
                  </div>

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
                </div>
              )}

              {/* Job select — inline search + results */}
              <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
                      <span className="text-[10px] font-bold text-primary">{role === "admin" || role === "super_agent" ? "2" : "1"}</span>
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
                                ? `${(sal.currency ?? "INR")} ${sal.min.toLocaleString()}–${sal.max.toLocaleString()}`
                                : sal?.min ? `${(sal.currency ?? "INR")} ${sal.min.toLocaleString()}+` : null;
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

              {/* Auto-populated employer & agent info */}
              {selectedJob && (
                <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/40 to-transparent p-4 dark:border-emerald-900/40 dark:from-emerald-950/20">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Auto-populated from Job</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-medium text-muted-foreground">Employer</p>
                      <p className="mt-0.5 text-sm font-semibold">
                        {selectedEmployer?.companyName ?? (isPopulatedJobEmployer(selectedJob.employerId) ? selectedJob.employerId.companyName : "—")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-medium text-muted-foreground">Agent</p>
                      <p className="mt-0.5 text-sm font-semibold">{selectedAgent?.userId?.name ?? selectedAgent?.userId?.email ?? "—"}</p>
                      {agentRate > 0 && <p className="mt-0.5 text-[11px] text-sky-600 dark:text-sky-400">{agentRate}% commission</p>}
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background/80 p-3">
                      <p className="text-[10px] font-medium text-muted-foreground">Super Agent</p>
                      <p className="mt-0.5 text-sm font-semibold">{selectedSuperAgent?.userId?.name ?? "—"}</p>
                      {superAgentRate > 0 && <p className="mt-0.5 text-[11px] text-indigo-600 dark:text-indigo-400">{superAgentRate}% override</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Billing - collapsible */}
              {selectedJob && (
                <details className="rounded-xl border border-border/60 bg-card/50">
                  <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                    ▸ Billing Information <span className="font-normal normal-case tracking-normal">(auto-filled from employer — click to edit)</span>
                  </summary>
                  <div className="grid gap-3 border-t border-border/40 px-4 py-4 sm:grid-cols-2">
                    <div><Label className="text-xs text-muted-foreground">Company</Label><Input className="mt-1 h-8 rounded-lg text-sm" value={billingCompanyName} onChange={e => setBillingCompanyName(e.target.value)} placeholder="Company name" /></div>
                    <div><Label className="text-xs text-muted-foreground">Contact Person</Label><Input className="mt-1 h-8 rounded-lg text-sm" value={billingContactPerson} onChange={e => setBillingContactPerson(e.target.value)} placeholder="Full name" /></div>
                    <div><Label className="text-xs text-muted-foreground">Email</Label><Input type="email" className="mt-1 h-8 rounded-lg text-sm" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="billing@company.com" /></div>
                    <div><Label className="text-xs text-muted-foreground">Phone</Label><Input className="mt-1 h-8 rounded-lg text-sm" type="tel" inputMode="tel" value={billingPhone} onChange={e => { const v = e.target.value.replace(/[^0-9+\-()\s]/g, ""); setBillingPhone(v); }} placeholder="+91 98765 43210" /></div>
                    <div className="sm:col-span-2"><Label className="text-xs text-muted-foreground">Address</Label><Input className="mt-1 h-8 rounded-lg text-sm" value={billingAddress} onChange={e => setBillingAddress(e.target.value)} placeholder="Street, city, state, zip" /></div>
                    <div><Label className="text-xs text-muted-foreground">Country</Label><Input className="mt-1 h-8 rounded-lg text-sm" value={billingCountry} onChange={e => setBillingCountry(e.target.value)} placeholder="e.g. India" /></div>
                    <div><Label className="text-xs text-muted-foreground">Tax ID</Label><Input className="mt-1 h-8 rounded-lg text-sm" value={billingTaxId} onChange={e => setBillingTaxId(e.target.value)} placeholder="e.g. GSTIN / VAT number" /></div>
                  </div>
                </details>
              )}
              {employerSearchError && <p className="text-xs text-rose-600">{employerSearchError}</p>}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 2: Invoice Details (type + currency + items + tax + commission + payment)
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Invoice type + currency row */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Invoice Type</Label>
                  <SearchableSelect
                    id="inv-type"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                    options={allInvoiceTypes}
                    value={category}
                    onValueChange={setCategory}
                    placeholder="Select type"
                    container={dialogContentRef.current}
                    modal
                  />
                  {!showAddType ? (
                    <button onClick={() => setShowAddType(true)} className="mt-1 text-[10px] text-sky-600 hover:underline">
                      + Add custom type
                    </button>
                  ) : (
                    <div className="mt-1 flex gap-1">
                      <Input
                        className="h-7 rounded text-xs"
                        placeholder="e.g. Background Verification"
                        value={customCategory}
                        onChange={e => setCustomCategory(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addCustomType()}
                      />
                      <Button variant="outline" size="sm" onClick={addCustomType} className="h-7 px-2 text-xs">Add</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowAddType(false); setCustomCategory(""); }} className="h-7 px-2 text-xs">✕</Button>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Currency</Label>
                  <SearchableSelect
                    id="inv-currency"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                    options={CURRENCY_OPTIONS}
                    value={currency}
                    onValueChange={setCurrency}
                    placeholder="Select currency"
                    container={dialogContentRef.current}
                    modal
                  />
                </div>
                <div>
                  <Label className="text-xs">Invoice Status</Label>
                  <SearchableSelect
                    id="inv-status"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                    options={statusOptions}
                    value={invoiceStatus}
                    onValueChange={setInvoiceStatus}
                    placeholder="Select status"
                    container={dialogContentRef.current}
                    modal
                  />
                  {role !== "agent" && (
                    !showAddStatus ? (
                      <button onClick={() => setShowAddStatus(true)} className="mt-1 text-[10px] text-sky-600 hover:underline">+ Add custom status</button>
                    ) : (
                      <div className="mt-1 flex gap-1">
                        <Input className="h-7 rounded text-xs" placeholder="e.g. Awaiting PO" value={customStatusLabel} onChange={e => setCustomStatusLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomStatus()} />
                        <Button variant="outline" size="sm" onClick={addCustomStatus} className="h-7 px-2 text-xs">Add</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setShowAddStatus(false); setCustomStatusLabel(""); }} className="h-7 px-2 text-xs">✕</Button>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Invoice Items</Label>
                  <Button variant="outline" size="sm" onClick={addLineItem} className="h-7 gap-1 rounded-lg text-[10px]">
                    <Plus className="h-3 w-3" /> Add Item
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_90px_90px_28px] items-end gap-1.5 rounded-lg border border-border/60 bg-secondary/20 p-2">
                      <div><Label className="text-[9px] text-muted-foreground">Description</Label><Input className="mt-0.5 h-8 rounded text-sm" value={li.description} onChange={e => updateLineItem(i, "description", e.target.value)} placeholder="Service description…" /></div>
                      <div><Label className="text-[9px] text-muted-foreground">Qty</Label><Input type="number" min={1} className="mt-0.5 h-8 rounded text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={li.quantity} onChange={e => updateLineItem(i, "quantity", parseInt(e.target.value) || 1)} placeholder="1" /></div>
                      <div><Label className="text-[9px] text-muted-foreground">Price</Label><Input type="number" min={0} step="0.01" className="mt-0.5 h-8 rounded text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={li.unitPrice || ""} onChange={e => updateLineItem(i, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="0.00" /></div>
                      <div><Label className="text-[9px] text-muted-foreground">Amount</Label><div className="mt-0.5 flex h-8 items-center rounded bg-muted/50 px-2 text-xs font-medium">{fmt(li.quantity * li.unitPrice)}</div></div>
                      <Button variant="ghost" size="sm" onClick={() => removeLineItem(i)} disabled={lineItems.length <= 1} className="h-8 w-7 p-0 text-muted-foreground hover:text-rose-500"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax row */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Tax Type</Label>
                  <SearchableSelect
                    id="inv-tax-type"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                    options={allTaxTypes}
                    value={taxType}
                    onValueChange={setTaxType}
                    container={dialogContentRef.current}
                    modal
                  />
                  {billingCountry && findTaxPreset(billingCountry) && (
                    <p className="mt-0.5 text-[10px] text-sky-600">Auto: {findTaxPreset(billingCountry)!.label}</p>
                  )}
                  {!showAddTaxType ? (
                    <button onClick={() => setShowAddTaxType(true)} className="mt-1 text-[10px] text-sky-600 hover:underline">+ Add custom tax type</button>
                  ) : (
                    <div className="mt-1 flex gap-1">
                      <Input className="h-7 rounded text-xs" placeholder="e.g. Zakat" value={customTaxLabel} onChange={e => setCustomTaxLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustomTaxType()} />
                      <Button variant="outline" size="sm" onClick={addCustomTaxType} className="h-7 px-2 text-xs">Add</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowAddTaxType(false); setCustomTaxLabel(""); }} className="h-7 px-2 text-xs">✕</Button>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Tax %</Label>
                  <Input type="number" min={0} max={100} step={0.5} className="mt-1 h-9 rounded-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={taxPercent || ""} onChange={e => setTaxPercent(parseFloat(e.target.value) || 0)} disabled={taxType === "none"} placeholder="0" />
                </div>
                <div className="flex items-end">
                  <div className="rounded-lg border border-border/70 bg-secondary/30 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-bold text-primary">{fmt(totalAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Commission — toggle to enable custom rates */}
              <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commission Split</p>
                  {(role === "admin" || role === "super_agent") && (
                    <label className="relative inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={commissionEnabled}
                        onChange={(e) => {
                          setCommissionEnabled(e.target.checked);
                          if (e.target.checked) {
                            setCustomAgentRate(agentRate);
                            setCustomSuperAgentRate(superAgentRate);
                          }
                        }}
                        className="peer sr-only"
                      />
                      <div className="peer h-5 w-9 rounded-full bg-muted-foreground/20 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-border after:bg-white after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-primary/25" />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {commissionEnabled ? "Custom" : "Default (0%)"}
                      </span>
                    </label>
                  )}
                </div>

                {!commissionEnabled && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
                    <p className="text-sm text-muted-foreground">Commission is <span className="font-semibold">disabled</span> for this invoice.</p>
                    <p className="mt-1 text-[10px] text-muted-foreground/70">Toggle on to set custom agent and super-agent commission rates.</p>
                  </div>
                )}

                {commissionEnabled && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <Label className="text-xs text-sky-600">Agent Rate (%)</Label>
                        {(role === "admin" || role === "super_agent") ? (
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="mt-1 h-8 rounded-lg text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={customAgentRate || ""}
                            onChange={(e) => setCustomAgentRate(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        ) : (
                          <div className="mt-1 flex items-center gap-2 h-8 rounded-lg border border-border bg-muted/30 px-3">
                            <span className="text-sm font-semibold text-sky-600">{effectiveAgentRate}%</span>
                            <span className="ml-auto text-[9px] text-muted-foreground uppercase tracking-wide">Fixed</span>
                          </div>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{selectedAgent?.userId?.name ?? "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-indigo-600">Super Agent Rate (%)</Label>
                        {(role === "admin" || role === "super_agent") ? (
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="mt-1 h-8 rounded-lg text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            value={customSuperAgentRate || ""}
                            onChange={(e) => setCustomSuperAgentRate(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                          />
                        ) : (
                          <div className="mt-1 flex items-center gap-2 h-8 rounded-lg border border-border bg-muted/30 px-3">
                            <span className="text-sm font-semibold text-indigo-600">{effectiveSuperAgentRate}%</span>
                            <span className="ml-auto text-[9px] text-muted-foreground uppercase tracking-wide">Fixed</span>
                          </div>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{selectedSuperAgent?.userId?.name ?? "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-emerald-600">Company Net</Label>
                        <p className="mt-1 text-sm font-bold text-emerald-600">{fmt(companyNet)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          A: {fmt(agentCommission)} · SA: {fmt(superAgentCommission)}
                        </p>
                      </div>
                    </div>
                    {(effectiveAgentRate + effectiveSuperAgentRate) > 100 && (
                      <p className="mt-2 text-xs text-rose-600">⚠ Total commission exceeds 100%</p>
                    )}
                    <p className="mt-2 text-[9px] italic text-muted-foreground/60">
                      Custom rates override profile defaults for this invoice only. Final amounts are calculated server-side.
                    </p>
                  </>
                )}
              </div>

              {/* Payment terms + notes */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Payment Terms</Label>
                  <SearchableSelect
                    id="inv-pay-terms"
                    className="mt-1 h-9 w-full rounded-lg border-border bg-card"
                    options={PAYMENT_TERMS}
                    value={paymentTerms}
                    onValueChange={setPaymentTerms}
                    container={dialogContentRef.current}
                    modal
                  />
                </div>
                {paymentTerms === "custom" && (
                  <div>
                    <Label className="text-xs">Custom Days</Label>
                    <Input type="number" min={1} max={365} className="mt-1 h-9 rounded-lg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" value={customPaymentDays} onChange={e => setCustomPaymentDays(parseInt(e.target.value) || 30)} placeholder="30" />
                  </div>
                )}
                <div>
                  <Label className="text-xs">Due Date (override)</Label>
                  <Input type="date" className="mt-1 h-9 rounded-lg" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {/* Notes */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Notes (on invoice)</Label>
                  <Textarea className="mt-1 rounded-lg text-sm" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment instructions, bank details…" />
                </div>
                <div>
                  <Label className="text-xs">Internal Notes</Label>
                  <Textarea className="mt-1 rounded-lg text-sm" rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Finance team only…" />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="mt-1 rounded-lg text-sm" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Invoice description…" />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              STEP 3: Review & Generate
              ═══════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border/70 pb-3">
                  <div>
                    <p className="text-lg font-bold text-foreground">INVOICE</p>
                    <p className="text-xs text-muted-foreground capitalize">{allInvoiceTypes.find(t => t.value === category)?.label ?? category}</p>
                    <p className="mt-1 text-xs">Status: <span className={previewStatusClass}>{previewStatusLabel}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{billingCompanyName || "—"}</p>
                    <p className="text-xs text-muted-foreground">{billingEmail}</p>
                    {billingCountry && <p className="text-xs text-muted-foreground">{billingCountry}</p>}
                  </div>
                </div>

                {/* Line Items */}
                <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50"><th className="px-3 py-2 text-left font-semibold">Description</th><th className="px-3 py-2 text-right font-semibold">Qty</th><th className="px-3 py-2 text-right font-semibold">Price</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr></thead>
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
                  {taxType !== "none" && taxPercent > 0 && (
                    <div className="flex justify-between"><span>Tax ({taxType.toUpperCase()} {taxPercent}%)</span><span>{fmt(taxAmount)}</span></div>
                  )}
                  <div className="border-t border-border/70 pt-1" />
                  <div className="flex justify-between text-sm font-bold"><span>Total</span><span className="text-primary">{fmt(totalAmount)}</span></div>
                </div>

                {/* Commission */}
                {commissionEnabled && (effectiveAgentRate > 0 || effectiveSuperAgentRate > 0) && (
                  <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs">
                    <p className="font-semibold text-muted-foreground">COMMISSION SPLIT</p>
                    <div className="mt-1 space-y-0.5">
                      {effectiveAgentRate > 0 && <p>Agent: {effectiveAgentRate}% = {fmt(agentCommission)}</p>}
                      {effectiveSuperAgentRate > 0 && <p>Super Agent: {effectiveSuperAgentRate}% = {fmt(superAgentCommission)}</p>}
                      <p className="font-medium text-emerald-600">Company Net: {fmt(companyNet)}</p>
                    </div>
                  </div>
                )}
                {!commissionEnabled && (
                  <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs">
                    <p className="font-semibold text-muted-foreground">COMMISSION</p>
                    <p className="mt-1 text-muted-foreground">No commission applied (0%)</p>
                  </div>
                )}

                {/* Payment & Notes */}
                <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-muted-foreground">PAYMENT</p>
                    <p className="mt-1">Terms: {PAYMENT_TERMS.find(t => t.value === paymentTerms)?.label ?? paymentTerms}</p>
                    <p>Currency: {currency}</p>
                    {dueDate && <p>Due: {dueDate}</p>}
                  </div>
                  <div>
                    <p className="font-semibold text-muted-foreground">BILLING</p>
                    <p className="mt-1">{billingCompanyName}</p>
                    <p className="text-muted-foreground">{billingAddress}</p>
                    {billingTaxId && <p className="text-muted-foreground">Tax ID: {billingTaxId}</p>}
                  </div>
                </div>

                {notes && <div className="mt-3 text-xs text-muted-foreground"><p className="font-semibold">Notes:</p><p>{notes}</p></div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/80 px-6 py-3">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onClose()} className="h-9 gap-1.5 rounded-lg">
            <ChevronLeft className="h-4 w-4" />
            {step > 1 ? "Back" : "Cancel"}
          </Button>
          <div className="flex items-center gap-2">
            {step < 3 ? (
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
