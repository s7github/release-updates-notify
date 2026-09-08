import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const discoverSources = async (query: string) => {
  const prompt = `You are a high-fidelity software discovery engine. 
  Task: Find the official software release sources for: "${query}".
  
  Guidelines & Priority:
  1. Primary Sources: Official changelogs (/changelog, /releases, /whats-new), Documentation archives, Manuals.
  2. GitHub/GitLab: Find the REST API /releases or /tags endpoint.
  3. RSS Feeds: Technical update feeds.
  
  Google Search Task:
  - Find the absolute official homepage.
  - Search specifically for terms like "[software] version history archive", "[software] changelog", "[software] release notes github".
  - Identify the real Developer/Vendor.
  - Find a high-res official logo URL (using clearbit: https://logo.clearbit.com/[domain]).
  
  Return ONLY a JSON object: 
  { 
    "name": string, 
    "vendor": string|null,
    "website": string|null,
    "icon_url": string|null,
    "type": "software"|"topic",
    "github_url": string|null, 
    "rss_url": string|null, 
    "changelog_url": string|null, 
    "suggested_priority": string[] (e.g. ["html", "github", "rss"])
  }.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      tools: [
        { googleSearch: {} }
      ]
    }
  });

  // Since we removed JSON mode, we may need to strip markdown delimiters if the model adds them
  let text = response.text;
  if (text.includes("```json")) {
    text = text.split("```json")[1].split("```")[0];
  } else if (text.includes("```")) {
    text = text.split("```")[1].split("```")[0];
  }

  return JSON.parse(text.trim());
};

export const searchLatestReleaseFallback = async (softwareName: string) => {
  const prompt = `Search the absolute latest official release notes for the software "${softwareName}". 
  Your goal is to find the most recent software version update, release date, and the URL where the changelog was found.
  
  Return ONLY a JSON object: 
  {
    "version": string,
    "releaseDate": string | null,
    "category": "New Features" | "Major Milestone Update" | "Bug Fixes",
    "summary": string,
    "isGenuineUpdate": true,
    "metadataLearnings": {
      "changelog_url": string | null
    }
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  let text = response.text || "";
  if (text.includes("```json")) {
    text = text.split("```json")[1].split("```")[0];
  } else if (text.includes("```")) {
    text = text.split("```")[1].split("```")[0];
  }

  return JSON.parse(text.trim());
};

export const extractReleaseNotes = async (softwareName: string, rawData: string) => {
  const prompt = `Analyze this raw data from multiple sources (GitHub, RSS, Website) for the software "${softwareName}".
  
  Critical Extraction Rules:
  1. Standardized Categorization: Use ONLY these categories: "New Features", "Feature Updates", "Optimization/Tips", "Bug Fixes", "Security Patches", "Major Milestone Update".
  2. Version vs Date Discrimination: STRICTLY extract technical version numbers (e.g. "25.2.5", "2024.1.2"). NEVER use a date string (like "2026-04-20") as a version name. If you see "25.2.5 (2026/03/09)", extract "25.2.5" as version. DO NOT extract content packs or plugins as software versions.
  3. Major Milestones: If a release marks a major integer change (e.g., 24.x to 25.0), lacks a patch number (e.g., "25.1"), or introduces major new features, categorize it as "Major Milestone Update".
  4. Entity-First Extraction: AI must prioritize Named Releases over generic Date-Based Titles.
  5. Accuracy Filtering: Ignore "dependency bumps" or "internal housekeeping" unless accompanied by feature notes.
  6. The Cluster Rule: You are receiving data from parallel streams. Aggregate it into a single "Product Profile".
  7. Self-Correction & Learning: Suggest metadata corrections in the "metadataLearnings" object.
  8. Conflict Resolution: If sources disagree, adopt "Highest Version + Most Recent Date" logic.
  
  Tasks:
  1. Determine if this data contains a valid software update or product status.
  2. Extract:
     - Version: Technical version (e.g. v24.1.1) or Marketing Name (e.g. "FL Studio 2024"). Lead with technical version if both exist.
     - Release Date: ISO format.
     - Category: From the allowed list above.
     - Summary: Markdown, focused on actionable information.
     - isGenuineUpdate: Set to TRUE if you can find ANY version number, any release date, or any product announcement.
  
  Raw data (Merged Streams): ${rawData.substring(0, 40000)}
  
  Return ONLY a JSON object: 
  {
    "version": string,
    "releaseDate": string | null,
    "category": "New Features" | "Feature Updates" | "Optimization/Tips" | "Bug Fixes" | "Security Patches" | "Major Milestone Update",
    "summary": string,
    "isGenuineUpdate": boolean,
    "metadataLearnings": {
      "vendor": string | null,
      "website": string | null,
      "github_url": string | null,
      "rss_url": string | null,
      "changelog_url": string | null,
      "logo_url": string | null
    }
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    }
  });

  return JSON.parse(response.text);
};

export const searchHistoryFallback = async (softwareName: string) => {
  const prompt = `Search the complete version history/changelog for "${softwareName}". 
  Your goal is to extract as many unique historical versions and their release dates as possible from the open web (official sites, wikis, or reputable news).
  
  Return ONLY a JSON array of objects: 
  [{
    "version": string,
    "releaseDate": string | null,
    "category": "New Features" | "Major Milestone Update" | "Bug Fixes",
    "summary": string
  }]`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  let text = response.text || "";
  if (text.includes("```json")) {
    text = text.split("```json")[1].split("```")[0];
  } else if (text.includes("```")) {
    text = text.split("```")[1].split("```")[0];
  }

  try {
    return JSON.parse(text.trim());
  } catch (e) {
    console.error("Failed to parse history search result:", text);
    return [];
  }
};

export const extractHistory = async (softwareName: string, rawData: string) => {
  const prompt = `Analyze this raw data describing the historical releases of "${softwareName}".
  
  Task: Extract a COMPREHENSIVE list of ALL identifiable release updates found in this text.
  
  Critical Extraction Rules:
  1. Maximum Coverage: Scan the entire text for ALL unique versions and dates.
  2. Version Strings: Extract technical version numbers (e.g., "25.2.5", "1.2.3-beta") OR Named Releases (e.g. "Release 1", "Alpha V1", "Stable Patch"). NEVER use a date string ONLY (like "2026-04-20") as a version name. If a line says "v25.2.5 (2026 / March / 09)", the version is "25.2.5". 
  3. Default if no version: If you find a release text but no version number/name, synthesize a logical name (e.g. "Update - [Date]").
  4. Ignore Content Packs/Assets: DO NOT extract plugins, sound packs, or sub-assets as software versions.
  5. Major Milestones: If a release marks a major integer change (e.g., 24.x to 25.0) or is explicitly called a major release, categorize it as "Major Milestone Update".
  6. Categorization: Use: "New Features", "Feature Updates", "Optimization/Tips", "Bug Fixes", "Security Patches", "Major Milestone Update".
  7. Date Format: Convert all parsed dates into ISO YYYY-MM-DD format.
  8. Max Items: Extract up to 100 unique historical releases if available.
  
  Raw data: ${rawData.substring(0, 100000)}
  
  Return ONLY a JSON array of objects: 
  [{
    "version": "string (strictly the numeric/semantic version, no dates)",
    "releaseDate": "string (ISO date YYYY-MM-DD)",
    "category": "string",
    "summary": "string (brief markdown summary focusing on key changes)"
  }]`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    }
  });

  return JSON.parse(response.text);
};
