type LegacyTargetRole = "admin" | "super-agent" | "agent";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

function appendSearchParams(params: URLSearchParams, searchParams: SearchParams): void {
  if (!searchParams) return;

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (typeof value === "string") {
      params.append(key, value);
    }
  }
}

export function getLegacyTargetRedirectPath(
  locale: string,
  role: LegacyTargetRole,
  searchParams?: SearchParams
): string {
  const params = new URLSearchParams();
  appendSearchParams(params, searchParams);

  const query = params.toString();
  return `/${locale}/${role}/target-management${query ? `?${query}` : ""}`;
}