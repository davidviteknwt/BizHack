# BizHack AI – Challenge 02: BOFF NWT (NWT group) — brief v2 (Wed 25 Nov)

**Category:** Capacity · **Challenge owner:** David Vítek (David.Vitek@nwt.cz), on site all three days
**Tools:** n8n, Lovable, ElevenLabs, Apify (+ an LLM inside n8n)

## 1. The problem
Site managers photograph every running project every week (about **25 projects, 10–30 photos each**) and store the photos on the company server. They also write a short progress report for the customer by hand.
After that the photos are not used. They are not shown at the weekly site inspection meeting or to management, and they very rarely reach the website or social media.

## 2. Who has it
| Person | Their week today |
|---|---|
| Site manager | about 1 h taking photos + 1 h texting the customer report, per week |
| Head of construction (CTO) | no overview of all projects without asking each site manager |
| Marketing manager | would need about 3 h a day to turn this into content, so it doesn't happen and sales lose leads |
| CEO | no regular summary of all projects |
| Site inspection meeting (weekly) | client (project owner), client's technical supervisor, site manager, design supervisor, safety manager: time lost because nobody has the photos and the status ready |

## 3. Root cause
Marketing has a lot of other work, and nobody owns the step "photos + notes → something useful for each audience".

## 4. What better looks like (baseline → target)
| Measure | Today | Target |
|---|---|---|
| Site manager's photos + report writing | 2 h / week (1 h photos + 1 h texting) | ≤ 15 min (one 1–2 min walk-through video with spoken commentary; AI writes the report) |
| Marketing time to get content out | 3 h / day needed (not done) | **≤ 30 min / day**: approve or reject drafts |
| Projects with a ready weekly draft for web/social | rarely | all 25, every week |
| Inspection meeting preparation | photos not available | one page per project, ready on screen, 0 min prep |
| Management overview | ask each site manager | one weekly summary of all projects |

State this baseline in the repo README and show the "after" numbers on one demo slide (25 points of the judging).

## 5. What to build: one input, five outputs
**Input (per project, per week):** one short **walk-through video** (1–2 min) in which the site manager films what has been **newly built since last week** and describes it out loud. This replaces the old way: separate photos plus a description typed by hand later. Extra photos in the folder are optional.

The spoken commentary is the source of all text. Key frames from the video (at the timestamps in the transcript) can serve as the photos.

1. **Customer report**: weekly text + best photos for the project owner (replaces the 1 h of texting).
2. **Project page / file**: all photos and all weekly texts of one project in one place. The same page serves the customer, the inspection meeting and the project chronicle; exports to PDF.
3. **Management summary**: all 25 projects on one page: progress, issues, missing documents.
4. **Marketing inbox**: one photo + a short text per project for website news, LinkedIn and Instagram, with **Approve / Reject** buttons.
5. **Document checklist** from the folder scan: new project folder? signed contract present? final approval from the building office present? Shown in the summary.

### Suggested architecture (keep it to 1.5 days)
```
Phone (site manager): 1–2 min walk-through video with commentary
        │  upload (Lovable form or shared cloud folder)
        ▼
n8n workflow (on new upload, or weekly schedule)
  1. ElevenLabs Speech-to-Text  → timestamped transcript ("what's new")
  2. Key frames: grab stills at the transcript timestamps (could; or use folder photos)
  3. LLM: transcript → customer report, project-page entry,
     social draft (1 photo + text), issues
  4. LLM vision: pick the best frame/photo; flag faces / car number plates
  5. Folder scan: contract / building approval by file name or PDF text
  6. Write results to the Lovable database (Supabase)
        ▼
Lovable app
  • Project page (photos + timeline + PDF export)   → customer, inspection, chronicle
  • Management dashboard (25 projects, checklist)   → CTO, CEO
  • Marketing inbox (approve / reject, copy text)    → marketing manager
```
- **ElevenLabs**: speech-to-text for the site manager's note (core). Optional: a 60-second spoken weekly summary for the CEO.
- **Apify**: optional. Crawl agro.nwt.cz and energo.nwt.cz references so the LLM learns the house style, and check which projects are already published.
- The real server (drive S:) is not reachable from cloud n8n. Use the sample folders in this repo or a test cloud folder. The infopack says to switch to test data if access takes more than about 2 hours.

### Priorities
- **Must:** walk-through video → transcript → customer report; marketing inbox with approve/reject; project page with all photos.
- **Should:** management summary of all projects; document checklist.
- **Could:** PDF export, CEO audio summary, Apify style learning, automatic posting (not needed; drafts are enough).

## 6. Answers to the open questions
| Question | Answer for the hackathon |
|---|---|
| Short video with comments on site? | Yes. Upload the video; n8n sends the audio to ElevenLabs STT, then the LLM summarises. |
| One file with all photos and text per project, for the customer and the inspection team? | Yes: the Lovable project page, plus PDF export (could). |
| Summary of all projects for management? | Yes: dashboard page, optionally a weekly e-mail from n8n. |
| Can the same page be the project chronicle? | Yes. Weekly entries stay on the page as a timeline. |
| All photos on the reference page? | Yes in the app. Publishing to the public website (CMS) is out of scope; export text and photos instead. |
| Draft of one photo + text per project for web/social, marketing decides? | Yes. This is the marketing inbox, core of the demo. |
| Easy upload of new videos? | Lovable upload form from the phone (simplest for the demo), or a shared cloud folder watched by n8n. |
| Scan folders for a new project, signed contract, building approval? | Yes for the demo: detect by file names and PDF text in the sample folders; show status in the summary. |

## 7. Guardrails
- Never invent numbers or facts; everything comes from the transcript, notes or files.
- Respect the customer's consent level for marketing drafts (no name, address or identifiable details if not allowed).
- Flag photos with faces or car number plates before anything goes to marketing.
- **No real customer data in the public GitHub repo**: use `sample_projects/`. Real data only in the live demo.

## 8. Data in this folder
- `sample_projects/`: 6 projects, all in English. 01–03 are fully **synthetic**; 04–06 are real published projects (facts from our website) with invented weekly progress:
  - weekly folders `2026-W46`, `2026-W47`, each with `voice_note_transcript.txt`: a timestamped transcript of the walk-through video, i.e. what ElevenLabs STT returns;
  - `site_manager_notes.txt`: project facts and the customer's consent level;
  - `documents/`: dummy PDFs for the checklist. Signed contract + building office approval: 01, 04, 06. Only signed contract: 02, 05. Only an unsigned draft (new project): 03.
- `reference_photos/`: real public photos from our websites, in folders named like the projects:
  - `01_PV_roof_factory_hall` (6), `02_BESS_container` (2), `03_PV_family_house_battery` (4): photos for sample projects 01–03;
  - `04_PV_roof_parking_house` (4), `05_PV_roof_municipal_buildings` (1), `06_PV_battery_bakery` (22): photos for projects 04–06; these photos really belong to those projects. 06 is the best set for testing photo selection.
- `public_references.csv`: 20 published references (house style, URLs).

## 9. Demo on Thursday (5 min)
1. Problem in one sentence + baseline numbers (30 s).
2. Live: upload a short walk-through video for one project (1 min).
3. Show the generated customer report and the updated project page (1 min).
4. Management dashboard: 25 projects, one with a missing contract flagged (1 min).
5. Marketing inbox: approve one draft in seconds; show "3 h/day → 30 min/day" (1 min).
6. Repo: run with sample data (30 s).
