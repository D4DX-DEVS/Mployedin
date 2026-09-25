/**
 * Turns an audit-log action or webhook event code into a readable label:
 * "subscription.cron_expiry" → "Subscription · Cron Expiry".
 */
export function formatActionCode(code: string): string {
  const [category, ...rest] = code.split(".");
  const action = rest.map(formatCodePart).join(" ");
  return action ? `${formatCodePart(category)} · ${action}` : formatCodePart(category);
}

/** "cron_expiry" → "Cron Expiry" */
function formatCodePart(part: string): string {
  return part
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
