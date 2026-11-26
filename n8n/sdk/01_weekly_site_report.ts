import { workflow, node, trigger, sticky, newCredential, ifElse, expr } from '@n8n/workflow-sdk';

const siteReportWebhook = trigger({
  type: 'n8n-nodes-base.webhook', version: 2.2,
  config: { name: 'Site report webhook', parameters: { httpMethod: 'POST', path: 'site-report', responseMode: 'responseNode', options: {} } },
  output: [{ body: { project: { name: '02_BESS_container', company: 'AGRO NWT', client_name: 'Client B', consent_name_allowed: false, notes: 'Container BESS 500 kW / 1 MWh' }, week: '2026-W47', transcript: '[00:05] New this week: the battery container arrived.', photo_urls: [] } }]
});

const normalizeInput = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Normalize input', parameters: { jsCode: "// Normalize input – accepts the JSON body sent by Lovable or scripts/run_demo.py\nconst raw = $input.first().json;\nconst b = raw.body ?? raw;\nconst p = b.project || {};\nconst input = {\n  started_ms: Date.now(),\n  project: {\n    id: p.id ?? null,\n    name: p.name ?? 'Unnamed project',\n    company: p.company ?? '',\n    client_name: p.client_name ?? '',\n    consent_name_allowed: p.consent_name_allowed !== false,\n    notes: p.notes ?? '',\n  },\n  week: b.week ?? '',\n  media_url: b.media_url ?? b.video_url ?? b.audio_url ?? '',\n  transcript: String(b.transcript ?? '').trim(),\n  notes_text: String(b.notes_text ?? '').trim(), // typed or dictated notes from the app\n  photo_urls: Array.isArray(b.photo_urls) ? b.photo_urls.slice(0, 8) : [],\n  output_language: b.output_language ?? 'en',\n  customer_language: b.customer_language ?? b.output_language ?? 'en',\n  stt_language: b.stt_language ?? 'ces',\n  stt_model: b.stt_model ?? 'scribe_v1',\n  model: b.model ?? 'gpt-4o-mini',\n};\nif (!input.transcript && !input.media_url && !input.notes_text) {\n  throw new Error('Send \"transcript\", \"notes_text\" or \"media_url\" (public URL of the walk-through video or audio note).');\n}\n// New media from the app (force_stt) is always transcribed, even if an older transcript exists\ninput.needs_stt = !!input.media_url && (!input.transcript || b.force_stt === true);\nif (input.needs_stt) input.transcript = '';\n// Without speech-to-text, typed/dictated notes become (part of) the transcript right away\nif (!input.needs_stt && input.notes_text) {\n  input.transcript = input.transcript ? `${input.transcript}\\n[notes] ${input.notes_text}` : input.notes_text;\n}\nreturn [{ json: input }];\n" } },
  output: [{ project: { name: '02_BESS_container', company: 'AGRO NWT', client_name: 'Client B', consent_name_allowed: false, notes: 'Container BESS 500 kW / 1 MWh' }, week: '2026-W47', media_url: '', transcript: '[00:05] New this week: the battery container arrived.', photo_urls: [], needs_stt: false, stt_model: 'scribe_v1', stt_language: 'ces', started_ms: 0 }]
});

const videoToTranscribe = ifElse({
  version: 2.2,
  config: { name: 'Video to transcribe?', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr('{{ $json.needs_stt }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
});

const elevenLabsStt = node({
  type: 'n8n-nodes-base.httpRequest', version: 4.5,
  config: {
    name: 'ElevenLabs speech-to-text',
    parameters: {
      method: 'POST', url: 'https://api.elevenlabs.io/v1/speech-to-text',
      authentication: 'genericCredentialType', genericAuthType: 'httpTemplatedCustomAuth',
      sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { name: 'model_id', value: expr('{{ $json.stt_model }}') },
        { name: 'cloud_storage_url', value: expr('{{ $json.media_url }}') },
        { name: 'language_code', value: expr('{{ $json.stt_language }}') },
        { name: 'timestamps_granularity', value: 'word' }
      ] },
      options: { timeout: 300000 }
    },
    credentials: { httpTemplatedCustomAuth: newCredential('ElevenLabs API key') }
  },
  output: [{ language_code: 'ces', text: 'Week 47, container arrived.', words: [{ text: 'Week', start: 0, end: 0.3, type: 'word' }] }]
});

