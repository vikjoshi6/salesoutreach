import path from "node:path";
import type { AppConfig } from "./config.js";
import type { CrmSnapshot, LearningDecision, LearningPattern, LearningState, Segment } from "./types.js";
import { segments } from "./types.js";
import { id, nowIso, readJsonFile, writeJsonFile } from "./utils.js";

export async function loadLearningState(config: AppConfig): Promise<LearningState> {
  return readJsonFile(learningStatePath(config), defaultLearningState(config));
}

export async function saveLearningState(config: AppConfig, state: LearningState): Promise<void> {
  await writeJsonFile(learningStatePath(config), state);
}

export function learningStatePath(config: AppConfig): string {
  return path.join(config.rootDir, "data", "learning-state.json");
}

export function defaultLearningState(config: AppConfig): LearningState {
  return {
    version: 1,
    updatedAt: nowIso(),
    scoringWeights: {
      missingWebsite: 25,
      outdatedWebsite: 15,
      noBooking: 15,
      noSocial: 10,
      noAi: 10,
      noEmailPenalty: 15,
      noPhonePenalty: 5,
      qualificationThreshold: 45
    },
    copyPlaybook: {
      landingPageDescriptor: "landing page mockup",
      openingAngleBySegment: {
        roofing: "trust, premium project fit, and easier quote flow",
        hvac_plumbing: "response speed, service clarity, and after-hours intake",
        landscaping: "visual proof, design confidence, and easier project requests"
      },
      proofPoints: [
        "recent local project experience",
        "faster first impression and quote flow",
        "practical AI intake and follow-up"
      ],
      objectionHandling: [
        "This is a focused landing page concept, not a full website redesign.",
        "The goal is to show what the first impression and conversion flow could feel like."
      ]
    },
    cadence: {
      discoveryLimit: config.DAILY_DISCOVERY_LIMIT,
      draftLimit: config.DAILY_DRAFT_LIMIT,
      discoveryMin: config.AUTO_TUNE_DISCOVERY_MIN,
      discoveryMax: config.AUTO_TUNE_DISCOVERY_MAX,
      draftMin: config.AUTO_TUNE_DRAFT_MIN,
      draftMax: config.AUTO_TUNE_DRAFT_MAX
    },
    patterns: [],
    decisions: [],
    proposedChanges: []
  };
}

export function applyLearningConfig(config: AppConfig, state: LearningState): AppConfig {
  return {
    ...config,
    DAILY_DISCOVERY_LIMIT: clamp(state.cadence.discoveryLimit, state.cadence.discoveryMin, state.cadence.discoveryMax),
    DAILY_DRAFT_LIMIT: clamp(state.cadence.draftLimit, state.cadence.draftMin, state.cadence.draftMax)
  };
}

export function deriveLearningUpdate(snapshot: CrmSnapshot, state: LearningState, source: LearningDecision["source"]): LearningState {
  const next = cloneState(state);
  const changes: string[] = [];
  const reasonCounts = countReasons(snapshot);
  const approvals = snapshot.approvals.filter((item) => item.approval === "approved");
  const rejections = snapshot.approvals.filter((item) => item.approval === "rejected");
  const suppressions = snapshot.suppressions.length;
  const qualified = snapshot.scores.filter((item) => item.qualified).length;
  const qualifiedRate = snapshot.leads.length > 0 ? qualified / snapshot.leads.length : 0;

  applyReasonWeight(reasonCounts, "Website may need a modernization review.", "outdatedWebsite", next, changes);
  applyReasonWeight(reasonCounts, "No clear booking, quote, or estimate path.", "noBooking", next, changes);
  applyReasonWeight(reasonCounts, "Weak or missing social media signal.", "noSocial", next, changes);
  applyReasonWeight(reasonCounts, "No visible AI/chat intake signal.", "noAi", next, changes);

  if (approvals.length > rejections.length && approvals.length > 0) {
    const old = next.scoringWeights.qualificationThreshold;
    next.scoringWeights.qualificationThreshold = clamp(old - 1, 40, 60);
    if (old !== next.scoringWeights.qualificationThreshold) {
      changes.push(`Lowered qualification threshold to ${next.scoringWeights.qualificationThreshold} because approvals outweigh rejections.`);
    }
  } else if (rejections.length > approvals.length && rejections.length > 0) {
    const old = next.scoringWeights.qualificationThreshold;
    next.scoringWeights.qualificationThreshold = clamp(old + 1, 40, 60);
    if (old !== next.scoringWeights.qualificationThreshold) {
      changes.push(`Raised qualification threshold to ${next.scoringWeights.qualificationThreshold} because rejections outweigh approvals.`);
    }
  }

  if (qualifiedRate >= 0.2 && suppressions === 0) {
    const beforeDiscovery = next.cadence.discoveryLimit;
    const beforeDraft = next.cadence.draftLimit;
    next.cadence.discoveryLimit = clamp(Math.round(beforeDiscovery * 1.1), next.cadence.discoveryMin, next.cadence.discoveryMax);
    next.cadence.draftLimit = clamp(Math.round(beforeDraft * 1.1), next.cadence.draftMin, next.cadence.draftMax);
    if (beforeDiscovery !== next.cadence.discoveryLimit || beforeDraft !== next.cadence.draftLimit) {
      changes.push(`Raised cadence to ${next.cadence.discoveryLimit} discoveries and ${next.cadence.draftLimit} drafts after a strong qualification rate.`);
    }
  } else if (qualified === 0 || suppressions > 0) {
    const beforeDiscovery = next.cadence.discoveryLimit;
    const beforeDraft = next.cadence.draftLimit;
    next.cadence.discoveryLimit = clamp(Math.round(beforeDiscovery * 0.9), next.cadence.discoveryMin, next.cadence.discoveryMax);
    next.cadence.draftLimit = clamp(Math.round(beforeDraft * 0.9), next.cadence.draftMin, next.cadence.draftMax);
    if (beforeDiscovery !== next.cadence.discoveryLimit || beforeDraft !== next.cadence.draftLimit) {
      changes.push(`Reduced cadence to ${next.cadence.discoveryLimit} discoveries and ${next.cadence.draftLimit} drafts because outcomes were weak or there were suppressions.`);
    }
  }

  for (const segment of segments) {
    const opening = dominantReasonForSegment(snapshot, segment);
    if (opening) next.copyPlaybook.openingAngleBySegment[segment] = opening;
  }

  next.patterns = buildPatterns(snapshot, next, reasonCounts);
  next.proposedChanges = changes;
  next.updatedAt = nowIso();
  next.decisions = [
    {
      decisionId: id(),
      source,
      summary: changes.length ? changes.join(" ") : "No heuristic changes applied; memory refreshed from current CRM state.",
      appliedChanges: changes,
      createdAt: next.updatedAt
    },
    ...next.decisions
  ].slice(0, 50);
  return next;
}

