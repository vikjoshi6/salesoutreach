import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import type { Audit, Lead, Mockup } from "./types.js";
import { ensureDir, escapeHtml, nowIso, slugify } from "./utils.js";

export async function createMockup(config: AppConfig, lead: Lead, audit: Audit): Promise<Mockup> {
  const slug = slugify(`${lead.businessName}-${lead.id.slice(0, 8)}`);
  const dir = path.join(config.rootDir, "public", "mockups", slug);
  await ensureDir(dir);
  const localPath = path.join(dir, "index.html");
  const url = `${config.MOCKUP_BASE_URL.replace(/\/$/, "")}/mockups/${slug}/`;
  await writeFile(localPath, renderMockupHtml(config, lead, audit), "utf8");
  return { leadId: lead.id, url, localPath, createdAt: nowIso() };
}

function renderMockupHtml(config: AppConfig, lead: Lead, audit: Audit): string {
  const headline =
    lead.segment === "roofing"
      ? "Storm-ready roofing help, one tap away"
      : lead.segment === "hvac_plumbing"
        ? "Fast service calls without phone tag"
        : "Outdoor spaces planned before the first visit";
  const cta = lead.segment === "landscaping" ? "Request a yard plan" : "Request a fast quote";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(lead.businessName)} mockup</title>
  <style>
    :root { font-family: Arial, sans-serif; color: #132018; background: #f6f8f7; }
    body { margin: 0; }
    main { min-height: 100vh; display: grid; grid-template-rows: auto 1fr auto; }
    header, section, footer { padding: 28px max(24px, calc((100vw - 1040px) / 2)); }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; background: #ffffff; border-bottom: 1px solid #dce4df; }
    .brand { font-size: 18px; font-weight: 700; }
    .phone { color: #315c45; font-weight: 700; }
    .hero { display: grid; align-content: center; gap: 20px; background: linear-gradient(135deg, #eaf2ee, #ffffff); }
    h1 { max-width: 680px; font-size: clamp(38px, 6vw, 72px); line-height: 1; margin: 0; letter-spacing: 0; }
    p { max-width: 640px; font-size: 18px; line-height: 1.6; }
    .cta { display: inline-flex; width: fit-content; border-radius: 8px; background: #1f6b47; color: #fff; padding: 14px 18px; text-decoration: none; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .item { background: #fff; border: 1px solid #dce4df; border-radius: 8px; padding: 18px; }
    footer { color: #516157; }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="brand">${escapeHtml(lead.businessName)}</div>
      <div class="phone">${escapeHtml(lead.phone ?? "Call for service")}</div>
    </header>
    <section class="hero">
      <h1>${headline}</h1>
      <p>A faster homepage concept for ${escapeHtml(config.TARGET_METRO)} homeowners who need clear service options, proof, and a simple next step.</p>
      <a class="cta" href="#contact">${cta}</a>
    </section>
    <section class="grid">
      ${audit.recommendations.map((item) => `<div class="item">${escapeHtml(item)}</div>`).join("\n      ")}
    </section>
    <footer id="contact">Concept preview prepared by ${escapeHtml(config.AGENCY_NAME)}.</footer>
  </main>
</body>
</html>
`;
}
