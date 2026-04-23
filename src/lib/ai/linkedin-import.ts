/**
 * AI-powered LinkedIn profile import.
 *
 * Strategy:
 * 1. Use LinkedIn userinfo endpoint (OIDC data: name, email, picture)
 * 2. Fetch the public LinkedIn profile page HTML
 * 3. Feed the HTML text to Gemini Flash via OpenRouter to extract structured data
 * 4. Return parsed profile fields for onboarding pre-fill
 */

import { generateText, parseAIJson, GEMINI_MODELS } from "@/lib/ai/gemini";
import logger from "@/lib/logger";

export interface LinkedInImportedProfile {
  name?: string;
  headline?: string;
  location?: string;
  summary?: string;
  experience?: {
    jobTitle: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
  }[];
  education?: {
    degree: string;
    institution: string;
    field?: string;
    startYear?: number;
    endYear?: number;
  }[];
  skills?: string[];
  languages?: string[];
  certifications?: string[];
  industry?: string;
}

/**
 * Fetch a LinkedIn public profile page's text content.
 * LinkedIn serves a server-rendered HTML for public profiles that contains
 * enough structured text for AI extraction.
 */
async function fetchPublicProfileHtml(profileUrl: string): Promise<string | null> {
  try {
    const res = await fetch(profileUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extract text content — strip scripts/styles, keep meaningful text
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    // Limit to first 12000 chars to stay within token limits
    return cleaned.slice(0, 12000);
  } catch (err) {
    logger.debug({ err }, "Failed to fetch LinkedIn public profile");
    return null;
  }
}

/**
 * Try to fetch LinkedIn profile data using the userinfo endpoint
 */
async function fetchUserInfo(
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Use AI to extract structured profile data from raw text.
 * Uses Gemini Flash via OpenRouter for fast, cheap extraction.
 */
async function aiExtractProfile(
  rawText: string,
  knownName?: string,
  knownEmail?: string,
): Promise<LinkedInImportedProfile> {
  const prompt = `You are an expert data extraction AI. Extract structured LinkedIn profile data from the following text content scraped from a LinkedIn profile page.

${knownName ? `Known name: ${knownName}` : ""}
${knownEmail ? `Known email: ${knownEmail}` : ""}

Return a JSON object with ONLY these fields (omit fields if data is not available):
{
  "name": "Full name",
  "headline": "Professional headline (e.g. 'Senior Software Engineer at Google')",
  "location": "City/region (e.g. 'Dubai, UAE')",
  "summary": "Professional summary/about section (max 500 chars)",
  "experience": [
    {
      "jobTitle": "Job title",
      "company": "Company name",
      "location": "City/country",
      "startDate": "YYYY-MM format or YYYY",
      "endDate": "YYYY-MM format, YYYY, or null if current",
      "isCurrent": true/false,
      "description": "Brief role description (max 200 chars)"
    }
  ],
  "education": [
    {
      "degree": "Degree type (e.g. 'Bachelor of Technology', 'MBA')",
      "institution": "University/school name",
      "field": "Field of study",
      "startYear": 2015,
      "endYear": 2019
    }
  ],
  "skills": ["Skill 1", "Skill 2", ...],
  "languages": ["English", "Arabic", ...],
  "certifications": ["Cert name 1", ...],
  "industry": "Primary industry (e.g. 'Information Technology')"
}

Important:
- Extract ONLY what is clearly stated in the text
- Do NOT fabricate or guess any data
- For experience, list most recent first
- For skills, include up to 15 most relevant ones
- Return valid JSON only, no markdown

LinkedIn profile text:
---
${rawText}
---`;

  const response = await generateText(prompt, GEMINI_MODELS.flash, 2000);
  return parseAIJson<LinkedInImportedProfile>(response);
}

/**
 * Main entry: Import LinkedIn profile using all available data sources.
 *
 * @param accessToken - LinkedIn OAuth access token (decrypted)
 * @param profileUrl  - LinkedIn public profile URL (optional)
 * @param userName    - Known user name from OIDC
 * @param userEmail   - Known user email from OIDC
 */
export async function importLinkedInProfile(
  accessToken: string,
  profileUrl?: string,
  userName?: string,
  userEmail?: string,
): Promise<LinkedInImportedProfile> {
  const sections: string[] = [];

  // 1. Try userinfo endpoint
  const userInfo = await fetchUserInfo(accessToken);
  if (userInfo) {
    sections.push(
      `LINKEDIN USERINFO: Name: ${userInfo.name ?? ""}, Email: ${userInfo.email ?? ""}, ` +
        `Location: ${userInfo.locale ?? ""}, Picture: ${userInfo.picture ? "yes" : "no"}`,
    );
  }

  // 2. Try REST API for headline/location
  try {
    const res = await fetch(
      "https://api.linkedin.com/v2/me?projection=(localizedFirstName,localizedLastName,localizedHeadline,vanityName)",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      sections.push(
        `LINKEDIN REST API: FirstName: ${data.localizedFirstName ?? ""}, LastName: ${data.localizedLastName ?? ""}, ` +
          `Headline: ${data.localizedHeadline ?? ""}, VanityName: ${data.vanityName ?? ""}`,
      );

      // If we don't have a profile URL yet, construct one
      if (!profileUrl && data.vanityName) {
        profileUrl = `https://www.linkedin.com/in/${data.vanityName}`;
      }
    }
  } catch {
    // REST API not available
  }

  // 3. Try public profile page
  if (profileUrl) {
    const htmlText = await fetchPublicProfileHtml(profileUrl);
    if (htmlText && htmlText.length > 200) {
      sections.push(`LINKEDIN PUBLIC PROFILE PAGE CONTENT:\n${htmlText}`);
    }
  }

  // If we have NO useful data at all, return minimal profile from OIDC
  if (sections.length === 0) {
    return {
      name: userName,
    };
  }

  // 4. Feed everything to AI for structured extraction
  const combinedText = sections.join("\n\n---\n\n");

  try {
    const extracted = await aiExtractProfile(combinedText, userName, userEmail);
    return extracted;
  } catch (err) {
    logger.error({ err }, "AI extraction failed for LinkedIn profile");
    // Return whatever we have from OIDC
    return {
      name: userName,
      headline: userInfo?.name ? String(userInfo.name) : undefined,
    };
  }
}
