"""Builds the importable n8n workflow JSON files from the Code-node sources in n8n/code/.
Run: python n8n/build_workflows.py   (only needed if you edit the .js files)"""
import json, uuid, pathlib

HERE = pathlib.Path(__file__).parent
code = lambda name: (HERE / "code" / name).read_text(encoding="utf-8")
_counter = [0]
def uid():
    _counter[0] += 1
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"bizhack-02-{_counter[0]}"))

def node(name, type_, version, params, pos, **extra):
    n = {"parameters": params, "id": uid(), "name": name, "type": type_, "typeVersion": version, "position": pos}
    n.update(extra)
    return n

def code_node(name, file, pos):
    return node(name, "n8n-nodes-base.code", 2, {"jsCode": code(file)}, pos)

def webhook(name, path, pos):
    return node(name, "n8n-nodes-base.webhook", 2,
                {"httpMethod": "POST", "path": path, "responseMode": "responseNode", "options": {}},
                pos, webhookId=uid())

def respond(name, pos):
    return node(name, "n8n-nodes-base.respondToWebhook", 1.1,
                {"respondWith": "firstIncomingItem", "options": {}}, pos)

def openai(name, pos):
    return node(name, "n8n-nodes-base.httpRequest", 4.2, {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.body) }}",
        "options": {"timeout": 120000},
    }, pos, notes="Credential: Header Auth  ->  Name: Authorization  /  Value: Bearer sk-...", notesInFlow=True)

def connect(*names):
    c = {}
    for a, b in zip(names, names[1:]):
        c.setdefault(a, {"main": [[]]})["main"][0].append({"node": b, "type": "main", "index": 0})
    return c

def merge(*dicts):
    out = {}
    for d in dicts:
        for k, v in d.items():
            if k in out:
                for i, lst in enumerate(v["main"]):
                    while len(out[k]["main"]) <= i:
                        out[k]["main"].append([])
                    out[k]["main"][i].extend(lst)
            else:
                out[k] = json.loads(json.dumps(v))
    return out

def sticky(text, pos, w=520, h=300):
    return node(f"Note {uid()[:4]}", "n8n-nodes-base.stickyNote", 1, {"content": text, "width": w, "height": h}, pos)

# ---------------------------------------------------------------- Workflow 1
stt = node("ElevenLabs Speech-to-Text", "n8n-nodes-base.httpRequest", 4.2, {
    "method": "POST",
    "url": "https://api.elevenlabs.io/v1/speech-to-text",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": True,
    "contentType": "multipart-form-data",
    "bodyParameters": {"parameters": [
        {"parameterType": "formData", "name": "model_id", "value": "={{ $json.stt_model }}"},
        {"parameterType": "formData", "name": "cloud_storage_url", "value": "={{ $json.media_url }}"},
        {"parameterType": "formData", "name": "language_code", "value": "={{ $json.stt_language }}"},
        {"parameterType": "formData", "name": "timestamps_granularity", "value": "word"},
    ]},
    "options": {"timeout": 300000},
}, [900, 160], notes="Credential: Header Auth  ->  Name: xi-api-key  /  Value: your ElevenLabs key", notesInFlow=True)

if_node = node("Video to transcribe?", "n8n-nodes-base.if", 2, {
    "conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
        "conditions": [{"id": uid(), "leftValue": "={{ $json.needs_stt }}", "rightValue": True,
                        "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
        "combinator": "and"},
    "options": {}}, [660, 300])

wf1_nodes = [
    webhook("Webhook site-report", "site-report", [200, 300]),
    code_node("Normalize input", "wf1_normalize.js", [430, 300]),
    if_node, stt,
    code_node("Transcript from STT", "wf1_stt_to_transcript.js", [1130, 160]),
    code_node("Build LLM request", "wf1_build_llm.js", [1360, 300]),
    openai("OpenAI – write outputs", [1590, 300]),
    code_node("Parse + fact check", "wf1_parse_check.js", [1820, 300]),
    respond("Respond to Lovable", [2050, 300]),
    sticky("## Weekly site report\n**Input** (POST JSON): project {name, company, client_name, consent_name_allowed, notes}, week, "
           "`media_url` (public URL of the walk-through video) **or** `transcript`, optional `photo_urls`.\n\n"
           "**Output**: customer report, project-page entry, social draft (EN+CZ) with best photo, issues, "
           "and a **fact check** (every number must exist in the sources, consent respected).",
           [160, -120], 640, 220),
]
wf1_conn = merge(
    connect("Webhook site-report", "Normalize input", "Video to transcribe?"),
    {"Video to transcribe?": {"main": [[{"node": "ElevenLabs Speech-to-Text", "type": "main", "index": 0}],
                                       [{"node": "Build LLM request", "type": "main", "index": 0}]]}},
    connect("ElevenLabs Speech-to-Text", "Transcript from STT", "Build LLM request",
            "OpenAI – write outputs", "Parse + fact check", "Respond to Lovable"),
)
wf1 = {"name": "BizHack 02 – Weekly site report (video → reports)", "nodes": wf1_nodes, "connections": wf1_conn,
       "settings": {"executionOrder": "v1"}, "pinData": {}}

# ---------------------------------------------------------------- Workflow 2
wf2_nodes = [
    webhook("Webhook management-summary", "management-summary", [200, 300]),
    code_node("Document checklist", "wf2_checklist.js", [430, 300]),
    code_node("Build summary request", "wf2_build_llm.js", [660, 300]),
    openai("OpenAI – management summary", [890, 300]),
    code_node("Combine summary + checklist", "wf2_parse.js", [1120, 300]),
    respond("Respond", [1350, 300]),
    sticky("## Weekly management summary\n**Input** (POST JSON): week, projects[] {name, company, documents[] (file names), "
           "entries[] (outputs of the site-report workflow)}.\n\n**Output**: totals, document checklist per project "
           "(contract signed? building office approval?), attention list, highlights, one-page Markdown summary.",
           [160, -120], 640, 220),
]
wf2_conn = connect("Webhook management-summary", "Document checklist", "Build summary request",
                   "OpenAI – management summary", "Combine summary + checklist", "Respond")
wf2 = {"name": "BizHack 02 – Weekly management summary + document checklist", "nodes": wf2_nodes,
       "connections": wf2_conn, "settings": {"executionOrder": "v1"}, "pinData": {}}

for fname, wf in [("01_weekly_site_report.json", wf1), ("02_management_summary.json", wf2)]:
    (HERE / fname).write_text(json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8")
    print("wrote", fname)