function buildPatterns(snapshot: CrmSnapshot, state: LearningState, reasonCounts: Map<string, number>): LearningPattern[] {
  const patterns: LearningPattern[] = [];
  for (const [reason, count] of reasonCounts.entries()) {
    if (count < 2) continue;
    patterns.push({
      patternId: slug(reason),
      scope: reason.includes("social") ? "copy" : "scoring",
      kind: reason,
      confidence: Math.min(0.95, 0.35 + count * 0.1),
      appliesTo: affectedSegments(snapshot, reason),
      evidence: [`Observed ${count} times in current lead scoring.`],
      recommendation: buildRecommendation(reason, state),
      lastUpdated: state.updatedAt
    });
  }
  return patterns.slice(0, 20);
}

function applyReasonWeight(
  reasonCounts: Map<string, number>,
  reason: string,
  field: keyof LearningState["scoringWeights"],
  state: LearningState,
  changes: string[]
): void {
  const count = reasonCounts.get(reason) ?? 0;
  if (count < 3) return;
  const before = state.scoringWeights[field];
  const after = clamp(before + 1, 1, 30);
  state.scoringWeights[field] = after;
  if (before !== after) changes.push(`Increased ${field} weight to ${after} after repeated signal: ${reason}`);
}

function dominantReasonForSegment(snapshot: CrmSnapshot, segment: Segment): string | undefined {
  const counts = new Map<string, number>();
  for (const lead of snapshot.leads.filter((item) => item.segment === segment)) {
    const score = snapshot.scores.find((item) => item.leadId === lead.id);
    for (const reason of score?.reasons ?? []) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!winner) return undefined;
  if (winner.includes("modernization")) return "modernize the first impression and trust cues";
  if (winner.includes("booking")) return "make quote requests easier and faster";
  if (winner.includes("social")) return "tighten proof and visible credibility";
  if (winner.includes("AI")) return "capture after-hours demand more reliably";
  return undefined;
}

function affectedSegments(snapshot: CrmSnapshot, reason: string): Segment[] {
  const result = new Set<Segment>();
  for (const score of snapshot.scores) {
    if (!score.reasons.includes(reason)) continue;
    const lead = snapshot.leads.find((item) => item.id === score.leadId);
    if (lead) result.add(lead.segment);
  }
  return result.size > 0 ? [...result] : [...segments];
}

function buildRecommendation(reason: string, state: LearningState): string {
  if (reason.includes("modernization")) return "Lead with modernization and first-impression framing in copy and keep outdated site weight elevated.";
  if (reason.includes("booking")) return "Emphasize quote-flow fixes in the opening email and keep booking-gap scoring active.";
  if (reason.includes("social")) return "Use social-proof and consistency framing in the email and landing page proof blocks.";
  if (reason.includes("AI")) return "Explain after-hours intake and simple AI follow-up as a practical revenue-protection angle.";
  return `Keep "${state.copyPlaybook.landingPageDescriptor}" framing clear and evidence-based.`;
}

function countReasons(snapshot: CrmSnapshot): Map<string, number> {
  const counts = new Map<string, number>();
  for (const score of snapshot.scores) {
    for (const reason of score.reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return counts;
}

function cloneState(state: LearningState): LearningState {
  return JSON.parse(JSON.stringify(state)) as LearningState;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
