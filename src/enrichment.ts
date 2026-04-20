import type { CrmSnapshot, Enrichment, Lead } from "./types.js";
import { normalizeDomain, nowIso } from "./utils.js";

export async function enrichLeads(snapshot: CrmSnapshot): Promise<{ enriched: number }> {
  let enriched = 0;
  for (const lead of snapshot.leads.filter((item) => item.state === "discovered" || item.state === "enriched" || item.state === "scored" || item.state === "draft_ready")) {
    const enrichment = await buildEnrichment(lead);
    snapshot.enrichments = snapshot.enrichments.filter((item) => item.leadId !== lead.id);
    snapshot.enrichments.push(enrichment);
    lead.state = "enriched";
    lead.updatedAt = nowIso();
    enriched += 1;
  }
  return { enriched };
}

export async function buildEnrichment(lead: Lead): Promise<Enrichment> {
  const websiteText = await fetchWebsiteSignals(lead.website);
  const existingEmail = lead.contactEmail && isUsableEmailForLead(lead.contactEmail, lead.website) ? lead.contactEmail : undefined;
  const discoveredEmail = existingEmail ?? extractEmail(websiteText, lead.website);
  lead.contactEmail = discoveredEmail;
  const domainText = `${lead.website ?? ""} ${lead.contactEmail ?? ""} ${websiteText}`.toLowerCase();
  const notes: string[] = [];
  const hasWebsite = Boolean(lead.website);
  const hasContactEmail = Boolean(discoveredEmail);
  const hasPhone = Boolean(lead.phone);
  const hasBookingSignal = /book|schedule|estimate|quote|request|form|contact us/.test(domainText);
  const hasSocialSignal = /facebook|instagram|linkedin|tiktok|youtube/.test(domainText);
  const hasAiChatSignal = /chat|bot|ai|assistant|intercom|drift|tawk|crisp/.test(domainText);
  const websiteLooksModern =
    /https:\/\//.test(lead.website ?? "") &&
    /viewport|schema\.org|application\/ld\+json|wp-content|react|next|vite|bootstrap|tailwind|form/.test(domainText) &&
    !/\.test($|\/)/.test(lead.website ?? "");

  if (!hasWebsite) notes.push("No website captured.");
  if (!hasContactEmail) notes.push("No contact email captured.");
  if (!hasBookingSignal) notes.push("No obvious online booking or quote signal found.");
  if (!hasSocialSignal) notes.push("No social profile signal found in source fields.");
  if (!hasAiChatSignal) notes.push("No AI/chat intake signal found.");

  return {
    leadId: lead.id,
    hasWebsite,
    hasContactEmail,
    hasPhone,
    hasBookingSignal,
    hasSocialSignal,
    hasAiChatSignal,
    websiteLooksModern,
    notes
  };
}

async function fetchWebsiteSignals(website?: string): Promise<string> {
  if (!website) return "";
  const urls = candidateUrls(website);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const chunks: string[] = [];
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": "HomeServicesProspectingBot/0.1" }
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
        chunks.push((await response.text()).slice(0, 120_000));
      } catch {
        continue;
      }
    }
    return chunks.join("\n");
  } finally {
    clearTimeout(timeout);
  }
}

function candidateUrls(website: string): string[] {
  const base = website.startsWith("http") ? website : `https://${website}`;
  try {
    const url = new URL(base);
    const origin = url.origin;
    return [origin, `${origin}/contact`, `${origin}/contact-us`, `${origin}/about`, `${origin}/about-us`];
  } catch {
    return [];
  }
}

function extractEmail(text: string, website?: string): string | undefined {
  const matches = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => match[0].toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email))
    .filter((email) => !/(example\.com|domain\.com|email\.com|sentry\.io)/i.test(email));
  const websiteDomain = normalizeDomain(website);
  const sameDomain = matches.find((email) => websiteDomain && email.endsWith(`@${websiteDomain}`));
  if (sameDomain) return sameDomain;
  const roleBased = matches.find((email) => /^(info|hello|contact|service|sales|office|admin|support)@/.test(email));
  if (roleBased) return roleBased;
  const gmail = matches.find((email) => /@(gmail|outlook|hotmail)\.com$/.test(email));
  return gmail ?? undefined;
}

function isUsableEmailForLead(email: string, website?: string): boolean {
  const websiteDomain = normalizeDomain(website);
  const emailDomain = email.split("@")[1]?.toLowerCase() ?? "";
  if (websiteDomain && emailDomain === websiteDomain) return true;
  if (/^(info|hello|contact|service|sales|office|admin|support)@/.test(email.toLowerCase())) return true;
  if (/@(gmail|outlook|hotmail)\.com$/i.test(email)) return true;
  return false;
}
