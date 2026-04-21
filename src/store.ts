import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type {
  Approval,
  Audit,
  ComparativeAnalysis,
  CompetitorSnapshot,
  CrmSnapshot,
  Enrichment,
  Lead,
  LeadScore,
  LeadSource,
  Mockup,
  OutreachDraft,
  Suppression,
  WorkflowRun
} from "./types.js";
import type { AppConfig } from "./config.js";
import { usingSupabase } from "./config.js";
import { id, nowIso, readJsonFile, writeJsonFile } from "./utils.js";

const emptySnapshot = (): CrmSnapshot => ({
  leads: [],
  sources: [],
  enrichments: [],
  competitors: [],
  analyses: [],
  scores: [],
  audits: [],
  mockups: [],
  drafts: [],
  approvals: [],
  suppressions: [],
  runs: []
});

export interface Repository {
  load(): Promise<CrmSnapshot>;
  save(snapshot: CrmSnapshot): Promise<void>;
  startRun(type: WorkflowRun["runType"]): Promise<WorkflowRun>;
  finishRun(run: WorkflowRun, status: WorkflowRun["status"], summary: Record<string, unknown>, errors?: string[]): Promise<void>;
}

export class LocalJsonRepository implements Repository {
  constructor(private readonly file: string) {}

  async load(): Promise<CrmSnapshot> {
    return normalizeSnapshot(await readJsonFile(this.file, emptySnapshot()));
  }

  async save(snapshot: CrmSnapshot): Promise<void> {
    await writeJsonFile(this.file, snapshot);
  }

  async startRun(type: WorkflowRun["runType"]): Promise<WorkflowRun> {
    const snapshot = await this.load();
    const run: WorkflowRun = {
      id: id(),
      runType: type,
      status: "running",
      startedAt: nowIso(),
      summary: {},
      errors: []
    };
    snapshot.runs.push(run);
    await this.save(snapshot);
    return run;
  }

  async finishRun(run: WorkflowRun, status: WorkflowRun["status"], summary: Record<string, unknown>, errors: string[] = []): Promise<void> {
    const snapshot = await this.load();
    const existing = snapshot.runs.find((item) => item.id === run.id);
    if (existing) {
      existing.status = status;
      existing.finishedAt = nowIso();
      existing.summary = summary;
      existing.errors = errors;
    }
    await this.save(snapshot);
  }
}

function normalizeSnapshot(snapshot: Partial<CrmSnapshot>): CrmSnapshot {
  return {
    leads: snapshot.leads ?? [],
    sources: snapshot.sources ?? [],
    enrichments: snapshot.enrichments ?? [],
    competitors: snapshot.competitors ?? [],
    analyses: snapshot.analyses ?? [],
    scores: snapshot.scores ?? [],
    audits: snapshot.audits ?? [],
    mockups: snapshot.mockups ?? [],
    drafts: snapshot.drafts ?? [],
    approvals: snapshot.approvals ?? [],
    suppressions: snapshot.suppressions ?? [],
    runs: snapshot.runs ?? []
  };
}

export class SupabaseRepository extends LocalJsonRepository {
  private readonly client;

  constructor(config: AppConfig, fallbackFile: string) {
    super(fallbackFile);
    this.client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
  }

  override async save(snapshot: CrmSnapshot): Promise<void> {
    await super.save(snapshot);
    await this.syncToSupabase(snapshot);
  }

  private async syncToSupabase(snapshot: CrmSnapshot): Promise<void> {
    await this.upsert("leads", snapshot.leads.map(toLeadRow), "normalized_key");
    await this.upsert("lead_sources", snapshot.sources.map(toSourceRow), "id");
    await this.upsert("competitor_snapshots", snapshot.competitors.map(toCompetitorRow), "id");
    await this.upsert("comparative_analyses", snapshot.analyses.map(toAnalysisRow), "lead_id,created_at");
    await this.upsert("lead_scores", snapshot.scores.map(toScoreRow), "lead_id,created_at");
    await this.upsert("audits", snapshot.audits.map(toAuditRow), "lead_id,created_at");
    await this.upsert("mockups", snapshot.mockups.map(toMockupRow), "lead_id,created_at");
    await this.upsert("outreach_drafts", snapshot.drafts.map(toDraftRow), "lead_id,created_at");
    await this.upsert("approvals", snapshot.approvals.map(toApprovalRow), "lead_id,created_at");
    await this.upsertSuppressions(snapshot.suppressions);
    await this.upsert("workflow_runs", snapshot.runs.map(toRunRow), "id");
  }

