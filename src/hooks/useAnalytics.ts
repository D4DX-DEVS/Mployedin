import { keepPreviousData, useQuery } from "@tanstack/react-query";

// Types
export interface FunnelStage {
  stage: string;
  count: number;
}

export interface TrendData {
  date: string;
  count: number;
}

export interface TopJob {
  jobId: string;
  title: string;
  count: number;
}

export interface ConversionMetrics {
  applied: number;
  shortlisted: number;
  interview: number;
  selected: number;
  hired: number;
}

export interface AnalyticsData {
  funnel: FunnelStage[];
  trend: TrendData[];
  topJobs: TopJob[];
  conversion: ConversionMetrics;
}

export interface PerJobPageParams {
  page: number;
  pageSize: number;
  q: string;
}

export interface PipelineData {
  stageDistribution: { stage: string; count: number }[];
  funnel: { stage: string; count: number }[];
  perJob: {
    jobId: string;
    title: string;
    total: number;
    stages: { status: string; count: number }[];
  }[];
  perJobMeta: { total: number; page: number; pageSize: number; totalPages: number };
  jobOptions: { jobId: string; title: string; total: number }[];
  conversionRates: {
    appliedToShortlisted: number;
    shortlistedToInterview: number;
    interviewToOffer: number;
    offerToHired: number;
    overallHireRate: number;
  };
  stalledCount: number;
}

export interface HistoricalData {
  timeToHire: {
    transition: string;
    avgDays: number;
    medianDays: number;
    count: number;
  }[];
  dropOff: {
    stage: string;
    stageName: string;
    nextStage: string;
    nextStageName: string;
    count: number;
    nextCount: number;
    dropOffPct: number;
  }[];
  sourceBreakdown: { source: string; label: string; count: number; pct: number }[];
  trend: { date: string; count: number }[];
  perJobTimeToHire: {
    jobId: string;
    title: string;
    stages: { transition: string; avgDays: number; count: number }[];
  }[];
  totalApplications: number;
  dateRange: { start: string; end: string };
}

export interface JobPerformance {
  jobId: string;
  title: string;
  status: string;
  views: number;
  uniqueViews: number;
  applications: number;
  conversionRate: number;
  avgMatchScore: number;
  createdAt: string;
  daysActive: number;
  insight?: string;
}

export interface PerformanceData {
  jobs: JobPerformance[];
  summary: {
    totalJobs: number;
    activeJobs: number;
    totalViews: number;
    totalUniqueViews: number;
    totalApplications: number;
    overallConversion: number;
    underperforming: number;
  };
}

export interface ResponseTimeData {
  overall: {
    avgHours: number;
    medianHours: number;
    totalMeasured: number;
    avgDays: number;
  };
  commitment: number | null;
  perJob: {
    jobId: string;
    title: string;
    avgHours: number;
    medianHours: number;
    count: number;
  }[];
  distribution: { label: string; count: number }[];
}

export interface OfferAnalyticsData {
  totalOffers: number;
  accepted: number;
  declined: number;
  pending: number;
  expired: number;
  withdrawn: number;
  countered: number;
  acceptanceRate: number;
  responseRate: number;
  avgTimeToAcceptDays: number | null;
  statusBreakdown: { status: string; count: number }[];
}

export interface DiversityReportData {
  totalApplications: number;
  totalResponses: number;
  responseRate: number;
  genderDistribution: Record<string, number>;
  ethnicityDistribution: Record<string, number>;
  ageDistribution: Record<string, number>;
  veteranRate: number;
  disabilityRate: number;
}

