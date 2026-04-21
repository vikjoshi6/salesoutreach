import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import { topAnalysisRows } from "./analysis.js";
import type { Audit, BenchmarkScore, ComparativeAnalysis, CrmSnapshot, Lead, LearningState, Mockup, OutreachDraft } from "./types.js";
import { outreachBlockers } from "./compliance.js";
import { createMockup } from "./mockup.js";
import { ensureDir, nowIso, slugify } from "./utils.js";

export async function prepareOutreach(snapshot: CrmSnapshot, config: AppConfig, learningState?: LearningState): Promise<{ prepared: number; blocked: number }> {
  const qualified = snapshot.leads
    .filter((lead) => lead.state === "qualified" || lead.state === "draft_ready")
    .slice(0, config.DAILY_DRAFT_LIMIT);
  let prepared = 0;
  let blocked = 0;

  for (const lead of qualified) {
    const blockers = outreachBlockers(config, snapshot, lead);
    if (blockers.length > 0) {
      blocked += 1;
      snapshot.runs.at(-1)?.errors.push(`${lead.businessName}: ${blockers.join(" ")}`);
      continue;
    }

    const audit = buildAudit(snapshot, lead);
    const mockup = await createMockup(config, lead, audit);
    const draft = await createDraft(config, lead, audit, mockup, learningState, snapshot.analyses.find((item) => item.leadId === lead.id));
    snapshot.audits = snapshot.audits.filter((item) => item.leadId !== lead.id);
    snapshot.mockups = snapshot.mockups.filter((item) => item.leadId !== lead.id);
    snapshot.drafts = snapshot.drafts.filter((item) => item.leadId !== lead.id);
    snapshot.approvals = snapshot.approvals.filter((item) => item.leadId !== lead.id);
    snapshot.audits.push(audit);
    snapshot.mockups.push(mockup);
    snapshot.drafts.push(draft);
    snapshot.approvals.push({ leadId: lead.id, approval: "pending", createdAt: nowIso() });
    lead.state = "draft_ready";
    lead.updatedAt = nowIso();
    prepared += 1;
  }

  return { prepared, blocked };
}

export function buildAudit(snapshot: CrmSnapshot, lead: Lead): Audit {
  const score = snapshot.scores.find((item) => item.leadId === lead.id);
  const analysis = snapshot.analyses.find((item) => item.leadId === lead.id);
  const observations = analysis?.summaryFindings.length
    ? analysis.summaryFindings
    : score?.reasons.length
      ? score.reasons
      : ["The current online presence has room for a clearer conversion path."];
  const recommendations = analysis?.rankedGaps.length
    ? analysis.rankedGaps.slice(0, 3).map(recommendationForGap)
    : [
        "Put quote and service-area actions above the fold.",
        "Add proof points that match the local homeowner's concern.",
        "Use a simple AI intake path for after-hours questions."
      ];
  return { leadId: lead.id, observations, recommendations, createdAt: nowIso() };
}

async function createDraft(
  config: AppConfig,
  lead: Lead,
  audit: Audit,
  mockup: Mockup,
  learningState?: LearningState,
  analysis?: ComparativeAnalysis
): Promise<OutreachDraft> {
  const descriptor = learningState?.copyPlaybook.landingPageDescriptor ?? "landing page mockup";
  const openingAngle = learningState?.copyPlaybook.openingAngleBySegment[lead.segment] ?? "the first impression and quote flow";
  const objectionLine =
    learningState?.copyPlaybook.objectionHandling[0] ??
    "This is a focused landing page concept, not a full website redesign.";
  const subject = `Quick website idea for ${lead.businessName}`;
  const body = [
    `Hi ${lead.businessName} team,`,
    "",
    `I was looking at local ${segmentLabel(lead.segment)} companies around ${config.TARGET_METRO} and noticed a practical opportunity around ${openingAngle}.`,
    `The main thing I noticed: ${audit.observations[0]}`,
    analysis ? `From a quick scan against local competitors and digital benchmarks, the current site is losing ground on ${analysis.rankedGaps[0]?.replace(/\.$/, "") ?? "first-impression and conversion basics"}.` : "",
    analysis ? "" : "",
    analysis ? "Here is the quick comparison:" : "",
    analysis ? renderComparisonTable(analysis, config.ANALYSIS_EMAIL_TABLE_ROWS) : "",
    "",
    `I put together a quick ${descriptor} here: ${mockup.url}`,
    `${objectionLine} It is meant to show how the first impression, copy, visuals, and quote flow could feel for your business.`,
    "",
    `I run ${config.AGENCY_NAME}. I help local service businesses with websites, social content, and practical AI intake workflows, and I have recent local project experience with commercialusedfoodequipment.com, coldstoragedesignsolutions.ca, coldstreamrefrigeration.ca, and similar businesses.`,
    `If this is worth a quick look, reply here and I can send over a tighter version for your business.`,
    `For context, our local packages start at CAD $1,500 for a lead-ready website sprint, CAD $650/month for consistent social content, and CAD $750 setup for a basic AI intake workflow.`,
    `You can also call or text me directly at ${config.AGENCY_PHONE}.`,
    "",
    `Best,`,
    `${config.SENDER_NAME}`,
    config.AGENCY_PHONE ? `${config.AGENCY_PHONE}` : "",
    `${config.REPLY_EMAIL}`,
    "",
    `Reply "no thanks" and I will not follow up.`,
    config.PHYSICAL_MAILING_ADDRESS
  ]
    .filter((line) => line !== "")
    .join("\n");

  const dir = path.join(config.rootDir, "outputs", config.outputDate, "drafts");
  await ensureDir(dir);
  const draftPath = path.join(dir, `${slugify(lead.businessName)}.txt`);
  await writeFile(draftPath, `To: ${lead.contactEmail}\nSubject: ${subject}\n\n${body}\n`, "utf8");
  return { leadId: lead.id, subject, body, draftPath, status: "draft_ready", createdAt: nowIso() };
}

function segmentLabel(segment: Lead["segment"]): string {
  return segment === "hvac_plumbing" ? "HVAC and plumbing" : segment;
}

function renderComparisonTable(analysis: ComparativeAnalysis, limit: number): string {
  const rows = topAnalysisRows(analysis, limit);
  const header = `Category                    Current  Comp Med  Benchmark`;
  const divider = `--------------------------  -------  --------  ---------`;
  const body = rows.map((row) => formatRow(row));
  return [header, divider, ...body].join("\n");
}

function formatRow(row: BenchmarkScore): string {
  return [
    pad(row.label, 26),
    pad(String(row.prospectScore), 7),
    pad(row.competitorMedianScore == null ? "-" : String(row.competitorMedianScore), 8),
    pad(String(row.benchmarkTarget), 9)
  ].join("  ");
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : `${value}${" ".repeat(width - value.length)}`;
}

function recommendationForGap(gap: string): string {
  const normalized = gap.toLowerCase();
  if (normalized.includes("quote/contact")) return "Put a stronger quote and contact path above the fold and keep it visible throughout the page.";
  if (normalized.includes("trust proof")) return "Add reviews, project proof, licensing, and warranty cues near the top of the page.";
  if (normalized.includes("local relevance")) return "Make Mississauga and nearby service areas obvious in the hero and proof sections.";
  if (normalized.includes("first-screen clarity")) return "Clarify the offer and primary call to action in the first screen.";
  if (normalized.includes("ai intake")) return "Add after-hours follow-up or AI-assisted intake so leads do not wait.";
  return "Tighten copy, proof, and conversion flow so the page answers the biggest visible gap first.";
}
