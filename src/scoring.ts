import type { CrmSnapshot, Enrichment, LeadScore, LearningState } from "./types.js";
import { nowIso } from "./utils.js";

export function scoreEnrichment(enrichment: Enrichment, learningState?: LearningState): Pick<LeadScore, "score" | "reasons" | "qualified"> {
  const weights = learningState?.scoringWeights ?? {
    missingWebsite: 25,
    outdatedWebsite: 15,
    noBooking: 15,
    noSocial: 10,
    noAi: 10,
    noEmailPenalty: 15,
    noPhonePenalty: 5,
    qualificationThreshold: 45
  };
  let score = 35;
  const reasons: string[] = [];

  if (!enrichment.hasWebsite) {
    score += weights.missingWebsite;
    reasons.push("No website captured.");
  } else if (!enrichment.websiteLooksModern) {
    score += weights.outdatedWebsite;
    reasons.push("Website may need a modernization review.");
  }

  if (!enrichment.hasBookingSignal) {
    score += weights.noBooking;
    reasons.push("No clear booking, quote, or estimate path.");
  }
  if (!enrichment.hasSocialSignal) {
    score += weights.noSocial;
    reasons.push("Weak or missing social media signal.");
  }
  if (!enrichment.hasAiChatSignal) {
    score += weights.noAi;
    reasons.push("No visible AI/chat intake signal.");
  }
  if (!enrichment.hasContactEmail) {
    score -= weights.noEmailPenalty;
    reasons.push("No email captured; needs manual contact research.");
  }
  if (!enrichment.hasPhone) {
    score -= weights.noPhonePenalty;
    reasons.push("No phone captured.");
  }

  const bounded = Math.max(0, Math.min(100, score));
  return { score: bounded, reasons, qualified: bounded >= weights.qualificationThreshold && enrichment.hasContactEmail && reasons.length > 0 };
}

export function scoreLeads(snapshot: CrmSnapshot, learningState?: LearningState): { scored: number; qualified: number; review: number; rejected: number } {
  let scored = 0;
  let qualified = 0;
  let review = 0;
  let rejected = 0;

  for (const lead of snapshot.leads.filter((item) => item.state === "enriched" || item.state === "scored" || item.state === "draft_ready")) {
    const enrichment = snapshot.enrichments.find((item) => item.leadId === lead.id);
    if (!enrichment) continue;
    const result = scoreEnrichment(enrichment, learningState);
    snapshot.scores = snapshot.scores.filter((item) => item.leadId !== lead.id);
    snapshot.audits = snapshot.audits.filter((item) => item.leadId !== lead.id);
    snapshot.mockups = snapshot.mockups.filter((item) => item.leadId !== lead.id);
    snapshot.drafts = snapshot.drafts.filter((item) => item.leadId !== lead.id);
    snapshot.approvals = snapshot.approvals.filter((item) => item.leadId !== lead.id);
    snapshot.scores.push({
      leadId: lead.id,
      ...result,
      createdAt: nowIso()
    });
    lead.state = result.qualified ? "qualified" : "scored";
    lead.updatedAt = nowIso();
    scored += 1;
    if (result.qualified) qualified += 1;
    else if (result.score >= (learningState?.scoringWeights.qualificationThreshold ?? 45)) review += 1;
    else rejected += 1;
  }

  return { scored, qualified, review, rejected };
}
