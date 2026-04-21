import type { AppConfig } from "./config.js";
import { applyLearningConfig, deriveLearningUpdate, loadLearningState, saveLearningState } from "./learning-state.js";
import { syncObsidianMemory } from "./obsidian.js";
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
    const learningState = await loadLearningState(config);
    const effectiveConfig = applyLearningConfig(config, learningState);
    const snapshot = await repo.load();
    const discovery = await discoverLeads(snapshot, effectiveConfig);
    const enrichment = await enrichLeads(snapshot);
    const scoring = scoreLeads(snapshot, learningState);
    const outreach = await prepareOutreach(snapshot, effectiveConfig, learningState);
    const report = await writeDailyReport(snapshot, effectiveConfig);
    const nextLearningState = deriveLearningUpdate(snapshot, learningState, "daily_run");
    await saveLearningState(config, nextLearningState);
    let memory: Record<string, unknown> = {};
    try {
      memory = await syncObsidianMemory(snapshot, config, nextLearningState, "daily", {
        discovery,
        enrichment,
        scoring,
        outreach,
        report
      });
    } catch (memoryError) {
      errors.push(`Obsidian memory sync failed: ${memoryError instanceof Error ? memoryError.message : String(memoryError)}`);
    }
    const summary = { discovery, enrichment, scoring, outreach, report, memory, cadence: nextLearningState.cadence, learning: nextLearningState.proposedChanges };
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
    const learningState = await loadLearningState(config);
    const report = await writeWeeklyReport(snapshot, config);
    const nextLearningState = deriveLearningUpdate(snapshot, learningState, "weekly_review");
    await saveLearningState(config, nextLearningState);
    let memory: Record<string, unknown> = {};
    let memoryError: string | undefined;
    try {
      memory = await syncObsidianMemory(snapshot, config, nextLearningState, "weekly", report);
    } catch (error) {
      memoryError = error instanceof Error ? error.message : String(error);
    }
    const summary = { ...report, memory, learning: nextLearningState.proposedChanges, memoryError };
    await repo.finishRun(run, "completed", summary);
    return summary;
  } catch (error) {
    const errors = [error instanceof Error ? error.message : String(error)];
    await repo.finishRun(run, "failed", {}, errors);
    throw error;
  }
}
