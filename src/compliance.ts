import type { AppConfig } from "./config.js";
import { isConfiguredForOutreach } from "./config.js";
import type { CrmSnapshot, Lead } from "./types.js";
import { normalizeDomain } from "./utils.js";

export function outreachBlockers(config: AppConfig, snapshot: CrmSnapshot, lead: Lead): string[] {
  const blockers: string[] = [];
  if (!isConfiguredForOutreach(config)) {
    blockers.push("Missing sender identity, reply email, target metro, agency name, or physical mailing address.");
  }
  if (!lead.contactEmail) {
    blockers.push("Missing contact email.");
  }
  if (lead.contactEmail && isSuppressed(snapshot, lead.contactEmail)) {
    blockers.push("Recipient is suppressed.");
  }
  if (/^re:|^fwd:/i.test(buildSubjectPrefix(lead))) {
    blockers.push("Misleading reply/forward subject is not allowed.");
  }
  return blockers;
}

export function isSuppressed(snapshot: CrmSnapshot, email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return snapshot.suppressions.some((item) => {
    if (item.email && item.email.toLowerCase() === email.toLowerCase()) return true;
    if (item.domain && domain && normalizeDomain(item.domain) === domain) return true;
    return false;
  });
}

function buildSubjectPrefix(_lead: Lead): string {
  return "Quick website idea";
}
