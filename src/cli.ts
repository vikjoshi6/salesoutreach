import { loadConfig } from "./config.js";
import { createRepository } from "./store.js";
import { discoverLeads } from "./discovery.js";
import { enrichLeads } from "./enrichment.js";
import { scoreLeads } from "./scoring.js";
import { prepareOutreach } from "./outreach.js";
import { writeDailyReport } from "./reports.js";
import { runDailyWorkflow, runWeeklyWorkflow } from "./workflow.js";

const command = process.argv[2];
const config = loadConfig();
const repo = createRepository(config);

async function main(): Promise<void> {
  if (command === "workflow:daily") {
    console.log(JSON.stringify(await runDailyWorkflow(repo, config), null, 2));
    return;
  }
  if (command === "workflow:weekly") {
    console.log(JSON.stringify(await runWeeklyWorkflow(repo, config), null, 2));
    return;
  }

  const snapshot = await repo.load();
  let result: unknown;
  if (command === "leads:discover") result = await discoverLeads(snapshot, config);
  else if (command === "leads:enrich") result = await enrichLeads(snapshot);
  else if (command === "leads:score") result = scoreLeads(snapshot);
  else if (command === "outreach:prepare") result = await prepareOutreach(snapshot, config);
  else if (command === "reports:daily") result = await writeDailyReport(snapshot, config);
  else throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  await repo.save(snapshot);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
