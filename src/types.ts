export const segments = ["roofing", "hvac_plumbing", "landscaping"] as const;
export type Segment = (typeof segments)[number];

export const leadStates = [
  "discovered",
  "enriched",
  "scored",
  "qualified",
  "mockup_ready",
  "draft_ready",
  "approved",
  "sent_manual",
  "replied",
  "not_interested",
  "suppressed"
] as const;
export type LeadState = (typeof leadStates)[number];

export type Lead = {
  id: string;
  segment: Segment;
  businessName: string;
  website?: string;
  contactEmail?: string;
  phone?: string;
  metro: string;
  state: LeadState;
  normalizedKey: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadSource = {
  id: string;
  leadId: string;
  source: string;
  externalId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type Enrichment = {
  leadId: string;
  hasWebsite: boolean;
  hasContactEmail: boolean;
  hasPhone: boolean;
  hasBookingSignal: boolean;
  hasSocialSignal: boolean;
  hasAiChatSignal: boolean;
  websiteLooksModern: boolean;
  notes: string[];
};

export type LeadScore = {
  leadId: string;
  score: number;
  reasons: string[];
  qualified: boolean;
  createdAt: string;
};

export type Audit = {
  leadId: string;
  observations: string[];
  recommendations: string[];
  createdAt: string;
};

export type Mockup = {
  leadId: string;
  url: string;
  localPath: string;
  createdAt: string;
};

export type OutreachDraft = {
  leadId: string;
  subject: string;
  body: string;
  draftPath: string;
  status: "draft_ready";
  createdAt: string;
};

export type Approval = {
  leadId: string;
  approval: "pending" | "approved" | "rejected";
  notes?: string;
  createdAt: string;
};

export type Suppression = {
  email?: string;
  domain?: string;
  reason: string;
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  runType: "daily" | "weekly" | "command";
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  summary: Record<string, unknown>;
  errors: string[];
};

export type CrmSnapshot = {
  leads: Lead[];
  sources: LeadSource[];
  enrichments: Enrichment[];
  scores: LeadScore[];
  audits: Audit[];
  mockups: Mockup[];
  drafts: OutreachDraft[];
  approvals: Approval[];
  suppressions: Suppression[];
  runs: WorkflowRun[];
};
