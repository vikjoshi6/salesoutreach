import type { AppConfig } from "./config.js";
import type {
  BenchmarkScore,
  ComparativeAnalysis,
  CompetitorSnapshot,
  CrmSnapshot,
  Lead,
  RubricCategory,
  SiteRubricScore
} from "./types.js";
import { rubricCategories } from "./types.js";
import { id, normalizeDomain, nowIso } from "./utils.js";

type RubricDefinition = {
  label: string;
  benchmarkTarget: number;
  evaluate: (context: SiteContext) => { score: number; evidence: string[] };
};

type CompetitorCandidate = {
  businessName: string;
  website: string;
  source: string;
};

type SiteContext = {
  lead: Lead;
  pages: Array<{ url: string; html: string }>;
  combinedText: string;
  domain: string;
};

const rubricDefinitions: Record<RubricCategory, RubricDefinition> = {
  first_screen_clarity: {
    label: "First-screen clarity",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /free quote|request a quote|get a quote|book now|schedule service|call now/, points: 2, note: "Visible primary call to action detected." },
      { pattern: /roof|hvac|plumbing|landscap|interlock|snow/, points: 2, note: "Service offer is stated clearly in headline/body copy." },
      { pattern: /serving|mississauga|gta|greater toronto|ontario/, points: 1, note: "Local service area appears early." }
    ])
  },
  quote_accessibility: {
    label: "Quote/contact accessibility",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /contact us|request.*quote|get.*estimate|book service|schedule/, points: 2, note: "Dedicated quote/contact path detected." },
      { pattern: /tel:|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/, points: 1, note: "Phone access is visible." },
      { pattern: /form|name=("|')?(name|email|phone)|textarea/, points: 2, note: "Lead form elements are present." }
    ])
  },
  trust_proof: {
    label: "Trust proof",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /review|testimonial|rated|stars?|google reviews?/, points: 2, note: "Review or testimonial proof is visible." },
      { pattern: /licensed|insured|certified|warranty|bonded/, points: 2, note: "Professional trust cues are present." },
      { pattern: /project|gallery|before and after|case study/, points: 1, note: "Project proof or gallery content is present." }
    ])
  },
  service_clarity: {
    label: "Service clarity",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /services|service areas|repair|replacement|installation|maintenance/, points: 2, note: "Core service language is present." },
      { pattern: /emergency|same day|consultation|inspection/, points: 1, note: "Visitor intent is segmented by service need." },
      { pattern: /about us|our process|how it works/, points: 2, note: "The site explains how the service process works." }
    ])
  },
  local_relevance: {
    label: "Local relevance",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /mississauga|brampton|oakville|etobicoke|north york|toronto/, points: 2, note: "Local geography is named." },
      { pattern: /serving|service area|local|near you/, points: 2, note: "Local service-area positioning is visible." },
      { pattern: /ontario|gta/, points: 1, note: "Regional coverage is named." }
    ])
  },
  modern_ux: {
    label: "Mobile/modern UX",
    benchmarkTarget: 4,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /viewport/, points: 2, note: "Viewport meta tag detected." },
      { pattern: /react|next|vite|tailwind|bootstrap|application\/ld\+json|schema\.org/, points: 2, note: "Modern frontend or structured-data signal detected." },
      { pattern: /hero|section|grid|card|accordion/, points: 1, note: "Modern content structure cues are present." }
    ])
  },
  technical_hygiene: {
    label: "Technical hygiene",
    benchmarkTarget: 3,
    evaluate: ({ pages, domain }) => {
      const signals = [
        pages.some((page) => page.url.startsWith("https://")) ? "HTTPS detected." : "",
        domain && !domain.includes(".test") ? "Reachable public domain detected." : "",
        pages.some((page) => /meta name=["']description["']/i.test(page.html)) ? "Meta description present." : "",
        pages.some((page) => /loading=("|')lazy/i.test(page.html)) ? "Lazy-loading media signal present." : ""
      ].filter(Boolean);
      return {
        score: Math.min(5, signals.length),
        evidence: signals.length ? signals : ["Technical hygiene signals were limited from fetched pages."]
      };
    }
  },
  ai_intake: {
    label: "Follow-up / AI intake",
    benchmarkTarget: 3,
    evaluate: ({ combinedText }) => scoreBySignals(combinedText, [
      { pattern: /chat|assistant|ai|bot|after-hours|text us/, points: 2, note: "Chat, AI, or after-hours intake signal detected." },
      { pattern: /sms|text|whatsapp/, points: 1, note: "Alternate follow-up channel is visible." },
      { pattern: /callback|follow up|response time/, points: 1, note: "Follow-up expectation is stated." }
    ])
  }
};

export async function scanComparativeAnalysis(
  snapshot: CrmSnapshot,
  config: AppConfig
): Promise<{ analyzed: number; competitorSnapshots: number; degraded: number }> {
  let analyzed = 0;
  let competitorSnapshots = 0;
  let degraded = 0;
  const marketCache = new Map<Lead["segment"], CompetitorCandidate[]>();
  const siteCache = new Map<string, SiteRubricScore[]>();

  for (const lead of snapshot.leads.filter((item) => item.state === "enriched" || item.state === "scored" || item.state === "qualified" || item.state === "draft_ready")) {
    const cachedCompetitors = marketCache.get(lead.segment) ?? await discoverCompetitors(lead, config);
    marketCache.set(lead.segment, cachedCompetitors);
    const analysis = await analyzeLeadAgainstMarket(lead, config, cachedCompetitors, siteCache);
    snapshot.competitors = snapshot.competitors.filter((item) => item.leadId !== lead.id);
    snapshot.analyses = snapshot.analyses.filter((item) => item.leadId !== lead.id);
    snapshot.competitors.push(...analysis.competitors);
    snapshot.analyses.push(analysis.comparativeAnalysis);
    competitorSnapshots += analysis.competitors.length;
    if (analysis.comparativeAnalysis.degradedMode) degraded += 1;
    analyzed += 1;
  }

  return { analyzed, competitorSnapshots, degraded };
}

export function comparativeScoreDelta(analysis?: ComparativeAnalysis): { delta: number; reasons: string[] } {
  if (!analysis) return { delta: 0, reasons: [] };
  const trailingRows = analysis.benchmarkRows.filter(
    (row) => row.prospectScore < row.benchmarkTarget || (row.competitorMedianScore != null && row.prospectScore < row.competitorMedianScore)
  );
  const delta = Math.min(15, trailingRows.length * 3 + (analysis.underperformsCompetitorMedian ? 3 : 0));
  const reasons = trailingRows.slice(0, 3).map((row) => `${row.label} trails competitors or benchmark expectations.`);
  return { delta, reasons };
}

export function topAnalysisRows(analysis: ComparativeAnalysis, limit: number): BenchmarkScore[] {
  return [...analysis.benchmarkRows]
    .sort((a, b) => gapMagnitude(b) - gapMagnitude(a))
    .slice(0, limit);
}

async function analyzeLeadAgainstMarket(
  lead: Lead,
  config: AppConfig,
  marketCandidates: CompetitorCandidate[],
  siteCache: Map<string, SiteRubricScore[]>
): Promise<{ competitors: CompetitorSnapshot[]; comparativeAnalysis: ComparativeAnalysis }> {
  const prospectRubric = await rubricForWebsite(lead, lead.website, config, siteCache);
  const competitorCandidates = marketCandidates
    .filter((candidate) => normalizeDomain(candidate.website) !== normalizeDomain(lead.website))
    .slice(0, config.COMPETITOR_COUNT);
  const competitors: CompetitorSnapshot[] = [];

  for (const candidate of competitorCandidates) {
    const rubric = await rubricForWebsite(lead, candidate.website, config, siteCache);
    if (rubric.length === 0) continue;
    competitors.push({
      id: id(),
      leadId: lead.id,
      businessName: candidate.businessName,
      website: candidate.website,
      source: candidate.source,
      rubric,
      notes: [`Used as a local ${lead.segment} benchmark for ${lead.metro}.`],
      createdAt: nowIso()
    });
  }

  const benchmarkRows = buildBenchmarkRows(prospectRubric, competitors);
  const rankedGaps = benchmarkRows
    .filter((row) => row.prospectScore < row.benchmarkTarget || (row.competitorMedianScore != null && row.prospectScore < row.competitorMedianScore))
    .sort((a, b) => gapMagnitude(b) - gapMagnitude(a))
    .map((row) => `${row.label} is behind ${comparisonLabel(row)}.`);
  const summaryFindings = rankedGaps.slice(0, 3).map((gap) => `Current site gap: ${gap}`);
  const underperformsCompetitorMedian = benchmarkRows.some(
    (row) => row.competitorMedianScore != null && row.prospectScore < row.competitorMedianScore
  );

  return {
    competitors,
    comparativeAnalysis: {
      leadId: lead.id,
      summaryFindings: summaryFindings.length ? summaryFindings : ["Site is reasonably competitive on visible surface signals; use benchmark-led positioning."],
      rankedGaps: rankedGaps.length ? rankedGaps : ["No major comparative gaps found from the bounded scan."],
      competitorSet: competitors.map((item) => ({ businessName: item.businessName, website: item.website, source: item.source })),
      benchmarkRows,
      underperformsCompetitorMedian,
      emailTableIncluded: true,
      degradedMode: competitors.length < config.COMPETITOR_COUNT ? "Competitor scan degraded; used available competitors plus fixed benchmarks." : undefined,
      createdAt: nowIso()
    }
  };
}

async function rubricForWebsite(
  lead: Lead,
  website: string | undefined,
  config: AppConfig,
  siteCache: Map<string, SiteRubricScore[]>
): Promise<SiteRubricScore[]> {
  const domain = normalizeDomain(website);
  if (!website || !domain) return [];
  const cached = siteCache.get(domain);
  if (cached) return cached;
  const site = await fetchSitePages(website, config);
  const rubric = site.pages.length === 0 ? [] : scoreSite({ lead, ...site, domain });
  siteCache.set(domain, rubric);
  return rubric;
}

async function discoverCompetitors(lead: Lead, config: AppConfig): Promise<CompetitorCandidate[]> {
  if (!config.COMPETITOR_SCAN_ENABLED || !config.ENABLE_GOOGLE_PLACES_DISCOVERY || !config.GOOGLE_PLACES_API_KEY) return [];
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.displayName,places.websiteUri"
    },
    body: JSON.stringify({
      textQuery: `${segmentSearchLabel(lead.segment)} near ${lead.metro}`,
      pageSize: Math.min(12, config.COMPETITOR_COUNT * 4),
      regionCode: "CA",
      languageCode: "en"
    })
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { places?: Array<{ displayName?: { text?: string }; websiteUri?: string }> };
  const ownDomain = normalizeDomain(lead.website);
  const deduped = new Map<string, CompetitorCandidate>();
  for (const place of data.places ?? []) {
    const website = place.websiteUri;
    const name = place.displayName?.text;
    const domain = normalizeDomain(website);
    if (!website || !name || !domain || domain === ownDomain) continue;
    if (!deduped.has(domain)) deduped.set(domain, { businessName: name, website, source: "google_places_competitor_scan" });
  }
  return [...deduped.values()];
}

async function fetchSitePages(website: string | undefined, config: AppConfig): Promise<{ pages: Array<{ url: string; html: string }>; combinedText: string }> {
  if (!website) return { pages: [], combinedText: "" };
  const base = website.startsWith("http") ? website : `https://${website}`;
  let origin = "";
  try {
    origin = new URL(base).origin;
  } catch {
    return { pages: [], combinedText: "" };
  }
  const urls = [origin, `${origin}/contact`, `${origin}/services`, `${origin}/about`].slice(0, config.ANALYSIS_PAGE_LIMIT_PER_SITE);
  const pages: Array<{ url: string; html: string }> = [];

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.ANALYSIS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "HomeServicesProspectingBot/0.1" }
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
      pages.push({ url, html: (await response.text()).slice(0, 120_000) });
    } catch {
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  return { pages, combinedText: pages.map((page) => page.html.toLowerCase()).join("\n") };
}

function scoreSite(context: SiteContext): SiteRubricScore[] {
  return rubricCategories.map((category) => {
    const definition = rubricDefinitions[category];
    const result = definition.evaluate(context);
    return {
      category,
      label: definition.label,
      score: Math.max(0, Math.min(5, result.score)),
      benchmarkTarget: definition.benchmarkTarget,
      evidence: result.evidence.slice(0, 3)
    };
  });
}

function buildBenchmarkRows(prospectRubric: SiteRubricScore[], competitors: CompetitorSnapshot[]): BenchmarkScore[] {
  return prospectRubric.map((prospectRow) => {
    const competitorScores = competitors
      .map((item) => item.rubric.find((row) => row.category === prospectRow.category)?.score)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
    const median =
      competitorScores.length === 0
        ? undefined
        : competitorScores[Math.floor((competitorScores.length - 1) / 2)];
    const top = competitorScores.length ? competitorScores[competitorScores.length - 1] : undefined;
    return {
      category: prospectRow.category,
      label: prospectRow.label,
      prospectScore: prospectRow.score,
      competitorMedianScore: median,
      competitorTopScore: top,
      benchmarkTarget: prospectRow.benchmarkTarget,
      evidence: prospectRow.evidence
    };
  });
}

function scoreBySignals(
  text: string,
  rules: Array<{ pattern: RegExp; points: number; note: string }>
): { score: number; evidence: string[] } {
  let score = 0;
  const evidence: string[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      score += rule.points;
      evidence.push(rule.note);
    }
  }
  return {
    score: Math.min(5, score),
    evidence: evidence.length ? evidence : ["No strong visible signal was captured for this category."]
  };
}

function gapMagnitude(row: BenchmarkScore): number {
  const benchmarkGap = Math.max(0, row.benchmarkTarget - row.prospectScore);
  const competitorGap = Math.max(0, (row.competitorMedianScore ?? row.prospectScore) - row.prospectScore);
  return benchmarkGap + competitorGap;
}

function comparisonLabel(row: BenchmarkScore): string {
  if (row.competitorMedianScore != null && row.prospectScore < row.competitorMedianScore && row.prospectScore < row.benchmarkTarget) {
    return "both competitor median and benchmark";
  }
  if (row.competitorMedianScore != null && row.prospectScore < row.competitorMedianScore) {
    return "competitor median";
  }
  return "benchmark expectations";
}

function segmentSearchLabel(segment: Lead["segment"]): string {
  if (segment === "hvac_plumbing") return "HVAC plumbing contractor";
  if (segment === "roofing") return "roofing contractor";
  return "landscaping company";
}
