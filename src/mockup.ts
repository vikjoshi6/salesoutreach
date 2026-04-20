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
    .hero-copy { max-width: 700px; color: rgba(255,255,255,0.82); font-size: 16px; line-height: 1.7; margin-top: 16px; }
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
    .section-kicker { color: #8a6b2d; font-weight: 800; text-transform: uppercase; font-size: 13px; margin-bottom: 12px; }
    .section-intro { max-width: 760px; color: #4e5853; line-height: 1.7; font-size: 18px; margin: -8px 0 28px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { background: #fff; border: 1px solid #deddd5; border-radius: 8px; padding: 22px; min-height: 190px; box-shadow: 0 16px 38px rgba(23,29,25,0.06); }
    .card b { display: block; margin-bottom: 10px; font-size: 18px; }
    .card p { margin: 0; color: #4d5752; line-height: 1.6; }
    .card ul { margin: 14px 0 0; padding-left: 18px; color: #4d5752; line-height: 1.65; }
    .band { background: #ffffff; }
    .split { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 34px; align-items: start; }
    .proof-list { display: grid; gap: 12px; }
    .proof { border-left: 4px solid #d7b46a; background: #fbfaf5; padding: 17px; border-radius: 0 8px 8px 0; box-shadow: 0 12px 32px rgba(23,29,25,0.05); }
    .process { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .step { background: #111513; color: #fff; border-radius: 8px; padding: 22px; min-height: 190px; }
    .step span { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: #d7b46a; color: #111513; font-weight: 800; margin-bottom: 18px; }
    .step b { display: block; margin-bottom: 10px; font-size: 18px; }
    .step p { margin: 0; color: rgba(255,255,255,0.78); line-height: 1.6; }
    .visual-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding-top: 0; }
    .visual { min-height: 220px; border-radius: 8px; background: center/cover; position: relative; overflow: hidden; }
    .visual:after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.36)); }
    .visual span { position: absolute; z-index: 1; left: 16px; right: 16px; bottom: 14px; color: #fff; font-weight: 800; text-shadow: 0 2px 18px rgba(0,0,0,0.45); }
    .visual.one { background-image: url("${profile.gallery[0]}"); }
    .visual.two { background-image: url("${profile.gallery[1]}"); }
    .visual.three { background-image: url("${profile.gallery[2]}"); }
    .testimonial { background: #fff; border-radius: 8px; padding: 26px; border: 1px solid #deddd5; box-shadow: 0 16px 38px rgba(23,29,25,0.06); }
    .testimonial p { font-size: 20px; line-height: 1.6; margin: 0 0 14px; }
    .faq { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .faq-item { background: #fff; border: 1px solid #deddd5; border-radius: 8px; padding: 20px; }
    .faq-item b { display: block; margin-bottom: 8px; }
    .faq-item p { margin: 0; color: #4d5752; line-height: 1.6; }
    .final { background: #1c2723; color: #fff; }
    footer { padding: 24px max(22px, calc((100vw - 1200px) / 2)); color: #5b625f; }
    @media (max-width: 780px) {
      .nav a:not(.call) { display: none; }
      .hero, .split { grid-template-columns: 1fr; }
      .hero { min-height: auto; padding-top: 110px; }
      .quote-panel { max-width: 520px; }
      .stats, .cards, .visual-strip, .process, .faq { grid-template-columns: 1fr; }
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
        <p class="hero-copy">${escapeHtml(profile.heroCopy)}</p>
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
      <div class="section-kicker">Services</div>
      <h2 class="section-title">A cleaner path from search to booked work.</h2>
      <p class="section-intro">${escapeHtml(profile.servicesIntro)}</p>
      <div class="cards">
        ${profile.services
          .map(
            (item) =>
              `<div class="card"><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.body)}</p><ul>${item.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul></div>`
          )
          .join("\n        ")}
      </div>
    </section>
    <section class="visual-strip" aria-label="Project gallery preview">
      <div class="visual one"><span>${escapeHtml(profile.galleryCaptions[0])}</span></div>
      <div class="visual two"><span>${escapeHtml(profile.galleryCaptions[1])}</span></div>
      <div class="visual three"><span>${escapeHtml(profile.galleryCaptions[2])}</span></div>
    </section>
    <section class="band">
      <div class="section-kicker">How it works</div>
      <h2 class="section-title">${escapeHtml(profile.processTitle)}</h2>
      <p class="section-intro">${escapeHtml(profile.processIntro)}</p>
      <div class="process">
        ${profile.process
          .map((item, index) => `<div class="step"><span>${index + 1}</span><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.body)}</p></div>`)
          .join("\n        ")}
      </div>
    </section>
    <section id="proof">
      <div class="split">
        <h2 class="section-title">What this concept fixes first.</h2>
        <div class="proof-list">
          ${audit.recommendations.map((item) => `<div class="proof">${escapeHtml(item)}</div>`).join("\n          ")}
        </div>
      </div>
    </section>
    <section class="band">
      <div class="split">
        <div>
          <div class="section-kicker">Trust</div>
          <h2 class="section-title">${escapeHtml(profile.proofTitle)}</h2>
          <p class="section-intro">${escapeHtml(profile.proofIntro)}</p>
        </div>
        <div class="testimonial">
          <p>${escapeHtml(profile.testimonial)}</p>
          <b>${escapeHtml(profile.testimonialByline)}</b>
        </div>
      </div>
    </section>
    <section>
      <div class="section-kicker">Questions</div>
      <h2 class="section-title">Answers before the first call.</h2>
      <div class="faq">
        ${profile.faq.map((item) => `<div class="faq-item"><b>${escapeHtml(item.question)}</b><p>${escapeHtml(item.answer)}</p></div>`).join("\n        ")}
      </div>
    </section>
    <section class="final">
      <h2 class="section-title">Ready for customers who are comparing options today.</h2>
      <p class="lead">This landing page concept uses stronger copy, premium visuals, faster quote flow, and clearer trust cues without making the site feel overbuilt.</p>
      <div class="actions">
        <a class="primary" href="#contact">${escapeHtml(profile.cta)}</a>
        <a class="secondary" href="tel:${escapeHtml((lead.phone ?? "").replace(/\D/g, ""))}">Call ${escapeHtml(lead.phone ?? "now")}</a>
      </div>
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
  galleryCaptions: string[];
  heroCopy: string;
  servicesIntro: string;
  processTitle: string;
  processIntro: string;
  proofTitle: string;
  proofIntro: string;
  testimonial: string;
  testimonialByline: string;
  services: Array<{ title: string; body: string; points: string[] }>;
  process: Array<{ title: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
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
      galleryCaptions: ["Premium exterior finish", "Clean curb appeal", "High-value home protection"],
      heroCopy:
        "Homeowners deciding on a roof replacement want clarity, credibility, and a fast way to ask the right questions. This landing page makes the next step obvious while giving the company a more premium first impression.",
      servicesIntro:
        "The page frames roofing services around the moments customers actually care about: protection, urgency, financing confidence, and a simple path to a quote.",
      processTitle: "A quote flow that feels organized from the first click.",
      processIntro:
        "A strong landing page should reduce uncertainty before the call. This structure gives visitors a clear process and helps the business receive better-qualified requests.",
      proofTitle: "A premium roof deserves premium proof.",
      proofIntro:
        "The concept reserves space for project photos, warranty messaging, materials, and local service coverage so the page feels credible instead of generic.",
      testimonial:
        "The goal is to make the company feel established before a homeowner ever picks up the phone: premium visuals, direct quote language, and confidence-building proof above the fold.",
      testimonialByline: "Landing page strategy note",
      services: [
        {
          title: "Metal roof systems",
          body: "Durable roof options presented with clear benefits, timelines, and homeowner confidence cues.",
          points: ["Material and warranty highlights", "Before-and-after project space", "Quote request without friction"]
        },
        {
          title: "Repair and replacement",
          body: "A direct path for urgent needs, aging roofs, leaks, and inspection requests.",
          points: ["Leak and storm prompts", "Inspection CTA", "Service-area copy"]
        },
        {
          title: "Financing-ready estimates",
          body: "A polished quote journey that makes it easier to start the conversation.",
          points: ["Budget range language", "Financing cue", "Fast callback expectation"]
        }
      ],
      process: [
        { title: "Send details", body: "The customer submits photos, address, timeline, and the main roofing concern." },
        { title: "Fast review", body: "The company confirms fit, urgency, and whether an inspection is needed." },
        { title: "Clear options", body: "The quote path explains repair, replacement, materials, and next steps." },
        { title: "Booked work", body: "The page keeps the homeowner moving toward a call, estimate, or project date." }
      ],
      faq: [
        { question: "Do I need a repair or replacement?", answer: "The page routes both needs into the quote flow and asks enough detail to guide the first conversation." },
        { question: "Can I ask about metal roofing?", answer: "Yes. The copy highlights premium metal systems and gives visitors a reason to ask about material options." },
        { question: "How fast will someone respond?", answer: "The page sets a clear response expectation and keeps phone/text visible throughout the experience." },
        { question: "Is this a full site?", answer: "This is a focused landing page concept that can become part of a full website build." }
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
      galleryCaptions: ["Fast service intake", "Mechanical trust cues", "Clean booking path"],
      heroCopy:
        "Customers searching for comfort service want to know who can respond, what they handle, and how quickly they can book. This landing page keeps the phone path visible while adding a more professional quote flow.",
      servicesIntro:
        "The page gives service calls, installations, and maintenance plans their own clear value so the business can capture urgent work and longer-term opportunities.",
      processTitle: "Less phone tag, more booked service calls.",
      processIntro:
        "A better landing page should triage customer needs quickly and capture enough detail for a useful follow-up.",
      proofTitle: "Trust signals for urgent service decisions.",
      proofIntro:
        "The layout creates space for emergency availability, licensed technician messaging, system brands, reviews, and maintenance plan value.",
      testimonial:
        "The strongest HVAC and plumbing landing pages make customers feel handled immediately: clear services, visible phone access, and no confusion about what happens next.",
      testimonialByline: "Landing page strategy note",
      services: [
        {
          title: "Emergency service",
          body: "Prominent call and intake paths for customers who need help quickly.",
          points: ["Urgency-first CTA", "After-hours intake", "Issue details captured"]
        },
        {
          title: "Installations",
          body: "Clean service sections for systems, upgrades, and project requests.",
          points: ["System replacement copy", "Brand/proof area", "Estimate request flow"]
        },
        {
          title: "Maintenance plans",
          body: "A recurring revenue path with clearer homeowner value and reminders.",
          points: ["Plan benefits", "Seasonal reminders", "Easy sign-up CTA"]
        }
      ],
      process: [
        { title: "Choose issue", body: "The customer identifies repair, installation, maintenance, or emergency need." },
        { title: "Share details", body: "The form collects system type, timing, contact details, and preferred callback." },
        { title: "Confirm service", body: "The team follows up with next steps and expected availability." },
        { title: "Stay connected", body: "Maintenance and future service options are introduced without cluttering the first request." }
      ],
      faq: [
        { question: "Can customers call right away?", answer: "Yes. The call button stays visible while the quote form captures non-urgent requests." },
        { question: "Does this support after-hours leads?", answer: "The concept includes an intake path that can route after-hours questions into email or AI-assisted follow-up." },
        { question: "Can maintenance plans be promoted?", answer: "Yes. The page includes recurring service positioning without distracting from emergency bookings." },
        { question: "Is this a full site?", answer: "This is a focused landing page concept that can become part of a full website build." }
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
    galleryCaptions: ["Design-led presentation", "Project proof area", "Seasonal property care"],
    heroCopy:
      "Homeowners comparing landscaping companies need to see taste, organization, and a clear next step. This landing page gives the business a more premium visual presence while turning vague interest into a project request.",
    servicesIntro:
      "The page separates design, installation, and seasonal care so visitors can quickly find the service that matches their project.",
    processTitle: "From inspiration to a serious project request.",
    processIntro:
      "A stronger landing page helps customers describe their yard, budget, timing, and design goals before the first conversation.",
    proofTitle: "Visual proof is the sales engine.",
    proofIntro:
      "The concept makes room for project galleries, transformation stories, service areas, and seasonal work so visitors can picture the result.",
    testimonial:
      "Landscaping pages need to feel aspirational and practical at the same time: strong visuals, clear service categories, and a low-friction quote request.",
    testimonialByline: "Landing page strategy note",
    services: [
      {
        title: "Landscape design",
        body: "A more visual path for customers who need inspiration and a clear starting point.",
        points: ["Design goals captured", "Gallery-led proof", "Consultation CTA"]
      },
      {
        title: "Interlocking and hardscape",
        body: "Project proof and structured quote requests for higher-value work.",
        points: ["Patio and walkway copy", "Budget/timeline prompts", "Transformation photos"]
      },
      {
        title: "Seasonal care",
        body: "Simple recurring-service positioning for maintenance and snow work.",
        points: ["Maintenance plan copy", "Commercial/residential split", "Seasonal reminders"]
      }
    ],
    process: [
      { title: "Describe the space", body: "Visitors share yard size, service needs, goals, photos, and timeline." },
      { title: "Shape the plan", body: "The company responds with a focused next step: consultation, estimate, or site visit." },
      { title: "Show the vision", body: "The page supports project galleries and design inspiration before commitment." },
      { title: "Book the work", body: "Calls and quote requests stay visible through the full landing page." }
    ],
    faq: [
      { question: "Can visitors request design help?", answer: "Yes. The concept positions design as a guided first step, not just a generic quote form." },
      { question: "Can this support larger projects?", answer: "The page uses proof, process, and structured questions to make high-value inquiries easier." },
      { question: "Can seasonal work be included?", answer: "Yes. Maintenance and snow services can sit below the main transformation-focused pitch." },
      { question: "Is this a full site?", answer: "This is a focused landing page concept that can become part of a full website build." }
    ]
  };
}
