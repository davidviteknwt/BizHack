#!/usr/bin/env python3
"""Run the whole pipeline on the sample data – no Lovable needed.

  python scripts/run_demo.py --n8n https://YOUR-INSTANCE.app.n8n.cloud/webhook

For every project and week in sample_data/sample_projects it sends the walk-through transcript
(+ photo URLs) to the n8n "site-report" webhook, then sends everything to the "management-summary"
webhook, and writes readable Markdown to output/:

  output/projects/<project>.md       one page per project: chronicle + customer reports (customer, inspection meeting)
  output/marketing_inbox.md          one photo + text per project, with fact-check status (marketing approves)
  output/management_summary.md       all projects + document checklist (CEO, head of construction)
  output/metrics.md                  processing time vs. the manual baseline
  output/raw/*.json                  raw responses

Only the Python standard library is used.
"""
import argparse, json, pathlib, re, sys, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_PHOTO_BASE = "https://raw.githubusercontent.com/davidviteknwt/BizHack/main/sample_data/reference_photos"

# Manual baseline from the challenge owner (BOFF NWT)
BASELINE = {
    "site_manager_min_per_week": 120,   # 1 h photos + 1 h texting the report
    "marketing_min_per_day": 180,        # needed, but not done today
    "marketing_target_min_per_day": 30,
}


def post(url, payload, timeout=300):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"\nn8n returned HTTP {e.code} for {url}:\n{e.read().decode('utf-8', 'replace')[:800]}\n"
                 "Is the workflow ACTIVE and are the OpenAI / ElevenLabs credentials set?")


def read_project(folder: pathlib.Path):
    notes = (folder / "site_manager_notes.txt").read_text(encoding="utf-8")
    field = lambda key: (re.search(rf"^{key}:\s*(.+)$", notes, re.M) or [None, ""])[1].strip()
    consent = field("Consent to a reference")
    quoted = re.search(r'"([^"]+)"', field("Project"))
    client = quoted.group(1) if quoted else ""
    name_allowed = consent.upper().startswith("YES") and not re.search(
        r"without|no name|only village|not the|anonym", consent, re.I)
    docs = sorted(p.name for p in (folder / "documents").glob("*")) if (folder / "documents").exists() else []
    weeks = sorted(p for p in folder.iterdir() if p.is_dir() and re.match(r"\d{4}-W\d{2}", p.name))
    return {
        "id": folder.name, "name": folder.name, "title": field("Project"), "company": field("Company"),
        "client_name": client, "consent_name_allowed": name_allowed, "notes": notes,
        "documents": docs, "weeks": weeks,
    }


