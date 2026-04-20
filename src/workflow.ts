import type { AppConfig } from "./config.js";
import type { Repository } from "./store.js";
import { discoverLeads } from "./discovery.js";
import { enrichLeads } from "./enrichment.js";
import { prepareOutreach } from "./outreach.js";
import { writeDailyReport, writeWeeklyReport } from "./reports.js";
import { scoreLeads } from "./scoring.js";

export async function runDailyWorkflow(repo: Repository, config: AppConfig): Promise<Record<string, unknown>> {
  const run = await repo.startRun("daily");
  const errors: string[] = [];
  try {
    const snapshot = await repo.load();
    const discovery = await discoverLeads(snapshot, config);
    const enrichment = await enrichLeads(snapshot);
    const scoring = scoreLeads(snapshot);
    const outreach = await prepareOutreach(snapshot, config);
    const report = await writeDailyReport(snapshot, config);
    const summary = { discovery, enrichment, scoring, outreach, report };
    await repo.save(snapshot);
    await repo.finishRun(run, "completed", summary, errors);
    return summary;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    await repo.finishRun(run, "failed", {}, errors);
    throw error;
  }
}

export async function runWeeklyWorkflow(repo: Repository, config: AppConfig): Promise<Record<string, unknown>> {
  const run = await repo.startRun("weekly");
  try {
    const snapshot = await repo.load();
    const report = await writeWeeklyReport(snapshot, config);
    await repo.finishRun(run, "completed", report);
    return report;
  } catch (error) {
    const errors = [error instanceof Error ? error.message : String(error)];
    await repo.finishRun(run, "failed", {}, errors);
    throw error;
  }
}
