/**
 * Monthly distribution strategies for target profiles.
 * Generates 12-month target breakdowns from annual targets.
 */

import type { IMonthlyTarget } from "@/models/TargetProfile";

interface AnnualTargets {
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

/**
 * Equal: divide evenly across 12 months, distribute remainder to early months.
 */
function equalDistribution(annual: AnnualTargets): IMonthlyTarget[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const empPer = Math.floor(annual.employerTarget / 12);
    const empRem = annual.employerTarget - empPer * 12;
    const emplPer = Math.floor(annual.employeeTarget / 12);
    const emplRem = annual.employeeTarget - emplPer * 12;
    const finPer = Math.floor(annual.financeTarget / 12);
    const finRem = annual.financeTarget - finPer * 12;

    return {
      month,
      employerTarget: empPer + (i < empRem ? 1 : 0),
      employeeTarget: emplPer + (i < emplRem ? 1 : 0),
      financeTarget: finPer + (i < finRem ? 1 : 0),
    };
  });
}

/**
 * Seasonal: Q1 & Q3 weighted higher (recruitment seasons).
 * Weights: Q1=30%, Q2=20%, Q3=30%, Q4=20%
 */
function seasonalDistribution(annual: AnnualTargets): IMonthlyTarget[] {
  // Per-quarter weights (divided among 3 months each)
  const qWeights = [0.30, 0.20, 0.30, 0.20];
  const monthWeights = qWeights.flatMap((qw) => {
    const perMonth = qw / 3;
    return [perMonth, perMonth, perMonth];
  });

  const months: IMonthlyTarget[] = monthWeights.map((w, i) => ({
    month: i + 1,
    employerTarget: Math.round(annual.employerTarget * w),
    employeeTarget: Math.round(annual.employeeTarget * w),
    financeTarget: Math.round(annual.financeTarget * w),
  }));

  // Fix rounding — adjust last month
  const empSum = months.reduce((s, m) => s + m.employerTarget, 0);
  const emplSum = months.reduce((s, m) => s + m.employeeTarget, 0);
  const finSum = months.reduce((s, m) => s + m.financeTarget, 0);
  months[11].employerTarget += annual.employerTarget - empSum;
  months[11].employeeTarget += annual.employeeTarget - emplSum;
  months[11].financeTarget += annual.financeTarget - finSum;

  return months;
}

/**
 * Generate monthly distribution based on strategy.
 * For "custom", returns equal as a starting template (caller edits).
 */
export function generateMonthlyDistribution(
  annual: AnnualTargets,
  strategy: "equal" | "custom" | "seasonal"
): IMonthlyTarget[] {
  switch (strategy) {
    case "seasonal":
      return seasonalDistribution(annual);
    case "equal":
    case "custom":
    default:
      return equalDistribution(annual);
  }
}

/**
 * Validate that monthly targets sum to annual targets.
 */
export function validateDistributionSum(
  annual: AnnualTargets,
  monthly: IMonthlyTarget[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const empSum = monthly.reduce((s, m) => s + m.employerTarget, 0);
  const emplSum = monthly.reduce((s, m) => s + m.employeeTarget, 0);
  const finSum = monthly.reduce((s, m) => s + m.financeTarget, 0);

  if (empSum !== annual.employerTarget) {
    errors.push(`Employer monthly sum (${empSum}) ≠ annual (${annual.employerTarget})`);
  }
  if (emplSum !== annual.employeeTarget) {
    errors.push(`Employee monthly sum (${emplSum}) ≠ annual (${annual.employeeTarget})`);
  }
  if (finSum !== annual.financeTarget) {
    errors.push(`Finance monthly sum (${finSum}) ≠ annual (${annual.financeTarget})`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get quarterly breakdowns from monthly targets.
 */
export function getQuarterlyBreakdown(monthly: IMonthlyTarget[]) {
  const quarters = [
    { label: "Q1", months: [1, 2, 3] },
    { label: "Q2", months: [4, 5, 6] },
    { label: "Q3", months: [7, 8, 9] },
    { label: "Q4", months: [10, 11, 12] },
  ];

  return quarters.map((q) => {
    const qMonths = monthly.filter((m) => q.months.includes(m.month));
    return {
      label: q.label,
      months: q.months,
      employerTarget: qMonths.reduce((s, m) => s + m.employerTarget, 0),
      employeeTarget: qMonths.reduce((s, m) => s + m.employeeTarget, 0),
      financeTarget: qMonths.reduce((s, m) => s + m.financeTarget, 0),
    };
  });
}