const transcriptFromStt = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Transcript from STT', parameters: { jsCode: "// Turn the ElevenLabs Speech-to-Text response into a timestamped transcript: \"[mm:ss] sentence\"\nconst input = $('Normalize input').first().json;\nconst stt = $input.first().json;\nconst words = (stt.words || []).filter(w => w.type !== 'spacing' && w.type !== 'audio_event');\nconst fmt = s => {\n  const m = Math.floor(s / 60), ss = Math.floor(s % 60);\n  return `[${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}]`;\n};\nconst lines = [];\nlet cur = [], start = null, last = 0;\nfor (const w of words) {\n  const ws = w.start ?? last;\n  if (start === null) start = ws;\n  if (cur.length && ws - last > 1.2) { // pause = new line\n    lines.push(`${fmt(start)} ${cur.join(' ')}`); cur = []; start = ws;\n  }\n  cur.push(w.text);\n  last = w.end ?? ws;\n  if (/[.!?]$/.test(w.text) && cur.length > 4) { // sentence end\n    lines.push(`${fmt(start)} ${cur.join(' ')}`); cur = []; start = null;\n  }\n}\nif (cur.length) lines.push(`${fmt(start ?? 0)} ${cur.join(' ')}`);\nlet transcript = lines.length ? lines.join('\\n') : String(stt.text || '').trim();\nif (!transcript && !input.notes_text) throw new Error('Speech-to-text returned no text. Check the media_url and the ElevenLabs key.');\n// Typed or dictated notes sent together with the video/audio are appended after the spoken transcript\nif (input.notes_text) transcript = transcript ? `${transcript}\\n[notes] ${input.notes_text}` : input.notes_text;\nreturn [{ json: { ...input, transcript, stt_language_detected: stt.language_code ?? null } }];\n" } },
  output: [{ transcript: '[00:00] Week 47, container arrived.', needs_stt: true }]
});

