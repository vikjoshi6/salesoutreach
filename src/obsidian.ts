import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { CrmSnapshot, Lead, LearningPattern, LearningState } from "./types.js";
import { nowIso, slugify } from "./utils.js";

export type MemorySyncResult = {
  companyNotes: number;
  patternNotes: number;
  runNotePath: string;
  decisionNotes: number;
};

export async function syncObsidianMemory(
  snapshot: CrmSnapshot,
  config: AppConfig,
  learningState: LearningState,
  runType: "daily" | "weekly" | "feedback",
  runSummary: Record<string, unknown>
): Promise<MemorySyncResult> {
  if (!config.OBSIDIAN_ENABLED) return { companyNotes: 0, patternNotes: 0, runNotePath: "", decisionNotes: 0 };
  await validateVault(config.OBSIDIAN_VAULT_PATH);
  const dirs = await ensureStructure(config.OBSIDIAN_VAULT_PATH);

  let companyNotes = 0;
  for (const lead of snapshot.leads) {
    await writeCompanyNote(dirs.companies, snapshot, lead);
    companyNotes += 1;
  }

  let patternNotes = 0;
  for (const pattern of learningState.patterns) {
    await writePatternNote(dirs.patterns, pattern);
    patternNotes += 1;
  }

  let decisionNotes = 0;
  for (const decision of learningState.decisions.slice(0, 5)) {
    await writeDecisionNote(dirs.decisions, decision.summary, decision.appliedChanges, decision.createdAt);
    decisionNotes += 1;
  }

  const runNotePath = await writeRunNote(dirs.runs, snapshot, learningState, runType, runSummary);
  return { companyNotes, patternNotes, runNotePath, decisionNotes };
}

async function validateVault(vaultPath: string): Promise<void> {
  try {
    await readFile(path.join(vaultPath, ".obsidian", "workspace.json"), "utf8");
  } catch {
    throw new Error(`Obsidian vault is not ready at ${vaultPath}`);
  }
}

async function ensureStructure(vaultPath: string): Promise<Record<string, string>> {
  const memoryDir = path.join(vaultPath, "Memory");
  const companies = path.join(memoryDir, "Companies");
  const patterns = path.join(memoryDir, "Patterns");
  const runs = path.join(memoryDir, "Runs");
  const decisions = path.join(memoryDir, "Decisions");
  for (const dir of [memoryDir, companies, patterns, runs, decisions]) {
    await mkdir(dir, { recursive: true });
  }
  return { companies, patterns, runs, decisions };
}

async function writeCompanyNote(baseDir: string, snapshot: CrmSnapshot, lead: Lead): Promise<void> {
  const score = snapshot.scores.find((item) => item.leadId === lead.id);
  const enrichment = snapshot.enrichments.find((item) => item.leadId === lead.id);
  const analysis = snapshot.analyses.find((item) => item.leadId === lead.id);
  const audit = snapshot.audits.find((item) => item.leadId === lead.id);
  const mockup = snapshot.mockups.find((item) => item.leadId === lead.id);
  const approval = snapshot.approvals.find((item) => item.leadId === lead.id);
  const notePath = path.join(baseDir, `${slugify(lead.businessName)}.md`);
  const content = [
    frontmatter({
      lead_id: lead.id,
      business_name: lead.businessName,
      segment: lead.segment,
      status: lead.state,
      contact_quality: lead.contactEmail ? "email_found" : "needs_contact_research",
      last_reviewed_at: nowIso()
    }),
    `# ${lead.businessName}`,
    "",
    "## Identity",
    `- Segment: ${lead.segment}`,
    `- Metro: ${lead.metro}`,
    `- Website: ${lead.website ?? "Missing"}`,
    `- Contact email: ${lead.contactEmail ?? "Missing"}`,
    `- Phone: ${lead.phone ?? "Missing"}`,
    "",
    "## Site Observations",
    ...((enrichment?.notes.length ? enrichment.notes : ["No enrichment notes yet."]).map((note) => `- ${note}`)),
    "",
    "## Scoring",
    `- Score: ${score?.score ?? "n/a"}`,
    `- Qualified: ${score?.qualified ? "yes" : "no"}`,
    ...((score?.reasons.length ? score.reasons : ["No scoring reasons yet."]).map((reason) => `- ${reason}`)),
    "",
    "## Comparative Analysis",
    `- Competitors scanned: ${analysis?.competitorSet.length ?? 0}`,
    `- Under competitor median: ${analysis?.underperformsCompetitorMedian ? "yes" : "no"}`,
    ...((analysis?.rankedGaps.length ? analysis.rankedGaps.slice(0, 4) : ["No comparative analysis yet."]).map((item) => `- ${item}`)),
    "",
    "## Mockup Notes",
    `- Mockup URL: ${mockup?.url ?? "None yet"}`,
    ...((audit?.recommendations.length ? audit.recommendations : ["No audit recommendations yet."]).map((item) => `- ${item}`)),
    "",
    "## Outcome Summary",
    `- Last action: ${lead.state}`,
    `- Approval: ${approval?.approval ?? "pending"}`,
    `- Approval notes: ${approval?.notes ?? "None"}`,
    "",
    "## Reusable Learnings",
    ...((score?.reasons.length ? score.reasons.slice(0, 3) : ["No reusable learnings yet."]).map((item) => `- ${item}`)),
    ""
  ].join("\n");
  await writeFile(notePath, content, "utf8");
}

