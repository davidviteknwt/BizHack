# Lovable prompt – SiteStory

Paste the text below into a new Lovable project (Lovable Cloud enabled). Then add the secret
`N8N_WEBHOOK_BASE` = `https://hackatonbudapest26.app.n8n.cloud/webhook` (Project → Cloud → Secrets).
If a step fails, paste the next block as a follow-up message: Lovable works best in small steps.

---

## Message 1 – app, data model, upload

Build **SiteStory**, an internal web app for a Czech construction company (solar plants, battery storage, buildings).
Every week a site manager records a 1–2 minute **walk-through video** on site and describes what was newly built.
The app turns it into a customer report, a project chronicle, marketing drafts and a management summary.
English UI, clean and simple, works on a phone (site managers upload from the site).

Use Lovable Cloud for database, storage and edge functions. No login for now (hackathon demo).

Database tables (create exactly these):
- `projects`: id uuid, code text unique, title text, company text, client_name text, consent_name_allowed boolean default false, notes text, created_at
- `weekly_entries`: id, project_id → projects, week text (ISO week like 2026-W47), media_url text, transcript text, customer_report jsonb {subject, body}, project_page_entry jsonb {title, body}, issues jsonb [{text, severity}], next_steps jsonb, fact_check jsonb {status, unverified_numbers, consent_ok}, processing_seconds numeric, status text default 'processing', created_at; unique(project_id, week)
- `photos`: id, project_id, week, url, flagged_reason text, created_at
- `documents`: id, project_id, file_name text, url text, created_at
- `social_drafts`: id, entry_id → weekly_entries, project_id, text_en, text_cs, hashtags jsonb, photo_url, fact_check_status text, decision text default 'pending', decided_at, created_at
- `management_summaries`: id, week, headline, summary_markdown, totals jsonb, attention jsonb, highlights jsonb, checklist jsonb, created_at

Public storage bucket `site-media` for videos, photos and documents.

Pages:
1. **Upload** (home page, mobile-first): select project, week (default = current ISO week), upload one video and optionally photos and documents → files go to `site-media/{project code}/{week}/`, rows into `photos` / `documents`, then a big button **"Create reports"**.
2. **Projects**: list with company, last reported week and checklist badges (contract signed, building approval).
3. **Project page** `/projects/:code`: header with title and company; photo gallery of all photos; timeline of weekly entries (newest first) showing project_page_entry, issues as coloured chips (info grey, warning amber, blocker red), expandable customer report (subject + body + "Copy e-mail" button) and transcript. A **Print / PDF** button with a print stylesheet. This page is used by the customer, at the weekly site inspection meeting and as the project chronicle.

Add a **Projects admin** dialog to create or edit a project (all project fields) and to upload documents.

## Message 2 – connect the automation (n8n)

Create an edge function `process-week` that receives `{project_id, week}`:
1. Load the project, the newest video for that week (`media_url`) and up to 8 photo public URLs of that week (fall back to project photos).
2. Upsert `weekly_entries` with status `processing`.
3. POST JSON to `${N8N_WEBHOOK_BASE}/site-report`:
   `{ "project": {id, name: code, company, client_name, consent_name_allowed, notes}, "week", "media_url", "photo_urls": [...], "output_language": "en", "customer_language": "en" }`
   (if there is no video but a transcript was typed in, send `"transcript"` instead of `media_url`).
   Timeout 300 s.
4. Save the response: transcript, customer_report, project_page_entry, issues, next_steps, fact_check, processing_seconds, status `done`.
   Insert a `social_drafts` row from `social_draft.text_en`, `text_cs`, `hashtags`, `best_photo_url`, `fact_check.status`.
   For each item in `photo_flags` set `photos.flagged_reason` for the matching url.
5. On error set status `error` and keep the message.

The **"Create reports"** button calls `process-week` and shows a progress state, then links to the project page.
Also add a small **"Paste transcript instead of video"** text area on the Upload page (for testing without video).

## Message 3 – marketing inbox and management dashboard

4. **Marketing inbox** `/marketing`: cards of `social_drafts` with decision `pending`, newest first: photo, EN text, CZ text, hashtags, project name, and a badge "✅ facts verified" or "⚠️ needs review" (show `fact_check.unverified_numbers`). Buttons **Approve**, **Reject**, **Copy EN**, **Copy CZ**, keyboard shortcuts A / R. Show a counter "x drafts waiting" and the time spent today. Goal: marketing needs max 30 min a day.
5. **Management** `/management`: button **"Generate weekly summary"** → edge function `management-summary` that POSTs to `${N8N_WEBHOOK_BASE}/management-summary`:
   `{ "week", "language": "en", "projects": [ {id, name: code, company, documents: [file names], entries: [{week, issues, project_page_entry}]} ] }`
   and stores the response in `management_summaries`. Show: headline, totals as stat tiles (projects, contracts missing, new projects, open issues), the document checklist table (✅ / 📝 draft / ❌), attention list, highlights, and the summary Markdown rendered.

Navigation bar: Upload · Projects · Marketing · Management.
