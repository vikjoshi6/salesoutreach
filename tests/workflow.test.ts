import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { discoverLeads } from "../src/discovery.js";
import { buildEnrichment } from "../src/enrichment.js";
import { defaultLearningState, deriveLearningUpdate, saveLearningState } from "../src/learning-state.js";
import { syncObsidianMemory } from "../src/obsidian.js";
import { prepareOutreach } from "../src/outreach.js";
import { writeDailyReport } from "../src/reports.js";
import { scoreEnrichment } from "../src/scoring.js";
import type { CrmSnapshot, Lead } from "../src/types.js";
import { id, nowIso } from "../src/utils.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "outreach-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function snapshot(): CrmSnapshot {
  return { leads: [], sources: [], enrichments: [], scores: [], audits: [], mockups: [], drafts: [], approvals: [], suppressions: [], runs: [] };
}

function configured() {
  return loadConfig({
    rootDir: tmp,
    outputDate: "2026-04-20",
    TARGET_METRO: "Test Metro",
    AGENCY_NAME: "Test Agency",
    SENDER_NAME: "Test Sender",
    REPLY_EMAIL: "sender@example.com",
    PHYSICAL_MAILING_ADDRESS: "123 Main St, Test Metro",
    MOCKUP_BASE_URL: "https://mockups.example.com",
    ENABLE_GOOGLE_PLACES_DISCOVERY: false,
    GOOGLE_PLACES_API_KEY: "",
    OBSIDIAN_ENABLED: true,
    OBSIDIAN_VAULT_PATH: path.join(tmp, "Codexbot"),
    AUTO_TUNE_DISCOVERY_MIN: 8,
    AUTO_TUNE_DISCOVERY_MAX: 14,
    AUTO_TUNE_DRAFT_MIN: 3,
    AUTO_TUNE_DRAFT_MAX: 8
  });
}

