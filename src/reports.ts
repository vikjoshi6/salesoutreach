import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { CrmSnapshot, Lead } from "./types.js";
import { csvEscape, ensureDir } from "./utils.js";

const headers = [
  "run_date",
  "segment",
  "business_name",
  "website",
  "contact_email",
  "phone",
  "source",
  "score",
  "score_reasons",
  "top_comparative_gaps",
  "competitor_count",
  "underperformed_competitor_median",
  "analysis_table_included",
  "qualified",
  "mockup_url",
  "draft_subject",
  "draft_status",
  "approval",
  "sent_date",
  "reply_status",
  "next_action",
  "suppressed"
];

export async function writeDailyReport(snapshot: CrmSnapshot, config: AppConfig): Promise<{ csvPath: string; summaryPath: string; crmExportDir: string }> {
  const dir = path.join(config.rootDir, "outputs", config.outputDate);
  await ensureDir(dir);
  const csvPath = path.join(dir, "pipeline-review.csv");
  const summaryPath = path.join(dir, "daily-summary.md");
  const rows = snapshot.leads.map((lead) => rowForLead(snapshot, config, lead));
  await writeFile(csvPath, [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))].join("\n"), "utf8");
  const crmExportDir = await writeCrmTableExports(snapshot, config, dir);
  await writeFile(summaryPath, renderDailySummary(snapshot, csvPath, crmExportDir), "utf8");
  return { csvPath, summaryPath, crmExportDir };
}

export async function writeWeeklyReport(snapshot: CrmSnapshot, config: AppConfig): Promise<{ reportPath: string }> {
  const dir = path.join(config.rootDir, "outputs", config.outputDate);
  await ensureDir(dir);
  const reportPath = path.join(dir, "weekly-performance.md");
  const bySegment = ["roofing", "hvac_plumbing", "landscaping"].map((segment) => {
    const leads = snapshot.leads.filter((lead) => lead.segment === segment);
    const drafted = leads.filter((lead) => lead.state === "draft_ready").length;
    const qualified = leads.filter((lead) => ["qualified", "draft_ready", "approved", "sent_manual", "replied"].includes(lead.state)).length;
    return { segment, researched: leads.length, qualified, drafted };
  });
  const best = [...bySegment].sort((a, b) => b.qualified - a.qualified)[0];
  const body = [
    "# Weekly Prospecting Review",
    "",
    "| Segment | Researched | Qualified | Drafted |",
    "| --- | ---: | ---: | ---: |",
    ...bySegment.map((item) => `| ${item.segment} | ${item.researched} | ${item.qualified} | ${item.drafted} |`),
    "",
    `Recommendation: keep equal weighting unless ${best.segment} continues to outperform for another week.`
  ].join("\n");
  await writeFile(reportPath, body, "utf8");
  return { reportPath };
}

function rowForLead(snapshot: CrmSnapshot, config: AppConfig, lead: Lead): Record<string, string | number | boolean> {
  const score = snapshot.scores.find((item) => item.leadId === lead.id);
  const mockup = snapshot.mockups.find((item) => item.leadId === lead.id);
  const draft = snapshot.drafts.find((item) => item.leadId === lead.id);
  const approval = snapshot.approvals.find((item) => item.leadId === lead.id);
  const analysis = snapshot.analyses.find((item) => item.leadId === lead.id);
  const suppressed = lead.contactEmail ? snapshot.suppressions.some((item) => item.email === lead.contactEmail) : false;
  return {
    run_date: config.outputDate,
    segment: lead.segment,
    business_name: lead.businessName,
    website: lead.website ?? "",
    contact_email: lead.contactEmail ?? "",
    phone: lead.phone ?? "",
    source: lead.source,
    score: score?.score ?? "",
    score_reasons: score?.reasons.join("; ") ?? "",
    top_comparative_gaps: analysis?.rankedGaps.slice(0, 3).join("; ") ?? "",
    competitor_count: analysis?.competitorSet.length ?? 0,
    underperformed_competitor_median: analysis?.underperformsCompetitorMedian ?? false,
    analysis_table_included: analysis?.emailTableIncluded ?? false,
    qualified: score?.qualified ?? false,
    mockup_url: mockup?.url ?? "",
    draft_subject: draft?.subject ?? "",
    draft_status: draft?.status ?? "",
    approval: approval?.approval ?? "",
    sent_date: "",
    reply_status: "",
    next_action: nextAction(lead),
    suppressed
  };
}

function nextAction(lead: Lead): string {
  if (lead.state === "draft_ready") return "Review Gmail-ready draft and send manually if approved.";
  if (lead.state === "qualified") return "Prepare outreach draft.";
  if (lead.state === "scored") return "Manual review or contact research if not qualified.";
  if (lead.state === "suppressed") return "Do not contact.";
  return "Continue workflow.";
}