async function writePatternNote(baseDir: string, pattern: LearningPattern): Promise<void> {
  const notePath = path.join(baseDir, `${slugify(pattern.patternId)}.md`);
  const content = [
    frontmatter({
      pattern_id: pattern.patternId,
      scope: pattern.scope,
      kind: pattern.kind,
      confidence: pattern.confidence.toFixed(2),
      applies_to: pattern.appliesTo.join(","),
      last_updated: pattern.lastUpdated
    }),
    `# ${pattern.kind}`,
    "",
    "## Evidence",
    ...(pattern.evidence.map((item) => `- ${item}`)),
    "",
    "## Recommendation",
    pattern.recommendation,
    ""
  ].join("\n");
  await writeFile(notePath, content, "utf8");
}

async function writeRunNote(
  baseDir: string,
  snapshot: CrmSnapshot,
  learningState: LearningState,
  runType: "daily" | "weekly" | "feedback",
  runSummary: Record<string, unknown>
): Promise<string> {
  const runDate = nowIso().slice(0, 10);
  const notePath = path.join(baseDir, `${runDate}-${runType}.md`);
  const content = [
    frontmatter({
      run_date: runDate,
      qualified_count: snapshot.scores.filter((item) => item.qualified).length,
      draft_count: snapshot.drafts.length,
      reply_summary: snapshot.leads.filter((lead) => lead.state === "replied").length,
      applied_rule_changes: learningState.proposedChanges.length
    }),
    `# ${runType === "daily" ? "Daily" : runType === "weekly" ? "Weekly" : "Feedback"} Memory Summary`,
    "",
    "## Counts",
    `- Leads in CRM: ${snapshot.leads.length}`,
    `- Qualified: ${snapshot.scores.filter((item) => item.qualified).length}`,
    `- Drafts: ${snapshot.drafts.length}`,
    `- Replies: ${snapshot.leads.filter((lead) => lead.state === "replied").length}`,
    `- Comparative analyses: ${snapshot.analyses.length}`,
    "",
    "## Strongest Patterns",
    ...((learningState.patterns.length ? learningState.patterns.slice(0, 5).map((pattern) => `- ${pattern.kind}: ${pattern.recommendation}`) : ["- None"])),
    "",
    "## Candidate Rule Changes",
    ...((learningState.proposedChanges.length ? learningState.proposedChanges : ["None"]).map((item) => `- ${item}`)),
    "",
    "## Run Summary",
    "```json",
    JSON.stringify(runSummary, null, 2),
    "```",
    ""
  ].join("\n");
  await writeFile(notePath, content, "utf8");
  return notePath;
}

async function writeDecisionNote(baseDir: string, summary: string, changes: string[], createdAt: string): Promise<void> {
  const notePath = path.join(baseDir, `${createdAt.slice(0, 10)}-${slugify(summary).slice(0, 40) || "decision"}.md`);
  const content = [
    frontmatter({
      decision_date: createdAt,
      source: "workflow_feedback"
    }),
    "# Feedback Decision",
    "",
    summary,
    "",
    "## Applied Changes",
    ...((changes.length ? changes : ["None"]).map((item) => `- ${item}`)),
    ""
  ].join("\n");
  await writeFile(notePath, content, "utf8");
}

function frontmatter(values: Record<string, string | number>): string {
  const body = Object.entries(values)
    .map(([key, value]) => `${key}: "${String(value).replace(/"/g, '\\"')}"`)
    .join("\n");
  return `---\n${body}\n---`;
}