const buildPrompts = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Build prompts', parameters: { jsCode: "// Build the prompts for the OpenAI nodes: one text call for all outputs, one image call for photo selection\nconst d = $input.first().json;\nconst consentRule = d.project.consent_name_allowed\n  ? 'The client name MAY be used in the social draft.'\n  : 'The client name, address or any identifying detail of the client MUST NOT appear in the social draft. Describe the client generically (e.g. \"an engineering company in the Zlín region\").';\n\nconst system_prompt = `You are the reporting assistant of a Czech construction company in the NWT group (solar power plants, battery storage, buildings).\nEvery week a site manager records a short walk-through video and describes what was NEWLY BUILT since last week. You get the transcript and the project notes.\nWrite outputs for the customer, the project chronicle / site inspection meeting, marketing and management.\n\nSTRICT RULES\n1. Use ONLY facts from the transcript and the project notes. Never invent numbers, dates, names, quotes or technical details.\n2. Write every number exactly as it appears in the sources (same digits). If a number is not in the sources, leave it out.\n3. Consent: ${consentRule}\n4. Factual, friendly, short. No hype words, no emojis in customer_report and project_page_entry.\n\nReturn ONLY one JSON object with exactly these keys:\n{\n  \"customer_report\": {\"subject\": string, \"body\": string},\n  \"project_page_entry\": {\"title\": string, \"body\": string},\n  \"social_draft\": {\"text_en\": string, \"text_cs\": string, \"hashtags\": [string]},\n  \"web_news\": {\"title_en\": string, \"body_en\": string, \"title_cs\": string, \"body_cs\": string},\n  \"issues\": [{\"text\": string, \"severity\": \"info\" | \"warning\" | \"blocker\"}],\n  \"next_steps\": [string]\n}\n- customer_report: weekly progress e-mail to the client in language \"${d.customer_language}\", 80-150 words: what was built this week, what comes next, anything the client must do.\n- project_page_entry: chronicle entry in language \"${d.output_language}\", 40-90 words, short lines starting with \"- \".\n- social_draft: one post for LinkedIn / Instagram, 40-70 words, in English (text_en) and Czech (text_cs), 3-6 hashtags.\n- web_news: a short news article for the \"News\" section of the NWT company website, in English and Czech: a factual title (max 10 words) and 90-160 words of body in 2-3 short paragraphs (what was built, the technology, what comes next). No hashtags, no emojis. Same consent rule as the social draft.\n- issues: delays, missing material, waiting for the client, safety. Empty list if none.`;\n\nconst user_prompt = `Project: ${d.project.name}\nCompany: ${d.project.company}\nWeek: ${d.week}\n\nPROJECT NOTES:\n${d.project.notes || '(none)'}\n\nTRANSCRIPT OF THIS WEEK'S WALK-THROUGH VIDEO:\n${d.transcript}`;\n\nconst photo_prompt = `You see ${d.photo_urls.length} photos from a construction site, in this order: index 0 to ${d.photo_urls.length - 1}.\nSuggest the 3 best photos for a marketing post, best first (sharp, shows finished or impressive work, no recognisable faces, no readable car number plates). If there are fewer than 3 usable photos, suggest fewer.\nphoto_flags: list ONLY photos that show a recognisable human face or a readable car number plate. Equipment, buildings and panels are never a reason to flag. If no photo has a face or plate, return an empty list.\nReturn ONLY JSON: {\"suggested\": [{\"index\": number, \"reason\": string}], \"photo_flags\": [{\"index\": number, \"reason\": string}]}`;\n\nreturn [{\n  json: {\n    ...d,\n    system_prompt,\n    user_prompt,\n    photo_prompt,\n    has_photos: d.photo_urls.length > 0,\n    photo_urls_csv: d.photo_urls.join(','),\n  },\n}];\n" } },
  output: [{ system_prompt: 'You are...', user_prompt: 'Project: ...', photo_prompt: 'You see ...', has_photos: true, photo_urls_csv: 'https://example.com/a.jpg' }]
});

