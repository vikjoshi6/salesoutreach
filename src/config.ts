import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TARGET_METRO: z.string().default("UNCONFIGURED_METRO"),
  AGENCY_NAME: z.string().default("UNCONFIGURED_AGENCY"),
  SENDER_NAME: z.string().default("UNCONFIGURED_SENDER"),
  REPLY_EMAIL: z.string().email().optional().or(z.literal("")).default(""),
  AGENCY_PHONE: z.string().optional().default(""),
  PHYSICAL_MAILING_ADDRESS: z.string().default(""),
  SUPABASE_URL: z.string().url().optional().or(z.literal("")).default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  GOOGLE_PLACES_API_KEY: z.string().optional().default(""),
  ENABLE_GOOGLE_PLACES_DISCOVERY: z.coerce.boolean().default(false),
  MOCKUP_BASE_URL: z.string().default("http://localhost:3000"),
  GOOGLE_SHEET_URL: z.string().url().optional().or(z.literal("")).default(""),
  OBSIDIAN_VAULT_PATH: z.string().default("C:\\Users\\Owner\\Documents\\Codexobsidian\\Codexbot"),
  OBSIDIAN_ENABLED: z.coerce.boolean().default(false),
  COMPETITOR_COUNT: z.coerce.number().int().positive().default(3),
  COMPETITOR_SCAN_ENABLED: z.coerce.boolean().default(true),
  ANALYSIS_PAGE_LIMIT_PER_SITE: z.coerce.number().int().positive().default(3),
  ANALYSIS_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  ANALYSIS_EMAIL_TABLE_ROWS: z.coerce.number().int().positive().default(5),
  DAILY_DISCOVERY_LIMIT: z.coerce.number().int().positive().default(12),
  DAILY_DRAFT_LIMIT: z.coerce.number().int().positive().default(5),
  AUTO_TUNE_DISCOVERY_MIN: z.coerce.number().int().positive().default(10),
  AUTO_TUNE_DISCOVERY_MAX: z.coerce.number().int().positive().default(100),
  AUTO_TUNE_DRAFT_MIN: z.coerce.number().int().positive().default(3),
  AUTO_TUNE_DRAFT_MAX: z.coerce.number().int().positive().default(30),
  DRY_RUN: z.coerce.boolean().default(true)
});

export type AppConfig = z.infer<typeof envSchema> & {
  rootDir: string;
  outputDate: string;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const parsed = envSchema.parse(process.env);
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...parsed,
    rootDir: process.cwd(),
    outputDate: today,
    ...overrides
  };
}

export function isConfiguredForOutreach(config: AppConfig): boolean {
  return Boolean(
    config.TARGET_METRO &&
      config.TARGET_METRO !== "UNCONFIGURED_METRO" &&
      config.AGENCY_NAME &&
      config.AGENCY_NAME !== "UNCONFIGURED_AGENCY" &&
      config.SENDER_NAME &&
      config.SENDER_NAME !== "UNCONFIGURED_SENDER" &&
      config.REPLY_EMAIL &&
      config.PHYSICAL_MAILING_ADDRESS
  );
}

export function usingSupabase(config: AppConfig): boolean {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}