async function writeCrmTableExports(snapshot: CrmSnapshot, _config: AppConfig, outputDir: string): Promise<string> {
  const crmDir = path.join(outputDir, "google-sheets-crm");
  await ensureDir(crmDir);
  await writeCsv(path.join(crmDir, "leads.csv"), ["id", "segment", "business_name", "website", "contact_email", "phone", "metro", "state", "normalized_key", "source", "created_at", "updated_at"], snapshot.leads.map((lead) => ({
    id: lead.id,
    segment: lead.segment,
    business_name: lead.businessName,
    website: lead.website ?? "",
    contact_email: lead.contactEmail ?? "",
    phone: lead.phone ?? "",
    metro: lead.metro,
    state: lead.state,
    normalized_key: lead.normalizedKey,
    source: lead.source,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt
  })));
  await writeCsv(path.join(crmDir, "scores.csv"), ["lead_id", "score", "qualified", "reasons", "created_at"], snapshot.scores.map((score) => ({
    lead_id: score.leadId,
    score: score.score,
    qualified: score.qualified,
    reasons: score.reasons.join("; "),
    created_at: score.createdAt
  })));
  await writeCsv(
    path.join(crmDir, "comparative_analyses.csv"),
    ["lead_id", "summary_findings", "ranked_gaps", "competitor_count", "underperforms_competitor_median", "email_table_included", "degraded_mode", "created_at"],
    snapshot.analyses.map((analysis) => ({
      lead_id: analysis.leadId,
      summary_findings: analysis.summaryFindings.join("; "),
      ranked_gaps: analysis.rankedGaps.join("; "),
      competitor_count: analysis.competitorSet.length,
      underperforms_competitor_median: analysis.underperformsCompetitorMedian,
      email_table_included: analysis.emailTableIncluded,
      degraded_mode: analysis.degradedMode ?? "",
      created_at: analysis.createdAt
    }))
  );
  await writeCsv(
    path.join(crmDir, "competitor_snapshots.csv"),
    ["id", "lead_id", "business_name", "website", "source", "rubric", "notes", "created_at"],
    snapshot.competitors.map((competitor) => ({
      id: competitor.id,
      lead_id: competitor.leadId,
      business_name: competitor.businessName,
      website: competitor.website,
      source: competitor.source,
      rubric: JSON.stringify(competitor.rubric),
      notes: competitor.notes.join("; "),
      created_at: competitor.createdAt
    }))
  );
  await writeCsv(path.join(crmDir, "audits.csv"), ["lead_id", "observations", "recommendations", "created_at"], snapshot.audits.map((audit) => ({
    lead_id: audit.leadId,
    observations: audit.observations.join("; "),
    recommendations: audit.recommendations.join("; "),
    created_at: audit.createdAt
  })));
  await writeCsv(path.join(crmDir, "mockups.csv"), ["lead_id", "url", "local_path", "created_at"], snapshot.mockups.map((mockup) => ({
    lead_id: mockup.leadId,
    url: mockup.url,
    local_path: mockup.localPath,
    created_at: mockup.createdAt
  })));
  await writeCsv(path.join(crmDir, "drafts.csv"), ["lead_id", "subject", "draft_path", "status", "created_at"], snapshot.drafts.map((draft) => ({
    lead_id: draft.leadId,
    subject: draft.subject,
    draft_path: draft.draftPath,
    status: draft.status,
    created_at: draft.createdAt
  })));
  await writeCsv(path.join(crmDir, "approvals.csv"), ["lead_id", "approval", "notes", "created_at"], snapshot.approvals.map((approval) => ({
    lead_id: approval.leadId,
    approval: approval.approval,
    notes: approval.notes ?? "",
    created_at: approval.createdAt
  })));
  await writeCsv(path.join(crmDir, "suppression_list.csv"), ["email", "domain", "reason", "created_at"], snapshot.suppressions.map((suppression) => ({
    email: suppression.email ?? "",
    domain: suppression.domain ?? "",
    reason: suppression.reason,
    created_at: suppression.createdAt
  })));
  await writeCsv(path.join(crmDir, "workflow_runs.csv"), ["id", "run_type", "status", "started_at", "finished_at", "summary", "errors"], snapshot.runs.map((run) => ({
    id: run.id,
    run_type: run.runType,
    status: run.status,
    started_at: run.startedAt,
    finished_at: run.finishedAt ?? "",
    summary: JSON.stringify(run.summary),
    errors: run.errors.join("; ")
  })));
  return crmDir;
}

async function writeCsv(file: string, fileHeaders: string[], rows: Array<Record<string, unknown>>): Promise<void> {
  const body = rows.map((row) => fileHeaders.map((header) => csvEscape(row[header] ?? "")).join(","));
  await writeFile(file, [fileHeaders.join(","), ...body].join("\n"), "utf8");
}

function renderDailySummary(snapshot: CrmSnapshot, csvPath: string, crmExportDir: string): string {
  const drafted = snapshot.leads.filter((lead) => lead.state === "draft_ready").length;
  const qualified = snapshot.scores.filter((score) => score.qualified).length;
  const review = snapshot.scores.filter((score) => score.score >= 50 && score.score < 75).length;
  const analyses = snapshot.analyses.length;
  const errors = snapshot.runs.at(-1)?.errors ?? [];
  return [
    "# Daily Prospecting Summary",
    "",
    `Leads in CRM: ${snapshot.leads.length}`,
    `Qualified: ${qualified}`,
    `Manual review: ${review}`,
    `Drafts ready: ${drafted}`,
    `Comparative analyses: ${analyses}`,
    "",
    `Review CSV: ${csvPath}`,
    `Google Sheets CRM exports: ${crmExportDir}`,
    "",
    errors.length ? "## Blockers" : "## Blockers",
    errors.length ? errors.map((error) => `- ${error}`).join("\n") : "- None"
  ].join("\n");
}
