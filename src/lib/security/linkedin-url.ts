const LINKEDIN_PROFILE_HOST = "www.linkedin.com";

/**
 * Accept only canonical HTTPS LinkedIn profile URLs. Keeping this allowlist
 * deliberately narrow prevents a stored social link from becoming an SSRF
 * primitive when the server imports the profile.
 */
export function parseLinkedInProfileUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid LinkedIn profile URL");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== LINKEDIN_PROFILE_HOST ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    !/^\/in\/[^/]+\/?$/.test(url.pathname)
  ) {
    throw new Error("LinkedIn URL must be a canonical https://www.linkedin.com/in/... profile");
  }

  url.hash = "";
  return url;
}

export function isLinkedInProfileUrl(rawUrl: string): boolean {
  try {
    parseLinkedInProfileUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}
