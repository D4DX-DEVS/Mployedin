/** GET a JSON endpoint, throwing on a non-2xx response. */
export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request to ${url} returned ${res.status}`);
  return res.json() as Promise<T>;
}
