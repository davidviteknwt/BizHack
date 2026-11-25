import json, base64, html, pathlib, io
from PIL import Image

D = json.load(open(pathlib.Path(__file__).with_name('data.json')))
PHOTOS = pathlib.Path(__file__).resolve().parent.parent / 'sample_data' / 'reference_photos'
OUT = pathlib.Path(__file__).resolve().parent; OUT.mkdir(exist_ok=True)
e = html.escape

def img64(path, w=900):
    im = Image.open(path).convert('RGB'); im.thumbnail((w, w))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=78)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()

def bullets(t):
    items = [l.lstrip('- ').strip() for l in t.splitlines() if l.strip()]
    return '<ul>' + ''.join(f'<li>{e(i)}</li>' for i in items) + '</ul>'

CSS = """
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: counter(page) " / " counter(pages); } }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Inter, Arial, sans-serif; color: #14202E; margin: 0; font-size: 10.5pt; line-height: 1.45; background: #fff; }
.wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
header.top { background: #16263A; color: #F5F2EC; padding: 18px 24px; border-radius: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
header.top .brand { font-weight: 700; letter-spacing: .5px; } header.top .brand b { color: #F2A23A; }
header.top h1 { margin: 6px 0 0; font-size: 20pt; }
header.top .meta { text-align: right; font-size: 9pt; color: #AEB8C4; }
h2 { font-size: 13pt; margin: 22px 0 8px; border-bottom: 2px solid #F2A23A; padding-bottom: 4px; }
h3 { font-size: 11pt; margin: 0 0 4px; }
.lead { font-size: 12pt; margin: 16px 0 4px; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
.tile { border: 1px solid #DDD6C8; border-radius: 8px; padding: 10px 12px; }
.tile .n { font-size: 20pt; font-weight: 700; color: #3F7CAC; } .tile.red .n { color: #B3261E; }
.tile .l { font-size: 8.5pt; color: #5B6673; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E4DED2; vertical-align: top; }
th { background: #F5F2EC; }
.ok { color: #1E7A3C; font-weight: 600; } .bad { color: #B3261E; font-weight: 600; } .warn { color: #A15C00; font-weight: 600; } .muted { color: #5B6673; }
.list li { margin-bottom: 4px; }
.attention li::marker { color: #B3261E; } .highlights li::marker { color: #1E7A3C; }
.proj { border: 1px solid #E4DED2; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; break-inside: avoid; }
.proj ul { margin: 4px 0 0 18px; padding: 0; }
.chip { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 8.5pt; margin-right: 6px; }
.chip.blocker { background: #FBE3E1; color: #B3261E; } .chip.warning { background: #FFF1D6; color: #A15C00; } .chip.info { background: #ECEFF3; color: #5B6673; }
.photos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.photos img { width: 100%; height: 180px; object-fit: cover; border-radius: 6px; }
.two { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
pre { white-space: pre-wrap; background: #F5F2EC; padding: 10px; border-radius: 6px; font-size: 9pt; }
.attendees { font-size: 9pt; color: #5B6673; }
footer { margin-top: 24px; font-size: 8pt; color: #5B6673; border-top: 1px solid #E4DED2; padding-top: 6px; }
.pb { break-before: page; }
.proj.row { display: grid; grid-template-columns: 170px 1fr; gap: 14px; }
.pp { width: 160px; height: 120px; object-fit: cover; border-radius: 6px; display: block; }
.cap { font-size: 7.5pt; color: #5B6673; margin-top: 3px; }
"""

def page(title, body):
    return f"<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>{e(title)}</title><style>{CSS}</style></head><body><div class='wrap'>{body}<footer>SiteStory · BizHack AI Hackathon 2026 · Challenge 02 BOFF NWT · Generated automatically from the site managers' weekly walk-through videos (n8n + OpenAI, fact-checked). Sample data.</footer></div></body></html>"

# ---------------- Management report
S = D['summary']; T = S['totals']
rows = ''.join(
    f"<tr><td><b>{e(p['name'])}</b><br><span class='muted'>{e(p['company'])}</span></td><td>{p['latest_week']}</td>"
    f"<td>{'<span class=ok>✔ signed</span>' if p['signed'] else ('<span class=warn>✎ draft only</span>' if p['draft'] else '<span class=bad>✘ missing</span>')}</td>"
    f"<td>{'<span class=ok>✔</span>' if p['approval'] else '<span class=muted>–</span>'}</td>"
    f"<td>{''.join(f'<span class=\"chip {i['severity']}\">{e(i['text'])}</span>' for i in p['issues']) or '<span class=muted>none</span>'}</td></tr>"
    for p in S['checklist'])