const writeOutputs = node({
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {
    name: 'Write outputs (OpenAI)',
    parameters: {
      resource: 'text', operation: 'response',
      modelId: { __rl: true, mode: 'id', value: 'gpt-4o-mini' },
      responses: { values: [{ type: 'text', role: 'user', content: expr('{{ $json.user_prompt }}') }] },
      simplify: true,
      options: {
        instructions: expr('{{ $json.system_prompt }}'),
        textFormat: { textOptions: { type: 'json_object' } },
        temperature: 0.2,
        maxTokens: 2500
      }
    },
    credentials: { openAiApi: newCredential('OpenAI') }
  },
  output: [{ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"customer_report":{"subject":"s","body":"b"}}' }] }] }]
});

const hasPhotos = ifElse({
  version: 2.2,
  config: { name: 'Photos attached?', parameters: { conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
    conditions: [{ leftValue: expr("{{ $('Build prompts').item.json.has_photos }}"), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' } } }
});

const pickBestPhoto = node({
  type: '@n8n/n8n-nodes-langchain.openAi', version: 2.3,
  config: {
    name: 'Pick best photo (OpenAI)',
    parameters: {
      resource: 'image', operation: 'analyze',
      modelId: { __rl: true, mode: 'id', value: 'gpt-4o-mini' },
      text: expr("{{ $('Build prompts').item.json.photo_prompt }}"),
      inputType: 'url',
      imageUrls: expr("{{ $('Build prompts').item.json.photo_urls_csv }}"),
      simplify: true,
      options: { detail: 'low', maxTokens: 800 }
    },
    credentials: { openAiApi: newCredential('OpenAI') }
  },
  output: [{ type: 'message', content: [{ type: 'output_text', text: '{"best_photo_index":0,"photo_flags":[]}' }] }]
});

const parseAndCheck = node({
  type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Parse + fact check', parameters: { jsCode: "// Parse both OpenAI answers and run the guardrails:\n// every number must exist in the sources, client-name consent must be respected, flagged photos are never chosen\nconst d = $('Build prompts').first().json;\n\nconst findText = (x) => {\n  if (x == null) return null;\n  if (Array.isArray(x)) { for (const v of x) { const t = findText(v); if (t != null) return t; } return null; }\n  if (typeof x === 'object') {\n    if ((x.type === 'output_text' || x.type === undefined) && x.text != null && typeof x.text !== 'undefined') return x.text;\n    for (const k of ['output', 'content', 'message', 'choices']) { if (x[k] != null) { const t = findText(x[k]); if (t != null) return t; } }\n    return null;\n  }\n  return null;\n};\nconst toJson = (raw, what) => {\n  if (raw && typeof raw === 'object') return raw;\n  const s = String(raw ?? '').replace(/^\\s*```(?:json)?\\s*/i, '').replace(/\\s*```\\s*$/, '');\n  try { return JSON.parse(s); } catch (e) { throw new Error(`${what}: the model did not return valid JSON: ${s.slice(0, 400)}`); }\n};\n\nconst out = toJson(findText($('Write outputs (OpenAI)').first().json), 'Write outputs');\nlet photo = { best_photo_index: null, photo_flags: [] };\nlet photo_error = null;\ntry {\n  const p = $('Pick best photo (OpenAI)').first().json;\n  if (p?.error) photo_error = String(p.error?.message ?? p.error);\n  const pt = findText(p);\n  if (pt != null) photo = toJson(pt, 'Pick best photo');\n} catch (e) {\n  // photo step did not run (no photos) or failed: the texts are still delivered\n  if (!/not executed|hasn't been executed|has not been executed|No node|no data/i.test(String(e.message))) photo_error = String(e.message);\n}\n\n// ---- Fact check: numbers -------------------------------------------------\nconst NUM = /\\d+(?:[.,]\\d+)?/g;\nconst variants = (s) => {\n  const v = new Set([s, s.replace(/,/g, '.'), s.replace(/,/g, ''), s.replace(/\\./g, ',')]);\n  const n = parseFloat(s.replace(/,/g, '.'));\n  if (!Number.isNaN(n)) v.add(String(n));\n  return [...v];\n};\n// join thousands written with a space (\"1 816\", Czech style) so they are read as one number\nconst joinThousands = (t) => String(t).replace(/(\\d)[\\s\\u00a0\\u202f](?=\\d{3}(?!\\d))/g, '$1');\nconst sourceText = joinThousands([d.transcript, d.project.notes, d.week, d.project.name].join(' '));\nconst sourceSet = new Set();\nfor (const m of sourceText.match(NUM) || []) variants(m).forEach((x) => sourceSet.add(x));\n\nconst texts = {\n  customer_report: `${out.customer_report?.subject ?? ''} ${out.customer_report?.body ?? ''}`,\n  project_page_entry: `${out.project_page_entry?.title ?? ''} ${out.project_page_entry?.body ?? ''}`,\n  social_en: out.social_draft?.text_en ?? '',\n  social_cs: out.social_draft?.text_cs ?? '',\n  web_news_en: `${out.web_news?.title_en ?? ''} ${out.web_news?.body_en ?? ''}`,\n  web_news_cs: `${out.web_news?.title_cs ?? ''} ${out.web_news?.body_cs ?? ''}`,\n};\nconst unverified = [];\nfor (const [field, t] of Object.entries(texts)) {\n  for (const m of joinThousands(t).match(NUM) || []) {\n    if (/^\\d$/.test(m)) continue; // single digits (list numbering) are not checked\n    if (!variants(m).some((x) => sourceSet.has(x))) unverified.push({ field, number: m });\n  }\n}\n\n// ---- Consent check -------------------------------------------------------\nconst social = `${texts.social_en} ${texts.social_cs} ${texts.web_news_en} ${texts.web_news_cs}`.toLowerCase();\nconst client = (d.project.client_name || '').trim().toLowerCase();\nconst consent_ok = d.project.consent_name_allowed || !client || !social.includes(client);\n\n// ---- Photos --------------------------------------------------------------\nconst flags = (photo.photo_flags || []).filter((f) => Number.isInteger(f.index));\nconst flagged = new Set(flags.map((f) => f.index));\n// up to 3 suggestions, best first; flagged photos are never suggested; fill up with unflagged photos\nconst legacy = Number.isInteger(photo.best_photo_index) ? [{ index: photo.best_photo_index, reason: photo.best_photo_reason ?? '' }] : [];\nconst suggested = [];\nfor (const s of [...(photo.suggested || []), ...legacy]) {\n  if (Number.isInteger(s.index) && d.photo_urls[s.index] && !flagged.has(s.index) && !suggested.some((x) => x.index === s.index)) suggested.push({ index: s.index, reason: s.reason ?? '', url: d.photo_urls[s.index] });\n}\nd.photo_urls.forEach((u, i) => { if (suggested.length < 3 && !flagged.has(i) && !suggested.some((x) => x.index === i)) suggested.push({ index: i, reason: 'not ranked', url: u }); });\nconst suggested_photos = suggested.slice(0, 3);\nconst best_photo_url = suggested_photos[0]?.url ?? null;\n\nreturn [{\n  json: {\n    project_id: d.project.id,\n    project_name: d.project.name,\n    week: d.week,\n    transcript: d.transcript,\n    customer_report: out.customer_report ?? null,\n    project_page_entry: out.project_page_entry ?? null,\n    social_draft: out.social_draft ?? null,\n    web_news: out.web_news ?? null,\n    best_photo_url,\n    best_photo_reason: suggested_photos[0]?.reason ?? null,\n    suggested_photos,\n    photo_error,\n    photo_flags: flags.map((f) => ({ ...f, url: d.photo_urls[f.index] ?? null })),\n    issues: out.issues || [],\n    next_steps: out.next_steps || [],\n    fact_check: {\n      status: unverified.length === 0 && consent_ok ? 'ok' : 'needs_review',\n      unverified_numbers: unverified,\n      consent_ok,\n      numbers_checked: (Object.values(texts).join(' ').match(NUM) || []).length,\n    },\n    processing_seconds: Math.round((Date.now() - d.started_ms) / 100) / 10,\n  },\n}];\n" } },
  output: [{ week: '2026-W47', customer_report: { subject: 's', body: 'b' }, fact_check: { status: 'ok', unverified_numbers: [], consent_ok: true } }]
});

const respondToApp = node({
  type: 'n8n-nodes-base.respondToWebhook', version: 1.5,
  config: { name: 'Respond to app', parameters: { respondWith: 'firstIncomingItem', options: {} } }
});

const note = sticky('## Weekly site report\n**POST /webhook/site-report** with project (name, company, client_name, consent_name_allowed, notes), week, and `media_url` (public URL of the walk-through video) **or** `transcript`, optional `photo_urls`.\n\nReturns customer report, chronicle entry, social draft EN/CZ, best photo, issues and a **fact check** (every number must be in the sources, client-name consent respected).\n\n**Setup:** ElevenLabs node needs a credential with header `xi-api-key` = your key (only for videos).', [], { color: 7, width: 560, height: 300 });

export default workflow('bizhack-site-report', 'BizHack 02 – Weekly site report (video → reports)', { settings: { executionOrder: 'v1', executionTimeout: 600 } })
  .add(note)
  .add(siteReportWebhook)
  .to(normalizeInput)
  .to(videoToTranscribe
    .onTrue(elevenLabsStt.to(transcriptFromStt.to(buildPrompts)))
    .onFalse(buildPrompts))
  .add(buildPrompts)
  .to(writeOutputs)
  .to(hasPhotos
    .onTrue(pickBestPhoto.to(parseAndCheck))
    .onFalse(parseAndCheck))
  .add(parseAndCheck)
  .to(respondToApp)
  .group('Speech to text', [elevenLabsStt, transcriptFromStt], { description: 'Only when a video URL is sent: ElevenLabs transcribes it into a timestamped transcript' })
  .group('Guardrails', [parseAndCheck], { description: 'Every number must appear in the transcript or notes; client name only with consent; flagged photos never chosen' });