// Query keys factory
export const analyticsKeys = {
  all: ["analytics"] as const,
  overview: () => [...analyticsKeys.all, "overview"] as const,
  pipeline: (jobId: string, pageParams?: PerJobPageParams) =>
    [...analyticsKeys.all, "pipeline", jobId, pageParams ?? null] as const,
  historical: (params: {
    range: string;
    customStart?: string;
    customEnd?: string;
  }) => [...analyticsKeys.all, "historical", params] as const,
  jobs: () => [...analyticsKeys.all, "jobs"] as const,
  responseTime: () => [...analyticsKeys.all, "response-time"] as const,
  offers: () => [...analyticsKeys.all, "offers"] as const,
  diversity: () => [...analyticsKeys.all, "diversity"] as const,
};

// Fetcher functions
async function fetchAnalyticsOverview(): Promise<AnalyticsData> {
  const res = await fetch("/api/employers/analytics");
  if (!res.ok) throw new Error("Failed to fetch analytics overview");
  return res.json();
}

async function fetchAnalyticsPipeline(
  jobId: string,
  pageParams?: PerJobPageParams
): Promise<PipelineData> {
  const params = new URLSearchParams();
  if (jobId) params.set("jobId", jobId);
  if (pageParams) {
    params.set("page", String(pageParams.page));
    params.set("pageSize", String(pageParams.pageSize));
    if (pageParams.q) params.set("q", pageParams.q);
  }
  const qs = params.toString();
  const res = await fetch(`/api/employers/analytics/pipeline${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch pipeline data");
  return res.json();
}

async function fetchAnalyticsHistorical(params: {
  range: string;
  customStart?: string;
  customEnd?: string;
}): Promise<HistoricalData> {
  const searchParams = new URLSearchParams({ range: params.range });
  if (params.customStart) searchParams.set("startDate", params.customStart);
  if (params.customEnd) searchParams.set("endDate", params.customEnd);

  const res = await fetch(
    `/api/employers/analytics/historical?${searchParams.toString()}`
  );
  if (!res.ok) throw new Error("Failed to fetch historical data");
  return res.json();
}

async function fetchAnalyticsJobs(): Promise<PerformanceData> {
  const res = await fetch("/api/employers/analytics/jobs");
  if (!res.ok) throw new Error("Failed to fetch job performance");
  return res.json();
}

async function fetchAnalyticsResponseTime(): Promise<ResponseTimeData> {
  const res = await fetch("/api/employers/analytics/response-time");
  if (!res.ok) throw new Error("Failed to fetch response time data");
  return res.json();
}

async function fetchAnalyticsOffers(): Promise<OfferAnalyticsData> {
  const res = await fetch("/api/employers/analytics/offers");
  if (!res.ok) throw new Error("Failed to fetch offer analytics");
  return res.json();
}

async function fetchDiversityReport(): Promise<DiversityReportData> {
  const res = await fetch("/api/diversity");
  if (!res.ok) throw new Error("Failed to fetch diversity report");
  const json = await res.json();
  return json.report as DiversityReportData;
}

// Hooks
export function useAnalyticsOverview(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.overview(),
    queryFn: fetchAnalyticsOverview,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useAnalyticsPipeline(
  jobId: string,
  pageParams?: PerJobPageParams,
  enabled = true
) {
  return useQuery({
    queryKey: analyticsKeys.pipeline(jobId, pageParams),
    queryFn: () => fetchAnalyticsPipeline(jobId, pageParams),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAnalyticsHistorical(
  params: { range: string; customStart?: string; customEnd?: string },
  enabled = true
) {
  return useQuery({
    queryKey: analyticsKeys.historical(params),
    queryFn: () => fetchAnalyticsHistorical(params),
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useAnalyticsJobs(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.jobs(),
    queryFn: fetchAnalyticsJobs,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useAnalyticsResponseTime(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.responseTime(),
    queryFn: fetchAnalyticsResponseTime,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useAnalyticsOffers(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.offers(),
    queryFn: fetchAnalyticsOffers,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useDiversityReport(enabled = true) {
  return useQuery({
    queryKey: analyticsKeys.diversity(),
    queryFn: fetchDiversityReport,
    staleTime: 60 * 1000,
    enabled,
  });
}