def transcript_of(week_dir: pathlib.Path):
    t = (week_dir / "voice_note_transcript.txt").read_text(encoding="utf-8")
    lines = [l for l in t.splitlines() if l.startswith("[")]   # keep only the timestamped speech
    return "\n".join(lines) or t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n8n", required=True, help="Webhook base URL, e.g. https://xxx.app.n8n.cloud/webhook (or .../webhook-test)")
    ap.add_argument("--data", default=str(ROOT / "sample_data"))
    ap.add_argument("--out", default=str(ROOT / "output"))
    ap.add_argument("--photo-base-url", default=DEFAULT_PHOTO_BASE, help="Public base URL of sample_data/reference_photos ('' = no photos)")
    ap.add_argument("--max-photos", type=int, default=6)
    ap.add_argument("--language", default="en", help="Language of reports (en / cs)")
    ap.add_argument("--project", help="Only this project folder name")
    ap.add_argument("--video-url", help="Public URL of a real walk-through video: replaces the latest transcript of --project")
    a = ap.parse_args()

    data, out = pathlib.Path(a.data), pathlib.Path(a.out)
    (out / "raw").mkdir(parents=True, exist_ok=True)
    (out / "projects").mkdir(exist_ok=True)
    base = a.n8n.rstrip("/")
    folders = sorted(p for p in (data / "sample_projects").iterdir() if p.is_dir() and p.name[:2].isdigit())
    if a.project:
        folders = [f for f in folders if f.name == a.project]

    projects, timings, inbox = [], [], []
    for f in folders:
        proj = read_project(f)
        photo_dir = data / "reference_photos" / f.name
        photos = sorted(photo_dir.glob("*.jpg"))[: a.max_photos] if photo_dir.exists() else []
        photo_urls = [f"{a.photo_base_url.rstrip('/')}/{f.name}/{p.name}" for p in photos] if a.photo_base_url else []
        entries = []
        for i, w in enumerate(proj["weeks"]):
            payload = {
                "project": {k: proj[k] for k in ("id", "name", "company", "client_name", "consent_name_allowed", "notes")},
                "week": w.name, "photo_urls": photo_urls,
                "output_language": a.language, "customer_language": a.language,
            }
            if a.video_url and i == len(proj["weeks"]) - 1:
                payload["media_url"] = a.video_url
            else:
                payload["transcript"] = transcript_of(w)
            print(f"→ {f.name} {w.name} ...", end=" ", flush=True)
            t0 = time.time()
            res = post(f"{base}/site-report", payload)
            dt = time.time() - t0
            timings.append(dt)
            print(f"{dt:.0f} s, fact check: {res.get('fact_check', {}).get('status')}")
            (out / "raw" / f"{f.name}_{w.name}.json").write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
            entries.append(res)
        projects.append({**proj, "entries": entries})
        write_project_page(out, proj, entries)
        if entries:
            inbox.append((proj, entries[-1]))

    print("→ management summary ...", end=" ", flush=True)
    summary = post(f"{base}/management-summary", {
        "week": max((e["week"] for p in projects for e in p["entries"]), default=""),
        "language": a.language,
        "projects": [{"id": p["id"], "name": p["name"], "company": p["company"], "documents": p["documents"],
                      "entries": [{"week": e["week"], "issues": e.get("issues", []),
                                   "project_page_entry": e.get("project_page_entry")} for e in p["entries"]]}
                     for p in projects],
    })
    print("done")
    (out / "raw" / "management_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    write_summary(out, summary)
    write_inbox(out, inbox)
    write_metrics(out, timings, inbox, summary)
    print(f"\nDone. Open {out}/management_summary.md, {out}/marketing_inbox.md and {out}/projects/")


def write_project_page(out, proj, entries):
    md = [f"# {proj['title'] or proj['name']}", f"*{proj['company']}*", ""]
    for e in entries:
        pe, cr = e.get("project_page_entry") or {}, e.get("customer_report") or {}
        md += [f"## {e['week']} – {pe.get('title', '')}", pe.get("body", ""), ""]
        if e.get("best_photo_url"):
            md += [f"![best photo]({e['best_photo_url']})", ""]
        if e.get("issues"):
            md += ["**Issues:** " + "; ".join(f"{i['text']} ({i.get('severity')})" for i in e["issues"]), ""]
        md += [f"<details><summary>Customer report: {cr.get('subject', '')}</summary>", "", cr.get("body", ""), "", "</details>", ""]
        md += [f"<details><summary>Transcript of the walk-through video</summary>", "", "```", e.get("transcript", ""), "```", "</details>", ""]
    (out / "projects" / f"{proj['name']}.md").write_text("\n".join(md), encoding="utf-8")


def write_inbox(out, inbox):
    md = ["# Marketing inbox – approve or reject", "",
          "One photo + text per project. Approve = publish on web / LinkedIn / Instagram.", ""]
    for proj, e in inbox:
        s, fc = e.get("social_draft") or {}, e.get("fact_check") or {}
        badge = "✅ facts verified" if fc.get("status") == "ok" else f"⚠️ needs review: {fc.get('unverified_numbers')} consent_ok={fc.get('consent_ok')}"
        md += [f"## {proj['name']} ({e['week']}) – {badge}", ""]
        if e.get("best_photo_url"):
            md += [f"![photo]({e['best_photo_url']})", ""]
        md += ["**EN:** " + s.get("text_en", ""), "", "**CZ:** " + s.get("text_cs", ""), "",
               " ".join(s.get("hashtags", [])), "", "- [ ] Approve   - [ ] Reject", ""]
    (out / "marketing_inbox.md").write_text("\n".join(md), encoding="utf-8")


def write_summary(out, s):
    rows = ["| Project | Weeks | Contract signed | Building approval | Flags |", "|---|---|---|---|---|"]
    for p in s.get("checklist", []):
        c = p["checklist"]
        rows.append(f"| {p['name']} | {p['weeks_reported']} | {'✅' if c['contract_signed'] else ('📝 draft' if c['contract_draft_only'] else '❌')} | "
                    f"{'✅' if c['building_office_approval'] else '–'} | {'; '.join(f['text'] for f in p['flags'] if f['severity'] != 'info')} |")
    md = [s.get("summary_markdown", ""), "", "---", "## Document checklist (from the project folders)", "", *rows, ""]
    (out / "management_summary.md").write_text("\n".join(md), encoding="utf-8")


def write_metrics(out, timings, inbox, summary):
    n = len(timings)
    avg = sum(timings) / n if n else 0
    ok = sum(1 for _, e in inbox if (e.get("fact_check") or {}).get("status") == "ok")
    md = [
        "# Metrics", "",
        f"- Weekly entries processed: **{n}** (projects: {len(inbox)})",
        f"- Average processing time per entry: **{avg:.0f} s** (automatic)",
        f"- Site manager: **{BASELINE['site_manager_min_per_week']} min/week → ~15 min/week** (record a 1–2 min walk-through video per project)",
        f"- Marketing: **{BASELINE['marketing_min_per_day']} min/day → {BASELINE['marketing_target_min_per_day']} min/day** (approve/reject drafts in the inbox)",
        f"- Social drafts passing the automatic fact check: **{ok}/{len(inbox)}**",
        f"- Projects with missing signed contract: **{summary.get('totals', {}).get('contracts_missing', '?')}**",
        f"- Management summary generated in **{summary.get('processing_seconds', '?')} s** (was: ask every site manager)",
    ]
    (out / "metrics.md").write_text("\n".join(md), encoding="utf-8")


if __name__ == "__main__":
    main()
