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
  const profile = segmentProfile(lead.segment);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(lead.businessName)} mockup</title>
  <style>
    :root {
      font-family: Arial, Helvetica, sans-serif;
      color: #111513;
      background: #f7f7f4;
      letter-spacing: 0;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f7f4; }
    a { color: inherit; }
    .shell { min-height: 100vh; background: #f7f7f4; }
    .topbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      padding: 16px max(22px, calc((100vw - 1200px) / 2));
      background: rgba(10, 14, 12, 0.78);
      color: #fff;
      backdrop-filter: blur(18px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    }
    .brandmark { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .mark {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #111513;
      background: #d7b46a;
      font-weight: 800;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
    }
    .brand { font-size: 17px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0; }
    .nav { display: flex; align-items: center; gap: 18px; color: rgba(255,255,255,0.86); font-size: 14px; }
    .nav a { text-decoration: none; }
    .call { border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; padding: 10px 13px; font-weight: 800; color: #111513; text-decoration: none; background: #fff; }
    .hero {
      min-height: 92vh;
      display: grid;
      grid-template-columns: minmax(0, 1.04fr) minmax(330px, 0.76fr);
      gap: 44px;
      align-items: center;
      padding: 118px max(22px, calc((100vw - 1200px) / 2)) 44px;
      background:
        radial-gradient(circle at 78% 18%, rgba(215,180,106,0.28), transparent 28%),
        linear-gradient(90deg, rgba(6,10,8,0.94), rgba(9,14,12,0.72) 45%, rgba(9,14,12,0.18)),
        url("${profile.image}") center/cover;
      color: #fff;
    }
    .eyebrow { width: fit-content; border: 1px solid rgba(215,180,106,0.62); border-radius: 8px; padding: 9px 11px; font-size: 13px; font-weight: 800; text-transform: uppercase; color: #f4db9d; background: rgba(0,0,0,0.18); }
    h1 { max-width: 820px; font-size: clamp(46px, 6vw, 88px); line-height: 0.95; margin: 18px 0; letter-spacing: 0; }
    .lead { max-width: 680px; font-size: 19px; line-height: 1.6; color: rgba(255,255,255,0.88); }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
    .primary, .secondary { border-radius: 8px; padding: 15px 18px; text-decoration: none; font-weight: 850; }
    .primary { background: #d7b46a; color: #111513; box-shadow: 0 12px 30px rgba(0,0,0,0.2); }
    .secondary { border: 1px solid rgba(255,255,255,0.48); color: #fff; }
    .trust-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 28px; }
    .pill { border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 9px 11px; color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.08); font-size: 14px; }
    .quote-panel { background: rgba(255,255,255,0.96); color: #111513; border-radius: 8px; padding: 24px; box-shadow: 0 28px 90px rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.72); }
    .quote-panel h2 { margin: 0 0 12px; font-size: 24px; }
    .fields { display: grid; gap: 10px; }
    .field { border: 1px solid #d9d7cf; border-radius: 8px; padding: 13px; color: #5b625f; background: #fff; }
    .submit { border: 0; border-radius: 8px; padding: 15px 16px; background: #111513; color: #fff; font-weight: 850; }
    .panel-note { color: #636b66; line-height: 1.5; font-size: 14px; margin-top: 12px; }
    section { padding: 66px max(22px, calc((100vw - 1200px) / 2)); }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #111513; color: #fff; }
    .stat { border: 1px solid rgba(255,255,255,0.16); border-radius: 8px; padding: 22px; }
    .stat strong { display: block; font-size: 36px; margin-bottom: 6px; color: #d7b46a; }
    .section-title { max-width: 760px; margin: 0 0 24px; font-size: clamp(30px, 4vw, 48px); line-height: 1.04; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { background: #fff; border: 1px solid #deddd5; border-radius: 8px; padding: 22px; min-height: 190px; box-shadow: 0 16px 38px rgba(23,29,25,0.06); }
    .card b { display: block; margin-bottom: 10px; font-size: 18px; }
    .band { background: #ffffff; }
    .split { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 34px; align-items: start; }
    .proof-list { display: grid; gap: 12px; }
    .proof { border-left: 4px solid #d7b46a; background: #fbfaf5; padding: 17px; border-radius: 0 8px 8px 0; box-shadow: 0 12px 32px rgba(23,29,25,0.05); }
    .visual-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding-top: 0; }
    .visual { min-height: 220px; border-radius: 8px; background: center/cover; position: relative; overflow: hidden; }
    .visual:after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.36)); }
    .visual.one { background-image: url("${profile.gallery[0]}"); }
    .visual.two { background-image: url("${profile.gallery[1]}"); }
    .visual.three { background-image: url("${profile.gallery[2]}"); }
    .final { background: #1c2723; color: #fff; }
    footer { padding: 24px max(22px, calc((100vw - 1200px) / 2)); color: #5b625f; }
    @media (max-width: 780px) {
      .nav a:not(.call) { display: none; }
      .hero, .split { grid-template-columns: 1fr; }
      .hero { min-height: auto; padding-top: 110px; }
      .quote-panel { max-width: 520px; }
      .stats, .cards, .visual-strip { grid-template-columns: 1fr; }
      .brand { max-width: 220px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brandmark">
        <div class="mark">${escapeHtml(lead.businessName.slice(0, 1).toUpperCase())}</div>
        <div class="brand">${escapeHtml(lead.businessName)}</div>
      </div>
      <nav class="nav">
        <a href="#services">Services</a>
        <a href="#proof">Proof</a>
        <a class="call" href="tel:${escapeHtml((lead.phone ?? "").replace(/\D/g, ""))}">${escapeHtml(lead.phone ?? "Call now")}</a>
      </nav>
    </header>
    <section class="hero">
      <div>
        <div class="eyebrow">${escapeHtml(profile.eyebrow)}</div>
        <h1>${escapeHtml(profile.headline)}</h1>
        <p class="lead">${escapeHtml(profile.subhead)} Built for ${escapeHtml(config.TARGET_METRO)} customers who want confidence before they book.</p>
        <div class="actions">
          <a class="primary" href="#contact">${escapeHtml(profile.cta)}</a>
          <a class="secondary" href="#services">View services</a>
        </div>
        <div class="trust-row">
          <div class="pill">Licensed local crews</div>
          <div class="pill">Photo-first project proof</div>
          <div class="pill">Fast quote follow-up</div>
        </div>
      </div>
      <aside class="quote-panel" id="contact">
        <h2>Request a priority quote</h2>
        <div class="fields">
          <div class="field">Name</div>
          <div class="field">Phone or email</div>
          <div class="field">Project details</div>
          <button class="submit">Send request</button>
        </div>
        <p class="panel-note">A production build would connect this to phone, text, email, and AI intake routing.</p>
      </aside>
    </section>
    <section class="stats">
      <div class="stat"><strong>24 hr</strong>Response expectation</div>
      <div class="stat"><strong>GTA</strong>Local service coverage</div>
      <div class="stat"><strong>Easy</strong>Call, text, or quote request</div>
    </section>
    <section id="services" class="band">
      <h2 class="section-title">A cleaner path from search to booked work.</h2>
      <div class="cards">
        ${profile.services.map((item) => `<div class="card"><b>${escapeHtml(item.title)}</b>${escapeHtml(item.body)}</div>`).join("\n        ")}
      </div>
    </section>
    <section class="visual-strip" aria-label="Project gallery preview">
      <div class="visual one"></div>
      <div class="visual two"></div>
      <div class="visual three"></div>
    </section>
    <section id="proof">
      <div class="split">
        <h2 class="section-title">What this concept fixes first.</h2>
        <div class="proof-list">
          ${audit.recommendations.map((item) => `<div class="proof">${escapeHtml(item)}</div>`).join("\n          ")}
        </div>
      </div>
    </section>
    <section class="final">
      <h2 class="section-title">Ready for customers who are comparing options today.</h2>
      <p class="lead">This concept uses a stronger visual first impression, faster quote flow, and clearer trust cues without making the site feel overbuilt.</p>
    </section>
    <footer>Concept preview prepared by ${escapeHtml(config.AGENCY_NAME)}. Not affiliated with ${escapeHtml(lead.businessName)}.</footer>
  </main>
</body>
</html>
`;
}

function segmentProfile(segment: Lead["segment"]): {
  eyebrow: string;
  headline: string;
  subhead: string;
  cta: string;
  image: string;
  gallery: string[];
  services: Array<{ title: string; body: string }>;
} {
  if (segment === "roofing") {
    return {
      eyebrow: "Premium roofing and exterior protection",
      headline: "Metal roofing built to protect what matters.",
      subhead: "A high-trust homepage concept with premium visuals, project confidence, and a quote flow that feels worthy of a major home investment.",
      cta: "Request a roofing quote",
      image: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1800&q=82",
      gallery: [
        "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80"
      ],
      services: [
        { title: "Metal roof systems", body: "Durable roof options presented with clear benefits, timelines, and homeowner confidence cues." },
        { title: "Repair and replacement", body: "A direct path for urgent needs, aging roofs, leaks, and inspection requests." },
        { title: "Financing-ready estimates", body: "A polished quote journey that makes it easier to start the conversation." }
      ]
    };
  }
  if (segment === "hvac_plumbing") {
    return {
      eyebrow: "Reliable comfort and mechanical service",
      headline: "Fast comfort service without the back and forth.",
      subhead: "A modern service-site concept built around emergency trust, booking clarity, and after-hours intake.",
      cta: "Book service",
      image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&w=1800&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80"
      ],
      services: [
        { title: "Emergency service", body: "Prominent call and intake paths for customers who need help quickly." },
        { title: "Installations", body: "Clean service pages for systems, upgrades, and project requests." },
        { title: "Maintenance plans", body: "A recurring revenue path with clearer homeowner value and reminders." }
      ]
    };
  }
  return {
    eyebrow: "Landscape design and property care",
    headline: "Outdoor spaces that look planned from day one.",
    subhead: "A high-end visual concept for homeowners comparing landscaping, interlocking, and seasonal property care.",
      cta: "Request a yard plan",
      image: "https://images.unsplash.com/photo-1558904541-efa843a96f01?auto=format&fit=crop&w=1800&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1558521958-0a228e77f984?auto=format&fit=crop&w=900&q=80",
        "https://images.unsplash.com/photo-1598902108854-10e335adac99?auto=format&fit=crop&w=900&q=80"
      ],
    services: [
      { title: "Landscape design", body: "A more visual path for customers who need inspiration and a clear starting point." },
      { title: "Interlocking and hardscape", body: "Project proof and structured quote requests for higher-value work." },
      { title: "Seasonal care", body: "Simple recurring-service positioning for maintenance and snow work." }
    ]
  };
}
