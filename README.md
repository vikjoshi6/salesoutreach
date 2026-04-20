# Local Home Services Prospecting Automation

Codex-managed prospecting workflow for a local metro pilot across roofing, HVAC/plumbing, and landscaping.

The v1 workflow is intentionally draft-only for a personal Gmail setup. It researches/imports leads, scores them, prepares mini-audits and hosted mockup pages, writes Gmail-ready draft files, and exports Google Sheets-ready CRM tables. It never sends email.

## Quick Start

1. Copy `.env.example` to `.env`.
2. Fill in `TARGET_METRO`, `AGENCY_NAME`, `SENDER_NAME`, `REPLY_EMAIL`, and `PHYSICAL_MAILING_ADDRESS`.
3. Add compliant lead rows to `data/input/leads.csv`, or use the optional Google Places API discovery configured in `.env`.
4. Run:

```powershell
npm install
npm run workflow:daily
npm test
```

## Daily Commands

- `npm run leads:discover` imports lead candidates and deduplicates them.
- `npm run leads:enrich` checks websites/contact/social signals.
- `npm run leads:score` ranks leads from 0-100.
- `npm run outreach:prepare` creates mini-audits, mockup pages, and draft files.
- `npm run reports:daily` writes the approval queue CSV and Markdown summary.
- `npm run workflow:daily` runs the full daily sequence.
- `npm run workflow:weekly` writes a weekly performance report.

## Required CSV Columns

`segment,business_name,website,contact_email,phone,source`

Accepted segments: `roofing`, `hvac_plumbing`, `landscaping`.

## Outputs

- `public/mockups/<lead-slug>/index.html`: generated mockup pages for Vercel/static hosting.
- `outputs/YYYY-MM-DD/drafts/*.txt`: Gmail-ready draft files.
- `outputs/YYYY-MM-DD/pipeline-review.csv`: Google Sheets-ready review view.
- `outputs/YYYY-MM-DD/google-sheets-crm/*.csv`: Google Sheets-ready CRM table exports.
- `outputs/YYYY-MM-DD/daily-summary.md`: daily Codex inbox summary.
- `data/local-crm.json`: local fallback CRM when Supabase credentials are absent.

Live approval sheet created for this workflow:

https://docs.google.com/spreadsheets/d/10u-6zqvC4c1whfCntRQVUGZsUzXx4N12Q6yO5krISQQ/edit

## Storage

Current operating storage is local JSON plus Google Sheets exports, with the live review sheet linked above. Supabase remains scaffolded for later; run `supabase/schema.sql` in your Supabase project before setting `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Safety Defaults

- No automatic sending.
- No attachments in outreach drafts.
- Suppressed emails/domains are blocked.
- Missing sender identity or physical mailing address blocks outreach creation.
- Google Places discovery uses the official API. Do not scrape Google Maps pages or mass-download Google Maps content into the CRM.
