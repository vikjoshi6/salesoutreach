import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { CrmSnapshot, Lead, Segment } from "./types.js";
import { segments } from "./types.js";
import { id, leadKey, nowIso, parseCsv } from "./utils.js";

type Candidate = {
  segment: Segment;
  businessName: string;
  website?: string;
  contactEmail?: string;
  phone?: string;
  source: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

export async function discoverLeads(snapshot: CrmSnapshot, config: AppConfig): Promise<{ imported: number; duplicates: number }> {
  const candidates = [
    ...(await readCsvCandidates(path.join(config.rootDir, "data", "input", "leads.csv"))),
    ...(await readGooglePlacesCandidates(config))
  ];
  const quota = Math.max(1, Math.floor(config.DAILY_DISCOVERY_LIMIT / segments.length));
  const bySegment = new Map<Segment, number>(segments.map((segment) => [segment, 0]));
  let imported = 0;
  let duplicates = 0;

  for (const candidate of candidates) {
    const count = bySegment.get(candidate.segment) ?? 0;
    if (count >= quota) continue;
    const normalizedKey = leadKey(candidate);
    const existing = snapshot.leads.find((lead) => lead.normalizedKey === normalizedKey);
    if (existing) {
      duplicates += 1;
      continue;
    }
    const createdAt = nowIso();
    const lead: Lead = {
      id: id(),
      segment: candidate.segment,
      businessName: candidate.businessName,
      website: candidate.website,
      contactEmail: candidate.contactEmail,
      phone: candidate.phone,
      metro: config.TARGET_METRO,
      state: "discovered",
      normalizedKey,
      source: candidate.source,
      createdAt,
      updatedAt: createdAt
    };
    snapshot.leads.push(lead);
    snapshot.sources.push({
      id: id(),
      leadId: lead.id,
      source: candidate.source,
      externalId: candidate.externalId,
      metadata: candidate.metadata ?? { importedFrom: "data/input/leads.csv" },
      createdAt
    });
    bySegment.set(candidate.segment, count + 1);
    imported += 1;
  }

  return { imported, duplicates };
}

async function readGooglePlacesCandidates(config: AppConfig): Promise<Candidate[]> {
  if (!config.ENABLE_GOOGLE_PLACES_DISCOVERY || !config.GOOGLE_PLACES_API_KEY) return [];
  const quota = Math.max(1, Math.floor(config.DAILY_DISCOVERY_LIMIT / segments.length));
  const candidates: Candidate[] = [];
  for (const segment of segments) {
    const query = `${segmentSearchLabel(segment)} near ${config.TARGET_METRO}`;
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber"
      },
      body: JSON.stringify({ textQuery: query, pageSize: Math.min(quota, 20), regionCode: "CA", languageCode: "en" })
    });
    if (!response.ok) {
      throw new Error(`Google Places discovery failed for ${segment}: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        websiteUri?: string;
        nationalPhoneNumber?: string;
      }>;
    };
    for (const place of data.places ?? []) {
      if (!place.displayName?.text) continue;
      candidates.push({
        segment,
        businessName: place.displayName.text,
        website: place.websiteUri,
        phone: place.nationalPhoneNumber,
        source: "google_places_api",
        externalId: place.id,
        metadata: { adapter: "places.searchText", storedFields: ["place_id", "websiteUri", "nationalPhoneNumber", "displayName"] }
      });
    }
  }
  return candidates;
}

function segmentSearchLabel(segment: Segment): string {
  if (segment === "hvac_plumbing") return "HVAC plumbing contractor";
  if (segment === "roofing") return "roofing contractor";
  return "landscaping company";
}

async function readCsvCandidates(file: string): Promise<Candidate[]> {
  const text = await readFile(file, "utf8");
  return parseCsv(text)
    .map((row) => ({
      segment: row.segment as Segment,
      businessName: row.business_name,
      website: row.website || undefined,
      contactEmail: row.contact_email || undefined,
      phone: row.phone || undefined,
      source: row.source || "directory_csv"
    }))
    .filter((candidate) => segments.includes(candidate.segment) && candidate.businessName);
}