# one photo per project = the photo selected for Instagram (social_drafts.photo_url); sample photo if none selected yet
def proj_photo(p):
    ph = p.get('photo')
    if not ph: return ''
    return f"<img class='pp' src='{img64(PHOTOS / ph['dir'] / ph['file'], 500)}' alt='project photo'><div class='cap'>{e(ph['label'])}</div>"
projs = ''.join(
    f"<div class='proj row'><div class='ph'>{proj_photo(p)}</div><div><h3>{e(p['name'])}</h3><div class='muted'>{e(p['company'])} · {p['latest_week']} · {p['weeks']} weekly reports</div>{bullets(p['summary'])}</div></div>"
    for p in S['checklist'])
mgmt = f"""
<header class='top'><div><div class='brand'>Site<b>Story</b> · NWT group</div><h1>Weekly management report – {S['week']}</h1></div>
<div class='meta'>For: CEO, head of construction<br>Generated {S['created_at']} UTC</div></header>
<p class='lead'>{e(S['headline'])}</p>
<div class='tiles'>
<div class='tile'><div class='n'>{T['projects']}</div><div class='l'>active projects</div></div>
<div class='tile red'><div class='n'>{T['contracts_missing']}</div><div class='l'>contracts not signed</div></div>
<div class='tile'><div class='n'>{T['new_projects']}</div><div class='l'>new projects</div></div>
<div class='tile'><div class='n'>{T['open_issues']}</div><div class='l'>open issues</div></div></div>
<h2>Attention</h2><ul class='list attention'>{''.join(f"<li><b>{e(a['project'])}:</b> {e(a['text'])}</li>" for a in S['attention'])}</ul>
<h2>Highlights</h2><ul class='list highlights'>{''.join(f"<li><b>{e(a['project'])}:</b> {e(a['text'])}</li>" for a in S['highlights'])}</ul>
<h2>Document checklist</h2>
<table><tr><th>Project</th><th>Week</th><th>Contract</th><th>Building approval</th><th>Issues</th></tr>{rows}</table>
<h2>Projects this week</h2>{projs}
"""
(OUT / 'management_report_2026-W47.html').write_text(page(f"Management report {S['week']}", mgmt), encoding='utf-8')

# ---------------- Site meeting reports
for s in D['site']:
    imgs = ''.join(f"<img src='{img64(PHOTOS / s['photos_dir'] / f)}' alt='site photo'>" for f in s['photos'])
    by = {k: [i for i in s['issues'] if i['severity'] == k] for k in ('blocker', 'warning', 'info')}
    issues = ''.join(
        f"<p><b>{lbl}</b></p><ul>{''.join(f'<li>{e(i['text'])}</li>' for i in by[k])}</ul>" for k, lbl in
        (('blocker', 'Blockers'), ('warning', 'Warnings'), ('info', 'Info')) if by[k]) or "<p class='ok'>No open issues.</p>"
    docs = s['docs']
    signed = any('contract_signed' in d for d in docs); approval = any('building_office_approval' in d for d in docs)
    body = f"""
<header class='top'><div><div class='brand'>Site<b>Story</b> · {e(s['company'])}</div><h1>Site inspection meeting – {s['week']}</h1></div>
<div class='meta'>{e(s['title'])}<br>Report generated in {s['secs']} s · facts verified ({s['fact']['n']} numbers)</div></header>
<p class='attendees'>Attendees: client (project owner) · client's technical supervisor · site manager · design supervisor · safety manager</p>
<div class='two'>
<div><h2>What was built this week</h2><h3>{e(s['entry_title'])}</h3>{bullets(s['entry'])}
<h2>Issues</h2>{issues}
<h2>Next steps</h2><ul>{''.join(f'<li>{e(n)}</li>' for n in s['next'])}</ul>
<h2>Documents</h2><table><tr><th>Document</th><th>Status</th></tr>
<tr><td>Contract for work</td><td>{'<span class=ok>✔ signed</span>' if signed else '<span class=bad>✘ not signed</span>'}</td></tr>
<tr><td>Building office approval</td><td>{'<span class=ok>✔ in folder</span>' if approval else '<span class=muted>– not yet</span>'}</td></tr></table></div>
<div><h2>Photos of the week</h2><div class='photos'>{imgs}</div><p class='muted'>{e(s['photo_note'])}</p></div></div>
<h2 class='pb'>Appendix: site manager's walk-through video (transcript)</h2><pre>{e(s['transcript'])}</pre>
"""
    (OUT / f"site_meeting_{s['code']}_{s['week']}.html").write_text(page(f"Site meeting {s['code']} {s['week']}", body), encoding='utf-8')
print('\n'.join(sorted(p.name for p in OUT.iterdir())))
