/** An employer's current plan as agents and super agents see it. */
export interface ClientPlan {
  userId: string;
  planName: string;
  tier: number;
  price: number;
  currency: string;
  endDate: string;
}
