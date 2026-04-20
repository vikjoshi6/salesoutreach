import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Audit, CrmSnapshot, Lead, Mockup, OutreachDraft } from "./types.js";
import { outreachBlockers } from "./compliance.js";
import { createMockup } from "./mockup.js";
import { ensureDir, nowIso, slugify } from "./utils.js";

export async function prepareOutreach(snapshot: CrmSnapshot, config: AppConfig): Promise<{ prepared: number; blocked: number }> {
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
    const draft = await createDraft(config, lead, audit, mockup);
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
  const observations = score?.reasons.length ? score.reasons : ["The current online presence has room for a clearer conversion path."];
  const recommendations = [
    "Put quote and service-area actions above the fold.",
    "Add proof points that match the local homeowner's concern.",
    "Use a simple AI intake path for after-hours questions."
  ];
  return { leadId: lead.id, observations, recommendations, createdAt: nowIso() };
}

async function createDraft(config: AppConfig, lead: Lead, audit: Audit, mockup: Mockup): Promise<OutreachDraft> {
  const subject = `Quick website idea for ${lead.businessName}`;
  const body = [
    `Hi ${lead.businessName} team,`,
    "",
    `I was looking at local ${segmentLabel(lead.segment)} companies around ${config.TARGET_METRO} and noticed a practical opportunity to make the first website visit turn into a quote request faster.`,
    `The main thing I noticed: ${audit.observations[0]}`,
    "",
    `I put together a quick landing page mockup here: ${mockup.url}`,
    `To be clear, this is not meant to be a full website mockup. It is a focused landing page concept to show how the first impression, copy, visuals, and quote flow could feel for your business.`,
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