  private async upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`Supabase upsert failed for ${table}: ${error.message}`);
  }

  private async upsertSuppressions(rows: Suppression[]): Promise<void> {
    const emailRows = rows.filter((row) => row.email).map(toSuppressionRow);
    const domainRows = rows.filter((row) => !row.email && row.domain).map(toSuppressionRow);
    await this.upsert("suppression_list", emailRows, "email");
    await this.upsert("suppression_list", domainRows, "domain");
  }
}

export function createRepository(config: AppConfig): Repository {
  const fallbackFile = path.join(config.rootDir, "data", "local-crm.json");
  return usingSupabase(config) ? new SupabaseRepository(config, fallbackFile) : new LocalJsonRepository(fallbackFile);
}

function toLeadRow(lead: Lead): Record<string, unknown> {
  return {
    id: lead.id,
    segment: lead.segment,
    business_name: lead.businessName,
    website: lead.website,
    contact_email: lead.contactEmail,
    phone: lead.phone,
    metro: lead.metro,
    state: lead.state,
    normalized_key: lead.normalizedKey,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt
  };
}

function toSourceRow(source: LeadSource): Record<string, unknown> {
  return {
    id: source.id,
    lead_id: source.leadId,
    source: source.source,
    external_id: source.externalId,
    metadata: source.metadata,
    created_at: source.createdAt
  };
}

function toScoreRow(score: LeadScore): Record<string, unknown> {
  return {
    lead_id: score.leadId,
    score: score.score,
    reasons: score.reasons,
    qualified: score.qualified,
    created_at: score.createdAt
  };
}

function toCompetitorRow(competitor: CompetitorSnapshot): Record<string, unknown> {
  return {
    id: competitor.id,
    lead_id: competitor.leadId,
    business_name: competitor.businessName,
    website: competitor.website,
    source: competitor.source,
    rubric: competitor.rubric,
    notes: competitor.notes,
    created_at: competitor.createdAt
  };
}

function toAnalysisRow(analysis: ComparativeAnalysis): Record<string, unknown> {
  return {
    lead_id: analysis.leadId,
    summary_findings: analysis.summaryFindings,
    ranked_gaps: analysis.rankedGaps,
    competitor_set: analysis.competitorSet,
    benchmark_rows: analysis.benchmarkRows,
    underperforms_competitor_median: analysis.underperformsCompetitorMedian,
    email_table_included: analysis.emailTableIncluded,
    degraded_mode: analysis.degradedMode,
    created_at: analysis.createdAt
  };
}

function toAuditRow(audit: Audit): Record<string, unknown> {
  return {
    lead_id: audit.leadId,
    observations: audit.observations,
    recommendations: audit.recommendations,
    created_at: audit.createdAt
  };
}

function toMockupRow(mockup: Mockup): Record<string, unknown> {
  return {
    lead_id: mockup.leadId,
    url: mockup.url,
    local_path: mockup.localPath,
    created_at: mockup.createdAt
  };
}

function toDraftRow(draft: OutreachDraft): Record<string, unknown> {
  return {
    lead_id: draft.leadId,
    subject: draft.subject,
    body: draft.body,
    draft_path: draft.draftPath,
    status: draft.status,
    created_at: draft.createdAt
  };
}

function toApprovalRow(approval: Approval): Record<string, unknown> {
  return {
    lead_id: approval.leadId,
    approval: approval.approval,
    notes: approval.notes,
    created_at: approval.createdAt
  };
}

function toSuppressionRow(suppression: Suppression): Record<string, unknown> {
  return {
    email: suppression.email,
    domain: suppression.domain,
    reason: suppression.reason,
    created_at: suppression.createdAt
  };
}

function toRunRow(run: WorkflowRun): Record<string, unknown> {
  return {
    id: run.id,
    run_type: run.runType,
    status: run.status,
    started_at: run.startedAt,
    finished_at: run.finishedAt,
    summary: run.summary,
    errors: run.errors
  };
}