function lead(overrides: Partial<Lead> = {}): Lead {
  const createdAt = nowIso();
  return {
    id: id(),
    segment: "roofing",
    businessName: "Test Roofing",
    website: "https://test-roofing.example",
    contactEmail: "owner@test-roofing.example",
    phone: "555-0100",
    metro: "Test Metro",
    state: "qualified",
    normalizedKey: "domain:test-roofing.example",
    source: "test",
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

describe("prospecting workflow", () => {
  it("deduplicates discovered businesses by normalized domain", async () => {
    await writeFile(
      path.join(tmp, "data", "input", "leads.csv"),
      "segment,business_name,website,contact_email,phone,source\nroofing,A,https://a.example,a@a.example,555-0101,test\nroofing,A LLC,https://a.example,other@a.example,555-0102,test\n",
      "utf8"
    ).catch(async () => {
      await import("../src/utils.js").then(({ ensureDir }) => ensureDir(path.join(tmp, "data", "input")));
      await writeFile(
        path.join(tmp, "data", "input", "leads.csv"),
        "segment,business_name,website,contact_email,phone,source\nroofing,A,https://a.example,a@a.example,555-0101,test\nroofing,A LLC,https://a.example,other@a.example,555-0102,test\n",
        "utf8"
      );
    });
    const data = snapshot();
    const result = await discoverLeads(data, configured());
    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("scores missing conversion and social signals higher than optimized presence", () => {
    const weak = scoreEnrichment({
      leadId: "1",
      hasWebsite: true,
      hasContactEmail: true,
      hasPhone: true,
      hasBookingSignal: false,
      hasSocialSignal: false,
      hasAiChatSignal: false,
      websiteLooksModern: false,
      notes: []
    });
    const optimized = scoreEnrichment({
      leadId: "2",
      hasWebsite: true,
      hasContactEmail: true,
      hasPhone: true,
      hasBookingSignal: true,
      hasSocialSignal: true,
      hasAiChatSignal: true,
      websiteLooksModern: true,
      notes: []
    });
    expect(weak.score).toBeGreaterThan(optimized.score);
    expect(weak.qualified).toBe(true);
  });

  it("blocks outreach when sender identity is incomplete", async () => {
    const data = snapshot();
    data.leads.push(lead());
    data.scores.push({ leadId: data.leads[0].id, score: 90, reasons: ["Needs clearer quote path."], qualified: true, createdAt: nowIso() });
    const result = await prepareOutreach(data, loadConfig({
      rootDir: tmp,
      outputDate: "2026-04-20",
      TARGET_METRO: "UNCONFIGURED_METRO",
      AGENCY_NAME: "UNCONFIGURED_AGENCY",
      SENDER_NAME: "UNCONFIGURED_SENDER",
      REPLY_EMAIL: "",
      PHYSICAL_MAILING_ADDRESS: "",
      ENABLE_GOOGLE_PLACES_DISCOVERY: false,
      GOOGLE_PLACES_API_KEY: ""
    }));
    expect(result.blocked).toBe(1);
    expect(data.drafts).toHaveLength(0);
  });

  it("creates mockup pages and draft files without attachments", async () => {
    const data = snapshot();
    data.leads.push(lead());
    data.scores.push({ leadId: data.leads[0].id, score: 90, reasons: ["No clear booking path."], qualified: true, createdAt: nowIso() });
    const result = await prepareOutreach(data, configured());
    expect(result.prepared).toBe(1);
    expect(data.mockups[0].url).toContain("/mockups/");
    const draft = await readFile(data.drafts[0].draftPath, "utf8");
    expect(draft).toContain("Subject: Quick website idea");
    expect(draft).not.toMatch(/attachment/i);
  });

  it("blocks suppressed recipients", async () => {
    const data = snapshot();
    data.leads.push(lead());
    data.scores.push({ leadId: data.leads[0].id, score: 90, reasons: ["No AI/chat intake signal."], qualified: true, createdAt: nowIso() });
    data.suppressions.push({ email: "owner@test-roofing.example", reason: "opt-out", createdAt: nowIso() });
    const result = await prepareOutreach(data, configured());
    expect(result.blocked).toBe(1);
    expect(data.drafts).toHaveLength(0);
  });

  it("writes daily review output including failure/blocker visibility", async () => {
    const data = snapshot();
    data.leads.push(lead({ state: "draft_ready" }));
    data.scores.push({ leadId: data.leads[0].id, score: 90, reasons: ["No social signal."], qualified: true, createdAt: nowIso() });
    data.runs.push({ id: "run", runType: "daily", status: "running", startedAt: nowIso(), summary: {}, errors: ["Blocked lead: Missing email."] });
    const result = await writeDailyReport(data, configured());
    const summary = await readFile(result.summaryPath, "utf8");
    expect(summary).toContain("Blocked lead");
  });

  it("enrichment marks sample test domains as not modern to drive review", async () => {
    const enrichment = await buildEnrichment(lead({ website: "https://sample.test" }));
    expect(enrichment.websiteLooksModern).toBe(false);
  });

  it("writes structured Obsidian notes for companies, patterns, and runs", async () => {
    const vault = path.join(tmp, "Codexbot");
    await import("../src/utils.js").then(({ ensureDir }) => ensureDir(path.join(vault, ".obsidian")));
    await writeFile(path.join(vault, ".obsidian", "workspace.json"), "{}", "utf8");
    const data = snapshot();
    data.leads.push(lead({ state: "draft_ready" }));
    data.enrichments.push({
      leadId: data.leads[0].id,
      hasWebsite: true,
      hasContactEmail: true,
      hasPhone: true,
      hasBookingSignal: false,
      hasSocialSignal: false,
      hasAiChatSignal: false,
      websiteLooksModern: false,
      notes: ["No social profile signal found."]
    });
    data.scores.push({ leadId: data.leads[0].id, score: 55, reasons: ["Website may need a modernization review."], qualified: true, createdAt: nowIso() });
    const state = deriveLearningUpdate(data, defaultLearningState(configured()), "daily_run");
    await saveLearningState(configured(), state);
    const result = await syncObsidianMemory(data, configured(), state, "daily", { ok: true });
    expect(result.companyNotes).toBe(1);
    const companyNote = await readFile(path.join(vault, "Memory", "Companies", "test-roofing.md"), "utf8");
    expect(companyNote).toContain('lead_id:');
    expect(companyNote).toContain("# Test Roofing");
  });

  it("keeps cadence learning within configured bounds", () => {
    const data = snapshot();
    for (let index = 0; index < 10; index += 1) {
      const record = lead({ id: id(), normalizedKey: `domain:test-${index}.example` });
      data.leads.push(record);
      data.scores.push({ leadId: record.id, score: 70, reasons: ["Website may need a modernization review."], qualified: true, createdAt: nowIso() });
      data.approvals.push({ leadId: record.id, approval: "approved", createdAt: nowIso() });
    }
    const updated = deriveLearningUpdate(data, defaultLearningState(configured()), "manual_feedback");
    expect(updated.cadence.discoveryLimit).toBeGreaterThanOrEqual(configured().AUTO_TUNE_DISCOVERY_MIN);
    expect(updated.cadence.discoveryLimit).toBeLessThanOrEqual(configured().AUTO_TUNE_DISCOVERY_MAX);
    expect(updated.cadence.draftLimit).toBeGreaterThanOrEqual(configured().AUTO_TUNE_DRAFT_MIN);
    expect(updated.cadence.draftLimit).toBeLessThanOrEqual(configured().AUTO_TUNE_DRAFT_MAX);
  });

  it("fails clearly when obsidian is enabled and the vault is missing", async () => {
    const data = snapshot();
    await expect(syncObsidianMemory(data, configured(), defaultLearningState(configured()), "daily", {})).rejects.toThrow("Obsidian vault is not ready");
  });
});
