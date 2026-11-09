/**
 * What an AI call costs, in USD.
 *
 * OpenRouter returns the billed cost in `usage.cost`; that is used whenever it
 * is present, because it already reflects the tier and any provider discount.
 * Otherwise the price comes from this table (USD per 1M tokens). A model that is
 * not listed is reported as "unpriced" rather than as a free call, so the admin
 * page can say how many calls it could not price instead of showing a false $0.
 *
 * Update the table when a model's price changes; old rows keep the cost they
 * were logged with.
 */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

const PRICES: Record<string, ModelPrice> = {
  // Standard-tier prices on 2026-09-24 (see openRouter.ts flex note).
  "google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  // Jev bills only the prompt.
  "typesafe/jev-1.13": { input: 0.042, output: 0 },
};

/** Strip a provider prefix and a `:variant` suffix so near-identical ids match. */
function normalise(model: string): string {
  return model.trim().toLowerCase().replace(/:[a-z0-9_-]+$/, "");
}

/** The price for a model, or undefined when we do not know it. */
export function priceFor(model: string): ModelPrice | undefined {
  const key = normalise(model);
  return PRICES[key] ?? PRICES[key.replace(/^[^/]+\//, "")];
}

export interface CostInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cost reported by the provider, in USD, when it gave one. */
  reportedCostUsd?: number | null;
}

export interface CostResult {
  costUsd: number;
  /** False when the cost is a placeholder 0 because the model has no known price. */
  priced: boolean;
}

export function computeCost({ model, inputTokens, outputTokens, reportedCostUsd }: CostInput): CostResult {
  if (typeof reportedCostUsd === "number" && Number.isFinite(reportedCostUsd) && reportedCostUsd >= 0) {
    return { costUsd: reportedCostUsd, priced: true };
  }
  const price = priceFor(model);
  if (!price) return { costUsd: 0, priced: false };
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { costUsd, priced: true };
}
